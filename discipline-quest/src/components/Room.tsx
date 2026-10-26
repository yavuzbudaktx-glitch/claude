"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ITEMS } from "@/engine/catalog";
import { dateKey, minutesOfDay, parseHM } from "@/engine/dates";
import { lockedCopy, type Sprite } from "@/game/iso";
import type { Raster } from "@/game/raster";
import { SPOTS, blockedTiles, buildBackground, buildPiece, findPath, screenToTile, tileScreen } from "@/game/furniture";
import { roomLayout, sceneDrawables, type AvatarView, type CatView, type Drawable } from "@/game/scene";
import { renderAvatar, renderSleepingHead, type Facing, type OutfitId, type Pose } from "@/game/sprites/avatar";
import { renderCat } from "@/game/sprites/cat";
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

interface Cached {
  c: HTMLCanvasElement;
  r: Raster;
  ax: number;
  ay: number;
}
const cache = (s: Sprite): Cached => ({ c: toCanvas(s.r), r: s.r, ax: s.ax, ay: s.ay });

const ACTION_SPOT: Record<RoomActionKind, Tile> = {
  pray: SPOTS.pray, wake: SPOTS.wake, late: SPOTS.wake, diet: SPOTS.diet, cheat: SPOTS.diet,
  urge: SPOTS.center, habit: SPOTS.center, buy: SPOTS.center, equip: SPOTS.center, relapse: SPOTS.sad,
};

/** What the avatar does on arrival. Prayer plays a short takbir → qiyam → sitting sequence. */
const ACTION_POSES: Record<RoomActionKind, Pose[]> = {
  pray: ["takbir", "pray", "kneel"], wake: ["celebrate"], late: ["sad"], diet: ["celebrate"], cheat: ["sad"],
  urge: ["celebrate"], habit: ["celebrate"], buy: ["celebrate"], equip: ["celebrate"], relapse: ["sad"],
};

const QUIPS: Record<string, string> = {
  arcade: "Streak first. Games later.",
  tv: "Earned screen time only.",
  bookshelf: "One more chapter.",
  dumbbells: "Light weight!",
  treadmill: "Cardio after Fajr.",
  piano: "♪ ♫",
  aquarium: "The fish never skip a day.",
  ioniq5: "Fully charged.",
  sofa: "Rest, then back to it.",
  desk: "Build, don't scroll.",
  chair: "Posture check.",
  lamp: "Lights.",
  plant: "Watered.",
  monstera: "It grows like my streak.",
  coffee: "Fuel for 08:30.",
  lantern: "Ramadan vibes.",
  mabkhara: "Smells like Jumu'ah.",
  tasbihshelf: "SubhanAllah ×33",
  beanbag: "Comfy.",
  trophycase: "Earned, not bought. Well, bought too.",
};

const SPEED = 2.6;

interface Actor {
  fx: number;
  fy: number;
  path: Tile[];
  facing: Facing;
  mirror: boolean;
  pose: Pose;
  queue: Pose[];
  poseUntil: number;
  pending: { poses: Pose[]; say: string } | null;
  nextWander: number;
  nextBlink: number;
}

interface CatActor {
  fx: number;
  fy: number;
  mirror: boolean;
  moving: boolean;
}

export type RoomTap = "pray" | "wake" | "diet";

