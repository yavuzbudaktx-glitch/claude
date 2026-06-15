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

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// Turn an HTML body into an array of text BLOCKS, one per visual paragraph.
// The key is to convert block-level tag boundaries into newlines BEFORE we
// strip tags — otherwise everything collapses into a single line and the
// paragraph structure (which is how we find the lede) is lost. This was the
// bug that made the email parser silently return nothing.
function htmlToBlocks(html: string): string[] {
  const withBreaks = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|td|tr|h[1-6]|li|blockquote|table)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(withBreaks)
    .split(/\n{1,}/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function stripHtml(html: string): string {
  return htmlToBlocks(html).join(" ").replace(/\s+/g, " ").trim();
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

const NOISE = /^(view (this|in) (your )?browser|unsubscribe|manage (your )?(email )?(preferences|subscriptions?)|privacy policy|terms of (use|service)|on this day|today.?s featured event|britannica( logo)?|encyclop[æae]+dia britannica|subscribe|join britannica|sign up|advertisement|©|copyright|all rights reserved|follow us|share this|read more|learn more|see (all|more)|\d{1,4} [a-z]+ (st|ave|rd|blvd|street|avenue))/i;

function looksLikeProse(s: string): boolean {
  if (s.length < 60 || s.length > 1400) return false;
  if (NOISE.test(s)) return false;
  if (!/[a-z]/.test(s)) return false;           // not an ALL-CAPS banner
  if (!/[.?!]/.test(s)) return false;           // a real sentence ends somewhere
  const words = s.split(/\s+/);
  if (words.length < 12) return false;          // ledes are at least a dozen words
  // Reject link/footer lines that are mostly URLs or punctuation.
  if (/https?:\/\//.test(s) && words.length < 25) return false;
  return true;
}

// Find the lede paragraph from the email's text blocks. Britannica's "Today
// in History" puts the event description as the first substantial prose block
// after the masthead. We pick the first block that reads like prose AND comes
// at/after the title block when we can find it.
function extractParagraph(blocks: string[], title: string | null): string {
  let startIdx = 0;
  if (title) {
    const want = title.toLowerCase().slice(0, 24);
    const ti = blocks.findIndex((b) => b.toLowerCase().includes(want));
    if (ti >= 0) startIdx = ti; // include the title block in case the lede shares it
  }
  for (let i = startIdx; i < blocks.length; i++) {
    const b = blocks[i];
    // If the title block also carries the lede ("Title. On this day in 1903…"),
    // peel the title prefix off so we don't return it twice.
    let candidate = b;
    if (title && candidate.toLowerCase().startsWith(title.toLowerCase())) {
      candidate = candidate.slice(title.length).replace(/^[\s.:—–-]+/, "");
    }
    if (looksLikeProse(candidate)) {
      return candidate.length > 700 ? candidate.slice(0, 697).trimEnd() + "…" : candidate;
    }
  }
  // Nothing matched after the title — fall back to the first prose block anywhere.
  for (const b of blocks) {
    if (looksLikeProse(b)) return b.length > 700 ? b.slice(0, 697).trimEnd() + "…" : b;
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
    // Prefer the HTML part (richest structure); turn it into paragraph blocks.
    const htmlBody = chunks.find((c) => /<\/?[a-z][\s\S]*>/i.test(c)) ?? chunks[0] ?? "";
    const blocks = htmlToBlocks(htmlBody);
    const flat = blocks.join(" ");
    if (blocks.length === 0) continue;

    const { title: subTitle, year: subYear } = parseSubject(subject);
    let title = subTitle;
    let year = subYear;

    // If the subject was generic, try to find a more specific title in the body.
    if (!title || title.length < 8 || /^(today|on this day)$/i.test(title)) {
      const bodyTitle = flat.match(/(?:Featured event|Today's Featured Event|On this day)[:\s]+([^.!?]{8,140}?)(?:[.!?]|\s—|\s–)/i);
      if (bodyTitle) title = bodyTitle[1].trim();
      // Otherwise the title is often the first short, capitalized heading block.
      if (!title || title.length < 8) {
        const heading = blocks.find((b) => b.length >= 8 && b.length <= 120 && !NOISE.test(b) && /[A-Z]/.test(b[0]) && b.split(/\s+/).length <= 16 && !/[.?!]$/.test(b));
        if (heading) title = heading.trim();
      }
    }

    // If we still have no year, look for one near the start of the body.
    if (!year) {
      const yM = flat.slice(0, 2000).match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
      if (yM) year = Number(yM[1]);
    }

    const summary = extractParagraph(blocks, title);
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
