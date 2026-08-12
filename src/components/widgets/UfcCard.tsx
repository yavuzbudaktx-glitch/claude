"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useEffect, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Card } from "@/components/Card";
import { localDateKey, msUntilLocalMidnight } from "@/lib/local-date";
import { useRankChanges, RankArrow } from "@/lib/use-rank-changes";
import { fetchUfcRankings, type DivisionRanking } from "@/lib/ufc-rankings-client";
import { useFreshAt } from "@/lib/use-fresh";
import type { UfcEvent, UfcFighter, UfcPayload } from "@/app/api/ufc/route";
import { fetchUfcFromBrowser } from "@/lib/sports-client";

// Mirror of the slug-candidate helper in /api/ufc/route.ts. Kept inline
// so the client doesn't have to import a server module.
function ufcSlugCandidates(name: string): string[] {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['‘’]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-");
  if (!base) return [];
  return [base, `${base}-1`, `${base}-2`];
}

// Bumped to v2 so any wrong-fighter URLs cached from previous builds
// get evicted automatically. Also shortened the TTL — a week was too
// long to live with a bad guess.
const UFC_PHOTO_CACHE_KEY = "morning.ufc-photo.v2";

function readPhotoCache(name: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${UFC_PHOTO_CACHE_KEY}.${name}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { ts: number; url: string };
    if (Date.now() - entry.ts > 1000 * 60 * 60 * 24) return null; // 1d
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

function pageMatchesFighter(html: string, fighterName: string): boolean {
  // Match the same name-verification logic as the server route — we only
  // trust a page's photo if every meaningful (≥3 char) token of the
  // fighter's name appears in its <title>/og:title/<h1>. Stops slug
  // collisions from putting the wrong fighter's portrait in this row.
  const tokens = fighterName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return false;
  const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").trim();
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const haystack = [
    titleMatch?.[1] ?? "",
    h1Match ? stripTags(h1Match[1]) : "",
    ogTitleMatch?.[1] ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return tokens.every((t) => haystack.includes(t));
}

function findClientUfcPhoto(html: string, name: string): string | null {
  const all = [
    ...html.matchAll(
      /https?:\/\/dmxg5wxfqgb4u\.cloudfront\.net\/[^"'\s)]+\.(?:png|jpg|jpeg|webp)/gi,
    ),
  ].map((m) => m[0]);
  if (all.length === 0) return null;
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const tokens = normalize(name).split(/\s+/).filter((t) => t.length >= 4);
  if (tokens.length === 0) return all[0];
  for (const url of all) {
    const filename = normalize(url.split("/").pop() ?? "");
    if (tokens.every((t) => filename.includes(t))) return url;
  }
  const last = tokens[tokens.length - 1];
  for (const url of all) {
    const filename = normalize(url.split("/").pop() ?? "");
    if (filename.includes(last)) return url;
  }
  return all[0];
}

async function scrapeUfcPhotoFromBrowser(name: string): Promise<string | null> {
  // Walk every slug candidate × every proxy; for each page that matches
  // this fighter, prefer a Cloudfront URL whose filename contains the
  // fighter's surname.
  const proxify = (target: string): string[] => [
    `https://corsproxy.io/?${encodeURIComponent(target)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    `https://proxy.cors.sh/${target}`,
    `https://thingproxy.freeboard.io/fetch/${target}`,
  ];
  for (const slug of ufcSlugCandidates(name)) {
    const target = `https://www.ufc.com/athlete/${slug}`;
    for (const url of proxify(target)) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const html = await res.text();
        if (!pageMatchesFighter(html, name)) continue;
        const photo = findClientUfcPhoto(html, name);
        if (photo) return photo;
      } catch {
        // try next proxy
      }
    }
  }
  return null;
}

// Image-search-based fallback. Mirrors what the user described ("search
// google for 'Illia Topuria PNG'") using sources that don't require an
// API key: Wikipedia article search returns the fighter's article, whose
// infobox image is reliably the right person. The query qualifier
// "UFC" narrows ambiguous names (multiple Alex Pereiras, etc).
interface WikiSearchResp { query?: { search?: Array<{ title?: string }> } }
interface WikiSummaryResp {
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
  type?: string;
}
async function searchFighterPhoto(name: string): Promise<string | null> {
  if (!name) return null;
  const queries = [`${name} UFC fighter`, `${name} MMA`, name];
  for (const q of queries) {
    try {
      const searchUrl =
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}` +
        `&srlimit=3&format=json&origin=*`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) continue;
      const searchJson = (await searchRes.json()) as WikiSearchResp;
      const hits = searchJson.query?.search ?? [];
      for (const hit of hits) {
        if (!hit.title) continue;
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/\s+/g, "_"))}`;
        try {
          const sumRes = await fetch(summaryUrl);
          if (!sumRes.ok) continue;
          const sumJson = (await sumRes.json()) as WikiSummaryResp;
          // Skip disambiguation pages — those have no real photo.
          if (sumJson.type === "disambiguation") continue;
          const img = sumJson.originalimage?.source ?? sumJson.thumbnail?.source;
          if (img) return img;
        } catch {
          // try next hit
        }
      }
    } catch {
      // try next query
    }
  }
  return null;
}

