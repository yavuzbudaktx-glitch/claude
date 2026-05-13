"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Card } from "@/components/Card";
import type { UfcEvent, UfcFighter, UfcPayload } from "@/app/api/ufc/route";

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<UfcPayload>);

// UFC logo with several fallbacks — the ESPN combiner URL we used before
// returns a 404 from some regions; Wikimedia Commons hosts the canonical
// SVG and is rock-solid from anywhere.
const UFC_LOGO_URLS = [
  "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/UFC_Logo.svg/640px-UFC_Logo.svg.png",
  "https://a.espncdn.com/i/teamlogos/leagues/500/ufc.png",
  "https://a.espncdn.com/i/teamlogos/leagues/500-dark/ufc.png",
];

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
// fighter. Tries the URL the API returned first, then a couple of standard
// ESPN CDN patterns, then a generic silhouette.
function headshotCandidates(f: UfcFighter): string[] {
  const urls: string[] = [];
  if (f.headshot) {
    urls.push(f.headshot);
    // Some ESPN headshot URLs are missing the .png extension or hash key
    // that triggers caching; try the bare file too.
    if (f.headshot.includes("&w=")) {
      urls.push(f.headshot.replace(/&w=\d+/, ""));
    }
    const idMatch = f.headshot.match(/(\d+)\.png/);
    if (idMatch) {
      urls.push(`https://a.espncdn.com/i/headshots/mma/players/full/${idMatch[1]}.png`);
    }
  }
  return urls;
}

function FighterCell({ f, highlight }: { f: UfcFighter | null; highlight: boolean }) {
  if (!f) {
    return (
      <div className="flex flex-col items-center text-center min-w-0 flex-1">
        <div className="h-16 w-16 rounded-full border rule-soft bg-hl" />
        <div className="text-[11px] text-muted italic mt-2">TBD</div>
      </div>
    );
  }
  const candidates = headshotCandidates(f);
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
        className={`text-[12px] font-medium leading-snug mt-2 max-w-[110px] truncate ${
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
      action={
        <FallbackImg
          urls={UFC_LOGO_URLS}
          alt="UFC"
          className="h-5 w-auto opacity-80"
        />
      }
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
