import { Raster, gridRaster, paintGrid } from "../raster";

export type Facing = "front" | "back";
export type Pose =
  | "idle" | "walk1" | "walk2" | "pray" | "takbir" | "kneel" | "sit" | "celebrate" | "sad" | "blink"
  | "run1" | "run2" | "read" | "game" | "clarinet" | "drink" | "curl1" | "curl2";
/** 0 = starting out … 4 = built. Comes from gym weeks. */
export type BodyStage = 0 | 1 | 2 | 3 | 4;
export type Mood = "neutral" | "happy" | "sad" | "closed";
export type OutfitId = "fit-coat" | "fit-hoodie" | "fit-gym" | "fit-thobe" | "fit-leather" | "fit-suit";

export const AVATAR_W = 30;
export const AVATAR_H = 48;
/** Pixel in the sprite that sits on the floor point. */
export const AVATAR_FOOT = { x: 15, y: 46 };

/** Face and hair colors, picked from your photo. */
const BODY: Record<string, string> = {
  K: "#25170f", // outline
  H: "#3a271c", // hair
  h: "#634634", // hair highlight
  d: "#24170f", // hair shadow
  S: "#f0c9a4", // skin
  s: "#d9a882", // skin shade
  r: "#bd8a66", // deep shade
  B: "#2b1b12", // brows
  W: "#fbf6ee", // eye white
  E: "#4a2a16", // iris
  M: "#a8604f", // lips
  m: "#c9826f", // lower lip
  T: "#d9b192", // stubble
  t: "#7fb6e6", // tear
};

interface OutfitStyle {
  torso: "open" | "closed" | "suit";
  arm: "long" | "short";
  legs: "pants" | "shorts" | "robe";
  kufi?: boolean;
  colors: Record<string, string>;
}

/** C main, c shade, x detail, N inner layer, Z center detail, P/p pants, O/o shoes. */
export const OUTFITS: Record<OutfitId, OutfitStyle> = {
  "fit-coat": {
    torso: "open", arm: "long", legs: "pants",
    colors: { C: "#4b4b51", c: "#36363b", x: "#67676e", N: "#17171b", Z: "#c9ccd2", P: "#2c2c33", p: "#1e1e24", O: "#111114", o: "#3a3a42" },
  },
  "fit-hoodie": {
    torso: "closed", arm: "long", legs: "pants",
    colors: { C: "#8d9198", c: "#6f737a", x: "#7c8088", N: "#5c6066", Z: "#f2f2f2", P: "#35507a", p: "#283d5e", O: "#f4f4f4", o: "#c9c9c9" },
  },
  "fit-gym": {
    torso: "closed", arm: "short", legs: "shorts",
    colors: { C: "#1d1d21", c: "#111114", x: "#1d1d21", N: "#f0c9a4", Z: "#1d1d21", P: "#5b5f66", p: "#474b51", O: "#f4f4f4", o: "#e04848" },
  },
  "fit-thobe": {
    torso: "closed", arm: "long", legs: "robe", kufi: true,
    colors: { C: "#f6f4ee", c: "#dcd8cd", x: "#f6f4ee", N: "#e8e4d8", Z: "#c9c4b6", P: "#f6f4ee", p: "#dcd8cd", O: "#7a5236", o: "#5b3b25" },
  },
  "fit-leather": {
    torso: "open", arm: "long", legs: "pants",
    colors: { C: "#26221f", c: "#171412", x: "#3a3430", N: "#f4f4f4", Z: "#f4f4f4", P: "#2d3a52", p: "#202a3c", O: "#3b2416", o: "#24160d" },
  },
  "fit-suit": {
    torso: "suit", arm: "long", legs: "pants",
    colors: { C: "#26324f", c: "#1b2439", x: "#3b4a70", N: "#f7f7f7", Z: "#7a1f2b", P: "#26324f", p: "#1b2439", O: "#0e0e10", o: "#2c2c30" },
  },
};

