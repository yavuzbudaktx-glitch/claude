"use client";

/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Trophy, Flag, Clock, BarChart3, ListChecks } from "lucide-react";

// Live 2026 FIFA World Cup tracker — talks to /api/worldcup for matches and
// /api/worldcup/standings for group tables. SWR refreshes every 60s.

interface Team { name: string; abbr: string; logo: string; score: number | null; winner: boolean }
interface Match {
  id: string;
  status: "live" | "upcoming" | "final";
  state: string;
  date: string;
  group?: string;
  home: Team; away: Team;
  venue?: string;
}
interface WCResp {
  tournament: string;
  live: Match[];
  today: Match[];
  upcoming: Match[];
  finished: Match[];
  turkiye: Match | null;
}
interface BracketTeam { name: string; abbr: string; logo: string; score: number | null; winner: boolean; placeholder: boolean }
interface BracketMatch { id: string; status: "live" | "upcoming" | "final"; state: string; date: string; home: BracketTeam; away: BracketTeam; round: string }
interface BracketRound { name: string; matches: BracketMatch[] }
interface BracketResp { tournament: string; rounds: BracketRound[] }

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function fmtKickoff(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  } catch { return iso; }
}

function TeamFlag({ logo, alt, size = 20 }: { logo: string; alt: string; size?: number }) {
  if (logo) {
    return <img src={logo} alt={alt} className="object-contain shrink-0" style={{ height: size, width: size }} referrerPolicy="no-referrer" />;
  }
  return <span className="rounded-sm bg-[var(--rule)] shrink-0" style={{ height: size, width: size }} />;
}

function LiveHero({ m }: { m: Match }) {
  return (
    <div className="rounded-xl border border-[var(--down)]/40 bg-[color-mix(in_srgb,var(--down)_8%,transparent)] p-3.5 relative overflow-hidden">
      <div className="absolute top-2.5 right-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--down)]/15 text-down px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--down)] animate-pulse" /> LIVE · {m.state}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mt-1">
        <div className="flex items-center justify-end gap-2 min-w-0">
          <span className={`text-[14px] truncate ${m.home.winner ? "font-bold text-ink" : "font-medium text-ink-soft"}`}>{m.home.name || m.home.abbr}</span>
          <TeamFlag logo={m.home.logo} alt={m.home.name} size={32} />
        </div>
        <div className="font-mono tabular-nums text-[22px] font-extrabold text-ink text-center min-w-[80px]">
          {m.home.score ?? 0} <span className="text-muted-2 font-normal">–</span> {m.away.score ?? 0}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <TeamFlag logo={m.away.logo} alt={m.away.name} size={32} />
          <span className={`text-[14px] truncate ${m.away.winner ? "font-bold text-ink" : "font-medium text-ink-soft"}`}>{m.away.name || m.away.abbr}</span>
        </div>
      </div>
      {m.group && <div className="text-[10px] text-muted-2 mt-1.5 text-center uppercase tracking-wider">{m.group}</div>}
    </div>
  );
}