function useClientUfcPhoto(name: string, serverPrimary: string | null): string | null {
  const [photo, setPhoto] = useState<string | null>(() => readPhotoCache(name));
  useEffect(() => {
    if (!name) return;
    // Trust the server's primary URL when it's already a known-good
    // source — a /fighters/* file from the repo, or a UFC Cloudfront
    // URL. No reason to scrape and risk overwriting it with something
    // worse.
    if (
      serverPrimary &&
      (serverPrimary.startsWith("/fighters/") || serverPrimary.includes("dmxg5wxfqgb4u.cloudfront.net"))
    ) {
      return;
    }
    if (photo) return;
    let cancelled = false;
    (async () => {
      // First try UFC.com via CORS proxy; if that fails, fall back to the
      // image-search-style lookup (Wikipedia article infobox) — exactly
      // what the user described as "search google for {fighter} PNG".
      let found = await scrapeUfcPhotoFromBrowser(name);
      if (!found) found = await searchFighterPhoto(name);
      if (cancelled || !found) return;
      setPhoto(found);
      writePhotoCache(name, found);
    })();
    return () => { cancelled = true; };
  }, [name, serverPrimary, photo]);
  return photo;
}

// Server route first; if it comes back with nothing (ESPN throttling Vercel's
// IP, or the route hitting its own deadline) fall back to reading ESPN straight
// from the browser, which is on a residential IP it will serve. Same trick that
// fixed the Reddit feed.
const fetcher = async (url: string): Promise<UfcPayload> => {
  let server: UfcPayload | null = null;
  try {
    const r = await fetch(url);
    if (r.ok) server = (await r.json()) as UfcPayload;
  } catch { /* fall through to the browser path */ }
  if (server?.previous || server?.upcoming) return server;

  const direct = await fetchUfcFromBrowser();
  if (direct?.previous || direct?.upcoming) {
    return {
      previous: direct.previous as unknown as UfcEvent | null,
      upcoming: direct.upcoming as unknown as UfcEvent | null,
      source: "espn-browser",
    };
  }
  return server ?? { previous: null, upcoming: null, source: "none" };
};

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

