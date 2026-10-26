"use client";
import { useEffect, useRef, useState } from "react";
import { CAR_UNLOCKS, ITEMS } from "@/engine/catalog";
import { owns, usable } from "@/engine/engine";
import type { Raster } from "@/game/raster";
import { GARAGE, buildGarage, garagePoints, isNight } from "@/game/garage";
import { AVATAR_FOOT, renderAvatar, type BodyStage, type OutfitId } from "@/game/sprites/avatar";
import { carSprite } from "@/game/sprites/cars";
import { getNow } from "@/lib/clock";
import { SFX } from "@/lib/sound";
import { useGame } from "@/store/useGame";
import PixelIcon from "./PixelIcon";
import RasterCanvas from "./RasterCanvas";

const CARS = ["car-mini", "car-q50", "car-ioniq5"];

function toCanvas(r: Raster) {
  const c = document.createElement("canvas");
  c.width = r.w;
  c.height = r.h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.w, r.h), 0, 0);
  return c;
}

/** Outside: your parked car on the driveway, and a picker for which car to park. */
export default function Garage() {
  const game = useGame((s) => s.game);
  const equip = useGame((s) => s.equip);
  const carId = game.equipped.car;
  const ref = useRef<HTMLCanvasElement>(null);
  const flashUntil = useRef(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const live = useRef({ carId, outfit: game.equipped.outfit as OutfitId, body: game.body.stage as BodyStage });
  live.current = { carId, outfit: game.equipped.outfit as OutfitId, body: game.body.stage as BodyStage };

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
      const k = `${hour}|${L.carId}`;
      if (k !== key || !bg) {
        bg = toCanvas(buildGarage(hour, L.carId));
        key = k;
      }
      const ak = `${L.outfit}|${L.body}|${Math.floor(t / 3000) % 8 === 0 ? "blink" : "idle"}`;
      if (ak !== avatarKey || !avatar) {
        avatar = toCanvas(renderAvatar("front", ak.endsWith("blink") ? "blink" : "idle", L.outfit, L.body));
        avatarKey = ak;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, 0, 0);
      const pts = garagePoints(L.carId);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(Math.round(pts.avatar[0]) - 7, Math.round(pts.avatar[1]) - 1, 14, 3);
      ctx.drawImage(avatar, Math.round(pts.avatar[0] - AVATAR_FOOT.x), Math.round(pts.avatar[1] - AVATAR_FOOT.y));
      const night = isNight(hour);
      if (night) {
        ctx.fillStyle = "rgba(10,12,40,0.38)";
        ctx.fillRect(0, 0, GARAGE.W, GARAGE.H);
      }
      const flashing = flashUntil.current > t && Math.floor(t / 180) % 2 === 0;
      const glows: [readonly [number, number], number, string][] = [];
      if (night) glows.push([pts.lamp, 60, "rgba(255,220,140,A)"], [pts.wallLamp, 26, "rgba(255,220,140,A)"]);
      if (night || flashing) for (const h of pts.headlights) glows.push([h, flashing ? 30 : 18, "rgba(230,245,255,A)"]);
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

  const tapCar = () => {
    flashUntil.current = performance.now() + 1500;
    setBubble(carId === "car-ioniq5" ? "Silent. Electric. Bismillah." : carId === "car-q50" ? "V6 says hi. Bismillah." : "The OG. Bismillah.");
    if (game.settings.sound) SFX.engine();
  };

  const pts = garagePoints(carId);
  return (
    <div>
      <div className="relative w-full select-none" style={{ aspectRatio: `${GARAGE.W} / ${GARAGE.H}` }}>
        <canvas
          ref={ref}
          width={GARAGE.W}
          height={GARAGE.H}
          className="h-full w-full cursor-pointer"
          style={{ imageRendering: "pixelated" }}
          aria-label={`Your ${ITEMS[carId]?.name} parked outside. Tap it to start it.`}
          onPointerDown={tapCar}
        />
        {bubble && (
          <div className="bubble pointer-events-none absolute -translate-x-1/2 -translate-y-full" style={{ left: `${(pts.avatar[0] / GARAGE.W) * 100}%`, top: `${((pts.avatar[1] - 52) / GARAGE.H) * 100}%` }}>
            {bubble}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5 border-t-2 border-black bg-[var(--panel)] p-2">
        {CARS.map((id) => {
          const have = owns(game, id);
          const ok = usable(game, id);
          const parked = carId === id;
          const unlock = CAR_UNLOCKS.find((u) => u.id === id);
          return (
            <button
              key={id}
              disabled={!ok || parked}
              onClick={() => equip(id, "Parked.")}
              className={`flex flex-col items-center rounded-[4px] border-2 border-black p-1 text-center ${parked ? "bg-[#e3f1ff]" : "bg-white"} disabled:cursor-default`}
            >
              <RasterCanvas make={() => carSprite(id).r} deps={[id]} className={have ? "" : "opacity-40 grayscale"} style={{ width: "100%", height: 46 }} />
              <span className="font-pixel text-[7px] leading-tight">{ITEMS[id].name.replace(/^\d+ /, "")}</span>
              <span className="text-sm leading-tight">
                {parked ? "Parked" : have ? (ok ? "Park it" : "Locked") : (
                  <span className="inline-flex items-center gap-1">
                    <PixelIcon name="lock" size={9} /> {Math.min(game.streaks.clean, unlock?.cleanDays ?? 0)}/{unlock?.cleanDays} clean
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
