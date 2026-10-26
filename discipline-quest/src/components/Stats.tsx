"use client";
import { emptyDay, liveStreaks } from "@/engine/engine";
import { addDays, dateKey } from "@/engine/dates";
import { PRAYERS, type DayLog } from "@/engine/types";
import { useNow } from "@/lib/useNow";
import { useGame } from "@/store/useGame";
import { plan, dayLabel } from "@/engine/planner";

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

  const weekScore = (offset: number) =>
    Array.from({ length: 7 }, (_, i) => addDays(today, -i - offset)).reduce((n, k) => n + (game.days[k] && k >= game.startDate ? score(game.days[k]) : 0), 0);
  const thisWeek = weekScore(0);
  const lastWeek = weekScore(7);

  const rows: [string, number, number][] = [
    ["Perfect days", game.streaks.perfect, game.best.perfect],
    ["Gym weeks (4×)", game.streaks.gymWeeks, game.best.gymWeeks],
    ["Quran goal", game.streaks.quran, game.best.quran],
    ["Bedtime", game.streaks.bed, game.best.bed],
    ["Jumu'ah (Fridays)", game.streaks.jumuah, game.best.jumuah],
    ["Prayers (all 5)", live.prayers, game.best.prayers],
    ["Wake on time", live.wake, game.best.wake],
    ["Porn-free", live.clean, game.best.clean],
    ["Diet", live.diet, game.best.diet],
    ...game.customHabits.filter((h) => !h.archived).map((h): [string, number, number] => [h.name, game.streaks.custom[h.id] ?? 0, game.best.custom[h.id] ?? 0]),
  ];

  const p = plan(game, now);

  return (
    <div className="space-y-3">
      <section className="panel">
        <div className="panel-head">Unlock planner</div>
        <div className="space-y-2 p-3">
          <div className="flex items-end gap-3">
            <div className="font-pixel text-3xl leading-none tabular-nums">{p.daysAll}</div>
            <div className="pb-0.5 text-[15px] leading-tight">days until everything is unlocked{p.daysAll > 0 ? ` (around ${dayLabel(now, p.daysAll)})` : ""}</div>
          </div>
          <p className="text-[14px] text-[var(--muted)]">
            {p.estimated ? "Estimated for a strong pace" : "Based on your last 14 days"}: about {p.coinRate} coins and {p.xpRate} XP a day, with no relapses.
            {" "}{p.remainingCost.toLocaleString()} coins of items left to buy.
          </p>
          {p.next.length > 0 && (
            <ul className="space-y-0.5">
              {p.next.map((n) => (
                <li key={n.id} className="flex justify-between gap-2 border-b border-black/10 text-[15px]">
                  <span className="min-w-0 truncate">{n.name}</span>
                  <span className="shrink-0 tabular-nums text-[var(--head-2)]">{n.days <= 0 ? "now" : `in ${n.days} day${n.days === 1 ? "" : "s"}`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">This week</div>
        <div className="grid grid-cols-3 gap-2 p-3 text-center">
          <div>
            <div className="font-pixel text-[17px] tabular-nums">{thisWeek}</div>
            <div className="text-[14px] text-[var(--muted)]">points / 28</div>
          </div>
          <div>
            <div className="font-pixel text-[17px] tabular-nums">{lastWeek}</div>
            <div className="text-[14px] text-[var(--muted)]">last week</div>
          </div>
          <div>
            <div className={`font-pixel text-[17px] tabular-nums ${thisWeek >= lastWeek ? "text-[var(--good)]" : "text-[var(--bad)]"}`}>
              {thisWeek >= lastWeek ? "+" : ""}
              {thisWeek - lastWeek}
            </div>
            <div className="text-[14px] text-[var(--muted)]">change</div>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">Streaks</div>
        <table className="w-full text-[15px]">
          <thead>
            <tr className="text-left text-[14px] opacity-70">
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
                  className={`flex aspect-square items-center justify-center rounded-[3px] border-2 text-[14px] ${isToday ? "border-[var(--head)]" : "border-black"}`}
                  style={{ background: before ? "#e6e2d6" : isToday ? "#fff" : SCORE_COLORS[s] }}
                >
                  {Number(k.slice(8))}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[14px] opacity-75">Each day scores 0–4: all prayers, on-time wake-up, diet kept, porn-free.</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">Lifetime</div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 px-3 py-2 text-[15px]">
          {([
            ["Prayers", game.stats.prayers],
            ["Fajr", game.stats.fajr],
            ["Clean days", game.stats.cleanDays],
            ["Urges beaten", game.stats.urges],
            ["On-time mornings", game.stats.wakeOnTime],
            ["Diet days", game.stats.dietDays],
            ["Quests done", game.stats.quests],
            ["Gym visits", game.stats.gym],
            ["Quran pages", game.stats.quranPages],
            ["Khatms", game.stats.khatms],
            ["Jumu'ah", game.stats.jumuah],
            ["Perfect days", game.stats.perfectDays],
          ] as [string, number][]).map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-black/10">
              <dt>{k}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="panel">
        <div className="panel-head">Log</div>
        <ul className="max-h-72 overflow-y-auto px-3 py-2 text-[14px]">
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
