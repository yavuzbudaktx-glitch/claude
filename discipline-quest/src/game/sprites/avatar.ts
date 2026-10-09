import { Raster, gridRaster, paintGrid } from "../raster";
import { AVATAR_PALETTE as P } from "./palette";

export type Facing = "front" | "back";
export type Pose = "idle" | "walk1" | "walk2" | "pray" | "celebrate" | "sad";
export type Mood = "neutral" | "happy" | "sad";

export const AVATAR_W = 24;
export const AVATAR_H = 48;
/** Pixel in the sprite that sits on the floor point. */
export const AVATAR_FOOT = { x: 12, y: 45 };

const HAIR_TOP = [
  "...KKKKKKKKK....",
  ".KKhhhhhhHHHKK..",
  "KHhhhHHHHHhhhHK.",
  "KHHHHHHHhhHHhHHK",
  "KHHhhHHHHHHHHhHK",
  "KHHHHHHHHHHHHHHK",
];

function headFront(mood: Mood): string[] {
  const brows = mood === "sad" ? "KHHHSSSBBSSSSBBK" : "KHHHSSBBBSSSBBSK";
  const eyes = mood === "sad" ? "KHsssSSEESSSSESK" : "KHsssSSEESSSSESK";
  const mouth =
    mood === "happy" ? ".KHSSSSSSSMMMMSK" : mood === "sad" ? ".KHSSSSSSSSSMMSK" : ".KHSSSSSSSSMMSSK";
  const under = mood === "sad" ? "KHsSsSStSSSSsStK" : "KHsSsSSSSSSSsSSK";
  return [
    ...HAIR_TOP,
    "KHHHHHHHSSSSSHHK",
    "KHHHHHSSSSSSSHHK",
    brows,
    "KHHsSSSSSSSSSSSK",
    eyes,
    under,
    ".KHsSSSSSSSSssSK",
    mouth,
    "..KTSSSSSSTTTTK.",
    "...KTTTTTTTTTK..",
    "....KKKKKKKKK...",
  ];
}

const HEAD_BACK = [
  ...HAIR_TOP,
  "KHHHHHHHHHHHHHHK",
  "KHHHhHHHHHHHHHHK",
  "KHHHHHHHHHHHHHHK",
  "KHHHHHHHHHHHsSHK",
  "KHHHHHHHHhHHsSHK",
  "KHHHHHHHHHHHHHHK",
  ".KHHHHHHHHHHHHHK",
  ".KHHHHHHHHHHHHHK",
  "..KHHHHHHHHHHHK.",
  "...KsSSSSSSSsK..",
  "....KKKKKKKKK...",
];

const TORSO_FRONT = [
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
];

const TORSO_BACK = [
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
];

const ARM_DOWN = [
  ".KK.", "KCCK", "KCxK", "KCCK", "KCCK", "KCCK", "KCxK", "KCCK",
  "KCCK", "KcCK", "KccK", "KccK", "KSSK", "KSsK", ".KK.",
];

const ARM_BENT = [".KK.", "KCCK", "KCxK", "KCCK", "KCCK", "KcCK", "KccK", "KccK", ".KK."];

const ARM_UP = [
  ".KK.", "KSSK", "KsSK", "KccK", "KcCK", "KCCK", "KCxK", "KCCK",
  "KCCK", "KCCK", "KCxK", "KCCK", "KCCK", "KCCK", ".KK.",
];

const CHEST_HANDS = [".KKKKKK.", "KSSSSSsK", "KsSSSSsK", ".KKKKKK."];

const LEG = [
  "KPPPPK", "KPPPpK", "KPPPpK", "KPPPpK", "KPPPpK", "KPPPpK", "KPPPpK",
  "KPPPpK", "KPPPpK", "KPPPpK", "KPPppK", "KOOOOK", "KOoOOK", "KKKKKK",
];

const g = (grid: string[]) => gridRaster(grid, P);

/** Render one avatar frame (24×48). Mirroring for other directions happens at draw time. */
export function renderAvatar(facing: Facing, pose: Pose): Raster {
  const r = new Raster(AVATAR_W, AVATAR_H);
  const step = pose === "walk1" ? 1 : pose === "walk2" ? -1 : 0;
  const headDy = pose === "pray" || pose === "sad" ? 1 : 0;
  const mood: Mood = pose === "celebrate" ? "happy" : pose === "sad" ? "sad" : "neutral";

  // Legs (behind the coat hem)
  r.blit(g(LEG), 6, 31 + step);
  r.blit(g(LEG), 12, 31 - step);

  // Arms behind torso edges
  if (pose === "celebrate") {
    r.blit(g(ARM_UP), 1, 4);
    r.blit(g(ARM_UP), 19, 4);
  } else if (pose === "pray" && facing === "front") {
    r.blit(g(ARM_BENT), 2, 17);
    r.blit(g(ARM_BENT), 18, 17);
  } else {
    r.blit(g(ARM_DOWN), 2, 17 - step);
    r.blit(g(ARM_DOWN), 18, 17 + step);
  }

  paintGrid(r, facing === "front" ? TORSO_FRONT : TORSO_BACK, P, 5, 16);
  if (pose === "pray" && facing === "front") paintGrid(r, CHEST_HANDS, P, 8, 23);

  paintGrid(r, facing === "front" ? headFront(mood) : HEAD_BACK, P, 4, headDy);
  return r;
}

export const ALL_POSES: Pose[] = ["idle", "walk1", "walk2", "pray", "celebrate", "sad"];