const HAIR_TOP = [
  ".....KKKKKKK......",
  "...KKhhhhhhhKK....",
  "..KhhhhHHHHhhhK...",
  ".KHhhHHHHHHHHhhKK.",
  "KHHHHHHHHHhhhHHHHK",
  "KHHdHHHHHHHHHhHHHK",
  "KHdHHHHHHHHHHHHHdK",
  "KHHHHHHHHHHHHHHHHK",
];

function headFront(mood: Mood): string[] {
  const brows = mood === "sad" ? "KHHHHSSSBBBSSBBSSK" : "KHHHHSSBBBBSSBBBSK";
  const lids = mood === "closed" ? "KHHHsSSSSSSSSSSSSK" : "KHHHsSSKKKSSSKKSSK";
  const eyes = mood === "closed" ? "KHsrsSSKKKSSSKKSSK" : mood === "happy" ? "KHsrsSSKEESSSKESSK" : "KHsrsSSWEESSSWESSK";
  const cheek = mood === "sad" ? "KHsrsSSSSSSSSsStSK" : "KHsrsSSSSSSSSsSSSK";
  const mouth =
    mood === "happy" ? "..KTsSSSSKWWWKSSK." : mood === "sad" ? "..KTsSSSSSSMMSSSK." : "..KTsSSSSSMMMSSSK.";
  const lip =
    mood === "happy" ? "..KTTsSSSSKKKSTTK." : mood === "sad" ? "..KTTsSSSSMSSMTTK." : "..KTTsSSSSSmSSTTK.";
  return [
    ...HAIR_TOP,
    "KdHHHHHHHSSSSSHHHK",
    "KdHHHHSSSSSSSSSSHK",
    brows,
    lids,
    eyes,
    cheek,
    ".KHssSSSSSSSSrSSSK",
    ".KHsSSSSSSSSSSSSSK",
    mouth,
    lip,
    "...KTTTSSSSSTTTK..",
    "....KKTTTTTTTKK...",
    "......KKKKKKK.....",
  ];
}

const HEAD_BACK = [
  ...HAIR_TOP,
  "KHHHHHHHHHHHHHHHHK",
  "KHHHhHHHHHHHHHHHHK",
  "KHHHHHHHHHHHHHHHHK",
  "KHHHHHHHHHHHHHsSHK",
  "KHHHHHHHhHHHHHsrHK",
  "KHHHHHHHHHHHHHHHHK",
  ".KHHHHHHHHHHHHHHHK",
  ".KHHHHHHHdHHHHHHHK",
  "..KdHHHHHHHHHHHdK.",
  "..KKSSSSSSSSSSSK..",
  "...KsSSSSSSSSsK...",
  "....KSSSSSSSSK....",
  "......KKKKKKK.....",
];

/** Sits over the hair from row 2; rows 0-1 of hair are hidden when worn. */
const KUFI = [
  "...KKKKKKKKKKK....",
  "..KWWWWWWWWWWWK...",
  ".KWWWwWWWwWWWWWKK.",
  "KWWWWWWWWWWWWWWWWK",
  "KwWwWwWwWwWwWwWwWK",
  "KKKKKKKKKKKKKKKKKK",
];
const KUFI_COLORS = { K: "#9c968a", W: "#fbfaf6", w: "#d9d4c8" };