function MatchRow({ m, dim = false }: { m: Match; dim?: boolean }) {
  const live = m.status === "live";
  const final = m.status === "final";
  const showScore = m.home.score != null || m.away.score != null;

  return (
    <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2 px-2.5 rounded-lg ${live ? "bg-[color-mix(in_srgb,var(--down)_8%,transparent)] ring-1 ring-[var(--down)]/30" : "hover:bg-[var(--rule-soft)]"} ${dim ? "opacity-70" : ""} transition`}>
      <div className={`flex items-center justify-end gap-2 min-w-0 ${final && m.home.winner ? "font-semibold text-ink" : "text-ink-soft"}`}>
        <span className="text-[13px] truncate">{m.home.name || m.home.abbr}</span>
        <TeamFlag logo={m.home.logo} alt={m.home.name} />
      </div>
      <div className="text-center min-w-[78px]">
        {showScore ? (
          <div className="font-mono tabular-nums text-[15px] font-bold text-ink">
            {m.home.score ?? "-"} <span className="text-muted-2 font-normal">–</span> {m.away.score ?? "-"}
          </div>
        ) : (
          <div className="text-[10.5px] uppercase tracking-wider text-muted">{m.state || fmtKickoff(m.date)}</div>
        )}
        <div className={`text-[9.5px] uppercase tracking-wider mt-0.5 ${live ? "text-down font-bold animate-pulse" : "text-muted-2"}`}>
          {live ? `LIVE · ${m.state}` : final ? "FT" : m.group ?? fmtKickoff(m.date)}
        </div>
      </div>
      <div className={`flex items-center gap-2 min-w-0 ${final && m.away.winner ? "font-semibold text-ink" : "text-ink-soft"}`}>
        <TeamFlag logo={m.away.logo} alt={m.away.name} />
        <span className="text-[13px] truncate">{m.away.name || m.away.abbr}</span>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <div className="flex items-center gap-1.5 px-2.5 mb-1">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted">{title}</span>
      </div>
      <div className="divide-y divide-[var(--rule-soft)]">{children}</div>
    </div>
  );
}

function BracketTeamRow({ t, live }: { t: BracketTeam; live: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 px-2 py-1 ${t.winner ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : ""}`}>
      <span className="flex items-center gap-1.5 min-w-0">
        <TeamFlag logo={t.logo} alt={t.name} size={15} />
        <span className={`text-[11.5px] truncate ${t.placeholder ? "text-muted-2 italic" : t.winner ? "font-bold text-ink" : "text-ink-soft"}`}>
          {t.name || t.abbr || "TBD"}
        </span>
      </span>
      {t.score != null && (
        <span className={`font-mono tabular-nums text-[11.5px] shrink-0 ${live ? "text-down font-bold" : t.winner ? "text-ink font-bold" : "text-muted"}`}>{t.score}</span>
      )}
    </div>
  );
}

function BracketMatchCard({ m }: { m: BracketMatch }) {
  const live = m.status === "live";
  return (
    <div className={`rounded-lg border overflow-hidden ${live ? "border-[var(--down)]/50" : "border-[var(--rule)]"} bg-[var(--paper)]/30`}>
      <div className="divide-y divide-[var(--rule-soft)]">
        <BracketTeamRow t={m.home} live={live} />
        <BracketTeamRow t={m.away} live={live} />
      </div>
      <div className={`px-2 py-0.5 text-[8.5px] uppercase tracking-wider text-center ${live ? "text-down font-bold animate-pulse" : "text-muted-2"}`}>
        {live ? `Live · ${m.state}` : m.status === "final" ? "FT" : fmtKickoff(m.date)}
      </div>
    </div>
  );
}

