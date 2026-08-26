"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { fetchSuperLigStandingsFromBrowser, fetchTeamFixturesFromBrowser, fetchSportsDbFixtures, type LiteFixture } from "@/lib/sports-client";
import { useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Card } from "@/components/Card";
import { localDateKey, msUntilLocalMidnight } from "@/lib/local-date";
import { useRankChanges, RankArrow } from "@/lib/use-rank-changes";
import { usePref } from "@/components/PrefsProvider";
import { useFreshAt } from "@/lib/use-fresh";

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

// Server route first, then patch any gaps from the browser. The route races a
// pile of upstreams, but when all of them throttle Vercel's IP it returns empty
// and the card had nothing. ESPN answers cross-origin GETs, so the browser can
// fill in the table and the fixtures itself. Each half is patched
// independently — a working table shouldn't be thrown away because the fixture
// lookup failed, or the reverse.
// The browser fetchers return a LiteFixture, which is deliberately narrower
// than the route's Match. It used to be cast straight across with
// `as unknown as Match`, which compiled fine and then rendered every played
// match as "vs" with no score — because `isFinished` (what MatchBox keys the
// score off) and `league` (spelled `competition` upstream) simply weren't
// there. Map the fields explicitly so that can't happen again.
function liteToMatch(f: LiteFixture | null | undefined): Match | null {
  if (!f) return null;
  return {
    id: `${f.date}-${f.home}-${f.away}`,
    home: f.home,
    away: f.away,
    homeScore: f.homeScore,
    awayScore: f.awayScore,
    date: f.date,
    venue: f.venue,
    league: f.competition,
    isFinished: f.isFinished,
  };
}

const fetcher = async (url: string): Promise<Resp> => {
  let server: Resp | null = null;
  try {
    const r = await fetch(url);
    if (r.ok) server = (await r.json()) as Resp;
  } catch { /* fall through */ }

  const teamName = decodeURIComponent(new URL(url, window.location.origin).searchParams.get("team") ?? "Beşiktaş");
  const teamId = Number(new URL(url, window.location.origin).searchParams.get("teamId")) || 1895;

  // The diagnostic showed ESPN returns 403 to Vercel but 200 to the browser, so
  // the browser is the reliable path — but the server still "succeeds" with a
  // junk 5-row TheSportsDB preseason table, which meant a simple
  // "only fall back when empty" test never fired. The Süper Lig has 18 teams,
  // so anything under 12 rows is treated as not-a-real-table and we take
  // whichever source actually returns a full one.
  const serverRows = server?.standings?.length ?? 0;
  const wantTable = serverRows < 12;
  // Either half missing is enough reason to go look. The old test needed BOTH
  // to be missing, so a route that found the next fixture but not the last one
  // left "Last match" permanently empty.
  const wantFixtures = !server?.last || !server?.next;

  // Ask BOTH fixture sources at once rather than treating TheSportsDB as a
  // last resort. ESPN's team schedule regularly has the played matches but no
  // upcoming one, and the old "only try SportsDB if ESPN gave nothing at all"
  // rule meant that case left Next match permanently blank.
  const [table, espnFixtures, sdbFixtures] = await Promise.all([
    wantTable ? fetchSuperLigStandingsFromBrowser() : Promise.resolve(null),
    wantFixtures ? fetchTeamFixturesFromBrowser(teamId) : Promise.resolve(null),
    wantFixtures ? fetchSportsDbFixtures(teamName) : Promise.resolve(null),
  ]);

  const standings = (table && table.length > serverRows)
    ? (table as unknown as Standing[])
    : (server?.standings ?? []);

  // Merge every source per half: the most recent past match wins "last", the
  // soonest future one wins "next". A source that only knows about one of them
  // still contributes it.
  const now = Date.now();
  const candidates = [
    server?.last, server?.next,
    liteToMatch(espnFixtures?.last), liteToMatch(espnFixtures?.next),
    liteToMatch(sdbFixtures?.last), liteToMatch(sdbFixtures?.next),
  ].filter((m): m is Match => !!m && !!m.date && Number.isFinite(Date.parse(m.date)));

  const past = candidates.filter((m) => Date.parse(m.date) <= now || m.isFinished);
  const future = candidates.filter((m) => !(Date.parse(m.date) <= now || m.isFinished));
  past.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  future.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  return {
    source: [
      server?.source,
      table && table.length > serverRows ? "table:espn-browser" : null,
      espnFixtures?.last || espnFixtures?.next ? "fixtures:espn-browser" : null,
      sdbFixtures?.last || sdbFixtures?.next ? "fixtures:sportsdb" : null,
    ].filter(Boolean).join("+") || "none",
    standings,
    last: past[0] ?? null,
    next: future[0] ?? null,
  };
};

// The team whose last/next match is tracked. Synced across devices.
interface SelectedTeam { name: string; teamId: string }
const DEFAULT_TEAM: SelectedTeam = { name: "Beşiktaş", teamId: "1895" };

