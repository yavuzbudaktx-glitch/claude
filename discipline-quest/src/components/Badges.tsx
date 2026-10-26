"use client";
import { BADGES, type BadgeFamily } from "@/engine/badges";
import { renderBadge } from "@/game/sprites/badges";
import { useGame } from "@/store/useGame";
import PixelIcon from "./PixelIcon";
import RasterCanvas from "./RasterCanvas";

const FAMILIES: { id: BadgeFamily; label: string }[] = [
  { id: "prayer", label: "Prayer" },
  { id: "purity", label: "Purity" },
  { id: "wake", label: "Mornings" },
  { id: "diet", label: "Diet" },
  { id: "general", label: "General" },
];

export default function Badges() {
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
                        <span className="shrink-0 text-sm text-[var(--muted)]">+{b.coins}</span>
                      </div>
                      <div className="text-base leading-tight">{b.desc}</div>
                      {!got && (
                        <div className="mt-1 flex items-center gap-2">
                          <div className="bar h-2.5 flex-1">
                            <div className="h-full bg-[var(--head)]" style={{ width: `${Math.min(100, (cur / target) * 100)}%` }} />
                          </div>
                          <span className="text-sm tabular-nums">
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