const TORSO: Record<OutfitStyle["torso"], { front: string[]; back: string[] }> = {
  open: {
    front: [
      "....KNNNNK....",
      "..KKCNNNNCKK..",
      ".KCCcNNZNcCCK.",
      "KCxCcNNZNcCxCK",
      "KCCCcNNZNcCCCK",
      "KCCxcNNZNcxCCK",
      "KCCCcNNZNcCCCK",
      "KCxCcNNZNcCCxK",
      "KCCCcNNZNcCCCK",
      "KCCCcNNZNcCxCK",
      "KCxCcNNZNcCCCK",
      "KCCCcNNZNcCCCK",
      "KCCCcNNZNcxCCK",
      "KCxCCcNZcCCCCK",
      "KCCCCcNZcCCxCK",
      "KcCCCcNNcCCCcK",
      "KKKKKKKKKKKKKK",
    ],
    back: [
      "....KNNNNK....",
      "..KKCCCCCCKK..",
      ".KCCCCCCCCCCK.",
      "KCxCCCCCCCCxCK",
      "KCCCCCxCCCCCCK",
      "KCCxCCCCCCxCCK",
      "KCCCCCCCCCCCCK",
      "KCxCCCCCCxCCxK",
      "KCCCCCCcCCCCCK",
      "KCCCCCCcCCCxCK",
      "KCxCCCCcCCCCCK",
      "KCCCCCCcCCCCCK",
      "KCCCCCCcCCxCCK",
      "KCxCCCCcCCCCCK",
      "KCCCCCCcCCCxCK",
      "KcCCCCCcCCCCcK",
      "KKKKKKKKKKKKKK",
    ],
  },
  closed: {
    front: [
      "...KCCCCCCK...",
      "..KCcNNNNcCK..",
      ".KCCCcZNZcCCK.",
      "KCCCCCZCZCCCCK",
      "KCCCCCZCZCCCCK",
      "KCCCCCCCCCCCCK",
      "KCCCCCCCCCCCcK",
      "KCCCCCCCCCCCcK",
      "KCCCCCCCCCCCcK",
      "KCCcxxxxxxcCcK",
      "KCCcCCCCCCcCcK",
      "KCCcCCCCCCcCcK",
      "KCCcxxxxxxcCcK",
      "KccCCCCCCCCccK",
      "KcxxxxxxxxxxcK",
      "KcxxxxxxxxxxcK",
      "KKKKKKKKKKKKKK",
    ],
    back: [
      "...KCCCCCCK...",
      "..KCCCCCCCCK..",
      ".KCCCcccccCCK.",
      "KCCCCcccccCCCK",
      "KCCCCCcccCCCCK",
      "KCCCCCCCCCCCCK",
      "KCCCCCCCCCCCcK",
      "KCCCCCCCCCCCcK",
      "KCCCCCCCCCCCcK",
      "KCCCCCCCCCCCcK",
      "KCCCCCCCCCCCcK",
      "KCCCCCCCCCCCcK",
      "KCCCCCCCCCCCcK",
      "KccCCCCCCCCccK",
      "KcxxxxxxxxxxcK",
      "KcxxxxxxxxxxcK",
      "KKKKKKKKKKKKKK",
    ],
  },
  suit: {
    front: [
      "....KNNNNK....",
      "..KKCNZZNCKK..",
      ".KCCCNZZNCCCK.",
      "KCCCcNZZNcCCCK",
      "KCCCCcZZcCCCCK",
      "KCCCCCcZcCCCCK",
      "KCCCCCCcCCCCCK",
      "KCCCCCCxCCCCCK",
      "KCCCCCCcCCCCCK",
      "KCCCCCCxCCCCCK",
      "KCccCCCcCCCccK",
      "KCCCCCCcCCCCCK",
      "KCCCCCcCcCCCCK",
      "KCCCCcCCCcCCCK",
      "KCCCCcCCCcCCCK",
      "KcCCcCCCCCcCcK",
      "KKKKKKKKKKKKKK",
    ],
    back: [
      "....KNNNNK....",
      "..KKCCCCCCKK..",
      ".KCCCCCCCCCCK.",
      "KCCCCCCCCCCCCK",
      "KCCCCCCCCCCCCK",
      "KCCCCCCCCCCCCK",
      "KCCCCCCcCCCCCK",
      "KCCCCCCcCCCCCK",
      "KCCCCCCcCCCCCK",
      "KCCCCCCcCCCCCK",
      "KCCCCCCcCCCCCK",
      "KCCCCCCcCCCCCK",
      "KCCCCCCcCCCCCK",
      "KCCCCCcKcCCCCK",
      "KCCCCCcKcCCCCK",
      "KcCCCCcKcCCCcK",
      "KKKKKKKKKKKKKK",
    ],
  },
};

