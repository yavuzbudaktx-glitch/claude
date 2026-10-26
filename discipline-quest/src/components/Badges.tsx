"use client";
import { BADGES, type BadgeFamily } from "@/engine/badges";
import { renderBadge } from "@/game/sprites/badges";
import { useGame } from "@/store/useGame";
import { ITEMS, RARE_BY_MONTH } from "@/engine/catalog";
import { monthOf } from "@/engine/challenges";
import { dateKey } from "@/engine/dates";
import { getNow } from "@/lib/clock";
import { previewFor } from "./Catalog";
import PixelIcon from "./PixelIcon";
import RasterCanvas from "./RasterCanvas";

const FAMILIES: { id: BadgeFamily; label: string }[] = [
  { id: "prayer", label: "Prayer" },
  { id: "purity", label: "Purity" },
  { id: "wake", label: "Mornings" },
  { id: "diet", label: "Diet" },
  { id: "general", label: "General" },
];

/** A year of monthly prizes: won ones shine, missed ones are greyed out, future ones are a mystery. */
function TrophyWall() {
  const game = useGame((s) => s.game);
  const now = getNow();
  const year = now.getFullYear();
  const thisMonth = monthOf(dateKey(now));
  const wins = game.challengeHistory.filter((h) => h.won).length + (game.challenge?.won ? 1 : 0);
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="flex items-center gap-1.5">
          <PixelIcon name="star" size={12} color="#fff" /> Trophy wall {year}
        </span>
        <span className="normal-case">{wins} won</span>
      </div>
      <div className="grid grid-cols-4 gap-2 p-3 sm:grid-cols-6">
        {Array.from({ length: 12 }, (_, k) => {
          const month = `${year}-${String(k + 1).padStart(2, "0")}`;
          const item = ITEMS[RARE_BY_MONTH[k + 1]];
          const past = game.challengeHistory.find((h) => h.month === month);
          const live = game.challenge?.month === month ? game.challenge : null;
          const won = !!past?.won || !!live?.won;
          // a month only counts as missed if you had a challenge running in it
          const state = won ? "won" : month < thisMonth ? (past ? "missed" : "none") : month === thisMonth ? "now" : "later";
          const label = new Date(year, k, 1).toLocaleString("en", { month: "short" });
          return (
            <div
              key={month}
              className={`flex flex-col items-center rounded-xl border-2 border-[var(--line)] p-1.5 text-center ${state === "won" ? "shine bg-[linear-gradient(135deg,#fff7d6,#f6e3a1)]" : state === "now" ? "bg-white" : "bg-[var(--panel-2)]"}`}
            >
              <div className="flex h-11 w-full items-center justify-center">
                {state === "later" || state === "none" ? (
                  <span className="font-pixel text-[14px] text-[var(--muted)]">{state === "none" ? "–" : "?"}</span>
                ) : (
                  <RasterCanvas make={() => previewFor(item, !won)} deps={[item.id, won]} className="max-h-full max-w-full" style={{ width: 44, height: 44 }} />
                )}
              </div>
              <div className="font-pixel text-[7px]">{label.toUpperCase()}</div>
              <div className={`text-[11px] font-bold leading-tight ${won ? "text-[var(--good)]" : "text-[var(--muted)]"}`}>
                {state === "won" ? item.name : state === "missed" ? "Missed" : state === "now" ? (live ? "In progress" : "Pick one") : state === "none" ? "—" : "Locked"}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Badges() {
  return (
    <div className="space-y-3">
      <TrophyWall />
      <BadgeList />
    </div>
  );
}

function BadgeList() {
  const game = useGame((s) => s.game);
  const earned = BADGES.filter((b) => game.badges[b.id]).length;
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="flex items-center gap-1.5">
          <PixelIcon name="medal" size={12} color="#fff" /> Badges
        </span>
        <span className="normal-case">
          {earned}/{BADGES.length}
        </span>
      </div>
      <div className="space-y-3 p-3">
        {FAMILIES.map((f) => (
          <div key={f.id}>
            <h3 className="mb-1.5 font-pixel text-[9px] text-[var(--head-2)]">{f.label.toUpperCase()}</h3>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {BADGES.filter((b) => b.family === f.id).map((b) => {
                const got = !!game.badges[b.id];
                const [cur, target] = b.progress(game);
                return (
                  <li key={b.id} className={`flex items-center gap-2 rounded-[4px] border-2 border-black p-1.5 ${got ? "bg-white" : "bg-[var(--panel-2)]"}`}>
                    <RasterCanvas make={() => renderBadge(b, got)} deps={[b.id, got]} style={{ width: 40, height: 40 }} label={got ? b.name : `${b.name} (locked)`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-pixel text-[8px]">{b.name}</span>
                        <span className="shrink-0 text-[12.5px] text-[var(--muted)]">+{b.coins}</span>
                      </div>
                      <div className="text-[14px] leading-tight">{b.desc}</div>
                      {!got && (
                        <div className="mt-1 flex items-center gap-2">
                          <div className="bar h-2.5 flex-1">
                            <div className="h-full bg-[var(--head)]" style={{ width: `${Math.min(100, (cur / target) * 100)}%` }} />
                          </div>
                          <span className="text-[12.5px] tabular-nums">
                            {Math.min(cur, target)}/{target}
                          </span>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
