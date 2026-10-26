"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ITEMS } from "@/engine/catalog";
import { bedWindow, canStore, isAsleep, wakeWindow } from "@/engine/engine";
import {
  blockedSet,
  checkPlace,
  footprint,
  visiblePlacements,
  type PlaceCheck,
} from "@/engine/placement";
import { checkWall, wallWidth, type WallCheck } from "@/engine/wall";
import { ITEMS as CAT_ITEMS, isWallItem } from "@/engine/catalog";
import type { PlacedItem, WallPlaced } from "@/engine/types";
import { lockedCopy, type Sprite } from "@/game/iso";
import type { Raster } from "@/game/raster";
import {
  buildBackground,
  buildPiece,
  findPath,
  screenToTile,
  tileScreen,
  wallItemPreview,
} from "@/game/furniture";
import {
  pieceDepth,
  pieceKey,
  roomLayout,
  sceneDrawables,
  type AvatarView,
  type CatView,
  type Drawable,
  type PlacedPiece,
} from "@/game/scene";
import {
  renderAvatar,
  renderSleepingHead,
  type BodyStage,
  type Facing,
  type OutfitId,
  type Pose,
} from "@/game/sprites/avatar";
import { renderCat } from "@/game/sprites/cat";
import { getNow } from "@/lib/clock";
import { SFX } from "@/lib/sound";
import { useGame, type RoomActionKind } from "@/store/useGame";
import PixelIcon from "./PixelIcon";
import RasterCanvas from "./RasterCanvas";

type Tile = { tx: number; ty: number };

function toCanvas(r: Raster): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = r.w;
  c.height = r.h;
  c.getContext("2d")!.putImageData(
    new ImageData(new Uint8ClampedArray(r.data), r.w, r.h),
    0,
    0,
  );
  return c;
}

interface Cached {
  c: HTMLCanvasElement;
  r: Raster;
  ax: number;
  ay: number;
}
const cache = (s: Sprite): Cached => ({
  c: toCanvas(s.r),
  r: s.r,
  ax: s.ax,
  ay: s.ay,
});

/** What the avatar does when you tap a piece. */
interface Use {
  /** Stand on the piece itself (sofa, treadmill, chair) instead of next to it. */
  onTop?: boolean;
  /** Draw the avatar behind the piece (sitting in a sofa/chair) or on top (treadmill). */
  depthBias?: number;
  lift?: number;
  poses: Pose[];
  frameMs: number;
  durationMs: number;
  /** "item" = turn toward the piece, "away" = face the way the seat faces, "front" = face you. */
  face: "item" | "away" | "front";
  say?: string;
  effect?: string;
}

const USES: Record<string, Use> = {
  treadmill: {
    onTop: true,
    depthBias: 0.2,
    lift: 4,
    poses: ["run1", "run2"],
    frameMs: 130,
    durationMs: 7000,
    face: "away",
    say: "Cardio!",
    effect: "belt",
  },
  sofa: {
    onTop: true,
    depthBias: -0.1,
    poses: ["sit"],
    frameMs: 1000,
    durationMs: 6000,
    face: "away",
    say: "Taking five.",
  },
  chair: {
    onTop: true,
    depthBias: -0.1,
    poses: ["sit"],
    frameMs: 1000,
    durationMs: 5000,
    face: "away",
  },
  desk: {
    poses: ["game"],
    frameMs: 1000,
    durationMs: 7000,
    face: "item",
    say: "One game. Then back to work.",
    effect: "pc",
  },
  arcade: {
    poses: ["idle", "blink"],
    frameMs: 400,
    durationMs: 7000,
    face: "item",
    say: "High score!",
    effect: "arcade",
  },
  clarinet: {
    poses: ["clarinet"],
    frameMs: 1000,
    durationMs: 7000,
    face: "front",
    say: "♪ ♫ ♪",
    effect: "notes",
  },
  recordplayer: {
    poses: ["celebrate", "idle"],
    frameMs: 450,
    durationMs: 9000,
    face: "front",
    say: "Good song.",
    effect: "vinyl",
  },
  coffee: {
    poses: ["drink"],
    frameMs: 1000,
    durationMs: 4000,
    face: "front",
    say: "Fresh coffee.",
    effect: "steam",
  },
  gymbench: {
    poses: ["curl1", "curl2"],
    frameMs: 500,
    durationMs: 7000,
    face: "front",
    say: "Light weight!",
    effect: "",
  },
  aquarium: {
    poses: ["idle"],
    frameMs: 1000,
    durationMs: 3500,
    face: "item",
    say: "Feeding the fish.",
    effect: "feed",
  },
  bookshelf: {
    poses: ["read"],
    frameMs: 1000,
    durationMs: 7000,
    face: "front",
    say: "One more chapter.",
    effect: "",
  },
  tv: {
    poses: ["sit"],
    frameMs: 1000,
    durationMs: 8000,
    face: "away",
    say: "Earned screen time.",
    effect: "tv",
  },
  console: {
    poses: ["sit"],
    frameMs: 1000,
    durationMs: 8000,
    face: "away",
    say: "One match. Okay, two.",
    effect: "tv",
  },
  armchair: {
    onTop: true,
    depthBias: -0.1,
    poses: ["sit"],
    frameMs: 1000,
    durationMs: 5000,
    face: "away",
    say: "Comfy.",
  },
  massage: {
    onTop: true,
    depthBias: -0.1,
    poses: ["sit", "blink"],
    frameMs: 600,
    durationMs: 6000,
    face: "away",
    say: "Ahhhh. Leg day recovery.",
  },
  majlis: {
    onTop: true,
    depthBias: -0.1,
    poses: ["kneel"],
    frameMs: 1000,
    durationMs: 5000,
    face: "away",
    say: "Çay anyone?",
  },
  punchbag: {
    poses: ["celebrate", "idle"],
    frameMs: 220,
    durationMs: 5000,
    face: "item",
    say: "Take that, urge.",
    effect: "sway",
  },
  pullup: {
    poses: ["celebrate", "idle"],
    frameMs: 600,
    durationMs: 6000,
    face: "front",
    say: "One more rep.",
    effect: "",
  },
  yogamat: {
    onTop: true,
    depthBias: 0.2,
    poses: ["kneel", "pray"],
    frameMs: 1400,
    durationMs: 7000,
    face: "front",
    say: "Stretching. Everything hurts.",
  },
  bike: {
    onTop: true,
    depthBias: 0.2,
    lift: 6,
    poses: ["run1", "run2"],
    frameMs: 160,
    durationMs: 7000,
    face: "away",
    say: "Riding nowhere, fast.",
    effect: "wheels",
  },
  telescope: {
    poses: ["idle"],
    frameMs: 1000,
    durationMs: 4000,
    face: "item",
    say: "Is that the moon? Yep.",
  },
  vending: {
    poses: ["drink"],
    frameMs: 1000,
    durationMs: 4000,
    face: "front",
    say: "Free drinks. Owner perks.",
    effect: "",
  },
  pooltable: {
    poses: ["idle", "celebrate"],
    frameMs: 900,
    durationMs: 5000,
    face: "item",
    say: "Nice break.",
    effect: "",
  },
  pingpong: {
    poses: ["idle", "celebrate"],
    frameMs: 300,
    durationMs: 5000,
    face: "item",
    say: "Ping. Pong. Ping.",
    effect: "",
  },
  globe: {
    poses: ["idle"],
    frameMs: 1000,
    durationMs: 3500,
    face: "item",
    say: "Next trip: …that one.",
    effect: "spin",
  },
  dresser: {
    poses: ["idle"],
    frameMs: 1000,
    durationMs: 3000,
    face: "item",
    say: "Hair's on point.",
  },
  island: {
    poses: ["drink"],
    frameMs: 1000,
    durationMs: 3500,
    face: "front",
    say: "Kitchen island snack. On plan, obviously.",
  },
  dining: {
    poses: ["idle"],
    frameMs: 1000,
    durationMs: 3000,
    face: "item",
    say: "Table for four, dinner for one.",
  },
  hottub: {
    poses: ["blink"],
    frameMs: 1000,
    durationMs: 5000,
    face: "front",
    say: "Bubbles. Earned.",
  },
  fireplace: {
    poses: ["idle"],
    frameMs: 1000,
    durationMs: 4000,
    face: "item",
    say: "Warm.",
  },
  budgie: {
    poses: ["idle", "celebrate"],
    frameMs: 700,
    durationMs: 6500,
    face: "item",
    say: "Fly, little guy!",
    effect: "fly",
  },
  hamster: {
    poses: ["idle"],
    frameMs: 1000,
    durationMs: 5000,
    face: "item",
    say: "Go go go!",
    effect: "wheel",
  },
  turtle: {
    poses: ["idle"],
    frameMs: 1000,
    durationMs: 3500,
    face: "item",
    say: "Slow and steady.",
  },
  snake: {
    poses: ["idle"],
    frameMs: 1000,
    durationMs: 3500,
    face: "item",
    say: "Hssss. (He likes you.)",
    effect: "tongue",
  },
};

