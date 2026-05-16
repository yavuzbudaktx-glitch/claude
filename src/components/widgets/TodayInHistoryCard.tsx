"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { localDateKey, msUntilLocalMidnight } from "@/lib/local-date";

interface TodayResp {
  date?: string;
  year?: number | null;
  text?: string;
  summary?: string | null;
  kind?: "featured" | "selected" | "events" | "births" | "deaths";
  source?: "britannica" | "wikipedia" | "wikipedia-featured";
  thumbnail?: string | null;
  pageTitle?: string | null;
  link?: string | null;
  error?: string;
}

interface BritannicaFeatured {
  year: number | null;
  title: string;
  summary: string;
  link: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<TodayResp>);

// Multi-strategy Britannica scraper that runs ENTIRELY on the client (via
// public CORS proxies) since Vercel's egress IPs can't reach britannica.com.
// Each strategy returns a candidate; we accept the first one whose title,
// summary, and either a year or link pass a real quality check.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;|&#34;/g, '"').replace(/&apos;|&#39;|&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function strip(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}
function isGoodFeatured(f: BritannicaFeatured | null): f is BritannicaFeatured {
  if (!f) return false;
  if (!f.title || f.title.trim().length < 12 || f.title.split(/\s+/).length < 2) return false;
  if (/^(read|more|browse|see|view|home|next|previous|subscribe|sign|about|search|menu)\b/i.test(f.title)) return false;
  if (!f.summary || f.summary.trim().length < 60) return false;
  if (f.year === null && !f.link) return false;
  return true;
}

function parseBritannicaHtml(html: string): BritannicaFeatured | null {
  // Strategy A: the page exposes a JSON blob with the day's events.
  // Britannica embeds something like {"todaysEvents":[{...},{...}]} in
  // a <script> tag. The first events with a long description is what
  // we want.
  const scriptRe = /<script[^>]*>([^<]*"events?"[^<]*)<\/script>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = scriptRe.exec(html)) !== null) {
    try {
      // Look inside the script for an event-shaped object with year + description.
      const eventMatch = sm[1].match(
        /\{[^{}]*"year"\s*:\s*(\d{3,4})[^{}]*"(?:title|name)"\s*:\s*"([^"]{12,})"[^{}]*"(?:description|summary|extract)"\s*:\s*"([^"]{60,})"[^{}]*\}/,
      );
      if (eventMatch) {
        return {
          year: parseInt(eventMatch[1], 10),
          title: decodeEntities(eventMatch[2]),
          summary: decodeEntities(eventMatch[3]),
          link: null,
        };
      }
    } catch {}
  }

  // Strategy B: og:title + og:description on a day-specific URL
  // describe the featured event itself.
  const og = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, "i"))?.[1] ?? null;
  const ogTitle = og("og:title");
  const ogDesc = og("og:description");
  const ogUrl = og("og:url");
  if (ogTitle && ogDesc && !/On This Day|Britannica/i.test(ogTitle)) {
    const yearM = ogDesc.match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/);
    return {
      year: yearM ? parseInt(yearM[1], 10) : null,
      title: decodeEntities(ogTitle),
      summary: decodeEntities(ogDesc),
      link: ogUrl,
    };
  }

  // Strategy C: text marker "Featured Event" followed by a card. Walk
  // forward to find an /event/, /topic/, or /biography/ link, capture
  // its text as the title and the following <p> as the summary.
  const markerIdx = html.search(/Featured\s+Event/i);
  if (markerIdx >= 0) {
    const chunk = html.slice(markerIdx, markerIdx + 12000);
    const linkRe = /<a[^>]+href=["'](\/(?:event|topic|biography|place|story|art|science|technology|sports)\/[^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/i;
    const linkM = chunk.match(linkRe);
    const title = linkM ? strip(linkM[2]) : "";
    // Find a long <p> after the link.
    let summary = "";
    if (linkM) {
      const after = chunk.slice(chunk.indexOf(linkM[0]) + linkM[0].length);
      const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
      let pm: RegExpExecArray | null;
      while ((pm = pRe.exec(after)) !== null) {
        const txt = strip(pm[1]);
        if (txt.length >= 60) { summary = txt; break; }
      }
    }
    const yearM = chunk.match(/\b(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})\b/);
    const link = linkM ? `https://www.britannica.com${linkM[1]}` : null;
    return {
      year: yearM ? parseInt(yearM[1], 10) : null,
      title,
      summary,
      link,
    };
  }

  return null;
}