// Build the ordered list of candidate URLs the FallbackImg cycles through.
// A local /fighters/* file from the repo wins outright when we have one —
// it's the user's own curated portrait, on the same origin, and always
// loads. Otherwise we try the client-scraped UFC photo, then anything the
// server returned (UFC.com / Wikipedia / ESPN URLs), then ESPN CDN
// variants extracted from the headshot id.
function headshotCandidates(f: UfcFighter, clientPhoto: string | null): string[] {
  const urls: string[] = [];
  const isLocal = (u: string | null) => !!u && u.startsWith("/fighters/");

  if (isLocal(f.headshot)) {
    urls.push(f.headshot!);
  } else {
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
      <a
        href={`https://www.ufc.com/athlete/${ufcSlugCandidates(f.name)[0] ?? ""}`}
        target="_blank"
        rel="noreferrer"
        className={`text-[12px] font-medium leading-snug mt-2 max-w-[120px] truncate hover:underline underline-offset-2 ${
          highlight ? "text-accent" : ""
        }`}
        title={`${f.name} — open UFC profile`}
      >
        {f.name}
      </a>
      {f.record && (
        <div className="font-mono text-[10px] tracking-wider text-muted mt-0.5">
          {f.record}
        </div>
      )}
      {f.division && (
        <div className="font-mono text-[9px] tracking-wider text-muted mt-0.5 max-w-[120px] truncate">
          {f.division}
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

function ChampionPhoto({ name }: { name: string }) {
  const { data } = useSWR<{ url: string | null }>(
    `/api/fighter-photo?name=${encodeURIComponent(name)}`,
    (u: string) => fetch(u).then((r) => r.json()),
    { revalidateOnFocus: false },
  );
  const [failed, setFailed] = useState(false);
  const url = data?.url;
  return (
    <div className="h-11 w-11 rounded-full overflow-hidden border border-[var(--glass-border)] bg-hl shrink-0 flex items-center justify-center">
      {url && !failed ? (
        <img
          src={url}
          alt={name}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="font-display text-[12px] text-accent">{initials(name)}</span>
      )}
    </div>
  );
}

function DivisionRankBlock({ d }: { d: DivisionRanking }) {
  // Track movement across the full ranked list so a contender climbing
  // 6→5 still shows an arrow even though only the top 5 are displayed.
  const order = d.contenders.map((c) => c.id);
  const changes = useRankChanges(`morning.ufcrank.${d.division}`, order);
  const top5 = d.contenders.slice(0, 5);
  return (
    <div>
      <div className="label text-accent">{d.division}</div>
      {d.champion && (
        <div className="mt-1.5 flex items-center gap-2.5">
          <ChampionPhoto name={d.champion} />
          <div className="min-w-0">
            <a
              href={`https://www.ufc.com/athlete/${ufcSlugCandidates(d.champion)[0] ?? ""}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-ink text-[13.5px] leading-tight truncate block hover:underline underline-offset-2"
              title={`${d.champion} — open UFC profile`}
            >
              {d.champion}
            </a>
            <div className="label !text-[9px] mt-0.5">Champion</div>
          </div>
        </div>
      )}
      <ul className="mt-2 divide-rule">
        {top5.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-[5px] text-[13px]">
            <span className="font-mono text-[11px] text-muted w-4 text-right tabular-nums shrink-0">
              {c.rank}
            </span>
            <a
              href={`https://www.ufc.com/athlete/${ufcSlugCandidates(c.name)[0] ?? ""}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 truncate hover:underline underline-offset-2 hover:text-accent transition"
              title={`${c.name} — open UFC profile`}
            >
              {c.name}
            </a>
            <RankArrow change={changes[c.id]} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function UfcRankings() {
  // Re-key at local midnight so rankings refresh nightly (plus hourly in
  // the background), picking up post-fight moves within the hour.
  const [dateKey, setDateKey] = useState(() => localDateKey());
  useEffect(() => {
    const t = setTimeout(() => setDateKey(localDateKey()), msUntilLocalMidnight());
    return () => clearTimeout(t);
  }, [dateKey]);

  const { data, isLoading } = useSWR<DivisionRanking[]>(
    `ufc-rankings:${dateKey}`,
    () => fetchUfcRankings(),
    { refreshInterval: 1000 * 60 * 60, keepPreviousData: true, revalidateOnFocus: false },
  );

  const divisions = data ?? [];

  if (isLoading && !data) {
    return (
      <div className="mt-5 pt-4 border-t rule">
        <p className="text-muted text-xs italic">Loading rankings…</p>
      </div>
    );
  }
  if (divisions.length === 0) {
    return (
      <div className="mt-5 pt-4 border-t rule">
        <p className="text-muted text-xs italic">Rankings unavailable right now.</p>
      </div>
    );
  }

  return (
    <div className="mt-5 pt-4 border-t rule">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-5">
        {divisions.map((d) => (
          <DivisionRankBlock key={d.division} d={d} />
        ))}
      </div>
    </div>
  );
}

export function UfcCard() {
  const { data, isLoading, error, isValidating, mutate } = useSWR<UfcPayload>("/api/ufc", fetcher, {
    refreshInterval: 1000 * 60 * 60,
    keepPreviousData: true,
    revalidateOnFocus: true,
    errorRetryCount: 3,
    errorRetryInterval: 3000,
  });
  const updatedAt = useFreshAt(data);

  return (
    <Card
      num="07"
      title="UFC"
      action={<UfcLogo />}
      status={{ updatedAt, loading: isValidating, error: !!error && !data, onRetry: () => mutate() }}
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

      <UfcRankings />

      <div className="font-mono text-[9px] uppercase tracking-wider text-muted mt-3">
        Source · ESPN
      </div>
    </Card>
  );
}
