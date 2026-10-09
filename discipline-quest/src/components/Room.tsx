"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { lockedCopy, type Sprite } from "@/game/iso";
import type { Raster } from "@/game/raster";
import {
  ROOM_H,
  ROOM_W,
  SPOTS,
  blockedTiles,
  buildBackground,
  buildPiece,
  findPath,
  tileScreen,
  type PieceId,
} from "@/game/furniture";
import { sceneDrawables, type AvatarView } from "@/game/scene";
import { ALL_POSES, AVATAR_FOOT, renderAvatar, type Facing, type Pose } from "@/game/sprites/avatar";
import { getNow } from "@/lib/clock";
import { useGame, type RoomActionKind } from "@/store/useGame";

type Tile = { tx: number; ty: number };

function toCanvas(r: Raster): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = r.w;
  c.height = r.h;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.w, r.h), 0, 0);
  return c;
}

interface CachedSprite {
  c: HTMLCanvasElement;
  ax: number;
  ay: number;
}
const cacheSprite = (s: Sprite): CachedSprite => ({ c: toCanvas(s.r), ax: s.ax, ay: s.ay });

const ACTION_SPOT: Record<RoomActionKind, Tile> = {
  pray: SPOTS.pray,
  wake: SPOTS.wake,
  late: SPOTS.wake,
  diet: SPOTS.diet,
  cheat: SPOTS.diet,
  urge: SPOTS.center,
  habit: SPOTS.center,
  buy: SPOTS.center,
  relapse: SPOTS.sad,
};

const ACTION_POSE: Record<RoomActionKind, Pose> = {
  pray: "pray",
  wake: "celebrate",
  late: "sad",
  diet: "celebrate",
  cheat: "sad",
  urge: "celebrate",
  habit: "celebrate",
  buy: "celebrate",
  relapse: "sad",
};

const SPEED = 2.6; // tiles per second

interface Actor {
  fx: number;
  fy: number;
  path: Tile[];
  facing: Facing;
  mirror: boolean;
  pose: Pose;
  poseUntil: number;
  pending: { pose: Pose; say: string } | null;
  nextWander: number;
}

