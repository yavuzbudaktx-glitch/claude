"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useEffect, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Card } from "@/components/Card";
import type { UfcEvent, UfcFighter, UfcPayload } from "@/app/api/ufc/route";

// Mirror of the slug helper in /api/ufc/route.ts. Kept inline so the
// client doesn't have to import a server module.
function ufcSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

const UFC_PHOTO_CACHE_KEY = "morning.ufc-photo.v1";

function readPhotoCache(name: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${UFC_PHOTO_CACHE_KEY}.${name}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { ts: number; url: string };
    if (Date.now() - entry.ts > 1000 * 60 * 60 * 24 * 7) return null; // 7d
    return entry.url;
  } catch {
    return null;
  }
}
function writePhotoCache(name: string, url: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${UFC_PHOTO_CACHE_KEY}.${name}`,
      JSON.stringify({ ts: Date.now(), url }),
    );
  } catch {}
}

async function scrapeUfcPhotoFromBrowser(name: string): Promise<string | null> {
  const target = `https://www.ufc.com/athlete/${ufcSlug(name)}`;
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(target)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    `https://proxy.cors.sh/${target}`,
    `https://thingproxy.freeboard.io/fetch/${target}`,
  ];
  for (const url of proxies) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const html = await res.text();
      const m = html.match(
        /https?:\/\/dmxg5wxfqgb4u\.cloudfront\.net\/[^"'\s)]+\.(?:png|jpg|jpeg|webp)/i,
      );
      if (m) return m[0];
    } catch {
      // try next proxy
    }
  }
  return null;
}

function useClientUfcPhoto(name: string, serverPrimary: string | null): string | null {
  const [photo, setPhoto] = useState<string | null>(() => readPhotoCache(name));
  useEffect(() => {
    if (!name) return;
    // If we already have a UFC.com Cloudfront URL from the server, trust it.
    if (serverPrimary && serverPrimary.includes("dmxg5wxfqgb4u.cloudfront.net")) return;
    if (photo) return;
    let cancelled = false;
    (async () => {
      const found = await scrapeUfcPhotoFromBrowser(name);
      if (cancelled || !found) return;
      setPhoto(found);
      writePhotoCache(name, found);
    })();
    return () => { cancelled = true; };
  }, [name, serverPrimary, photo]);
  return photo;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<UfcPayload>);

// UFC logo with several fallbacks. The Commons URL we tried before doesn't
// exist (the UFC logo is fair-use on English Wikipedia, not on Commons),
// hence the /wikipedia/en/ path. ESPN's league-logo CDN is the reliable
// backup, and we keep a stylized inline SVG as the final fallback so the
// header is never empty.
const UFC_LOGO_URLS = [
  "https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png",
  "https://upload.wikimedia.org/wikipedia/en/thumb/9/92/UFC_Logo.svg/240px-UFC_Logo.svg.png",
  "https://a.espncdn.com/i/teamlogos/leagues/500-dark/ufc.png",
];

function UfcLogo() {
  const [idx, setIdx] = useState(0);
  const [allFailed, setAllFailed] = useState(false);
  if (allFailed) {
    // Inline-SVG fallback — italic-bold "UFC" so the header still reads
    // as a UFC logo even when every external CDN is unreachable.
    return (
      <svg
        viewBox="0 0 60 20"
        className="h-5 w-auto opacity-80"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="UFC"
      >
        <text
          x="0"
          y="17"
          fontFamily="Impact, 'Arial Black', sans-serif"
          fontSize="20"
          fontWeight="900"
          fontStyle="italic"
          fill="currentColor"
          letterSpacing="-1"
        >
          UFC
        </text>
      </svg>
    );
  }
  return (
    <img
      src={UFC_LOGO_URLS[idx]}
      alt="UFC"
      className="h-5 w-auto opacity-80"
      referrerPolicy="no-referrer"
      onError={() => {
        if (idx + 1 < UFC_LOGO_URLS.length) setIdx(idx + 1);
        else setAllFailed(true);
      }}
    />
  );
}

