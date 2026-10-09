"use client";
import { emptyDay, liveStreaks } from "@/engine/engine";
import { addDays, dateKey } from "@/engine/dates";
import { PRAYERS, type DayLog } from "@/engine/types";
import { useNow } from "@/lib/useNow";
import { useGame } from "@/store/useGame";

/** 0..4 score: prayers all done, woke on time, diet kept, clean. */
function score(d: DayLog) {
  return (
    (PRAYERS.every((p) => d.prayers[p]) ? 1 : 0) +
    (d.wake === "ok" ? 1 : 0) +
    (d.diet === "on" ? 1 : 0) +
    (d.relapses === 0 ? 1 : 0)
  );
}
const SCORE_COLORS = ["#d64541", "#e98b39", "#f1c40f", "#8bc34a", "#2e9e4f"];

export default function Stats() {
  const game = useGame((s) => s.game);
  const now = useNow();
  const today = dateKey(now);
  const live = liveStreaks(game, now);
  const days = Array.from({ length: 35 }, (_, i) => addDays(today, i - 34));

  const rows: [string, number, number][] = [
    ["Prayers (all 5)", live.prayers, game.best.prayers],
    ["Wake on time", live.wake, game.best.wake],
    ["Porn-free", live.clean, game.best.clean],
    ["Diet", live.diet, game.best.diet],
    ...game.customHabits.filter((h) => !h.archived).map((h): [string, number, number] => [h.name, game.streaks.custom[h.id] ?? 0, game.best.custom[h.id] ?? 0]),
  ];

  return (
    <div className="space-y-3">
      <section className="panel">
        <div className="panel-head">Streaks</div>
        <table className="w-full text-lg">
          <thead>
            <tr className="text-left text-base opacity-70">
              <th className="px-3 py-1 font-normal">Habit</th>
              <th className="px-3 py-1 text-right font-normal">Now</th>
              <th className="px-3 py-1 text-right font-normal">Best</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, cur, best]) => (
              <tr key={name} className="border-t border-black/15">
                <td className="px-3 py-1">{name}</td>
                <td className="px-3 py-1 text-right">{cur}</td>
                <td className="px-3 py-1 text-right">{best}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-head">Last 5 weeks</div>
        <div className="p-3">
          <div className="grid grid-cols-7 gap-1">
            {days.map((k) => {
              const before = k < game.startDate;
              const d = game.days[k] ?? emptyDay(k);
              const isToday = k === today;
              const s = score(d);
              return (
                <div
                  key={k}
                  title={before ? k : `${k}: ${s}/4`}
                  className={`flex aspect-square items-center justify-center rounded-[3px] border-2 text-base ${isToday ? "border-[var(--head)]" : "border-black"}`}
                  style={{ background: before ? "#e6e2d6" : isToday ? "#fff" : SCORE_COLORS[s] }}
                >
                  {Number(k.slice(8))}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-base opacity-75">Each day scores 0–4: all prayers, on-time wake-up, diet kept, porn-free.</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Log</div>
        <ul className="max-h-72 overflow-y-auto px-3 py-2 text-base">
          {game.log.slice(0, 60).map((e, i) => (
            <li key={i} className="flex justify-between gap-2 border-b border-black/10 py-0.5">
              <span className={e.kind === "bad" ? "text-[#b0302c]" : e.kind === "good" ? "text-[#1e7d32]" : ""}>{e.text}</span>
              {e.coins ? <span className="shrink-0">{e.coins > 0 ? `+${e.coins}` : e.coins}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