export default function Room({ onTap }: { onTap?: (t: RoomTap) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useGame((s) => s.game);
  const lastAction = useGame((s) => s.lastAction);
  const [bubble, setBubble] = useState<{ text: string; x: number; y: number; id: number } | null>(null);
  const [pops, setPops] = useState<{ id: number; text: string; good: boolean; x: number; y: number }[]>([]);

  const layout = useMemo(() => roomLayout(game), [game]);
  const blocked = useMemo(() => blockedTiles(layout.pieces.map((p) => p.place)), [layout]);
  const now = getNow();
  const today = game.days[dateKey(now)];
  const deadline = parseHM(game.settings.wakeTarget) + game.settings.wakeGraceMin;
  const asleep = !!today && today.wake === "pending" && minutesOfDay(now) < deadline;
  const hasCat = game.inventory.some((i) => i.itemId === "cat" && i.lockDaysLeft === 0);

  const live = useRef({ layout, blocked, asleep, outfit: game.equipped.outfit as OutfitId, hasCat, gloomy: game.gloomy });
  live.current = { layout, blocked, asleep, outfit: game.equipped.outfit as OutfitId, hasCat, gloomy: game.gloomy };

  const actor = useRef<Actor>({
    fx: SPOTS.center.tx, fy: SPOTS.center.ty, path: [], facing: "front", mirror: false, pose: "idle",
    queue: [], poseUntil: 0, pending: null, nextWander: 0, nextBlink: 0,
  });
  const cat = useRef<CatActor>({ fx: 3, fy: 4, mirror: false, moving: false });
  const drawn = useRef<Drawable[]>([]);
  const piecesRef = useRef(new Map<string, Cached>());

  const avatarScreen = () => {
    const a = actor.current;
    const [sx, sy] = tileScreen(live.current.layout.spec, a.fx, a.fy, true);
    return { x: sx / live.current.layout.spec.W, y: (sy - 50) / live.current.layout.spec.H };
  };

  // Walk to the right spot for each habit action, then pose and talk.
  useEffect(() => {
    if (!lastAction) return;
    const a = actor.current;
    const from = { tx: Math.round(a.fx), ty: Math.round(a.fy) };
    a.fx = from.tx;
    a.fy = from.ty;
    a.path = findPath(live.current.layout.spec.n, from, ACTION_SPOT[lastAction.kind], live.current.blocked);
    a.pending = { poses: ACTION_POSES[lastAction.kind], say: lastAction.say };
    a.poseUntil = 0;
    a.queue = [];
  }, [lastAction]);

  // Floating +coins / -coins over the avatar.
  const prevCoins = useRef(game.coins);
  useEffect(() => {
    const delta = game.coins - prevCoins.current;
    prevCoins.current = game.coins;
    if (!delta) return;
    const { x, y } = avatarScreen();
    const id = Date.now() + Math.random();
    setPops((p) => [...p.slice(-4), { id, text: `${delta > 0 ? "+" : ""}${delta}`, good: delta > 0, x, y }]);
    setTimeout(() => setPops((p) => p.filter((q) => q.id !== id)), 1400);
  }, [game.coins]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let bgKey = "";
    let bg: HTMLCanvasElement | null = null;
    const pieces = piecesRef.current;
    const piece = (key: string, locked: boolean) => {
      const k = `${key}|${locked}`;
      let p = pieces.get(k);
      if (!p) {
        const s = buildPiece(key);
        p = cache(locked ? lockedCopy(s) : s);
        pieces.set(k, p);
      }
      return p;
    };
    const frames = new Map<string, HTMLCanvasElement>();
    const frame = (outfit: OutfitId, f: Facing, p: Pose) => {
      const k = `${outfit}:${f}:${p}`;
      let c = frames.get(k);
      if (!c) frames.set(k, (c = toCanvas(renderAvatar(f, p, outfit))));
      return c;
    };
    const heads = new Map<string, HTMLCanvasElement>();
    const catFrames = { sit: toCanvas(renderCat("sit")), walk1: toCanvas(renderCat("walk1")), walk2: toCanvas(renderCat("walk2")) };

    let last = performance.now();
    let raf = 0;
    let walkClock = 0;

    const freeTiles = () => {
      const out: Tile[] = [];
      const n = live.current.layout.spec.n;
      for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) if (!live.current.blocked.has(`${x},${y}`)) out.push({ tx: x, ty: y });
      return out;
    };

    const step = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      const a = actor.current;
      const L = live.current;
      const { spec } = L.layout;
      if (canvas.width !== spec.W || canvas.height !== spec.H) {
        canvas.width = spec.W;
        canvas.height = spec.H;
        a.fx = Math.min(a.fx, spec.n - 1);
        a.fy = Math.min(a.fy, spec.n - 1);
      }
      ctx.imageSmoothingEnabled = false;

      // ----- avatar -----
      if (L.asleep && !a.pending) {
        a.path = [];
        a.fx = SPOTS.wake.tx;
        a.fy = SPOTS.wake.ty;
      } else if (a.path.length) {
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
        a.queue = [...a.pending.poses];
        a.pose = a.queue.shift()!;
        a.facing = "front";
        a.mirror = false;
        a.poseUntil = t + (a.queue.length ? 1100 : 3200);
        const { x, y } = avatarScreen();
        setBubble({ text: a.pending.say, x, y, id: t });
        a.pending = null;
      } else if (a.poseUntil && t > a.poseUntil && a.queue.length) {
        a.pose = a.queue.shift()!;
        a.poseUntil = t + (a.queue.length ? 1100 : 2600);
      } else if (t > a.poseUntil) {
        if (a.poseUntil) {
          a.poseUntil = 0;
          a.facing = "front";
          a.mirror = false;
        }
        a.pose = L.gloomy ? "sad" : t > a.nextBlink && t < a.nextBlink + 140 ? "blink" : "idle";
        if (t > a.nextBlink + 140) a.nextBlink = t + 2500 + Math.random() * 3000;
        if (t > a.nextWander) {
          const options = freeTiles();
          const dest = options[Math.floor(Math.random() * options.length)];
          if (dest) a.path = findPath(spec.n, { tx: Math.round(a.fx), ty: Math.round(a.fy) }, dest, L.blocked).slice(0, 4);
          a.nextWander = t + 5000 + Math.random() * 6000;
        }
      }

      // ----- cat follows a step behind -----
      const c = cat.current;
      let catView: CatView | undefined;
      if (L.hasCat) {
        const tx = a.fx - 0.9, ty = a.fy + 0.4;
        const dx = tx - c.fx, dy = ty - c.fy;
        const dist = Math.hypot(dx, dy);
        c.moving = dist > 0.6;
        if (c.moving) {
          const s = Math.min(dist, 2.4 * dt);
          c.fx = Math.max(0, Math.min(spec.n - 1, c.fx + (dx / dist) * s));
          c.fy = Math.max(0, Math.min(spec.n - 1, c.fy + (dy / dist) * s));
          c.mirror = dx - dy < 0;
        }
        catView = { fx: c.fx, fy: c.fy, mirror: c.mirror, pose: c.moving ? (Math.floor(t / 180) % 2 ? "walk1" : "walk2") : "sit" };
      }

      // ----- draw -----
      const now = getNow();
      const hour = now.getHours();
      const key = `${spec.tier}|${L.layout.wallItems.map((w) => w.id + w.locked).join()}|${hour}|${bgSig(L.layout)}`;
      if (key !== bgKey || !bg) {
        bg = toCanvas(buildBackground({ spec, wallpaper: L.layout.wallpaper, floor: L.layout.floor, hour, wallItems: L.layout.wallItems }));
        bgKey = key;
      }
      ctx.clearRect(0, 0, spec.W, spec.H);
      ctx.drawImage(bg, 0, 0);

      const view: AvatarView = { fx: a.fx, fy: a.fy, facing: a.facing, pose: a.pose, mirror: a.mirror, outfit: L.outfit, asleep: L.asleep && !a.pending && !a.path.length };
      const list = sceneDrawables(L.layout, view, catView);
      drawn.current = list;
      for (const d of list) {
        if (d.kind === "piece") {
          const p = piece(d.piece.key, d.piece.locked);
          const x = Math.round(d.x - p.ax), y = Math.round(d.y - p.ay);
          ctx.drawImage(p.c, x, y);
          animate(ctx, d.piece.key.split(":")[0], Math.round(d.x), Math.round(d.y), t, d.piece.locked);
          if (d.piece.key === "bed" && view.asleep) {
            let h = heads.get(L.outfit);
            if (!h) heads.set(L.outfit, (h = toCanvas(renderSleepingHead(L.outfit))));
            ctx.drawImage(h, 0, 0, 18, 16, Math.round(d.x - 15), Math.round(d.y - 12), 18, 16);
            ctx.fillStyle = "#ffffff";
            ctx.font = "8px monospace";
            const zz = Math.floor(t / 500) % 3;
            ctx.fillText("z".repeat(zz + 1), Math.round(d.x + 3), Math.round(d.y - 18 - zz * 2));
          }
          if (d.piece.locked) drawLock(ctx, Math.round(d.x), y - 4);
        } else if (d.kind === "shadow") {
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          const x = Math.round(d.x), y = Math.round(d.y);
          ctx.fillRect(x - 7, y - 1, 14, 3);
          ctx.fillRect(x - 5, y - 2, 10, 5);
        } else if (d.kind === "cat") {
          const img = catFrames[d.view.pose];
          drawMirrored(ctx, img, Math.round(d.x - img.width / 2), Math.round(d.y - img.height + 2), d.view.mirror);
        } else {
          const img = frame(d.view.outfit, d.view.facing, d.view.pose);
          drawMirrored(ctx, img, Math.round(d.x), Math.round(d.y), d.view.mirror);
        }
      }

      // ----- lighting -----
      const dark = hour >= 21 || hour < 5 ? 0.42 : hour >= 19 || hour < 7 ? 0.2 : 0;
      if (L.gloomy || dark) {
        ctx.fillStyle = `rgba(12,10,40,${Math.min(0.6, (L.gloomy ? 0.4 : 0) + dark)})`;
        ctx.fillRect(0, 0, spec.W, spec.H);
      }
      if (dark) {
        ctx.globalCompositeOperation = "lighter";
        for (const d of list) {
          if (d.kind !== "piece" || d.piece.locked) continue;
          const glow = GLOWS[d.piece.key.split(":")[0]];
          if (!glow) continue;
          const [gx, gy, rad, color] = glow;
          const flicker = d.piece.key === "lantern" ? 0.85 + Math.sin(t / 90) * 0.15 : 1;
          const cx = d.x + gx, cy = d.y + gy;
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          g.addColorStop(0, color.replace("A", String(0.5 * flicker)));
          g.addColorStop(1, color.replace("A", "0"));
          ctx.fillStyle = g;
          ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
        }
        ctx.globalCompositeOperation = "source-over";
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!bubble) return;
    const id = setTimeout(() => setBubble(null), 3800);
    return () => clearTimeout(id);
  }, [bubble]);

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const sy = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const hit = hitTest(drawn.current, piecesRef.current, sx, sy);
    const a = actor.current;
    const L = live.current;
    if (hit) {
      const id = hit.split(":")[0];
      if (id === "rug" || id === "rehal") return onTap?.("pray");
      if (id === "bed") return onTap?.("wake");
      if (id === "fridge" || id === "counter" || id === "coffee") return onTap?.("diet");
      if (L.asleep) return onTap?.("wake");
      const quip = QUIPS[id];
      if (quip) {
        const item = ITEMS[id];
        const piece = L.layout.pieces.find((p) => p.key.split(":")[0] === id);
        const target = piece ? nearestFree(piece.place, L.blocked, L.layout.spec.n) : null;
        if (target) a.path = findPath(L.layout.spec.n, { tx: Math.round(a.fx), ty: Math.round(a.fy) }, target, L.blocked);
        a.pending = { poses: ["idle"], say: piece?.locked ? `${item?.name ?? id} is locked. Stay clean.` : quip };
        return;
      }
    }
    if (L.asleep) return onTap?.("wake");
    const t = screenToTile(L.layout.spec, sx, sy);
    if (t.tx < 0 || t.ty < 0 || t.tx >= L.layout.spec.n || t.ty >= L.layout.spec.n || L.blocked.has(`${t.tx},${t.ty}`)) return;
    a.path = findPath(L.layout.spec.n, { tx: Math.round(a.fx), ty: Math.round(a.fy) }, t, L.blocked);
    a.poseUntil = 0;
    a.queue = [];
    a.nextWander = performance.now() + 8000;
  };

  return (
    <div className="relative w-full select-none" style={{ aspectRatio: `${layout.spec.W} / ${layout.spec.H}` }}>
      <canvas
        ref={canvasRef}
        width={layout.spec.W}
        height={layout.spec.H}
        className="h-full w-full cursor-pointer touch-manipulation"
        style={{ imageRendering: "pixelated" }}
        aria-label="Your room. Tap the rug to pray, the bed to wake up, the kitchen for meals."
        onPointerDown={onPointer}
      />
      {bubble && (
        <div
          key={bubble.id}
          className="bubble pointer-events-none absolute -translate-x-1/2 -translate-y-full"
          style={{ left: `${Math.min(75, Math.max(25, bubble.x * 100))}%`, top: `${Math.max(12, bubble.y * 100)}%` }}
        >
          {bubble.text}
        </div>
      )}
      {pops.map((p) => (
        <div
          key={p.id}
          className={`coin-pop pointer-events-none absolute -translate-x-1/2 font-pixel text-[11px] ${p.good ? "text-[#ffe14d]" : "text-[#ff6b6b]"}`}
          style={{ left: `${p.x * 100 + 6}%`, top: `${p.y * 100}%` }}
        >
          {p.text}
        </div>
      ))}
      {asleep && (
        <div className="pointer-events-none absolute right-2 top-2 whitespace-nowrap rounded-sm border-2 border-black bg-[#232a46]/90 px-2 py-0.5 text-base text-white">
          Zzz… tap the bed when you&apos;re up
        </div>
      )}
      {game.gloomy && (
        <div className="absolute left-2 top-2 rounded-sm border-2 border-black bg-[#3b1d4a] px-2 py-0.5 text-base text-[#f3c1ff]">
          Room is gloomy. One clean day restores it.
        </div>
      )}
    </div>
  );
}