function FallbackImg({
  urls,
  alt,
  className,
}: {
  urls: string[];
  alt: string;
  className?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [hidden, setHidden] = useState(false);
  if (hidden || urls.length === 0) return null;
  return (
    <img
      src={urls[idx]}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      onError={() => {
        if (idx + 1 < urls.length) setIdx(idx + 1);
        else setHidden(true);
      }}
    />
  );
}

// Build a list of candidate headshot URLs from whatever we know about the
// fighter. Tries the client-scraped UFC.com photo first (best quality),
// then the URLs the API returned, then ESPN CDN patterns, then a
// Wikipedia infobox image.
function headshotCandidates(f: UfcFighter, clientPhoto: string | null): string[] {
  const urls: string[] = [];
  if (clientPhoto) urls.push(clientPhoto);
  if (f.headshot && f.headshot !== clientPhoto) {
    urls.push(f.headshot);
    if (f.headshot.includes("&w=")) {
      urls.push(f.headshot.replace(/&w=\d+/, ""));
    }
    const idMatch = f.headshot.match(/(\d+)\.png/);
    if (idMatch) {
      urls.push(`https://a.espncdn.com/i/headshots/mma/players/full/${idMatch[1]}.png`);
      urls.push(`https://a.espncdn.com/combiner/i?img=/i/headshots/mma/players/full/${idMatch[1]}.png&w=120&h=120`);
    }
  }
  if (f.headshotFallback && !urls.includes(f.headshotFallback)) urls.push(f.headshotFallback);
  return urls;
}

function FighterCell({ f, highlight }: { f: UfcFighter | null; highlight: boolean }) {
  // Hook must run unconditionally; pass empty name when f is null so it no-ops.
  const clientPhoto = useClientUfcPhoto(f?.name ?? "", f?.headshot ?? null);
  if (!f) {
    return (
      <div className="flex flex-col items-center text-center min-w-0 flex-1">
        <div className="h-16 w-16 rounded-full border rule-soft bg-hl" />
        <div className="text-[11px] text-muted italic mt-2">TBD</div>
      </div>
    );
  }
  const candidates = headshotCandidates(f, clientPhoto);
  return (
    <div className="flex flex-col items-center text-center min-w-0 flex-1">
      <div
        className={`relative h-16 w-16 rounded-full overflow-hidden border bg-hl ${
          highlight ? "border-[var(--accent)]" : "rule-soft"
        }`}
      >
        {candidates.length > 0 && (
          <FallbackImg
            urls={candidates}
            alt={f.name}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div
        className={`text-[12px] font-medium leading-snug mt-2 max-w-[120px] truncate ${
          highlight ? "text-accent" : ""
        }`}
        title={f.name}
      >
        {f.name}
      </div>
      {f.record && (
        <div className="font-mono text-[10px] tracking-wider text-muted mt-0.5">
          {f.record}
        </div>
      )}
      {(f.division || f.country) && (
        <div className="font-mono text-[9px] tracking-wider text-muted mt-0.5 max-w-[120px] truncate">
          {[f.division, f.country].filter(Boolean).join(" · ")}
        </div>
      )}
      {f.status && f.status.toLowerCase() !== "active" && (
        <div className="font-mono text-[9px] tracking-wider text-accent mt-0.5 uppercase">
          {f.status}
        </div>
      )}
    </div>
  );
}

function PreviousBox({ ev }: { ev: UfcEvent }) {
  const date = (() => {
    try { return parseISO(ev.date); } catch { return null; }
  })();
  return (
    <div className="border rule rounded-md p-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="label">Previous · {ev.shortName}</span>
        {date && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {format(date, "MMM d, yyyy")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <FighterCell f={ev.fighterA} highlight={!!ev.fighterA?.winner} />
        <div className="text-center px-2">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted">vs</div>
        </div>
        <FighterCell f={ev.fighterB} highlight={!!ev.fighterB?.winner} />
      </div>
      {(ev.method || ev.weightClass) && (
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted mt-3 text-center">
          {ev.weightClass}
          {ev.weightClass && ev.method ? " · " : ""}
          {ev.method}
        </div>
      )}
    </div>
  );
}

function UpcomingBox({ ev }: { ev: UfcEvent }) {
  const date = (() => {
    try { return parseISO(ev.date); } catch { return null; }
  })();
  const daysUntil = date ? differenceInCalendarDays(date, new Date()) : null;
  const dayLabel =
    daysUntil == null
      ? null
      : daysUntil <= 0
        ? "Today"
        : daysUntil === 1
          ? "Tomorrow"
          : `In ${daysUntil} days`;
  return (
    <div className="border rule rounded-md p-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="label">Upcoming · {ev.shortName}</span>
        {dayLabel && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
            {dayLabel}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <FighterCell f={ev.fighterA} highlight={false} />
        <div className="text-center px-2">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted">vs</div>
        </div>
        <FighterCell f={ev.fighterB} highlight={false} />
      </div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted mt-3 text-center">
        {ev.weightClass}
        {ev.weightClass && date ? " · " : ""}
        {date && format(date, "EEE MMM d · h:mm a")}
      </div>
    </div>
  );
}

export function UfcCard() {
  const { data, isLoading, error } = useSWR<UfcPayload>("/api/ufc", fetcher, {
    refreshInterval: 1000 * 60 * 60,
    keepPreviousData: true,
    revalidateOnFocus: true,
    errorRetryCount: 3,
    errorRetryInterval: 3000,
  });

  return (
    <Card
      num="07"
      title="UFC"
      action={<UfcLogo />}
    >
      {isLoading && !data && <p className="text-muted text-sm">Loading…</p>}
      {error && !data && <p className="text-accent text-sm">Couldn&rsquo;t load UFC schedule.</p>}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.previous ? (
            <PreviousBox ev={data.previous} />
          ) : (
            <div className="border rule rounded-md p-4 text-muted text-xs italic flex items-center justify-center">
              No recent numbered event.
            </div>
          )}
          {data.upcoming ? (
            <UpcomingBox ev={data.upcoming} />
          ) : (
            <div className="border rule rounded-md p-4 text-muted text-xs italic flex items-center justify-center">
              No upcoming numbered event scheduled.
            </div>
          )}
        </div>
      )}

      <div className="font-mono text-[9px] uppercase tracking-wider text-muted mt-3">
        Source · ESPN
      </div>
    </Card>
  );
}