function Bracket({ rounds }: { rounds: BracketRound[] }) {
  // Third-place match rides in the same column as the Final.
  const columns = rounds.filter((r) => r.name !== "Third Place");
  const thirdPlace = rounds.find((r) => r.name === "Third Place");
  return (
    <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className="flex gap-3 min-w-max items-stretch">
        {columns.map((r) => (
          <div key={r.name} className="flex flex-col min-w-[150px]">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted mb-1.5 text-center">{r.name}</div>
            {/* Evenly space matches down the column so later rounds read like a
                bracket funnelling inward. */}
            <div className="flex flex-col justify-around gap-2 flex-1">
              {r.matches.map((m) => <BracketMatchCard key={m.id} m={m} />)}
              {r.name === "Final" && thirdPlace?.matches[0] && (
                <div className="mt-1">
                  <div className="text-[9px] font-mono uppercase tracking-wider text-muted-2 mb-1 text-center">Third place</div>
                  <BracketMatchCard m={thirdPlace.matches[0]} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorldCup() {
  const [tab, setTab] = useState<"matches" | "bracket">("matches");

  const { data, error, isLoading } = useSWR<WCResp>("/api/worldcup", fetcher, {
    refreshInterval: 60_000,
    keepPreviousData: true,
    revalidateOnFocus: true,
  });
  const { data: bracket, isLoading: loadingB } = useSWR<BracketResp>(
    tab === "bracket" ? "/api/worldcup/bracket" : null,
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: false, refreshInterval: 60_000 },
  );

  // Bucket today/upcoming/finished in the USER'S local time (browser TZ),
  // not whatever the server's UTC clock thinks "today" is. This is the fix
  // for "World Cup matches don't show correctly today/tomorrow — thinks I'm
  // in Turkey": the server lives in UTC, so once UTC rolled over, tonight's
  // Dallas-time matches were getting classified as tomorrow.
  // Hook must run above the early returns to satisfy rules-of-hooks.
  const { todayBucket, upcomingBucket, finishedBucket } = useMemo(() => {
    const localKey = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const todayLocal = localKey(new Date().toISOString());
    const upc = data?.upcoming ?? [];
    const todayB = upc.filter((m) => localKey(m.date) === todayLocal);
    const upcomingB = upc.filter((m) => localKey(m.date) !== todayLocal).slice(0, 6);
    const finishedB = (data?.finished ?? []).filter((m) => localKey(m.date) !== todayLocal).slice(0, 6);
    return { todayBucket: todayB, upcomingBucket: upcomingB, finishedBucket: finishedB };
  }, [data?.upcoming, data?.finished]);

  if (isLoading && !data) {
    return <div className="grid place-items-center h-full text-muted text-sm">Loading World Cup…</div>;
  }
  if (error || !data) {
    return <div className="grid place-items-center h-full text-down text-sm">Couldn&rsquo;t reach the World Cup feed.</div>;
  }

  const hasLive = data.live.length > 0;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center justify-between shrink-0 gap-3 flex-wrap">
        <div className="inline-flex items-center gap-2">
          <Trophy className="h-4 w-4 text-accent" />
          <span className="text-[14px] font-semibold text-ink">{data.tournament}</span>
          {hasLive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--down)]/15 text-down px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--down)] animate-pulse" /> {data.live.length} live
            </span>
          )}
        </div>

        <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[var(--rule-soft)]">
          <button
            onClick={() => setTab("matches")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${tab === "matches" ? "bg-[var(--paper)] text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            <ListChecks className="h-3 w-3" /> Matches
          </button>
          <button
            onClick={() => setTab("bracket")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${tab === "bracket" ? "bg-[var(--paper)] text-ink shadow-sm" : "text-muted hover:text-ink"}`}
          >
            <BarChart3 className="h-3 w-3" /> Bracket
          </button>
        </div>

        {data.turkiye && (
          <a
            href="https://www.espn.com/soccer/team/_/id/3050/turkey"
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-muted hover:text-accent transition"
            title="Türkiye watch"
          >
            <Flag className="h-3 w-3" />
            <span className="font-medium">Türkiye</span>
            <span className="text-muted-2">·</span>
            <span className="font-mono tabular-nums">
              {data.turkiye.status === "final" && data.turkiye.home.score != null
                ? `${data.turkiye.home.score}-${data.turkiye.away.score}`
                : fmtKickoff(data.turkiye.date)}
            </span>
          </a>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        {tab === "matches" ? (
          <>
            {hasLive && (
              <div className="space-y-2 mb-3">
                {data.live.map((m) => <LiveHero key={m.id} m={m} />)}
              </div>
            )}
            {todayBucket.length > 0 && (
              <Section title="Today" icon={<Clock className="h-3 w-3 text-muted-2" />}>
                {todayBucket.map((m) => <MatchRow key={m.id} m={m} />)}
              </Section>
            )}
            {upcomingBucket.length > 0 && (
              <Section title="Coming up">
                {upcomingBucket.map((m) => <MatchRow key={m.id} m={m} />)}
              </Section>
            )}
            {finishedBucket.length > 0 && (
              <Section title="Recent">
                {finishedBucket.map((m) => <MatchRow key={m.id} m={m} dim />)}
              </Section>
            )}
            {!hasLive && todayBucket.length === 0 && upcomingBucket.length === 0 && finishedBucket.length === 0 && (
              <div className="text-muted-2 text-[12.5px] italic text-center py-8">
                No World Cup matches in the next few days.
              </div>
            )}
          </>
        ) : (
          <>
            {loadingB && !bracket && (
              <div className="text-muted text-sm py-6 text-center">Loading bracket…</div>
            )}
            {bracket?.rounds && bracket.rounds.length > 0 ? (
              <Bracket rounds={bracket.rounds} />
            ) : !loadingB && (
              <div className="text-muted-2 text-[12.5px] italic text-center py-8">
                The bracket fills in once the group stage ends — check back after the knockout draw.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
