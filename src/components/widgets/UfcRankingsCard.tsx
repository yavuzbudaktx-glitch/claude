"use client";

/* eslint-disable @next/next/no-img-element */
import useSWR from "swr";
import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { localDateKey, msUntilLocalMidnight } from "@/lib/local-date";
import { useRankChanges, RankArrow } from "@/lib/use-rank-changes";
import type { UfcRankingsResp, DivisionRanking } from "@/app/api/ufc-rankings/route";

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<UfcRankingsResp>);

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

function DivisionBlock({ d }: { d: DivisionRanking }) {
  // Track movement across the full ranked list so a contender climbing
  // from 6→5 still shows an arrow, even though only the top 5 are shown.
  const order = d.contenders.map((c) => c.id);
  const changes = useRankChanges(`morning.ufcrank.${d.division}`, order);
  const top5 = d.contenders.slice(0, 5);

  return (
    <div>
      <div className="label text-accent">{d.division}</div>

      <div className="mt-2 flex items-center gap-2.5">
        <div className="h-11 w-11 rounded-full overflow-hidden border border-[var(--glass-border)] bg-hl shrink-0 flex items-center justify-center">
          {d.championPhoto ? (
            <img
              src={d.championPhoto}
              alt={d.champion ?? ""}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="font-display text-[13px] text-accent">
              {d.champion ? initials(d.champion) : "—"}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-ink text-[14px] leading-tight truncate">
            {d.champion ?? "—"}
          </div>
          <div className="label !text-[9px] mt-0.5">Champion</div>
        </div>
      </div>

      <ul className="mt-3 divide-rule">
        {top5.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-[5px] text-[13px]">
            <span className="font-mono text-[11px] text-muted w-4 text-right tabular-nums shrink-0">
              {c.rank}
            </span>
            <span className="flex-1 truncate">{c.name}</span>
            <RankArrow change={changes[c.id]} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UfcRankingsCard() {
  // Re-key at local midnight so the rankings refresh nightly (in addition
  // to the hourly background revalidation) — picking up post-fight moves.
  const [dateKey, setDateKey] = useState(() => localDateKey());
  useEffect(() => {
    const t = setTimeout(() => setDateKey(localDateKey()), msUntilLocalMidnight());
    return () => clearTimeout(t);
  }, [dateKey]);

  const { data, isLoading, error } = useSWR<UfcRankingsResp>(
    `/api/ufc-rankings?d=${dateKey}`,
    fetcher,
    { refreshInterval: 1000 * 60 * 60, keepPreviousData: true, revalidateOnFocus: true },
  );

  const divisions = data?.divisions ?? [];

  return (
    <Card num="08" title="UFC Rankings">
      {isLoading && !data && <p className="text-muted text-sm">Loading…</p>}
      {error && !data && <p className="text-accent text-sm">Couldn&rsquo;t load rankings.</p>}
      {data && divisions.length === 0 && (
        <p className="text-muted text-xs italic">Rankings unavailable right now.</p>
      )}

      {divisions.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-6">
          {divisions.map((d) => (
            <DivisionBlock key={d.division} d={d} />
          ))}
        </div>
      )}

      <div className="font-mono text-[9px] uppercase tracking-wider text-muted mt-4">
        Top 5 contenders · arrows show this week&rsquo;s moves · refreshes nightly
      </div>
    </Card>
  );
}