const QUIPS: Record<string, string> = {
  plant: "Watered.",
  monstera: "It grows like my streak.",
  lantern: "Ramadan vibes.",
  trophycase: "Earned, not bought. Well, bought too.",
  rehal: "Quran time.",
  fan: "Spinning. Like my thoughts at 2am.",
  cactus: "Don't hug it.",
  bonsai: "Snip snip.",
  olivetree: "No olives yet.",
  sideboard: "Fancy.",
  wardrobe: "Too many hoodies.",
  fountain: "Very villa.",
  kilim: "Nice rug.",
  persian: "Bigger rug.",
};

const ACTION_POSES: Record<RoomActionKind, Pose[]> = {
  pray: ["takbir", "pray", "kneel"],
  wake: ["celebrate"],
  late: ["sad"],
  diet: ["celebrate"],
  cheat: ["sad"],
  urge: ["celebrate"],
  habit: ["celebrate"],
  buy: ["celebrate"],
  equip: ["celebrate"],
  relapse: ["sad"],
  gym: ["curl1", "curl2", "curl1", "curl2"],
  quran: ["read"],
  bed: ["blink"],
};

const SPEED = 2.6;

interface Actor {
  fx: number;
  fy: number;
  path: Tile[];
  facing: Facing;
  mirror: boolean;
  pose: Pose;
  /** Poses to cycle through while busy. */
  cycle: Pose[];
  frameMs: number;
  busyUntil: number;
  /** After arriving: start this activity. */
  pending: {
    use: Use;
    pieceId?: string;
    sitOn?: PlacedItem;
    faceTo?: Tile;
  } | null;
  depth?: number;
  lift?: number;
  nextWander: number;
  nextBlink: number;
}

export type RoomTap = "pray" | "wake" | "diet" | "bed";