const ARMS = {
  long: {
    down: [".KK.", "KCCK", "KCxK", "KCCK", "KCCK", "KCCK", "KCxK", "KCCK", "KCCK", "KcCK", "KccK", "KccK", "KSSK", "KSsK", ".KK."],
    bent: [".KK.", "KCCK", "KCxK", "KCCK", "KCCK", "KcCK", "KccK", "KccK", ".KK."],
    up: [".KK.", "KSSK", "KsSK", "KccK", "KcCK", "KCCK", "KCxK", "KCCK", "KCCK", "KCCK", "KCxK", "KCCK", "KCCK", "KCCK", ".KK."],
  },
  short: {
    down: [".KK.", "KCCK", "KCCK", "KcCK", "KKKK", "KSSK", "KSSK", "KSsK", "KSSK", "KSSK", "KSsK", "KSSK", "KSSK", "KSsK", ".KK."],
    bent: [".KK.", "KCCK", "KCCK", "KcCK", "KKKK", "KSSK", "KSsK", "KSSK", ".KK."],
    up: [".KK.", "KSSK", "KsSK", "KSSK", "KSSK", "KSsK", "KSSK", "KSSK", "KSSK", "KSsK", "KKKK", "KcCK", "KCCK", "KCCK", ".KK."],
  },
};

const CHEST_HANDS = [".KKKKKK.", "KSSSSSsK", "KsSSSSsK", ".KKKKKK."];
/** Hands raised to the ears for takbir. */
const EAR_HAND = [".KK.", "KSSK", "KSsK", "KSSK", ".KK."];

const LEGS: Record<OutfitStyle["legs"], string[]> = {
  pants: ["KPPPPK", "KPPPpK", "KPPPpK", "KPPPpK", "KPPPpK", "KPPPpK", "KPPPpK", "KPPPpK", "KPPPpK", "KPPPpK", "KPPppK", "KOOOOK", "KOoOOK", "KKKKKK"],
  shorts: ["KPPPPK", "KPPPpK", "KPPPpK", "KPPPpK", "KKKKKK", "KSSSsK", "KSSSsK", "KSSSsK", "KSSSsK", "KSSssK", "KWWWWK", "KOOOOK", "KOoooK", "KKKKKK"],
  robe: [],
};

const ROBE = [
  "KPPPPPpPPPPK", "KPPPPPpPPPPK", "KPPPPPpPPPPK", "KPPPPPpPPPPK", "KPPPPPpPPPPK",
  "KPPPPPpPPPPK", "KPPPPPpPPPPK", "KPPPPPpPPPPK", "KPPPPPpPPPPK", "KpPPPPpPPPpK",
  "KpPPPPpPPPpK", "KKKKKKKKKKKK", ".KOOK..KOOK.", ".KKKK..KKKK.",
];

/** Folded legs for kneeling / sitting on the floor. */
const KNEEL = [
  "..KKKKKKKKKKKK..",
  ".KPPPPPPPPPPPPK.",
  "KPPPPPPPpPPPPPPK",
  "KPPPPPPPpPPPPPPK",
  "KpPPPPPPpPPPPPpK",
  "KOOOKKKKKKKKOOOK",
  ".KKK........KKK.",
];
const KNEEL_ROBE = [
  "..KKKKKKKKKKKK..",
  ".KPPPPPPPPPPPPK.",
  "KPPPPPPPpPPPPPPK",
  "KPPPPPPPpPPPPPPK",
  "KpPPPPPPpPPPPPpK",
  "KpPPPPPPpPPPPPpK",
  ".KKKKKKKKKKKKKK.",
];

