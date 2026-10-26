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

/** A few coins fly into the counter whenever you earn some. */
function useCoinBurst(coins: number, target: React.RefObject<HTMLElement>) {
  const prev = useRef(coins);
  const [burst, setBurst] = useState<{ id: number; n: number } | null>(null);
  useEffect(() => {
    const gained = coins - prev.current;
    prev.current = coins;
    if (gained <= 0 || !target.current) return;
    setBurst({ id: Date.now(), n: Math.min(8, 3 + Math.floor(gained / 10)) });
    const id = setTimeout(() => setBurst(null), 900);
    return () => clearTimeout(id);
  }, [coins, target]);
  return burst;
}

export default function Hud({ onSettings }: { onSettings: () => void }) {
  const { coins, xp } = useGame((s) => s.game);
  const lv = levelFor(xp);
  const shown = useCountUp(coins);
  const coinRef = useRef<HTMLDivElement>(null);
  const burst = useCoinBurst(coins, coinRef);
  const box = coinRef.current?.getBoundingClientRect();
  return (
    <header className="panel flex items-center gap-3 p-2.5">
      <div className="h-[60px] w-[60px] shrink-0 overflow-hidden rounded-xl border-2 border-[var(--line)] bg-[radial-gradient(circle_at_50%_35%,#6ea4e0,#2f6fb0_70%)] shadow-[inset_0_-6px_12px_rgba(0,0,0,0.25)]">
        <RasterCanvas make={renderPortrait} deps={[]} className="h-full w-full" label="Your avatar" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-pixel text-[9px] leading-tight">
          LV {lv.level} <span className="text-[var(--head)]">{titleFor(lv.level).toUpperCase()}</span>
        </div>
        <div className="bar mt-1.5">
          <div
            className="h-full rounded-full bg-[linear-gradient(180deg,#c487e6,#8e44ad)] shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] transition-[width] duration-700 ease-out"
            style={{ width: `${(lv.into / lv.need) * 100}%` }}
          />
        </div>
        <div className="mt-1 whitespace-nowrap text-[12px] font-bold tabular-nums leading-none text-[var(--muted)]">
          {lv.into}/{lv.need} XP
        </div>
      </div>
      <div
        ref={coinRef}
        key={burst?.id}
        className={`chip shrink-0 py-1 font-pixel text-[11px] tabular-nums ${burst ? "coin-bump" : ""} ${coins < 0 ? "bg-[#d64541] text-white" : "bg-[linear-gradient(180deg,#ffd85c,#efb92a)]"}`}
        title={coins < 0 ? "In debt: the catalog is closed" : "Coins"}
      >
        <PixelIcon name="coin" size={14} color={coins < 0 ? "#fff" : "#7a5a00"} />
        {shown}
      </div>
      <button className="icon-btn h-10 w-10 shrink-0 bg-[#ece7da]" onClick={onSettings} aria-label="Settings">
        <PixelIcon name="gear" size={18} />
      </button>
      {burst &&
        box &&
        Array.from({ length: burst.n }, (_, k) => {
          const a = (k / burst.n) * Math.PI * 2;
          return (
            <span
              key={`${burst.id}-${k}`}
              className="coin-fly"
              style={
                {
                  left: box.left + 8,
                  top: box.top + 4,
                  animationDelay: `${k * 45}ms`,
                  "--fx": `${Math.cos(a) * 60 - 30}px`,
                  "--fy": `${Math.sin(a) * 40 + 90}px`,
                } as React.CSSProperties
              }
            >
              <PixelIcon name="coin" size={14} color="#f6c744" />
            </span>
          );
        })}
    </header>
  );
}
