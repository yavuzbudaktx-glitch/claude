// Pull today's Britannica "Today in History" newsletter from the user's Gmail
// and extract the featured event title + first paragraph.
//
// Britannica sends this email every morning between roughly 02:00–07:00 local
// time from `todayinhistory@mail.britannica.com`. The format is consistent
// enough that we can pull a clean title + lede from the HTML body.

const ALLOWED_FROM = ["todayinhistory@mail.britannica.com", "newsletters@britannica.com"];

interface RawHeader { name: string; value: string }
interface RawPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: RawPart[];
}
interface RawMessage {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: RawHeader[]; mimeType?: string; body?: { data?: string }; parts?: RawPart[] };
}

export interface BritannicaEmail {
  year: number | null;
  title: string;
  summary: string;
  link: string;
  emailDate: string;
}

function base64UrlDecode(data: string): string {
  // Gmail returns base64url-encoded message bodies.
  const padded = data.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((data.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function walkPartsForHtml(part: RawPart | undefined, out: string[]) {
  if (!part) return;
  if (part.mimeType === "text/html" && part.body?.data) {
    out.push(base64UrlDecode(part.body.data));
  } else if (part.mimeType === "text/plain" && part.body?.data) {
    out.push(base64UrlDecode(part.body.data));
  }
  if (part.parts) for (const p of part.parts) walkPartsForHtml(p, out);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

// Britannica's email subject lines look like:
//   "Today's Featured Event: Pearl Harbor attack (1941)"
//   "On This Day: The Apollo 11 moon landing"
// We pull the year and title from a combination of the subject and body.
function parseSubject(subject: string): { title: string; year: number | null } {
  let title = subject
    .replace(/^\s*(today'?s?\s+(featured\s+event|on this day|in history)\s*[:\-—]\s*)/i, "")
    .replace(/^\s*(on this day|today in history)\s*[:\-—]\s*/i, "")
    .trim();
  let year: number | null = null;
  const yearM = title.match(/\((1[0-9]{3}|20[0-9]{2})\)\s*$/);
  if (yearM) {
    year = Number(yearM[1]);
    title = title.slice(0, yearM.index).trim();
  }
  return { title, year };
}

function extractParagraph(text: string, after: string | null): string {
  // Drop everything up to and including the title from the plain body.
  let body = text;
  if (after) {
    const idx = body.toLowerCase().indexOf(after.toLowerCase());
    if (idx > 0) body = body.slice(idx + after.length);
  }
  // Britannica's lede is usually the first 1-3 sentences. We look for a chunk
  // that's substantive (>=80 chars) and not a navigation banner.
  const noise = /^(view in browser|unsubscribe|on this day|today.s featured event|britannica logo|encyclop[æae]+dia britannica|subscribe|join britannica)/i;
  const candidates = body.split(/(?:\s{2,}|\s\|\s)/).map((s) => s.trim()).filter(Boolean);
  for (const c of candidates) {
    if (c.length < 80 || c.length > 1200) continue;
    if (noise.test(c)) continue;
    if (!/[a-z]/.test(c) || !/[.?!]/.test(c)) continue;
    // Cap at a friendly card-length.
    return c.length > 700 ? c.slice(0, 697).trimEnd() + "…" : c;
  }
  return "";
}

export async function fetchTodaysBritannicaEmail(accessToken: string): Promise<BritannicaEmail | null> {
  // Search the last 36h of mail from Britannica's sender. The newsletter is
  // strictly daily, so anything in the last day-and-a-half is "today's" by
  // their definition. Gmail's `newer_than:1d` is calendar-day in user TZ.
  const fromQ = ALLOWED_FROM.map((f) => `from:${f}`).join(" OR ");
  const q = encodeURIComponent(`(${fromQ}) newer_than:2d`);
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=${q}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  if (!listRes.ok) return null;
  const list = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const ids = (list.messages ?? []).map((m) => m.id);
  if (ids.length === 0) return null;

  // The newest is the most recent newsletter — usually today's.
  for (const id of ids) {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
    );
    if (!r.ok) continue;
    const m = (await r.json()) as RawMessage;
    const headers = m.payload?.headers ?? [];
    const get = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
    const subject = get("Subject");
    if (!subject) continue;

    const chunks: string[] = [];
    walkPartsForHtml(m.payload, chunks);
    // Gmail occasionally puts the body on payload.body directly when there
    // are no parts (rare for marketing email but worth covering).
    if (chunks.length === 0 && m.payload?.body?.data) chunks.push(base64UrlDecode(m.payload.body.data));
    const text = chunks.map(stripHtml).find((s) => s.length > 200) ?? "";
    if (!text) continue;

    const { title: subTitle, year: subYear } = parseSubject(subject);
    let title = subTitle;
    let year = subYear;

    // If the subject was generic, try to find a more specific title in the body.
    if (!title || title.length < 8 || /^(today|on this day)$/i.test(title)) {
      const bodyTitle = text.match(/(?:Featured event|Today's Featured Event|On this day)[:\s]+([^.!?]{8,140}?)(?:[.!?]|\s—|\s–)/i);
      if (bodyTitle) title = bodyTitle[1].trim();
    }

    // If we still have no year, look for one near the start of the body.
    if (!year) {
      const yM = text.slice(0, 1500).match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
      if (yM) year = Number(yM[1]);
    }

    const summary = extractParagraph(text, title);
    if (!title || !summary) continue;

    const epoch = m.internalDate ? Number(m.internalDate) : Date.now();
    const d = new Date(epoch);
    const months = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    const link = `https://www.britannica.com/on-this-day/${months[d.getMonth()]}-${d.getDate()}`;

    return {
      year,
      title,
      summary,
      link,
      emailDate: d.toISOString(),
    };
  }
  return null;
}
