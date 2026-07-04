"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trophy, Swords, Hourglass } from "lucide-react";
import { Card } from "@/components/Card";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import { ZuyaWordle, type WordleOutcome, type BoardRow } from "@/components/zuya/ZuyaWordle";
import { zuyaToday } from "@/lib/zuya/day";
import type { ZuyaWordleResultRow } from "@/types/zuya";

function MiniBoard({ board }: { board: BoardRow[] }) {
  return (
    <div className="inline-grid gap-0.5">
      {board.map((row, r) => (
        <div key={r} className="grid grid-cols-5 gap-0.5">
          {row.map((t, c) => (
            <span
              key={c}
              className="w-4 h-4 rounded-[3px]"
              style={{
                background:
                  t.state === "right"
                    ? "var(--up)"
                    : t.state === "present"
                      ? "#d4a017"
                      : "var(--muted-2)",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function fmtTime(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

// Daily Wordle, raced head-to-head: same word for both (shared /api/wordle
// seed), fewest guesses wins, time breaks ties. Partner's board stays hidden
// (RLS) until you've finished yours.
export function WordleRaceCard() {
  const { supabase, me, partner } = useZuya();
  const today = zuyaToday();
  const [results, setResults] = useState<ZuyaWordleResultRow[]>([]);
  const [weekRows, setWeekRows] = useState<ZuyaWordleResultRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
    const [{ data: todayRows }, { data: week }] = await Promise.all([
      supabase.from("zuya_wordle_results").select("*").eq("day", today),
      supabase.from("zuya_wordle_results").select("*").gte("day", since),
    ]);
    setResults((todayRows as ZuyaWordleResultRow[]) ?? []);
    setWeekRows((week as ZuyaWordleResultRow[]) ?? []);
    setLoaded(true);
  }, [supabase, today]);

  useEffect(() => {
    void load();
  }, [load]);

  useZuyaTableEvent("zuya_wordle_results", () => void load());

  const mine = results.find((r) => r.user_id === me.user_id);
  const theirs = results.find((r) => r.user_id === partner.user_id);

  async function record(o: WordleOutcome) {
    await supabase.from("zuya_wordle_results").insert({
      user_id: me.user_id,
      day: today,
      guesses: o.guesses,
      time_ms: o.timeMs,
      board: o.board,
    });
    void load();
  }

  // Head-to-head verdict for a finished day: fewer guesses wins (0 = failed
  // = worst), time breaks ties.
  function winnerOf(a: ZuyaWordleResultRow, b: ZuyaWordleResultRow): string | null {
    const rank = (r: ZuyaWordleResultRow) => (r.guesses === 0 ? 99 : r.guesses);
    if (rank(a) !== rank(b)) return rank(a) < rank(b) ? a.user_id : b.user_id;
    if (a.time_ms !== b.time_ms) return a.time_ms < b.time_ms ? a.user_id : b.user_id;
    return null;
  }

  const weeklyScore = useMemo(() => {
    const byDay = new Map<string, ZuyaWordleResultRow[]>();
    for (const r of weekRows) {
      byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
    }
    let meWins = 0;
    let themWins = 0;
    for (const rows of byDay.values()) {
      if (rows.length < 2) continue;
      const w = winnerOf(rows[0], rows[1]);
      if (w === me.user_id) meWins++;
      else if (w === partner.user_id) themWins++;
    }
    return { meWins, themWins };
  }, [weekRows, me.user_id, partner.user_id]);

  const verdict = mine && theirs ? winnerOf(mine, theirs) : undefined;

  return (
    <Card id="zuya-wordle-card" title="Wordle race" meta="kim daha hızlı?" collapsible={false}>
      {(weeklyScore.meWins > 0 || weeklyScore.themWins > 0) && (
        <p className="text-[12px] text-muted mb-3 inline-flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5 text-accent-2" />
          This week: you {weeklyScore.meWins} — {weeklyScore.themWins} {partner.display_name}
        </p>
      )}

      {!loaded ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : !mine ? (
        <>
          <p className="text-[12.5px] text-muted mb-3 inline-flex items-center gap-1.5">
            <Swords className="h-3.5 w-3.5" />
            Same word for both of you — fewest guesses wins, speed breaks ties.
          </p>
          <ZuyaWordle onComplete={record} />
        </>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="label mb-1.5">{me.display_name}</p>
              <MiniBoard board={mine.board} />
              <p className="text-[12px] text-muted mt-1.5">
                {mine.guesses === 0 ? "didn't get it 😅" : `in ${mine.guesses} · ${fmtTime(mine.time_ms)}`}
              </p>
            </div>
            <div>
              <p className="label mb-1.5">{partner.display_name}</p>
              {theirs ? (
                <>
                  <MiniBoard board={theirs.board} />
                  <p className="text-[12px] text-muted mt-1.5">
                    {theirs.guesses === 0
                      ? "didn't get it 😅"
                      : `in ${theirs.guesses} · ${fmtTime(theirs.time_ms)}`}
                  </p>
                </>
              ) : (
                <p className="text-[12.5px] text-muted inline-flex items-center gap-1.5 pt-1">
                  <Hourglass className="h-3.5 w-3.5" /> still playing…
                </p>
              )}
            </div>
          </div>

          {theirs && (
            <p
              className="text-center text-[13px] font-semibold rounded-full px-4 py-2"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              {verdict === null
                ? "Dead heat — kader ♥"
                : verdict === me.user_id
                  ? "You won today! 🏆"
                  : `${partner.display_name} takes it today 🏆`}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
