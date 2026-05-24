export interface EmailItem {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
}

interface RawHeader { name: string; value: string }
interface RawMessage {
  id: string;
  snippet?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: { headers?: RawHeader[] };
}

function parseFrom(raw: string): { name: string; email: string } {
  if (!raw) return { name: "", email: "" };
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: "", email: raw.trim() };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export async function fetchRecentEmails(accessToken: string, max = 12): Promise<EmailItem[]> {
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&labelIds=INBOX`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  if (!listRes.ok) {
    throw new Error(`Gmail list ${listRes.status}: ${await listRes.text()}`);
  }
  const list = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const ids = (list.messages ?? []).map((m) => m.id);

  const items = await Promise.all(
    ids.map(async (id): Promise<EmailItem | null> => {
      const r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}` +
          `?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
      );
      if (!r.ok) return null;
      const m = (await r.json()) as RawMessage;
      const headers = m.payload?.headers ?? [];
      const get = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
      const { name, email } = parseFrom(get("From"));
      const dateMs = m.internalDate ? Number(m.internalDate) : Date.parse(get("Date"));
      return {
        id: m.id,
        fromName: name || email || "Unknown",
        fromEmail: email,
        subject: decodeEntities(get("Subject")) || "(no subject)",
        snippet: decodeEntities(m.snippet ?? ""),
        date: Number.isFinite(dateMs) ? new Date(dateMs).toISOString() : "",
        unread: (m.labelIds ?? []).includes("UNREAD"),
      };
    }),
  );

  return items
    .filter((x): x is EmailItem => !!x)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date));
}