function palette(fit: OutfitStyle): Record<string, string> {
  return { ...BODY, ...fit.colors, W: BODY.W, S: BODY.S, s: BODY.s };
}

/** Extra pixels per side for the chest/shoulders and the waist at each body stage (V-taper later). */
const CHEST_PAD = [0, 1, 1, 2, 3];
const WAIST_PAD = [0, 0, 1, 1, 1];

/** Widen a grid row by repeating the pixel next to each outline. */
function widen(row: string, pad: number): string {
  if (!pad || row.length < 4) return row;
  return row[0] + row[1].repeat(pad) + row.slice(1, -1) + row[row.length - 2].repeat(pad) + row[row.length - 1];
}

/** Thicker arms/legs: repeat the first inner column. */
const thicken = (grid: string[], on: boolean) => (on ? grid.map((row) => row[0] + row[1] + row.slice(1)) : grid);

const PROPS: Record<string, string> = { b: "#a8322d", u: "#fbf6ee", g: "#1b1b1e", m: "#c9ccd2", n: "#6b4a33" };
const BOOK = [".KKKKKKKK.", "KbuuuKuubK", "KbuuuKuubK", ".KKKKKKKK."];
const PAD = [".KKKKKK.", "KggmmggK", ".KKKKKK."];
const CUP = ["KKK", "KuK", "KuK", "KKK"];
const DUMBBELL = ["KK.KK", "KgKgK", "KK.KK"];

