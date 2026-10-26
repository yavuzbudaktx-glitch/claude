"use client";
import { useEffect, useMemo } from "react";
import { BADGE_BY_ID } from "@/engine/badges";
import { ITEMS } from "@/engine/catalog";
import { titleFor } from "@/engine/rules";
import { renderBadge } from "@/game/sprites/badges";
import { useGame } from "@/store/useGame";
import { previewFor } from "./Catalog";
import RasterCanvas from "./RasterCanvas";

const COLORS = ["#f1c40f", "#ff4fc3", "#4caf50", "#3d86c6", "#ffffff", "#e67e22"];

/** Shows one queued celebration at a time: badge earned, level up, or an unlock. */
export default function Celebrate() {
  const entry = useGame((s) => s.game.inbox[0]);
  const dismiss = useGame((s) => s.dismiss);
  const confetti = useMemo(
    () => Array.from({ length: 28 }, (_, k) => ({ left: (k * 37) % 100, delay: (k % 7) * 0.08, color: COLORS[k % COLORS.length] })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry?.at, entry?.kind],
  );
  useEffect(() => {
    if (!entry) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, dismiss]);
  if (!entry) return null;

  let title = "";
  let body = "";
  let art: React.ReactNode = null;
  if (entry.kind === "badge") {
    const b = BADGE_BY_ID[entry.id];
    if (!b) return null;
    title = "Badge earned";
    body = `${b.name}: ${b.desc} +${b.coins} coins`;
    art = <RasterCanvas make={() => renderBadge(b, true)} deps={[b.id]} style={{ width: 96, height: 96 }} label={b.name} />;
  } else if (entry.kind === "level") {
    title = `Level ${entry.level}`;
    body = `You're now "${titleFor(entry.level)}". New items may be open in the catalog.`;
    art = <div className="font-pixel text-5xl text-[var(--head)]">{entry.level}</div>;
  } else {
    const item = ITEMS[entry.id];
    if (!item) return null;
    title = "Unlocked";
    body = `${item.name}. ${item.blurb}`;
    art = <RasterCanvas make={() => previewFor(item)} deps={[item.id]} style={{ width: 160, height: 100 }} label={item.name} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/70 p-4" onClick={dismiss}>
      {confetti.map((c, k) => (
        <span key={k} className="confetti" style={{ left: `${c.left}%`, top: "18%", background: c.color, animationDelay: `${c.delay}s` }} />
      ))}
      <div className="panel pulse-in w-full max-w-xs text-center" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="panel-head justify-center">{title}</div>
        <div className="flex flex-col items-center gap-3 p-4">
          {art}
          <p className="text-lg leading-tight">{body}</p>
          <button className="btn btn-green w-full py-2" onClick={dismiss} autoFocus>
            Alhamdulillah
          </button>
        </div>
      </div>
    </div>
  );
}
