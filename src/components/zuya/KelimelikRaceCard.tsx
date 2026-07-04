"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Trophy, Swords, Hourglass } from "lucide-react";
import { Card } from "@/components/Card";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import { ZuyaKelimelik, type KelimelikOutcome, type BoardRow } from "@/components/zuya/ZuyaKelimelik";
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
  return s < 60 ? `${s}sn` : `${Math.floor(s / 60)}dk ${s % 60}sn`;
}

// Daily Kelimelik, raced head-to-head: same word for both, fewest guesses
// wins, time breaks ties. Partner's board stays hidden (RLS) until you finish.
// Reuses the zuya_wordle_results table.
export function KelimelikRaceCard() {
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

  async function record(o: KelimelikOutcome) {
    await supabase.from("zuya_wordle_results").insert({
      user_id: me.user_id,
      day: today,
      guesses: o.guesses,
      time_ms: o.timeMs,
      board: o.board,
    });
    void load();
  }

  function winnerOf(a: ZuyaWordleResultRow, b: ZuyaWordleResultRow): string | null {
    const rank = (r: ZuyaWordleResultRow) => (r.guesses === 0 ? 99 : r.guesses);
    if (rank(a) !== rank(b)) return rank(a) < rank(b) ? a.user_id : b.user_id;
    if (a.time_ms !== b.time_ms) return a.time_ms < b.time_ms ? a.user_id : b.user_id;
    return null;
  }

  const weeklyScore = useMemo(() => {
    const byDay = new Map<string, ZuyaWordleResultRow[]>();
    for (const r of weekRows) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
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
    <Card id="zuya-kelimelik-card" title="Kelimelik" collapsible={false}>
      {(weeklyScore.meWins > 0 || weeklyScore.themWins > 0) && (
        <p className="text-[12px] text-muted mb-3 inline-flex items-center gap-1.5">
          <Trophy className="h-3.5 w-3.5 text-accent-2" />
          Bu hafta: sen {weeklyScore.meWins} — {weeklyScore.themWins} {partner.display_name}
        </p>
      )}

      {!loaded ? (
        <p className="text-muted text-sm">Yükleniyor…</p>
      ) : !mine ? (
        <>
          <p className="text-[12.5px] text-muted mb-3 inline-flex items-center gap-1.5">
            <Swords className="h-3.5 w-3.5" />
            İkiniz de aynı kelime — az tahminde bilen kazanır, süre eşitliği bozar.
          </p>
          <ZuyaKelimelik onComplete={record} />
        </>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="label mb-1.5">{me.display_name}</p>
              <MiniBoard board={mine.board} />
              <p className="text-[12px] text-muted mt-1.5">
                {mine.guesses === 0 ? "bilemedi 😅" : `${mine.guesses} tahmin · ${fmtTime(mine.time_ms)}`}
              </p>
            </div>
            <div>
              <p className="label mb-1.5">{partner.display_name}</p>
              {theirs ? (
                <>
                  <MiniBoard board={theirs.board} />
                  <p className="text-[12px] text-muted mt-1.5">
                    {theirs.guesses === 0
                      ? "bilemedi 😅"
                      : `${theirs.guesses} tahmin · ${fmtTime(theirs.time_ms)}`}
                  </p>
                </>
              ) : (
                <p className="text-[12.5px] text-muted inline-flex items-center gap-1.5 pt-1">
                  <Hourglass className="h-3.5 w-3.5" /> hâlâ oynuyor…
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
                ? "Berabere."
                : verdict === me.user_id
                  ? "Bugün sen kazandın 🏆"
                  : `Bugün ${partner.display_name} kazandı 🏆`}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