function normTeam(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function sameTeam(a: string, b: string): boolean {
  const x = normTeam(a);
  const y = normTeam(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function MatchBox({
  label,
  match,
  variant,
  selectedName,
}: {
  label: string;
  match: Match;
  variant: "last" | "next";
  selectedName: string;
}) {
  let date: Date | null = null;
  try { date = parseISO(match.date); } catch {}

  // Two independent reasons to show a scoreline: the source said the match is
  // finished, or it handed us both numbers. Keying on the flag alone meant one
  // upstream that forgot to set it blanked out a result we already had.
  const hasScore = match.homeScore != null && match.awayScore != null;
  const finished = !!match.isFinished || hasScore;
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
        <span className={`flex-1 truncate text-right ${sameTeam(match.home, selectedName) ? "font-medium text-accent" : ""}`}>
          {match.home}
        </span>
        <span className="font-mono tabular-nums px-2 py-0.5 border rule rounded shrink-0">
          {hasScore ? `${match.homeScore} – ${match.awayScore}` : finished ? "FT" : "vs"}
        </span>
        <span className={`flex-1 truncate ${sameTeam(match.away, selectedName) ? "font-medium text-accent" : ""}`}>
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

  // The team whose fixtures we show — synced across devices.
  const [selected, setSelected] = usePref<SelectedTeam>("superligTeam", DEFAULT_TEAM);

  function pickTeam(s: Standing) {
    setSelected({ name: s.team, teamId: s.teamId });
  }

  const { data, error, isLoading, isValidating, mutate } = useSWR<Resp>(
    `/api/superlig?team=${encodeURIComponent(selected.name)}&teamId=${encodeURIComponent(selected.teamId)}&d=${dateKey}`,
    fetcher,
    {
      refreshInterval: 1000 * 60 * 60,
      keepPreviousData: true,
      revalidateOnFocus: true,
    },
  );

  // Track week-over-week position moves for the up/down arrows.
  const standingsOrder = useMemo(
    () => (data?.standings ?? []).map((s) => s.teamId || s.team),
    [data],
  );
  const rankChanges = useRankChanges("morning.superlig.rank", standingsOrder);
  const updatedAt = useFreshAt(data);

  return (
    <Card num="06" title="Süper Lig"
      status={{ updatedAt, loading: isValidating, error: !!error && !data, onRetry: () => mutate() }}>
      {isLoading && !data && <p className="text-muted text-sm">Loading…</p>}
      {error && !data && <p className="text-accent text-sm">Couldn&rsquo;t load standings.</p>}

      {data && (
        <>
          <div className="flex items-baseline justify-between mb-2">
            <div className="label">{selected.name} · Fixtures</div>
            <div className="font-mono text-[9px] uppercase tracking-wider text-muted-2">
              tap a team to track
            </div>
          </div>
          <div className="mb-4">
            {data.last ? (
              <MatchBox label="Last match" match={data.last} variant="last" selectedName={selected.name} />
            ) : (
              <div className="border rule rounded-md p-3 text-muted text-xs italic flex items-center justify-center">
                No recent match.
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
              <ul className="divide-rule">
                {data.standings.map((s) => {
                  const sel = sameTeam(s.team, selected.name);
                  return (
                    <li
                      key={s.teamId || s.team}
                      onClick={() => pickTeam(s)}
                      title={`Track ${s.team}'s fixtures`}
                      className={`grid grid-cols-[20px_1fr_28px_28px_28px] gap-x-2 items-center py-1.5 text-[12px] cursor-pointer rounded px-1 transition ${
                        sel ? "bg-hl" : "hover:bg-[var(--rule-soft)]"
                      }`}
                    >
                      <span className={`font-mono tabular-nums text-right ${sel ? "text-accent font-bold" : "text-muted"}`}>
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
                        <span className={`truncate ${sel ? "font-medium" : ""}`}>{s.team}</span>
                        <RankArrow change={rankChanges[s.teamId || s.team]} />
                      </span>
                      <span className="font-mono tabular-nums text-right text-muted">{s.played}</span>
                      <span className="font-mono tabular-nums text-right text-muted">
                        {s.gd > 0 ? `+${s.gd}` : s.gd}
                      </span>
                      <span className={`font-mono tabular-nums text-right ${sel ? "font-bold" : ""}`}>{s.points}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="mt-4">
            {data.next ? (
              <MatchBox label="Next match" match={data.next} variant="next" selectedName={selected.name} />
            ) : (
              <div className="border rule rounded-md p-3 text-muted text-xs italic flex flex-col items-center justify-center gap-0.5">
                <span>No fixture scheduled for {selected.name}.</span>
                <span className="text-muted-2 text-[10.5px]">Likely off-season.</span>
              </div>
            )}
          </div>

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