export default function Room({
  onTap,
  decorating,
  onDoneDecorating,
  zoom = false,
}: {
  onTap?: (t: RoomTap) => void;
  decorating: boolean;
  onDoneDecorating: () => void;
  zoom?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useGame((s) => s.game);
  const lastAction = useGame((s) => s.lastAction);
  const place = useGame((s) => s.place);
  const store = useGame((s) => s.store);
  const [bubble, setBubble] = useState<{
    text: string;
    x: number;
    y: number;
    id: number;
  } | null>(null);
  const [pops, setPops] = useState<
    { id: number; text: string; good: boolean; x: number; y: number }[]
  >([]);
  const [ghost, setGhost] = useState<PlacedItem | null>(null);
  const [wallGhost, setWallGhost] = useState<WallPlaced | null>(null);
  const placeWallAct = useGame((s) => s.placeWall);
  const storeWallAct = useGame((s) => s.storeWall);

  const layout = useMemo(() => roomLayout(game), [game]);
  const blocked = useMemo(() => blockedSet(visiblePlacements(game)), [game]);
  const asleep = isAsleep(game, getNow());
  const hasCat = game.inventory.some(
    (i) => i.itemId === "cat" && i.lockDaysLeft === 0,
  );
  const ghostCheck: PlaceCheck | null = ghost ? checkPlace(game, ghost) : null;
  const wallCheck: WallCheck | null = wallGhost
    ? checkWall(game, wallGhost)
    : null;
  const wallSig = game.wallPlacements
    .map((w) => `${w.itemId}${w.wall}${w.u}`)
    .join();

  const live = useRef({
    layout,
    blocked,
    asleep,
    outfit: game.equipped.outfit as OutfitId,
    body: game.body.stage as BodyStage,
    hasCat,
    gloomy: game.gloomy,
    decorating,
    ghost,
    ghostOk: ghostCheck === "ok",
    rug: game.equipped.rug,
    lights: game.settings.lights,
    wallGhost,
    wallOk: wallCheck === "ok",
    wallSig,
  });
  live.current = {
    layout,
    blocked,
    asleep,
    outfit: game.equipped.outfit as OutfitId,
    body: game.body.stage as BodyStage,
    hasCat,
    gloomy: game.gloomy,
    decorating,
    ghost,
    ghostOk: ghostCheck === "ok",
    rug: game.equipped.rug,
    lights: game.settings.lights,
    wallGhost,
    wallOk: wallCheck === "ok",
    wallSig,
  };

  const actor = useRef<Actor>({
    fx: 4,
    fy: 3,
    path: [],
    facing: "front",
    mirror: false,
    pose: "idle",
    cycle: [],
    frameMs: 1000,
    busyUntil: 0,
    pending: null,
    nextWander: 0,
    nextBlink: 0,
  });
  const cat = useRef({ fx: 3, fy: 4, mirror: false, moving: false });
  const effects = useRef<{
    effect: string;
    pieceId?: string;
    until: number;
    from: number;
  }>({ effect: "", until: 0, from: 0 });
  const kitchenOpenUntil = useRef(0);
  const lampOn = useRef(true);
  const drawn = useRef<Drawable[]>([]);
  const piecesRef = useRef(new Map<string, Cached>());

  const avatarScreen = () => {
    const a = actor.current;
    const { spec } = live.current.layout;
    const [sx, sy] = tileScreen(spec, a.fx, a.fy, true);
    return { x: sx / spec.W, y: (sy - 50 - (a.lift ?? 0)) / spec.H };
  };

  const placed = (id: string) =>
    live.current.layout.pieces.find((p) => p.place.itemId === id);

  /** Path to a free tile next to a piece (closest to the viewer). */
  const besideTile = (p: PlacedPiece): Tile | null => {
    const { n } = live.current.layout.spec;
    const cands: Tile[] = [];
    for (let x = p.place.tx - 1; x <= p.place.tx + p.w; x++)
      for (let y = p.place.ty - 1; y <= p.place.ty + p.d; y++) {
        const inside =
          x >= p.place.tx &&
          x < p.place.tx + p.w &&
          y >= p.place.ty &&
          y < p.place.ty + p.d;
        if (
          inside ||
          x < 0 ||
          y < 0 ||
          x >= n ||
          y >= n ||
          live.current.blocked.has(`${x},${y}`)
        )
          continue;
        cands.push({ tx: x, ty: y });
      }
    const a = actor.current;
    return (
      cands.sort(
        (u, v) =>
          Math.hypot(u.tx - a.fx, u.ty - a.fy) -
          Math.hypot(v.tx - a.fx, v.ty - a.fy),
      )[0] ?? null
    );
  };

  const goTo = (target: Tile | null, pending: Actor["pending"]) => {
    const a = actor.current;
    const from = { tx: Math.round(a.fx), ty: Math.round(a.fy) };
    a.fx = from.tx;
    a.fy = from.ty;
    a.depth = undefined;
    a.lift = undefined;
    a.busyUntil = 0;
    a.cycle = [];
    a.path =
      target && (target.tx !== from.tx || target.ty !== from.ty)
        ? findPath(
            live.current.layout.spec.n,
            from,
            target,
            live.current.blocked,
          )
        : [];
    a.pending = pending;
  };

  /** Run a piece's activity: walk over, then animate. */
  const usePiece = (id: string) => {
    const use = USES[id];
    const p = placed(id);
    if (!use || !p) return;
    if (id === "bookshelf" || id === "tv") {
      // grab a book / turn on the TV, then sit on the sofa if there is one
      const sofa = placed("sofa");
      if (sofa) {
        effects.current = {
          effect: use.effect ?? "",
          pieceId: id,
          until: performance.now() + use.durationMs + 6000,
          from: performance.now(),
        };
        const seat: Use = {
          ...USES.sofa,
          poses: id === "bookshelf" ? ["read"] : ["sit"],
          say: use.say,
          durationMs: use.durationMs,
        };
        goTo(besideTile(sofa), {
          use: seat,
          pieceId: "sofa",
          sitOn: sofa.place,
        });
        return;
      }
    }
    if (id === "desk") {
      const chair = placed("chair");
      if (chair) {
        effects.current = {
          effect: "pc",
          pieceId: "desk",
          until: performance.now() + use.durationMs + 6000,
          from: performance.now(),
        };
        goTo(besideTile(chair), {
          use: { ...USES.chair, say: use.say, durationMs: use.durationMs },
          pieceId: "chair",
          sitOn: chair.place,
          faceTo: { tx: p.place.tx, ty: p.place.ty },
        });
        return;
      }
    }
    goTo(besideTile(p), {
      use,
      pieceId: id,
      sitOn: use.onTop ? p.place : undefined,
      faceTo: {
        tx: p.place.tx + (p.w - 1) / 2,
        ty: p.place.ty + (p.d - 1) / 2,
      },
    });
  };

  // Habit actions: walk to the right piece, then pose and talk.
  useEffect(() => {
    if (!lastAction) return;
    const target =
      lastAction.kind === "pray"
        ? placed("prayerrug")
        : lastAction.kind === "wake" ||
            lastAction.kind === "late" ||
            lastAction.kind === "bed"
          ? placed("bed")
          : lastAction.kind === "diet" || lastAction.kind === "cheat"
            ? placed("kitchen")
            : lastAction.kind === "quran"
              ? (placed("rehal") ?? placed("prayerrug"))
              : lastAction.kind === "gym"
                ? placed("gymbench")
                : undefined;
    if (lastAction.kind === "diet" || lastAction.kind === "cheat")
      kitchenOpenUntil.current = performance.now() + 4500;
    const use: Use = {
      poses: ACTION_POSES[lastAction.kind],
      frameMs: 1100,
      durationMs: 3600,
      face: "front",
      say: lastAction.say,
    };
    if (target?.place.itemId === "prayerrug") {
      goTo({ tx: target.place.tx, ty: target.place.ty }, { use });
    } else
      goTo(
        target
          ? besideTile(target)
          : {
              tx: Math.round(actor.current.fx),
              ty: Math.round(actor.current.fy),
            },
        { use },
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAction]);

  // Floating +coins / -coins over the avatar.
  const prevCoins = useRef(game.coins);
  useEffect(() => {
    const delta = game.coins - prevCoins.current;
    prevCoins.current = game.coins;
    if (!delta) return;
    const { x, y } = avatarScreen();
    const id = Date.now() + Math.random();
    setPops((p) => [
      ...p.slice(-4),
      { id, text: `${delta > 0 ? "+" : ""}${delta}`, good: delta > 0, x, y },
    ]);
    setTimeout(() => setPops((p) => p.filter((q) => q.id !== id)), 1400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.coins]);

  useEffect(() => {
    if (!decorating) {
      setGhost(null);
      setWallGhost(null);
    }
  }, [decorating]);

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
    const frame = (outfit: OutfitId, body: BodyStage, f: Facing, p: Pose) => {
      const k = `${outfit}:${body}:${f}:${p}`;
      let c = frames.get(k);
      if (!c) frames.set(k, (c = toCanvas(renderAvatar(f, p, outfit, body))));
      return c;
    };
    const heads = new Map<string, HTMLCanvasElement>();
    const catFrames = {
      sit: toCanvas(renderCat("sit")),
      walk1: toCanvas(renderCat("walk1")),
      walk2: toCanvas(renderCat("walk2")),
    };

    let last = performance.now();
    let raf = 0;
    let walkClock = 0;

    const freeTiles = () => {
      const out: Tile[] = [];
      const n = live.current.layout.spec.n;
      for (let x = 0; x < n; x++)
        for (let y = 0; y < n; y++)
          if (!live.current.blocked.has(`${x},${y}`))
            out.push({ tx: x, ty: y });
      return out;
    };

    const faceToward = (a: Actor, to: Tile) => {
      const dx = to.tx - a.fx,
        dy = to.ty - a.fy;
      if (Math.abs(dx) >= Math.abs(dy)) {
        a.facing = dx >= 0 ? "front" : "back";
        a.mirror = dx < 0;
      } else {
        a.facing = dy > 0 ? "front" : "back";
        a.mirror = dy > 0;
      }
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
      const bed = L.layout.pieces.find((p) => p.place.itemId === "bed");
      const sleeping =
        L.asleep && !a.pending && !a.path.length && a.busyUntil < t;
      if (L.decorating) {
        a.path = [];
      } else if (sleeping) {
        a.path = [];
        a.cycle = [];
      } else if (a.path.length) {
        const next = a.path[0];
        const dx = next.tx - a.fx,
          dy = next.ty - a.fy;
        const dist = Math.hypot(dx, dy);
        const stepLen = SPEED * dt;
        faceToward(a, next);
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
        const { use, sitOn, faceTo } = a.pending;
        if (sitOn) {
          const fp = footprint(sitOn.itemId, sitOn.rot);
          // sit on the middle of the piece; seats face away from their backrest (-X, or -Y when rotated)
          a.fx = sitOn.tx + (fp.w - 1) / 2;
          a.fy = sitOn.ty + (fp.d - 1) / 2;
          const p = L.layout.pieces.find(
            (q) => q.place.itemId === sitOn.itemId,
          );
          a.depth = p ? pieceDepth(p) + (use.depthBias ?? 0) : undefined;
          a.lift = use.lift;
          // sofas face -X when unrotated; chairs and treadmills face -Y
          a.facing = "back";
          a.mirror = (sitOn.itemId === "sofa") !== (sitOn.rot === 1);
        } else if (use.face === "item" && faceTo) faceToward(a, faceTo);
        else {
          a.facing = "front";
          a.mirror = false;
        }
        a.cycle = use.poses;
        a.frameMs = use.frameMs;
        a.pose = use.poses[0];
        a.busyUntil = t + use.durationMs;
        if (use.effect)
          effects.current = {
            effect: use.effect,
            pieceId: a.pending.pieceId,
            until: Math.max(effects.current.until, t + use.durationMs),
            from: t,
          };
        if (use.say) {
          const { x, y } = avatarScreen();
          setBubble({ text: use.say, x, y, id: t });
        }
        a.pending = null;
      } else if (a.busyUntil > t) {
        a.pose = a.cycle[Math.floor(t / a.frameMs) % a.cycle.length] ?? "idle";
        // facing "front" poses like clarinet/pray only exist from the front
        if (
          [
            "pray",
            "takbir",
            "kneel",
            "clarinet",
            "read",
            "drink",
            "curl1",
            "curl2",
            "celebrate",
            "sad",
          ].includes(a.pose) &&
          !a.depth
        ) {
          a.facing = "front";
          a.mirror = false;
        }
      } else {
        if (a.busyUntil) {
          // stand up off seats / treadmill onto the nearest free tile
          if (a.depth !== undefined || a.lift) {
            const free = freeTiles().sort(
              (u, v) =>
                Math.hypot(u.tx - a.fx, u.ty - a.fy) -
                Math.hypot(v.tx - a.fx, v.ty - a.fy),
            )[0];
            if (free) {
              a.fx = free.tx;
              a.fy = free.ty;
            }
          }
          a.busyUntil = 0;
          a.depth = undefined;
          a.lift = undefined;
          a.facing = "front";
          a.mirror = false;
          a.nextWander = t + 4000;
        }
        a.pose = L.gloomy
          ? "sad"
          : t > a.nextBlink && t < a.nextBlink + 140
            ? "blink"
            : "idle";
        if (t > a.nextBlink + 140)
          a.nextBlink = t + 2500 + Math.random() * 3000;
        if (t > a.nextWander) {
          const options = freeTiles();
          const dest = options[Math.floor(Math.random() * options.length)];
          if (dest)
            a.path = findPath(
              spec.n,
              { tx: Math.round(a.fx), ty: Math.round(a.fy) },
              dest,
              L.blocked,
            ).slice(0, 4);
          a.nextWander = t + 5000 + Math.random() * 6000;
        }
      }

      // ----- cat follows a step behind -----
      const c = cat.current;
      let catView: CatView | undefined;
      if (L.hasCat && !L.decorating) {
        const tx = (sleeping && bed ? bed.place.tx + bed.w : a.fx) - 0.9,
          ty = (sleeping && bed ? bed.place.ty : a.fy) + 0.4;
        const dx = tx - c.fx,
          dy = ty - c.fy;
        const dist = Math.hypot(dx, dy);
        c.moving = dist > 0.6;
        if (c.moving) {
          const s = Math.min(dist, 2.4 * dt);
          c.fx = Math.max(0, Math.min(spec.n - 1, c.fx + (dx / dist) * s));
          c.fy = Math.max(0, Math.min(spec.n - 1, c.fy + (dy / dist) * s));
          c.mirror = dx - dy < 0;
        }
        catView = {
          fx: c.fx,
          fy: c.fy,
          mirror: c.mirror,
          pose: c.moving
            ? Math.floor(t / 180) % 2
              ? "walk1"
              : "walk2"
            : "sit",
        };
      }

      // ----- draw -----
      const now = getNow();
      const hour = now.getHours();
      const wg = L.wallGhost;
      const key = `${spec.tier}|${L.layout.wallItems.map((w) => w.id + w.locked).join()}|${L.wallSig}|${wg ? `${wg.itemId}${wg.wall}${wg.u}` : ""}|${hour}|${L.layout.wallpaper}|${L.layout.floor}|${L.layout.curtains}|${L.layout.ledStrip}`;
      if (key !== bgKey || !bg) {
        const wallItems = L.layout.wallItems.filter(
          (w) => !wg || w.id !== wg.itemId,
        );
        if (wg)
          wallItems.push({
            id: wg.itemId,
            wall: wg.wall,
            u: wg.u,
            locked: false,
          });
        bg = toCanvas(
          buildBackground({
            spec,
            wallpaper: L.layout.wallpaper,
            floor: L.layout.floor,
            hour,
            wallItems,
            curtains: L.layout.curtains,
            ledStrip: L.layout.ledStrip,
          }),
        );
        bgKey = key;
      }
      ctx.clearRect(0, 0, spec.W, spec.H);
      ctx.drawImage(bg, 0, 0);

      const view: AvatarView = {
        fx: a.fx,
        fy: a.fy,
        facing: a.facing,
        pose: a.pose,
        mirror: a.mirror,
        outfit: L.outfit,
        body: L.body,
        asleep: sleeping || L.decorating,
        depth: a.depth,
        lift: a.lift,
      };
      const ghost = L.ghost;
      const layoutForDraw = ghost
        ? {
            ...L.layout,
            pieces: L.layout.pieces.filter(
              (p) => p.place.itemId !== ghost.itemId,
            ),
          }
        : L.layout;
      const list = sceneDrawables(layoutForDraw, view, catView);
      drawn.current = list;
      const fx = effects.current.until > t ? effects.current : null;
      for (const d of list) {
        if (d.kind === "piece") {
          const id = d.piece.place.itemId;
          let k = d.piece.key;
          if (id === "kitchen" && kitchenOpenUntil.current > t) k += "-open";
          const p = piece(k, d.piece.locked);
          drawPiece(ctx, p, d.x, d.y, d.piece.place.rot === 1);
          if (!d.piece.locked)
            animate(
              ctx,
              id,
              d.x,
              d.y,
              d.piece.place.rot === 1,
              t,
              fx?.pieceId === id ? fx.effect : "",
              lampOn.current,
              [
                L.layout.spec.n * 8 - d.piece.place.tx * 16,
                L.layout.spec.n * 8 - d.piece.place.ty * 16,
                L.layout.spec.n * 4.5,
              ],
              fx ? t - fx.from : 0,
            );
          if (id === "bed" && view.asleep && !L.decorating) {
            let h = heads.get(L.outfit);
            if (!h)
              heads.set(L.outfit, (h = toCanvas(renderSleepingHead(L.outfit))));
            const rot = d.piece.place.rot === 1;
            const [hx, hy] = local(d.x, d.y, rot)(10, 16, 13);
            ctx.drawImage(
              h,
              0,
              0,
              18,
              16,
              Math.round(hx - 9),
              Math.round(hy - 10),
              18,
              16,
            );
            ctx.fillStyle = "#ffffff";
            ctx.font = "8px monospace";
            const zz = Math.floor(t / 500) % 3;
            ctx.fillText(
              "z".repeat(zz + 1),
              Math.round(hx + 8),
              Math.round(hy - 12 - zz * 2),
            );
          }
          if (d.piece.locked)
            drawLock(ctx, Math.round(d.x), Math.round(d.y - p.ay) - 4);
        } else if (d.kind === "shadow") {
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          const x = Math.round(d.x),
            y = Math.round(d.y);
          ctx.fillRect(x - 7, y - 1, 14, 3);
          ctx.fillRect(x - 5, y - 2, 10, 5);
        } else if (d.kind === "cat") {
          const img = catFrames[d.view.pose];
          drawMirrored(
            ctx,
            img,
            Math.round(d.x - img.width / 2),
            Math.round(d.y - img.height + 2),
            d.view.mirror,
          );
        } else {
          const img = frame(
            d.view.outfit,
            d.view.body,
            d.view.facing,
            d.view.pose,
          );
          drawMirrored(
            ctx,
            img,
            Math.round(d.x),
            Math.round(d.y),
            d.view.mirror,
          );
        }
      }

      // ----- decorate: the piece being moved, with its footprint in green/red -----
      if (L.decorating && ghost) {
        const fp = footprint(ghost.itemId, ghost.rot);
        ctx.fillStyle = L.ghostOk
          ? "rgba(76,175,80,0.45)"
          : "rgba(214,69,65,0.5)";
        for (let x = ghost.tx; x < ghost.tx + fp.w; x++)
          for (let y = ghost.ty; y < ghost.ty + fp.d; y++) {
            const [sx, sy] = tileScreen(spec, x, y);
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + 16, sy + 8);
            ctx.lineTo(sx, sy + 16);
            ctx.lineTo(sx - 16, sy + 8);
            ctx.closePath();
            ctx.fill();
          }
        const [gx, gy] = tileScreen(spec, ghost.tx, ghost.ty);
        const s = {
          itemId: ghost.itemId,
          tx: ghost.tx,
          ty: ghost.ty,
          rot: ghost.rot,
        } as PlacedItem;
        ctx.globalAlpha = 0.8;
        drawPiece(
          ctx,
          piece(pieceKey(useGame.getState().game, s), false),
          gx,
          gy,
          ghost.rot === 1,
        );
        ctx.globalAlpha = 1;
      } else if (L.decorating) {
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        for (let x = 0; x <= spec.n; x++) {
          const [ax, ay] = tileScreen(spec, x, 0);
          const [bx, by] = tileScreen(spec, x, spec.n);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
        for (let y = 0; y <= spec.n; y++) {
          const [ax, ay] = tileScreen(spec, 0, y);
          const [bx, by] = tileScreen(spec, spec.n, y);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }

      // ----- lighting -----
      const night =
        hour >= 21 || hour < 5 ? 0.42 : hour >= 19 || hour < 7 ? 0.2 : 0;
      // Lights on: a warm, bright room. Lights off (or asleep): the dark night look with lamps glowing.
      const lightsOn = L.lights && !sleeping;
      const dark = lightsOn ? 0 : night;
      if (lightsOn && night) {
        ctx.fillStyle = "rgba(255,190,120,0.07)";
        ctx.fillRect(0, 0, spec.W, spec.H);
      }
      if (L.gloomy || dark) {
        ctx.fillStyle = `rgba(12,10,40,${Math.min(0.6, (L.gloomy ? 0.4 : 0) + dark)})`;
        ctx.fillRect(0, 0, spec.W, spec.H);
      }
      if (dark) {
        ctx.globalCompositeOperation = "lighter";
        for (const d of list) {
          if (d.kind !== "piece" || d.piece.locked) continue;
          const id = d.piece.place.itemId;
          const glow = GLOWS[id];
          if (!glow || (id === "lamp" && !lampOn.current)) continue;
          if (id === "tv" && fx?.effect !== "tv") continue;
          if (id === "console" && fx?.pieceId !== "console") continue;
          const [gx, gy, rad, color] = glow;
          const flicker = id === "lantern" ? 0.85 + Math.sin(t / 90) * 0.15 : 1;
          const [cx, cy] = local(d.x, d.y, d.piece.place.rot === 1)(gx, gy, 0);
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          g.addColorStop(0, color.replace("A", String(0.5 * flicker)));
          g.addColorStop(1, color.replace("A", "0"));
          ctx.fillStyle = g;
          ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
        }
        if (L.layout.ledStrip) {
          ctx.strokeStyle = `rgba(200,107,255,${0.35 + Math.sin(t / 700) * 0.1})`;
          ctx.lineWidth = 3;
          const top = spec.wallH - 3;
          const [ax, ay] = [spec.origin.x, spec.origin.y - top];
          ctx.beginPath();
          ctx.moveTo(ax - spec.n * 16, ay + spec.n * 8);
          ctx.lineTo(ax, ay);
          ctx.lineTo(ax + spec.n * 16, ay + spec.n * 8);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
        ctx.globalCompositeOperation = "source-over";
      }
      // wall decor being moved: outline its spot in green/red
      if (L.decorating && wg) {
        const w = wallWidth(wg.itemId);
        const P = (u: number, z: number) =>
          wg.wall === "R"
            ? [spec.origin.x + u, spec.origin.y + u / 2 - z]
            : [spec.origin.x - u, spec.origin.y + u / 2 - z];
        ctx.strokeStyle = L.wallOk ? "#4caf50" : "#d64541";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const pts = [
          P(wg.u, 22),
          P(wg.u + w, 22),
          P(wg.u + w, 66),
          P(wg.u, 66),
        ];
        pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.stroke();
        ctx.lineWidth = 1;
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

  const toCanvasXY = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * canvas.width,
      ((e.clientY - rect.top) / rect.height) * canvas.height,
    ];
  };

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = toCanvasXY(e);
    const L = live.current;
    const hit = hitTest(drawn.current, piecesRef.current, sx, sy);

    if (L.decorating) {
      if (!ghost) {
        const w = wallHit(L.layout, sx, sy);
        if (w) {
          setWallGhost({ itemId: w.id, wall: w.wall, u: w.u });
          return;
        }
      }
      if (wallGhost) return;
      if (ghost) {
        const t = screenToTile(L.layout.spec, sx, sy);
        setGhost({ ...ghost, tx: t.tx, ty: t.ty });
      } else if (hit) {
        const p = L.layout.pieces.find(
          (q) => q.place.itemId === hit.split(":")[0],
        );
        if (p && ITEMS[p.place.itemId]?.size) setGhost({ ...p.place });
      }
      return;
    }

    const now = getNow();
    if (hit) {
      const id = hit.split(":")[0];
      if (id === "prayerrug" || id === "rehal") return onTap?.("pray");
      if (id === "bed") {
        const s = useGame.getState().game;
        if (isAsleep(s, now) && wakeWindow(s, now) !== "too-early")
          return onTap?.("wake");
        if (bedWindow(s, now) !== "too-early") return onTap?.("bed");
        return onTap?.("wake");
      }
      if (id === "kitchen") {
        kitchenOpenUntil.current = performance.now() + 4500;
        return onTap?.("diet");
      }
      if (L.asleep) return onTap?.("wake");
      const p = placed(id);
      if (p?.locked) {
        goTo(besideTile(p), {
          use: {
            poses: ["sad"],
            frameMs: 1000,
            durationMs: 2500,
            face: "front",
            say: `${ITEMS[id]?.name ?? id} is locked. Stay clean.`,
          },
        });
        return;
      }
      if (id === "lamp") {
        lampOn.current = !lampOn.current;
        if (useGame.getState().game.settings.sound) SFX.tap();
        return;
      }
      if (USES[id]) {
        if (useGame.getState().game.settings.sound)
          (id === "clarinet" || id === "recordplayer" ? SFX.melody : SFX.tap)();
        return usePiece(id);
      }
      if (QUIPS[id] && p)
        return goTo(besideTile(p), {
          use: {
            poses: ["idle"],
            frameMs: 1000,
            durationMs: 2500,
            face: "item",
            say: QUIPS[id],
          },
          faceTo: { tx: p.place.tx, ty: p.place.ty },
        });
    }
    if (L.asleep) return onTap?.("wake");
    const t = screenToTile(L.layout.spec, sx, sy);
    if (
      t.tx < 0 ||
      t.ty < 0 ||
      t.tx >= L.layout.spec.n ||
      t.ty >= L.layout.spec.n ||
      L.blocked.has(`${t.tx},${t.ty}`)
    )
      return;
    goTo(t, null);
    actor.current.nextWander = performance.now() + 8000;
  };

  const s = game;
  const placeable = s.inventory
    .map((i) => i.itemId)
    .filter((id) => ITEMS[id]?.size)
    .concat(["bed", "kitchen", "prayerrug"]);
  const wallOwned = s.inventory
    .map((i) => i.itemId)
    .filter((id) => isWallItem(id));
  const hungIds = new Set(s.wallPlacements.map((w) => w.itemId));
  const wallReason: Record<WallCheck, string> = {
    ok: "Fits here",
    outside: "Off the wall",
    overlap: "Hits a window or another frame",
  };
  const nudge = (du: number) =>
    wallGhost &&
    setWallGhost({ ...wallGhost, u: Math.max(0, wallGhost.u + du) });
  const placedIds = new Set(s.placements.map((p) => p.itemId));
  const ghostReason: Record<PlaceCheck, string> = {
    ok: "Fits here",
    outside: "Outside the room",
    overlap: "Something's already there",
    "blocks-path": "That would block the way",
  };

  return (
    <div>
      <div className="relative">
        <div
          className={zoom ? "overflow-x-auto" : ""}
          ref={(el) => {
            if (el && zoom && !el.dataset.centered) {
              el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
              el.dataset.centered = "1";
            }
            if (el && !zoom) delete el.dataset.centered;
          }}
        >
          <div
            className="relative select-none"
            style={{
              width: zoom ? "200%" : "100%",
              aspectRatio: `${layout.spec.W} / ${layout.spec.H}`,
            }}
          >
            <canvas
              ref={canvasRef}
              width={layout.spec.W}
              height={layout.spec.H}
              className="h-full w-full cursor-pointer touch-manipulation"
              style={{ imageRendering: "pixelated" }}
              aria-label="Your room. Tap the rug to pray, the bed to sleep or wake up, the kitchen for meals, and other items to use them."
              onPointerDown={onPointer}
            />
            {bubble && !decorating && (
              <div
                key={bubble.id}
                className="bubble pointer-events-none absolute -translate-x-1/2 -translate-y-full"
                style={{
                  left: `${Math.min(75, Math.max(25, bubble.x * 100))}%`,
                  top: `${Math.max(12, bubble.y * 100)}%`,
                }}
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
          </div>
        </div>
        {asleep && !decorating && (
          <div className="pointer-events-none absolute right-2 top-2 whitespace-nowrap rounded-sm border-2 border-black bg-[#232a46]/90 px-2 py-0.5 text-base text-white">
            Zzz… tap the bed when you&apos;re up
          </div>
        )}
        {game.gloomy && !decorating && (
          <div className="absolute left-2 top-2 rounded-sm border-2 border-black bg-[#3b1d4a] px-2 py-0.5 text-base text-[#f3c1ff]">
            Room is gloomy. One clean day restores it.
          </div>
        )}
        {decorating && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-sm border-2 border-black bg-[#232a46]/90 px-2 py-0.5 text-base text-white">
            {wallGhost
              ? `Slide the ${ITEMS[wallGhost.itemId]?.name ?? wallGhost.itemId} with ◀ ▶`
              : ghost
                ? `Tap a tile to move the ${ITEMS[ghost.itemId]?.name ?? ghost.itemId}`
                : "Tap an item or a wall decoration to move it"}
          </div>
        )}
      </div>

      {decorating && (
        <div className="space-y-2 border-t-2 border-black bg-[var(--panel)] p-2">
          {wallGhost ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`chip ${wallCheck === "ok" ? "bg-[#d9f0d9]" : "bg-[#f9d6d5]"}`}
              >
                {wallReason[wallCheck ?? "outside"]}
              </span>
              <button
                className="btn"
                onClick={() => nudge(wallGhost.wall === "R" ? -4 : 4)}
                aria-label="Move left"
              >
                ◀
              </button>
              <button
                className="btn"
                onClick={() => nudge(wallGhost.wall === "R" ? 4 : -4)}
                aria-label="Move right"
              >
                ▶
              </button>
              <button
                className="btn"
                onClick={() =>
                  setWallGhost({
                    ...wallGhost,
                    wall: wallGhost.wall === "L" ? "R" : "L",
                  })
                }
              >
                Swap wall
              </button>
              <button
                className="btn btn-green"
                disabled={wallCheck !== "ok"}
                onClick={() => {
                  placeWallAct(wallGhost);
                  setWallGhost(null);
                }}
              >
                Place
              </button>
              {hungIds.has(wallGhost.itemId) && (
                <button
                  className="btn"
                  onClick={() => {
                    storeWallAct(wallGhost.itemId);
                    setWallGhost(null);
                  }}
                >
                  Store
                </button>
              )}
              <button className="btn" onClick={() => setWallGhost(null)}>
                Cancel
              </button>
            </div>
          ) : ghost ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`chip ${ghostCheck === "ok" ? "bg-[#d9f0d9]" : "bg-[#f9d6d5]"}`}
              >
                {ghostReason[ghostCheck ?? "outside"]}
              </span>
              <button
                className="btn"
                onClick={() => setGhost({ ...ghost, rot: ghost.rot ? 0 : 1 })}
              >
                Rotate
              </button>
              <button
                className="btn btn-green"
                disabled={ghostCheck !== "ok"}
                onClick={() => {
                  place(ghost);
                  setGhost(null);
                }}
              >
                Place
              </button>
              {canStore(ghost.itemId) && placedIds.has(ghost.itemId) && (
                <button
                  className="btn"
                  onClick={() => {
                    store(ghost.itemId);
                    setGhost(null);
                  }}
                >
                  Store
                </button>
              )}
              <button className="btn" onClick={() => setGhost(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-base text-[var(--muted)]">
                Pick something below or tap it in the room.
              </span>
              <button className="btn btn-blue" onClick={onDoneDecorating}>
                Done
              </button>
            </div>
          )}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {placeable.map((id) => {
              const isPlaced = placedIds.has(id);
              return (
                <button
                  key={id}
                  className={`flex w-[72px] shrink-0 flex-col items-center rounded-[4px] border-2 border-black p-1 ${ghost?.itemId === id ? "bg-[#e3f1ff]" : "bg-white"}`}
                  onClick={() => {
                    setWallGhost(null);
                    const cur = s.placements.find((p) => p.itemId === id);
                    const n = layout.spec.n;
                    setGhost(
                      cur ?? {
                        itemId: id,
                        tx: Math.floor(n / 2),
                        ty: Math.floor(n / 2),
                        rot: 0,
                      },
                    );
                  }}
                >
                  <RasterCanvas
                    make={() =>
                      buildPiece(
                        id === "prayerrug"
                          ? `prayerrug:${s.equipped.rug}`
                          : id === "kitchen"
                            ? "kitchen:wall"
                            : id,
                      ).r
                    }
                    deps={[id]}
                    style={{ width: 48, height: 40 }}
                  />
                  <span className="w-full truncate text-center text-sm leading-tight">
                    {ITEMS[id]?.name ?? id}
                  </span>
                  <span
                    className={`text-xs leading-tight ${isPlaced ? "text-[var(--good)]" : "text-[var(--head-2)]"}`}
                  >
                    {isPlaced ? "placed" : "in storage"}
                  </span>
                </button>
              );
            })}
            {wallOwned.map((id) => {
              const hung = s.wallPlacements.find((w) => w.itemId === id);
              return (
                <button
                  key={id}
                  className={`flex w-[72px] shrink-0 flex-col items-center rounded-[4px] border-2 border-black p-1 ${wallGhost?.itemId === id ? "bg-[#e3f1ff]" : "bg-[#f3efe4]"}`}
                  onClick={() => {
                    setGhost(null);
                    setWallGhost(hung ?? { itemId: id, wall: "R", u: 8 });
                  }}
                >
                  <RasterCanvas
                    make={() => wallItemPreview(id).r}
                    deps={[id]}
                    style={{ width: 48, height: 40 }}
                  />
                  <span className="w-full truncate text-center text-sm leading-tight">
                    {CAT_ITEMS[id]?.name ?? id}
                  </span>
                  <span
                    className={`text-xs leading-tight ${hung ? "text-[var(--good)]" : "text-[var(--head-2)]"}`}
                  >
                    {hung ? "on wall" : "in storage"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  p: Cached,
  x: number,
  y: number,
  mirror: boolean,
) {
  if (!mirror)
    return ctx.drawImage(p.c, Math.round(x - p.ax), Math.round(y - p.ay));
  ctx.save();
  ctx.translate(Math.round(x + p.ax + 1), Math.round(y - p.ay));
  ctx.scale(-1, 1);
  ctx.drawImage(p.c, 0, 0);
  ctx.restore();
}

function drawMirrored(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  x: number,
  y: number,
  mirror: boolean,
) {
  if (!mirror) return ctx.drawImage(img, x, y);
  ctx.save();
  ctx.translate(x + img.width, y);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/** Project a piece-local point (X, Y, Z) to the screen, honouring rotation (mirroring swaps X and Y). */
function local(x: number, y: number, rot: boolean) {
  return (X: number, Y: number, Z: number): [number, number] => {
    const [a, b] = rot ? [Y, X] : [X, Y];
    return [x + a - b, y + (a + b) / 2 - Z];
  };
}

/** Light sources at night: piece-local offset (X, Y), radius, rgba color with an A placeholder. */
const GLOWS: Record<string, [number, number, number, string]> = {
  lamp: [8, 8, 46, "rgba(255,214,120,A)"],
  lantern: [8, 8, 30, "rgba(255,190,80,A)"],
  tv: [8, 16, 34, "rgba(120,190,255,A)"],
  desk: [16, 8, 30, "rgba(90,160,255,A)"],
  aquarium: [8, 8, 24, "rgba(110,220,255,A)"],
  arcade: [12, 8, 28, "rgba(200,90,255,A)"],
  trophycase: [8, 8, 22, "rgba(255,230,150,A)"],
  recordplayer: [8, 8, 18, "rgba(255,120,120,A)"],
  fireplace: [16, 10, 46, "rgba(255,150,60,A)"],
  vending: [8, 8, 30, "rgba(255,120,120,A)"],
  console: [8, 8, 20, "rgba(120,190,255,A)"],
  hottub: [16, 16, 30, "rgba(95,211,232,A)"],
};

const NOTE = ["..##", "..#.", "..#.", "###.", "##.."];

/** Small per-frame animations drawn over a piece. `effect` is the active use, if any. */
function animate(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  rot: boolean,
  t: number,
  effect: string,
  lampOn: boolean,
  /** World offset from this piece to the middle of the room, and a radius that stays inside it. */
  room: [number, number, number],
  /** ms since the current effect started. */
  since: number,
) {
  const P = local(x, y, rot);
  const px = (X: number, Y: number, Z: number, c: string, w = 1, h = 1) => {
    const [sx, sy] = P(X, Y, Z);
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(sx), Math.round(sy), w, h);
  };
  const note = (
    X: number,
    Y: number,
    Z: number,
    phase: number,
    color: string,
  ) => {
    const k = (t / 1600 + phase) % 1;
    const [sx, sy] = P(X, Y, Z + k * 18);
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = color;
    NOTE.forEach((row, ry) =>
      [...row].forEach(
        (ch, rx) =>
          ch === "#" &&
          ctx.fillRect(
            Math.round(sx + rx + Math.sin(k * 6 + phase) * 2),
            Math.round(sy + ry),
            1,
            1,
          ),
      ),
    );
    ctx.globalAlpha = 1;
  };
  switch (id) {
    case "aquarium": {
      const fish: [number, string, number][] = [
        [0, "#ff8c1a", 20],
        [1.7, "#ffd23f", 17],
        [3.1, "#ff5e5e", 23],
      ];
      for (const [phase, col, z] of fish)
        px(3 + ((Math.sin(t / 900 + phase) + 1) / 2) * 10, 15, z, col, 3, 2);
      if (effect === "feed")
        for (let k = 0; k < 4; k++)
          px(4 + k * 2, 6 + k, 26 - ((t / 60 + k * 5) % 12), "#c8a26a");
      break;
    }
    case "tv":
      if (effect === "tv") {
        const cols = ["#3a8ee6", "#e74c3c", "#2ecc71", "#f1c40f", "#9b59b6"];
        for (let k = 0; k < 6; k++) {
          const c = cols[(Math.floor(t / 300) + k) % cols.length];
          const [ax, ay] = P(7.6, 2 + k * 5, 29);
          const [bx, by] = P(7.6, 2 + k * 5 + 5, 12);
          ctx.fillStyle = c;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(
            Math.round(Math.min(ax, bx)),
            Math.round(ay),
            Math.max(1, Math.round(Math.abs(bx - ax))),
            Math.round(by - ay),
          );
          ctx.globalAlpha = 1;
        }
      }
      break;
    case "desk":
      if (effect === "pc") {
        for (let k = 0; k < 5; k++)
          px(
            10 + k * 2.5,
            5,
            20 + ((t / 90 + k * 3) % 6),
            k % 2 ? "#ff3df2" : "#4dff88",
            2,
            1,
          );
      } else if (Math.floor(t / 250) % 2) px(12, 5, 24, "#bfe0ff", 3, 1);
      px(30, 6, 21, ["#ff3df2", "#3dfff2", "#f1c40f"][Math.floor(t / 400) % 3]);
      break;
    case "arcade":
      px(
        9.7,
        6 + (Math.floor(t / (effect ? 120 : 400)) % 5),
        30,
        "#4dff88",
        2,
        1,
      );
      px(
        9.7,
        9 - (Math.floor(t / (effect ? 150 : 500)) % 4),
        32,
        "#ff4d6d",
        1,
        1,
      );
      if (effect)
        px(9.7, 8, 34, Math.floor(t / 200) % 2 ? "#ffffff" : "#f1c40f", 2, 1);
      break;
    case "recordplayer":
      if (effect === "vinyl") {
        const a = t / 140;
        px(7.5 + Math.cos(a) * 3, 8 + Math.sin(a) * 3, 15.2, "#9a9aa0");
        note(4, 6, 18, 0, "#ff4fc3");
        note(10, 9, 18, 0.5, "#4de0ff");
      }
      break;
    case "clarinet":
      if (effect === "notes") {
        note(2, 12, 30, 0, "#ffd23f");
        note(-4, 14, 30, 0.35, "#ffffff");
        note(4, 16, 30, 0.7, "#4de0ff");
      }
      break;
    case "treadmill":
      if (effect === "belt")
        for (let k = 0; k < 6; k++)
          px(4, 5 + ((k * 4 + t / 40) % 24), 4.1, "#55555a", 8, 1);
      break;
    case "coffee":
      if (effect === "steam")
        for (let k = 0; k < 3; k++) {
          const ph = (t / 900 + k / 3) % 1;
          ctx.globalAlpha = 0.7 * (1 - ph);
          px(12.5, 9.5, 17 + ph * 12, "#ffffff");
          ctx.globalAlpha = 1;
        }
      break;
    case "budgie": {
      // perched in the cage, hopping; when tapped it flies a loop around the room and comes back
      const bird = (bx: number, by: number, flap: boolean, k = 1) => {
        const r = (dx: number, dy: number, w: number, h: number, c: string) => {
          ctx.fillStyle = c;
          ctx.fillRect(
            Math.round(bx + dx * k),
            Math.round(by + dy * k),
            w * k,
            h * k,
          );
        };
        r(0, 0, 4, 3, "#6fd14a");
        r(3, -1, 2, 2, "#ffe14d");
        r(4, -1, 1, 1, "#1d1d1d");
        r(1, flap ? -2 : 1, 2, 1, "#3d9a2a");
      };
      if (effect === "fly") {
        // out of the cage, a lap around the middle of the room, back in
        const k = Math.min(1, since / 6000);
        const [cx, cy, R] = room;
        const start = Math.atan2(8 - cy, 8 - cx);
        const a = start + k * Math.PI * 2;
        const s = Math.sqrt(Math.sin(k * Math.PI));
        const wx = 8 + (cx + Math.cos(a) * R - 8) * s;
        const wy = 8 + (cy + Math.sin(a) * R - 8) * s;
        const z = 24 + s * 30 + Math.sin(k * Math.PI * 6) * 4;
        const [fx, fy] = rot ? P(wy, wx, z) : P(wx, wy, z);
        bird(fx - 4 * s, fy, Math.floor(t / 90) % 2 === 0, s > 0.4 ? 2 : 1);
      } else {
        const [bx, by] = P(8, 8, 24 + (Math.floor(t / 700) % 4 === 0 ? 1 : 0));
        bird(bx - 2, by, false);
      }
      break;
    }
    case "hamster": {
      const speed = effect === "wheel" ? 60 : 400;
      const a = t / speed;
      for (let k = 0; k < 4; k++) {
        const ang = a + (k * Math.PI) / 2;
        px(10, 9, 7, "#b9770e");
        const [sx, sy] = P(
          10 + Math.cos(ang) * 2.6,
          9,
          7 + Math.sin(ang) * 2.6,
        );
        ctx.fillStyle = "#b9770e";
        ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
      }
      px(
        9.5,
        9,
        4.5 + (effect === "wheel" ? Math.abs(Math.sin(t / 80)) : 0),
        "#f1d5a0",
        2,
        2,
      );
      break;
    }
    case "turtle": {
      const k = (Math.sin(t / 2500) + 1) / 2;
      px(4 + k * 12, 9, 11, "#3c8d4a", 3, 2);
      px(4 + k * 12 + 3, 9, 11.5, "#7fbf5a");
      break;
    }
    case "snake": {
      for (let k = 0; k < 14; k++) {
        const xx = 6 + k * 1.3 + Math.sin(t / 900) * 2;
        const zz = 9 + Math.sin(k * 0.8 + t / 400) * 0.8;
        px(xx, 9, zz, k % 3 === 0 ? "#b5441f" : "#e8762e");
      }
      if (effect === "tongue" && Math.floor(t / 150) % 2)
        px(6 + Math.sin(t / 900) * 2 - 1.5, 9, 9, "#d62d2d", 2, 1);
      break;
    }
    case "fan": {
      const a = t / 60;
      for (let k = 0; k < 3; k++) {
        const ang = a + (k * Math.PI * 2) / 3;
        const [sx, sy] = P(
          11,
          8 + Math.cos(ang) * 4.5,
          27 + Math.sin(ang) * 4.5,
        );
        ctx.fillStyle = "#9fb3c2";
        ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
      }
      break;
    }
    case "fireplace":
      for (let k = 0; k < 6; k++) {
        const h = 3 + ((Math.sin(t / 120 + k * 1.7) + 1) / 2) * 6;
        for (let z = 0; z < h; z++)
          px(
            6 + k * 3.6,
            11,
            4 + z,
            z > h - 2 ? "#ffe14d" : z > h / 2 ? "#ff9f1c" : "#e8542e",
          );
      }
      break;
    case "punchbag":
      if (effect === "sway") {
        const off = Math.sin(t / 120) * 1.5;
        px(4 + off, 12, 20, "rgba(255,255,255,0.25)", 2, 1);
      }
      break;
    case "globe":
      if (effect === "spin")
        px(8, 8 + Math.sin(t / 100) * 3, 15, "#5cb85c", 2, 2);
      break;
    case "bike":
      if (effect === "wheels")
        for (const cx of [7, 25]) {
          const ang = t / 70;
          const [sx, sy] = P(
            cx + Math.cos(ang) * 3.5,
            9,
            8 + Math.sin(ang) * 3.5,
          );
          ctx.fillStyle = "#55555a";
          ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
        }
      break;
    case "vending":
      px(13, 15, 30 + (Math.floor(t / 500) % 3) * 2, "#4dff88");
      break;
    case "hottub":
      for (let k = 0; k < 5; k++) {
        const ph = (t / 1200 + k / 5) % 1;
        px(
          6 + k * 5,
          8 + ((k * 7) % 16),
          10.2 + ph * 2,
          "rgba(255,255,255,0.7)",
        );
      }
      break;
    case "fountain":
      for (let k = 0; k < 4; k++) {
        const ph = (t / 600 + k / 4) % 1;
        px(
          16 + Math.cos(k * 1.6) * ph * 6,
          16 + Math.sin(k * 1.6) * ph * 6,
          25 - ph * 14,
          "#bfe8f7",
        );
      }
      break;
    case "lamp":
      if (!lampOn) px(5, 5, 32, "rgba(0,0,0,0.25)", 10, 6);
      break;
  }
}

/** Topmost non-transparent piece under a canvas point. */
/** Exact pixel first; then a few pixels of slack so thin things (cage wires, lamp poles) are easy to tap. */
function hitTest(
  list: Drawable[],
  pieces: Map<string, Cached>,
  sx: number,
  sy: number,
): string | null {
  const exact = hitAt(list, pieces, sx, sy);
  if (exact) return exact;
  for (const r of [2, 4])
    for (const [dx, dy] of [
      [0, -r],
      [0, r],
      [-r, 0],
      [r, 0],
      [-r, -r],
      [r, -r],
      [-r, r],
      [r, r],
    ]) {
      const h = hitAt(list, pieces, sx + dx, sy + dy);
      if (h) return h;
    }
  return null;
}

function hitAt(
  list: Drawable[],
  pieces: Map<string, Cached>,
  sx: number,
  sy: number,
): string | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    if (d.kind !== "piece") continue;
    const p =
      pieces.get(`${d.piece.key}|${d.piece.locked}`) ??
      pieces.get(`${d.piece.key}-open|${d.piece.locked}`);
    if (!p) continue;
    const mirror = d.piece.place.rot === 1;
    let px = Math.floor(sx - Math.round(d.x - p.ax));
    if (mirror) px = Math.floor(Math.round(d.x + p.ax) - sx);
    const py = Math.floor(sy - Math.round(d.y - p.ay));
    if (px < 0 || py < 0 || px >= p.r.w || py >= p.r.h) continue;
    if (p.r.data[(py * p.r.w + px) * 4 + 3] > 0) return d.piece.key;
  }
  return null;
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

/** Which wall decoration (if any) is under a canvas point. */
function wallHit(
  layout: ReturnType<typeof roomLayout>,
  sx: number,
  sy: number,
) {
  const { spec } = layout;
  for (const w of layout.wallItems) {
    const width = wallWidth(w.id);
    for (let u = w.u; u <= w.u + width; u += 1) {
      const x = w.wall === "R" ? spec.origin.x + u : spec.origin.x - u;
      const yMid = spec.origin.y + u / 2;
      if (Math.abs(sx - x) <= 1.5 && sy >= yMid - 64 && sy <= yMid - 24)
        return w;
    }
  }
  return null;
}