export default function Room() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useGame((s) => s.game);
  const lastAction = useGame((s) => s.lastAction);
  const [bubble, setBubble] = useState<{ text: string; x: number; y: number; id: number } | null>(null);

  const owned = useMemo(
    () => game.inventory.map((i) => ({ itemId: i.itemId, locked: i.lockDaysLeft > 0 })),
    [game.inventory],
  );
  const blocked = useMemo(() => blockedTiles(owned.map((o) => o.itemId)), [owned]);

  const live = useRef({ owned, gloomy: game.gloomy, blocked });
  live.current = { owned, gloomy: game.gloomy, blocked };

  const actor = useRef<Actor>({
    fx: SPOTS.center.tx, fy: SPOTS.center.ty, path: [], facing: "front", mirror: false,
    pose: "idle", poseUntil: 0, pending: null, nextWander: 0,
  });

  // React to habit actions: walk to the right spot, then strike a pose and talk.
  useEffect(() => {
    if (!lastAction) return;
    const a = actor.current;
    const from = { tx: Math.round(a.fx), ty: Math.round(a.fy) };
    a.fx = from.tx;
    a.fy = from.ty;
    a.path = findPath(from, ACTION_SPOT[lastAction.kind], live.current.blocked);
    a.pending = { pose: ACTION_POSE[lastAction.kind], say: lastAction.say };
    a.poseUntil = 0;
  }, [lastAction]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    let bgHour = -1;
    let bg: HTMLCanvasElement | null = null;
    const pieces = new Map<string, CachedSprite>();
    const piece = (id: PieceId, locked: boolean) => {
      const k = `${id}:${locked}`;
      let p = pieces.get(k);
      if (!p) {
        const s = buildPiece(id);
        p = cacheSprite(locked ? lockedCopy(s) : s);
        pieces.set(k, p);
      }
      return p;
    };
    const frames = new Map<string, HTMLCanvasElement>();
    for (const f of ["front", "back"] as Facing[])
      for (const p of ALL_POSES) frames.set(`${f}:${p}`, toCanvas(renderAvatar(f, p)));

    let last = performance.now();
    let raf = 0;
    let walkClock = 0;

    const freeTiles = () => {
      const out: Tile[] = [];
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) if (!live.current.blocked.has(`${x},${y}`)) out.push({ tx: x, ty: y });
      return out;
    };

    const frame = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const a = actor.current;
      const { gloomy, owned } = live.current;

      // movement
      if (a.path.length) {
        const next = a.path[0];
        const dx = next.tx - a.fx, dy = next.ty - a.fy;
        const dist = Math.hypot(dx, dy);
        const stepLen = SPEED * dt;
        if (Math.abs(dx) > Math.abs(dy)) {
          a.facing = dx > 0 ? "front" : "back";
          a.mirror = dx < 0;
        } else if (dy !== 0) {
          a.facing = dy > 0 ? "front" : "back";
          a.mirror = dy > 0;
        }
        if (dist <= stepLen) {
          a.fx = next.tx;
          a.fy = next.ty;
          a.path.shift();
        } else {
          a.fx += (dx / dist) * stepLen;
          a.fy += (dy / dist) * stepLen;
        }
        walkClock += dt;
        a.pose = Math.floor(walkClock / 0.16) % 2 ? "walk1" : "walk2";
      } else if (a.pending) {
        a.pose = a.pending.pose;
        a.facing = "front";
        a.mirror = false;
        a.poseUntil = t + 3500;
        const [sx, sy] = tileScreen(a.fx, a.fy, true);
        setBubble({ text: a.pending.say, x: Math.min(0.75, Math.max(0.25, sx / ROOM_W)), y: (sy - 52) / ROOM_H, id: t });
        a.pending = null;
      } else if (t > a.poseUntil) {
        a.pose = gloomy ? "sad" : "idle";
        if (a.poseUntil && t > a.poseUntil) {
          a.poseUntil = 0;
          setBubble(null);
          a.facing = "front";
          a.mirror = false;
        }
        if (t > a.nextWander) {
          const options = freeTiles();
          const dest = options[Math.floor(Math.random() * options.length)];
          a.path = findPath({ tx: Math.round(a.fx), ty: Math.round(a.fy) }, dest, live.current.blocked).slice(0, 4);
          a.nextWander = t + 5000 + Math.random() * 6000;
        }
      }

      // draw
      const hour = getNow().getHours();
      if (hour !== bgHour || !bg) {
        bg = toCanvas(buildBackground(hour));
        bgHour = hour;
      }
      ctx.clearRect(0, 0, ROOM_W, ROOM_H);
      ctx.drawImage(bg, 0, 0);

      const view: AvatarView = { fx: a.fx, fy: a.fy, facing: a.facing, pose: a.pose, mirror: a.mirror };
      for (const d of sceneDrawables({ owned, gloomy, avatar: view })) {
        if (d.kind === "piece") {
          const p = piece(d.id, d.locked);
          const x = Math.round(d.x - p.ax), y = Math.round(d.y - p.ay);
          ctx.drawImage(p.c, x, y);
          if (d.locked) drawLock(ctx, Math.round(d.x), y - 4);
        } else if (d.kind === "shadow") {
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          const x = Math.round(d.x), y = Math.round(d.y);
          ctx.fillRect(x - 7, y - 1, 14, 3);
          ctx.fillRect(x - 5, y - 2, 10, 5);
        } else {
          const img = frames.get(`${d.view.facing}:${d.view.pose}`)!;
          const x = Math.round(d.x), y = Math.round(d.y);
          if (d.view.mirror) {
            ctx.save();
            ctx.translate(x + AVATAR_FOOT.x * 2, y);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0);
            ctx.restore();
          } else ctx.drawImage(img, x, y);
        }
      }

      if (gloomy) {
        ctx.fillStyle = "rgba(12,10,40,0.45)";
        ctx.fillRect(0, 0, ROOM_W, ROOM_H);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!bubble) return;
    const id = setTimeout(() => setBubble(null), 3800);
    return () => clearTimeout(id);
  }, [bubble]);

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: `${ROOM_W} / ${ROOM_H}` }}>
      <canvas
        ref={canvasRef}
        width={ROOM_W}
        height={ROOM_H}
        className="h-full w-full"
        style={{ imageRendering: "pixelated" }}
        aria-label="Your room"
      />
      {bubble && (
        <div
          key={bubble.id}
          className="bubble pointer-events-none absolute -translate-x-1/2 -translate-y-full"
          style={{ left: `${bubble.x * 100}%`, top: `${bubble.y * 100}%` }}
        >
          {bubble.text}
        </div>
      )}
      {game.gloomy && (
        <div className="absolute left-2 top-2 rounded-sm border-2 border-black bg-[#3b1d4a] px-2 py-0.5 font-body text-base text-[#f3c1ff]">
          Room is gloomy. One clean day restores it.
        </div>
      )}
    </div>
  );
}

function drawLock(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "#111";
  ctx.fillRect(x - 3, y - 5, 7, 2);
  ctx.fillRect(x - 3, y - 5, 2, 5);
  ctx.fillRect(x + 2, y - 5, 2, 5);
  ctx.fillRect(x - 4, y - 1, 9, 8);
  ctx.fillStyle = "#f1c40f";
  ctx.fillRect(x - 3, y, 7, 6);
  ctx.fillStyle = "#111";
  ctx.fillRect(x, y + 2, 1, 2);
}