function bgSig(l: ReturnType<typeof roomLayout>) {
  return `${l.wallpaper}|${l.floor}`;
}

function drawMirrored(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, mirror: boolean) {
  if (!mirror) return ctx.drawImage(img, x, y);
  ctx.save();
  ctx.translate(x + img.width, y);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** Light sources at night: offset from the piece's back corner, radius, rgba color with an A placeholder. */
const GLOWS: Record<string, [number, number, number, string]> = {
  lamp: [0, -28, 46, "rgba(255,214,120,A)"],
  lantern: [0, -6, 30, "rgba(255,190,80,A)"],
  tv: [10, -8, 26, "rgba(120,190,255,A)"],
  desk: [6, -16, 30, "rgba(90,160,255,A)"],
  aquarium: [0, -12, 24, "rgba(110,220,255,A)"],
  arcade: [10, -20, 26, "rgba(200,90,255,A)"],
  ioniq5: [31, 22, 22, "rgba(220,240,255,A)"],
  trophycase: [0, -22, 22, "rgba(255,230,150,A)"],
};

/** Small per-frame animations drawn over a piece. */
function animate(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, t: number, locked: boolean) {
  if (locked) return;
  const P = (X: number, Y: number, Z: number) => [x + X - Y, y + (X + Y) / 2 - Z] as const;
  if (id === "aquarium") {
    const fish: [number, string, number][] = [[0, "#ff8c1a", 20], [1.7, "#ffd23f", 17], [3.1, "#ff5e5e", 23]];
    for (const [phase, col, z] of fish) {
      const k = (Math.sin(t / 900 + phase) + 1) / 2;
      const [fx, fy] = P(3 + k * 10, 15, z);
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(fx), Math.round(fy), 3, 2);
    }
  } else if (id === "tv" && Math.floor(t / 400) % 3 === 0) {
    const [sx, sy] = P(12, 6, 18);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(Math.round(sx) - 3, Math.round(sy), 4, 2);
  } else if (id === "mabkhara") {
    for (let k = 0; k < 3; k++) {
      const ph = ((t / 1400 + k / 3) % 1);
      const [sx, sy] = P(8, 8, 10 + ph * 16);
      ctx.fillStyle = `rgba(230,230,240,${0.6 * (1 - ph)})`;
      ctx.fillRect(Math.round(sx + Math.sin(ph * 6 + k) * 2), Math.round(sy), 1, 1);
    }
  } else if (id === "desk" && Math.floor(t / 250) % 2) {
    const [sx, sy] = P(12, 5, 24);
    ctx.fillStyle = "#bfe0ff";
    ctx.fillRect(Math.round(sx), Math.round(sy), 3, 1);
  }
}

/** Topmost non-transparent piece under a canvas point. */
function hitTest(list: Drawable[], pieces: Map<string, Cached>, sx: number, sy: number): string | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    if (d.kind !== "piece") continue;
    const p = pieces.get(`${d.piece.key}|${d.piece.locked}`);
    if (!p) continue;
    const px = Math.floor(sx - Math.round(d.x - p.ax)), py = Math.floor(sy - Math.round(d.y - p.ay));
    if (px < 0 || py < 0 || px >= p.r.w || py >= p.r.h) continue;
    if (p.r.data[(py * p.r.w + px) * 4 + 3] > 0) return d.piece.key;
  }
  return null;
}

function nearestFree(place: { tx: number; ty: number; w: number; d: number }, blocked: Set<string>, n: number): Tile | null {
  const cands: Tile[] = [];
  for (let x = place.tx - 1; x <= place.tx + place.w; x++)
    for (let y = place.ty - 1; y <= place.ty + place.d; y++)
      if (x >= 0 && y >= 0 && x < n && y < n && !blocked.has(`${x},${y}`)) cands.push({ tx: x, ty: y });
  return cands.sort((a, b) => b.tx + b.ty - (a.tx + a.ty))[0] ?? null;
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

