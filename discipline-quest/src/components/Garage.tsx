"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CAR_ORDER, CAR_UNLOCKS, ITEMS } from "@/engine/catalog";
import { owns } from "@/engine/engine";
import type { Raster } from "@/game/raster";
import { GARAGE, buildGarage, carAt, emptyBays, garagePoints, isNight, parkedCars } from "@/game/garage";
import { AVATAR_FOOT, renderAvatar, type BodyStage, type OutfitId } from "@/game/sprites/avatar";
import { getNow } from "@/lib/clock";
import { SFX } from "@/lib/sound";
import { useGame } from "@/store/useGame";
import PixelIcon from "./PixelIcon";

function toCanvas(r: Raster) {
  const c = document.createElement("canvas");
  c.width = r.w;
  c.height = r.h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.w, r.h), 0, 0);
  return c;
}

const LINES: Record<string, string[]> = {
  "car-mini": ["Still starts every time.", "Small car, big personality.", "Go-kart feeling, as promised."],
  "car-q50": ["Vroom. Allegedly.", "That V6 though.", "Blue looks good on it."],
  "car-ioniq5": ["0 to 60 in silence.", "Charging… my motivation.", "Pixel lights on point."],
};

/** Outside: every car you've unlocked has its own bay. Tap a car to flash its lights. */
export default function Garage() {
  const game = useGame((s) => s.game);
  const owned = useMemo(() => CAR_ORDER.filter((id) => owns(game, id)), [game]);
  const cars = useMemo(() => parkedCars(owned), [owned]);
  const ref = useRef<HTMLCanvasElement>(null);
  const flash = useRef<{ id: string; until: number } | null>(null);
  const [bubble, setBubble] = useState<{ text: string; x: number; y: number } | null>(null);
  const live = useRef({ cars, outfit: game.equipped.outfit as OutfitId, body: game.body.stage as BodyStage });
  live.current = { cars, outfit: game.equipped.outfit as OutfitId, body: game.body.stage as BodyStage };

  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!;
    let key = "";
    let bg: HTMLCanvasElement | null = null;
    let avatar: HTMLCanvasElement | null = null;
    let avatarKey = "";
    let raf = 0;
    const draw = (t: number) => {
      const hour = getNow().getHours();
      const L = live.current;
      const k = `${hour}|${L.cars.map((c) => c.id).join()}`;
      if (k !== key || !bg) {
        bg = toCanvas(buildGarage(hour, L.cars));
        key = k;
      }
      const pose = Math.floor(t / 3000) % 8 === 0 ? "blink" : "idle";
      const ak = `${L.outfit}|${L.body}|${pose}`;
      if (ak !== avatarKey || !avatar) {
        avatar = toCanvas(renderAvatar("front", pose, L.outfit, L.body));
        avatarKey = ak;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, 0, 0);
      const pts = garagePoints();
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(Math.round(pts.avatar[0]) - 7, Math.round(pts.avatar[1]) - 1, 14, 3);
      ctx.drawImage(avatar, Math.round(pts.avatar[0] - AVATAR_FOOT.x), Math.round(pts.avatar[1] - AVATAR_FOOT.y));
      const night = isNight(hour);
      if (night) {
        ctx.fillStyle = "rgba(10,12,40,0.3)";
        ctx.fillRect(0, 0, GARAGE.W, GARAGE.H);
      }
      const glows: [readonly [number, number], number, string][] = [];
      if (night) glows.push([pts.lamp, 60, "rgba(255,220,140,A)"], [pts.wallLamp, 26, "rgba(255,220,140,A)"]);
      const f = flash.current;
      for (const c of L.cars) {
        const on = f && f.id === c.id && f.until > t && Math.floor(t / 180) % 2 === 0;
        if (on || night) for (const h of c.headlights) glows.push([h, on ? 30 : 14, "rgba(230,245,255,A)"]);
      }
      ctx.globalCompositeOperation = "lighter";
      for (const [[x, y], rad, col] of glows) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, col.replace("A", "0.55"));
        g.addColorStop(1, col.replace("A", "0"));
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!bubble) return;
    const id = setTimeout(() => setBubble(null), 3000);
    return () => clearTimeout(id);
  }, [bubble]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const rect = c.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * c.width;
    const y = ((e.clientY - rect.top) / rect.height) * c.height;
    const car = carAt(live.current.cars, x, y);
    if (!car) return;
    flash.current = { id: car.id, until: performance.now() + 1500 };
    const lines = LINES[car.id] ?? ["Vroom."];
    setBubble({ text: lines[Math.floor(Math.random() * lines.length)], x: car.bubble[0], y: car.bubble[1] });
    if (game.settings.sound) SFX.engine();
  };

  return (
    <div>
      <div className="relative w-full select-none" style={{ aspectRatio: `${GARAGE.W} / ${GARAGE.H}` }}>
        <canvas
          ref={ref}
          width={GARAGE.W}
          height={GARAGE.H}
          className="h-full w-full"
          style={{ imageRendering: "pixelated" }}
          aria-label="Your garage. Tap a car to flash its lights."
          onPointerDown={onTap}
        />
        {emptyBays(owned).map((b) => {
          const unlock = CAR_UNLOCKS.find((u) => u.id === b.id);
          return (
            <div
              key={b.id}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-[3px] border-2 border-dashed border-white/70 bg-black/40 px-1.5 text-sm leading-tight text-white"
              style={{ left: `${(b.at[0] / GARAGE.W) * 100}%`, top: `${(b.at[1] / GARAGE.H) * 100}%` }}
            >
              {ITEMS[b.id].name.replace(/^\d+ /, "")} · {Math.min(game.streaks.clean, unlock?.cleanDays ?? 0)}/{unlock?.cleanDays} clean
            </div>
          );
        })}
        {bubble && (
          <div className="bubble pointer-events-none absolute -translate-x-1/2 -translate-y-full" style={{ left: `${(bubble.x / GARAGE.W) * 100}%`, top: `${(bubble.y / GARAGE.H) * 100}%` }}>
            {bubble.text}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 border-t-2 border-black bg-[var(--panel)] p-2 text-base">
        {CAR_ORDER.map((id) => {
          const have = owned.includes(id);
          const unlock = CAR_UNLOCKS.find((u) => u.id === id);
          return (
            <span key={id} className={`chip ${have ? "bg-[#d9f0d9]" : "bg-white"}`}>
              {have ? <PixelIcon name="check" size={10} color="var(--good)" /> : <PixelIcon name="lock" size={10} />}
              {ITEMS[id].name.replace(/^\d+ /, "")}
              {!have && unlock ? ` · ${unlock.cleanDays} clean days` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}