/** Render one avatar frame (26×48). Mirroring for other directions happens at draw time. */
export function renderAvatar(facing: Facing, pose: Pose, outfit: OutfitId = "fit-coat", body: BodyStage = 0): Raster {
  const fit = OUTFITS[outfit] ?? OUTFITS["fit-coat"];
  const P = { ...palette(fit), ...PROPS };
  const g = (grid: string[]) => gridRaster(grid, P);
  const r = new Raster(AVATAR_W, AVATAR_H);
  r.tx = 2;
  const run = pose === "run1" || pose === "run2";
  const step = pose === "walk1" ? 1 : pose === "walk2" ? -1 : pose === "run1" ? 2 : pose === "run2" ? -2 : 0;
  const seated = pose === "sit" || pose === "read" || pose === "game";
  const low = pose === "kneel" ? 11 : seated ? 8 : 0;
  const headDy = (pose === "pray" || pose === "sad" ? 1 : 0) + low;
  const mood: Mood =
    pose === "celebrate" ? "happy" : pose === "sad" ? "sad" : pose === "blink" || pose === "kneel" || pose === "clarinet" ? "closed" : "neutral";
  const arms = ARMS[fit.arm];
  const front = facing === "front";
  const cp = CHEST_PAD[body] ?? 0;
  const wp = WAIST_PAD[body] ?? 0;
  const bigArms = body >= 2;
  const bigLegs = body >= 3;
  const leftArmX = 3 - cp - (bigArms ? 1 : 0);
  const rightArmX = 19 + cp;

  // Legs
  if (low) {
    paintGrid(r, fit.legs === "robe" ? KNEEL_ROBE : KNEEL, P, 5, 40);
  } else if (fit.legs === "robe") {
    r.blit(g(ROBE), 7, 33);
  } else {
    const leg = thicken(LEGS[fit.legs], bigLegs);
    r.blit(g(leg), bigLegs ? 6 : 7, 33 + step);
    r.blit(g(leg), 13, 33 - step);
  }

  // Arms, behind the torso edges
  const ay = 19 + low;
  const A = (grid: string[]) => g(thicken(grid, bigArms));
  if (pose === "celebrate") {
    r.blit(A(arms.up), leftArmX - 1, 6);
    r.blit(A(arms.up), rightArmX + 1, 6);
  } else if (pose === "curl2") {
    r.blit(A(arms.bent), leftArmX, ay);
    r.blit(A(arms.bent), rightArmX, ay);
  } else if (front && (pose === "pray" || pose === "kneel" || pose === "takbir" || pose === "read" || pose === "game" || pose === "clarinet")) {
    r.blit(A(arms.bent), leftArmX, ay);
    r.blit(A(arms.bent), rightArmX, ay);
  } else if (pose === "drink") {
    r.blit(A(arms.down), leftArmX, ay);
    r.blit(A(arms.bent), rightArmX, ay - 2);
  } else if (run) {
    r.blit(A(arms.bent), leftArmX, ay - step / 2);
    r.blit(A(arms.bent), rightArmX, ay + step / 2);
  } else {
    r.blit(A(arms.down), leftArmX, ay - step);
    r.blit(A(arms.down), rightArmX, ay + step);
  }

  // Torso, widened for the body stage
  const torso = TORSO[fit.torso][front ? "front" : "back"];
  torso.forEach((row, y) => {
    const pad = y === 0 ? 0 : y <= 9 ? cp : wp;
    paintGrid(r, [widen(row, pad)], P, 6 - pad, 18 + low + y);
  });
  if (outfit === "fit-gym" && front && body >= 2) {
    // chest line and a hint of abs on the tee
    r.line(9 - cp + 1, 25 + low, 16 + cp, 25 + low, "#2a2a30");
    if (body >= 4) for (const y of [28, 30]) r.line(11, y + low, 14, y + low, "#2a2a30");
  }
  if ((pose === "pray" || pose === "kneel") && front) paintGrid(r, CHEST_HANDS, P, 9, 25 + low);
  if (pose === "read" && front) paintGrid(r, BOOK, P, 8, 24 + low);
  if (pose === "game" && front) paintGrid(r, PAD, P, 9, 26 + low);
  if (pose === "curl1" || pose === "curl2") {
    const hy = pose === "curl2" ? ay + 6 : ay + 13;
    paintGrid(r, DUMBBELL, P, leftArmX - 1, hy);
    paintGrid(r, DUMBBELL, P, rightArmX, hy);
  }

  const head = front ? headFront(mood) : HEAD_BACK;
  paintGrid(r, fit.kufi ? head.map((row, i) => (i < 2 ? "" : row)) : head, P, 4, headDy);
  if (fit.kufi) paintGrid(r, KUFI, KUFI_COLORS, 4, headDy + 2);
  if (pose === "takbir" && front) {
    paintGrid(r, EAR_HAND, P, 2 - cp, 11 + headDy);
    paintGrid(r, EAR_HAND, P, 20 + cp, 11 + headDy);
  }
  if (pose === "clarinet" && front) {
    // clarinet from the mouth down to the waist, hands on it
    r.rect(13, 16 + headDy, 2, 14, "#121214");
    for (const y of [20, 23, 26]) r.set(14, y + headDy, "#d8dde2");
    r.rect(12, 30 + headDy, 4, 2, "#121214");
    paintGrid(r, ["KSSK", "KSsK"], P, 12, 21 + headDy);
    paintGrid(r, ["KSSK", "KSsK"], P, 12, 25 + headDy);
  }
  if (pose === "drink") paintGrid(r, CUP, P, 17 + cp, 15 + headDy);
  return r;
}

/** Just the head, eyes closed, for sleeping in bed. */
export function renderSleepingHead(outfit: OutfitId = "fit-coat"): Raster {
  const fit = OUTFITS[outfit] ?? OUTFITS["fit-coat"];
  const r = new Raster(18, 21);
  paintGrid(r, headFront("closed"), palette(fit));
  return r;
}

export const ALL_POSES: Pose[] = ["idle", "walk1", "walk2", "pray", "takbir", "kneel", "sit", "celebrate", "sad", "blink", "run1", "run2", "read", "game", "clarinet", "drink", "curl1", "curl2"];
export const ALL_OUTFITS = Object.keys(OUTFITS) as OutfitId[];
