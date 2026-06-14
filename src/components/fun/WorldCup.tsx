"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { Trophy, Flag, Clock, MapPin } from "lucide-react";

// Live 2026 FIFA World Cup tracker — talks to /api/worldcup which proxies
// ESPN's free scoreboard. SWR refreshes every 60s so live scores tick.

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
const fetcher = (u: string) => fetch(u).then((r) => r.json() as Promise<WCResp>);

function fmtKickoff(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  } catch { return iso; }
}

function TeamRow({ t, winner }: { t: Team; winner: boolean }) {
  return (
    <div className={`flex items-center gap-2 min-w-0 ${winner ? "text-ink font-semibold" : "text-ink-soft"}`}>
      {t.logo
        ? <img src={t.logo} alt="" className="h-5 w-5 object-contain shrink-0" referrerPolicy="no-referrer" />
        : <span className="h-5 w-5 rounded-sm bg-[var(--rule)] shrink-0" />}
      <span className="text-[13px] truncate">{t.name || t.abbr}</span>
    </div>
  );
}

function MatchRow({ m, dim = false }: { m: Match; dim?: boolean }) {
  const live = m.status === "live";
  const final = m.status === "final";
  const showScore = m.home.score != null || m.away.score != null;

  return (
    <div className={`grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2 px-2.5 rounded-lg ${live ? "bg-[color-mix(in_srgb,var(--down)_8%,transparent)] ring-1 ring-[var(--down)]/30" : "hover:bg-[var(--rule-soft)]"} ${dim ? "opacity-70" : ""} transition`}>
      <TeamRow t={m.home} winner={final && m.home.winner} />
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
      <TeamRow t={m.away} winner={final && m.away.winner} />
    </div>
  );
}

export function WorldCup() {
  const { data, error, isLoading } = useSWR<WCResp>("/api/worldcup", fetcher, {
    refreshInterval: 60_000,
    keepPreviousData: true,
    revalidateOnFocus: true,
  });

  if (isLoading && !data) {
    return <div className="grid place-items-center h-full text-muted text-sm">Loading World Cup…</div>;
  }
  if (error || !data) {
    return <div className="grid place-items-center h-full text-down text-sm">Couldn&rsquo;t reach the World Cup feed.</div>;
  }

  const hasLive = data.live.length > 0;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center justify-between shrink-0">
        <div className="inline-flex items-center gap-2">
          <Trophy className="h-4 w-4 text-accent" />
          <span className="text-[14px] font-semibold text-ink">{data.tournament}</span>
          {hasLive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--down)]/15 text-down px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--down)] animate-pulse" /> {data.live.length} live
            </span>
          )}
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
        {hasLive && (
          <Section title="Live" icon={<span className="h-2 w-2 rounded-full bg-[var(--down)] animate-pulse" />}>
            {data.live.map((m) => <MatchRow key={m.id} m={m} />)}
          </Section>
        )}
        {data.today.length > 0 && (
          <Section title="Today" icon={<Clock className="h-3 w-3 text-muted-2" />}>
            {data.today.map((m) => <MatchRow key={m.id} m={m} />)}
          </Section>
        )}
        {data.upcoming.length > 0 && (
          <Section title="Coming up" icon={<MapPin className="h-3 w-3 text-muted-2" />}>
            {data.upcoming.map((m) => <MatchRow key={m.id} m={m} />)}
          </Section>
        )}
        {data.finished.length > 0 && (
          <Section title="Recent">
            {data.finished.map((m) => <MatchRow key={m.id} m={m} dim />)}
          </Section>
        )}
        {!hasLive && data.today.length === 0 && data.upcoming.length === 0 && data.finished.length === 0 && (
          <div className="text-muted-2 text-[12.5px] italic text-center py-8">
            No World Cup matches in the next few days.
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 px-2.5 mb-1">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted">{title}</span>
      </div>
      <div className="divide-y divide-[var(--rule-soft)]">{children}</div>
    </div>
  );
}
