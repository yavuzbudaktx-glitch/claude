"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useEffect, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Card } from "@/components/Card";
import { localDateKey, msUntilLocalMidnight } from "@/lib/local-date";

interface Standing {
  rank: number;
  team: string;
  teamId: string;
  badge: string | null;
  played: number;
  win: number;
  draw: number;
  loss: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  form: string | null;
}

interface Match {
  id: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  date: string;
  venue: string | null;
  league: string | null;
  isFinished?: boolean;
}

interface Resp {
  source?: string;
  standings: Standing[];
  last: Match | null;
  next: Match | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<Resp>);

const BESIKTAS_NAMES = ["beşiktaş", "besiktas", "beşiktaş jk", "besiktas jk"];
function isBesiktas(name: string) {
  return BESIKTAS_NAMES.some((n) => name.toLowerCase().includes(n));
}

function MatchBox({
  label,
  match,
  variant,
}: {
  label: string;
  match: Match;
  variant: "last" | "next";
}) {
  let date: Date | null = null;
  try { date = parseISO(match.date); } catch {}

  const finished = !!match.isFinished;
  const daysUntil =
    variant === "next" && date ? differenceInCalendarDays(date, new Date()) : null;
  const dayLabel =
    daysUntil == null
      ? null
      : daysUntil <= 0
        ? "Today"
        : daysUntil === 1
          ? "Tomorrow"
          : `In ${daysUntil} days`;

  return (
    <div className="border rule rounded-md p-2.5">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="label">{label}</span>
        {variant === "next" && dayLabel && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
            {dayLabel}
          </span>
        )}
        {variant === "last" && match.league && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted truncate max-w-[60%]">
            {match.league}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-[12px]">
        <span className={`flex-1 truncate text-right ${isBesiktas(match.home) ? "font-medium" : ""}`}>
          {match.home}
        </span>
        <span className="font-mono tabular-nums px-2 py-0.5 border rule rounded shrink-0">
          {finished ? `${match.homeScore ?? "-"} – ${match.awayScore ?? "-"}` : "vs"}
        </span>
        <span className={`flex-1 truncate ${isBesiktas(match.away) ? "font-medium" : ""}`}>
          {match.away}
        </span>
      </div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted mt-1 flex items-center gap-1.5">
        {date && (
          <span>
            {format(date, finished ? "MMM d, yyyy" : "EEE MMM d · h:mm a")}
          </span>
        )}
        {variant === "next" && match.league && (
          <>
            <span className="opacity-50">·</span>
            <span className="truncate">{match.league}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function SuperLigCard() {
  // Same local-midnight key trick used by TodayInHistory + verse so the
  // standings forcibly re-fetch at the user's local 00:00 in addition to the
  // hourly refresh interval.
  const [dateKey, setDateKey] = useState(() => localDateKey());
  useEffect(() => {
    const t = setTimeout(() => setDateKey(localDateKey()), msUntilLocalMidnight());
    return () => clearTimeout(t);
  }, [dateKey]);

  const { data, error, isLoading } = useSWR<Resp>(
    `/api/superlig?d=${dateKey}`,
    fetcher,
    {
      refreshInterval: 1000 * 60 * 60,
      keepPreviousData: true,
      revalidateOnFocus: true,
    },
  );

  return (
    <Card num="06" title="Süper Lig">
      {isLoading && !data && <p className="text-muted text-sm">Loading…</p>}
      {error && !data && <p className="text-accent text-sm">Couldn&rsquo;t load standings.</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {data.last ? (
              <MatchBox label="Last match" match={data.last} variant="last" />
            ) : (
              <div className="border rule rounded-md p-2.5 text-muted text-xs italic flex items-center justify-center">
                No recent match.
              </div>
            )}
            {data.next ? (
              <MatchBox label="Next match" match={data.next} variant="next" />
            ) : (
              <div className="border rule rounded-md p-2.5 text-muted text-xs italic flex items-center justify-center">
                No fixture scheduled.
              </div>
            )}
          </div>

          {data.standings.length === 0 ? (
            <p className="text-muted text-xs italic">Standings unavailable.</p>
          ) : (
            <div className="overflow-hidden">
              <div className="grid grid-cols-[20px_1fr_28px_28px_28px] gap-x-2 label pb-1 border-b rule-soft">
                <span>#</span>
                <span>Team</span>
                <span className="text-right">P</span>
                <span className="text-right">GD</span>
                <span className="text-right">Pts</span>
              </div>
              <ul className="divide-rule max-h-[280px] overflow-y-auto pr-1">
                {data.standings.map((s) => {
                  const bk = isBesiktas(s.team);
                  return (
                    <li
                      key={s.teamId || s.team}
                      className={`grid grid-cols-[20px_1fr_28px_28px_28px] gap-x-2 items-center py-1.5 text-[12px] ${
                        bk ? "bg-hl -mx-2 px-2 rounded" : ""
                      }`}
                    >
                      <span className={`font-mono tabular-nums text-right ${bk ? "text-accent font-bold" : "text-muted"}`}>
                        {s.rank}
                      </span>
                      <span className="flex items-center gap-2 min-w-0">
                        {s.badge && (
                          <img
                            src={s.badge}
                            alt=""
                            className="h-4 w-4 object-contain shrink-0"
                            referrerPolicy="no-referrer"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                        <span className={`truncate ${bk ? "font-medium" : ""}`}>{s.team}</span>
                      </span>
                      <span className="font-mono tabular-nums text-right text-muted">{s.played}</span>
                      <span className="font-mono tabular-nums text-right text-muted">
                        {s.gd > 0 ? `+${s.gd}` : s.gd}
                      </span>
                      <span className={`font-mono tabular-nums text-right ${bk ? "font-bold" : ""}`}>{s.points}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {data.source && (
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted mt-3">
              Source · {data.source === "espn" ? "ESPN" : "TheSportsDB"}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
