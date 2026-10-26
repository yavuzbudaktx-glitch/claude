"use client";
import { useEffect, useRef, useState } from "react";
import { levelFor, titleFor } from "@/engine/rules";
import { renderPortrait } from "@/game/sprites/portrait";
import { useGame } from "@/store/useGame";
import PixelIcon from "./PixelIcon";
import RasterCanvas from "./RasterCanvas";

/** Counts toward the target value so coin changes feel earned. */
function useCountUp(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 600);
      setShown(Math.round(a + (target - a) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target]);
  return shown;
}

export default function Hud({ onSettings }: { onSettings: () => void }) {
  const { coins, xp } = useGame((s) => s.game);
  const lv = levelFor(xp);
  const shown = useCountUp(coins);
  return (
    <header className="panel flex items-center gap-3 p-2">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[4px] border-2 border-black bg-[linear-gradient(#5b8fd0,#2f6fb0)]">
        <RasterCanvas make={renderPortrait} deps={[]} className="h-full w-full" label="Your avatar" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-pixel text-[9px] leading-tight">
          LV {lv.level} <span className="text-[var(--head)]">{titleFor(lv.level).toUpperCase()}</span>
        </div>
        <div className="bar mt-1.5">
          <div className="h-full bg-[linear-gradient(#b06ad8,#8e44ad)] transition-[width] duration-500" style={{ width: `${(lv.into / lv.need) * 100}%` }} />
        </div>
        <div className="mt-0.5 whitespace-nowrap text-sm tabular-nums leading-none text-[var(--muted)]">
          {lv.into}/{lv.need} XP
        </div>
      </div>
      <div
        className={`chip shrink-0 py-0.5 text-xl tabular-nums ${coins < 0 ? "bg-[#d64541] text-white" : "bg-[var(--gold)]"}`}
        title={coins < 0 ? "In debt: the catalog is closed" : "Coins"}
      >
        <PixelIcon name="coin" size={14} color={coins < 0 ? "#fff" : "#7a5a00"} />
        {shown}
      </div>
      <button className="btn h-10 w-10 shrink-0 px-0" onClick={onSettings} aria-label="Settings">
        <PixelIcon name="gear" size={18} />
      </button>
    </header>
  );
}
