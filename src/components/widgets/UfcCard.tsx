"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Card } from "@/components/Card";
import type { UfcEvent, UfcFighter, UfcPayload } from "@/app/api/ufc/route";

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<UfcPayload>);

// ESPN's CDN-hosted UFC logo. Public, no auth required.
const UFC_LOGO =
  "https://a.espncdn.com/combiner/i?img=/redesign/assets/img/logos/leaguelogos/ufc-260.png&w=260";

function FighterCell({ f, highlight }: { f: UfcFighter | null; highlight: boolean }) {
  if (!f) {
    return (
      <div className="flex flex-col items-center text-center min-w-0 flex-1">
        <div className="h-16 w-16 rounded-full border rule-soft bg-hl" />
        <div className="text-[11px] text-muted italic mt-2">TBD</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center text-center min-w-0 flex-1">
      <div
        className={`relative h-16 w-16 rounded-full overflow-hidden border ${
          highlight ? "border-[var(--accent)]" : "rule-soft"
        }`}
      >
        {f.headshot ? (
          <img
            src={f.headshot}
            alt={f.name}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="h-full w-full bg-hl" />
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
        <img
          src={UFC_LOGO}
          alt="UFC"
          className="h-5 w-auto opacity-80"
          referrerPolicy="no-referrer"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
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