async function fetchBritannicaFromBrowser(date: Date): Promise<BritannicaFeatured | null> {
  const MONTHS = ["january", "february", "march", "april", "may", "june",
                  "july", "august", "september", "october", "november", "december"];
  const targets = [
    `https://www.britannica.com/on-this-day/${MONTHS[date.getMonth()]}-${date.getDate()}`,
    "https://www.britannica.com/on-this-day",
  ];
  const proxify = (t: string) => [
    `https://corsproxy.io/?${encodeURIComponent(t)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(t)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(t)}`,
    `https://proxy.cors.sh/${t}`,
    `https://thingproxy.freeboard.io/fetch/${t}`,
  ];
  for (const target of targets) {
    for (const url of proxify(target)) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const html = await res.text();
        if (html.length < 5000) continue; // proxy gave us an error stub
        const parsed = parseBritannicaHtml(html);
        if (isGoodFeatured(parsed)) return parsed;
      } catch {
        // try next
      }
    }
  }
  return null;
}

export function TodayInHistoryCard() {
  const [dateKey, setDateKey] = useState(() => localDateKey());
  useEffect(() => {
    const t = setTimeout(() => setDateKey(localDateKey()), msUntilLocalMidnight());
    return () => clearTimeout(t);
  }, [dateKey]);

  const { data, isLoading } = useSWR<TodayResp>(
    `/api/today-in-history?d=${dateKey}`,
    fetcher,
    { refreshInterval: 1000 * 60 * 30, keepPreviousData: true, revalidateOnFocus: true },
  );

  // Client-side Britannica override — always tried, since the user
  // explicitly wants Britannica's content. Cached in localStorage per date.
  const [britannica, setBritannica] = useState<BritannicaFeatured | null>(null);
  useEffect(() => {
    const cacheKey = `britannica-tih.v4.${dateKey}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as BritannicaFeatured;
        if (isGoodFeatured(parsed)) { setBritannica(parsed); return; }
        localStorage.removeItem(cacheKey);
      }
    } catch {}
    let cancelled = false;
    (async () => {
      const now = new Date();
      const found = await fetchBritannicaFromBrowser(now);
      if (cancelled || !found) return;
      setBritannica(found);
      try { localStorage.setItem(cacheKey, JSON.stringify(found)); } catch {}
    })();
    return () => { cancelled = true; };
  }, [dateKey]);

  // Britannica wins when we got it. Otherwise Wikipedia fallback from server.
  const displayed: TodayResp = britannica
    ? {
        ...data,
        year: britannica.year,
        text: britannica.title,
        summary: britannica.summary,
        kind: "featured",
        source: "britannica",
        link: britannica.link,
      }
    : data ?? {};

  const labelKind =
    displayed.kind === "births" ? "Born today"
    : displayed.kind === "deaths" ? "Died today"
    : displayed.kind === "featured" ? "Featured event"
    : "On this day";

  const sourceLabel = displayed.source === "britannica" ? "Britannica" : displayed.source === "wikipedia" ? "Wikipedia" : null;

  // Require something that actually looks like a real headline. The previous
  // !displayed.text guard accepted one-word link labels ("Read", "More"),
  // which the Britannica scraper occasionally grabs from the wrong card
  // chunk — leaving the user with a thumbnail and a useless caption.
  const isMeaningfulText = (s: string | null | undefined): boolean => {
    if (!s) return false;
    const trimmed = s.trim();
    if (trimmed.length < 10) return false;
    if (/^(read|more|browse|see|view|details|home|next|previous)\b/i.test(trimmed)) return false;
    return true;
  };

  if (isLoading && !data) {
    return (
      <div className="animate-fadeIn">
        <div className="label mb-1.5">{labelKind}</div>
        <span className="text-muted text-xs italic">Loading…</span>
      </div>
    );
  }
  if (displayed.error || !isMeaningfulText(displayed.text)) {
    return (
      <div className="animate-fadeIn">
        <div className="label mb-1.5">{labelKind}</div>
        <span className="text-muted text-xs italic">No record for today.</span>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="label">{labelKind}</div>
        {sourceLabel && (
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted">
            via {sourceLabel}
          </div>
        )}
      </div>
      {/* Text-only render. We dropped the thumbnail because Britannica's
          card images regularly loaded ahead of a missing/invalid title,
          producing the "I see a picture but no text" failure mode. */}
      <div className="flex items-baseline gap-3">
        {displayed.year != null && (
          <span className="font-serif text-2xl font-light tabular-nums leading-none text-accent shrink-0">
            {displayed.year}
          </span>
        )}
        {displayed.link ? (
          <a
            href={displayed.link}
            target="_blank"
            rel="noreferrer"
            className="font-serif text-[14px] leading-snug min-w-0 hover:underline underline-offset-4 decoration-[var(--rule)]"
          >
            {displayed.text}
          </a>
        ) : (
          <span className="font-serif text-[14px] leading-snug min-w-0">
            {displayed.text}
          </span>
        )}
      </div>
      {displayed.summary && (
        <p className="font-serif text-[12.5px] leading-snug text-muted mt-1.5">
          {displayed.summary}
        </p>
      )}
    </div>
  );
}
