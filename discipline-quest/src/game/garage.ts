import { CAR_ORDER } from "@/engine/catalog";
import { Iso, type P3 } from "./iso";
import { Raster } from "./raster";
import { carSprite } from "./sprites/cars";

/** Outside the building: three garage doors, a driveway with a bay per car, curb, street, lamp post and a tree. */
const X1 = 210, Y1 = 124;
export const GARAGE = { W: 348, H: 296, ox: 132, oy: 120 };

/** Each car has its own bay, in the order you owned them. Cars are mirrored so they face the street (+Y). */
const BAY_X: Record<string, number> = { "car-mini": 20, "car-q50": 84, "car-ioniq5": 148 };
const CAR_Y = 6;
const CAR_LEN: Record<string, number> = { "car-mini": 53, "car-q50": 67.5, "car-ioniq5": 65 };

function skyColors(hour: number): [string, string] {
  if (hour >= 7 && hour < 17) return ["#7cc4f2", "#bfe6ff"];
  if (hour >= 17 && hour < 20) return ["#f08a4b", "#ffd08a"];
  if (hour >= 5 && hour < 7) return ["#9a8ad6", "#ffc9a3"];
  return ["#0d1330", "#24305e"];
}

export const isNight = (hour: number) => hour >= 20 || hour < 6;

const P = (x: number, y: number, z: number) => [GARAGE.ox + x - y, GARAGE.oy + (x + y) / 2 - z] as const;

export interface ParkedCar {
  id: string;
  /** Raster (mirrored) and where its top-left lands on the garage canvas, for hit-testing. */
  r: Raster;
  x: number;
  y: number;
  headlights: (readonly [number, number])[];
  bubble: readonly [number, number];
}

export function parkedCars(owned: string[]): ParkedCar[] {
  return CAR_ORDER.filter((id) => owned.includes(id)).map((id) => {
    const sp = carSprite(id);
    const mr = new Raster(sp.r.w, sp.r.h);
    mr.blit(sp.r, 0, 0, true);
    const bx = BAY_X[id];
    const [cx, cy] = P(bx, CAR_Y, 0);
    const L = CAR_LEN[id];
    return {
      id,
      r: mr,
      x: Math.round(cx - (sp.r.w - 1 - sp.ax)),
      y: Math.round(cy - sp.ay),
      headlights: [P(bx + 6, CAR_Y + L, 11), P(bx + 24, CAR_Y + L, 11)],
      bubble: P(bx + 15, CAR_Y + L / 2, 30),
    };
  });
}

/** Empty bays for cars you haven't unlocked yet: where to put the little sign. */
export function emptyBays(owned: string[]) {
  return CAR_ORDER.filter((id) => !owned.includes(id)).map((id) => ({ id, at: P(BAY_X[id] + 15, CAR_Y + 34, 0) }));
}

export function buildGarage(hour: number, cars: ParkedCar[]): Raster {
  const { W, H, ox, oy } = GARAGE;
  const r = new Raster(W, H);
  const [sky1, sky2] = skyColors(hour);
  const mix = (a: string, b: string, t: number) => {
    const pa = [1, 3, 5].map((k) => parseInt(a.slice(k, k + 2), 16));
    const pb = [1, 3, 5].map((k) => parseInt(b.slice(k, k + 2), 16));
    return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
  };
  for (let y = 0; y < H; y++) r.rect(0, y, W, 1, mix(sky1, sky2, y / H));
  const night = isNight(hour);
  if (night) for (let k = 0; k < 50; k++) r.set((k * 97) % W, (k * 53) % 80, k % 3 ? "#ffffff" : "#c9d6ff");
  const iso = new Iso(r, ox, oy);

  // ground: driveway with bay lines, curb, road
  iso.box(0, 0, -5, X1, Y1, 5, "#7b7f86", { top: "#b9bcc1" });
  for (let x = 0; x < X1; x += 0.5)
    for (let y = 0; y < Y1; y += 0.5) {
      let c: string;
      if (y < 80) {
        const bayLine = [12, 76, 140, 204].some((bx) => Math.abs(x - bx) < 0.6) && y > 6 && y < 76;
        c = bayLine ? "#f2f2f2" : x % 20 < 0.6 || y % 20 < 0.6 ? "#a6aab0" : "#c3c6cb";
      } else if (y < 86) c = "#d9dadc";
      else c = Math.abs(y - 105) < 0.8 && x % 16 < 9 ? "#f2d24b" : (Math.floor(x * 3) + Math.floor(y * 7)) % 11 === 0 ? "#45484d" : "#3a3d42";
      const [sx, sy] = iso.proj([x, y, 0]);
      r.set(sx, sy, c);
    }
  iso.box(0, 80, 0, X1, 6, 1.5, "#d9dadc");

  // building facade with three garage doors
  const F = (u: number, z: number): P3 => [u, 0, z];
  iso.box(-6, -6, 0, X1 + 6, 6, 100, "#d8cbb3", { left: "#d8cbb3", top: "#eee5d3", outline: "#6d6150" });
  for (let z = 0; z < 100; z += 0.5)
    for (let u = 0; u < X1; u += 0.5)
      if (Math.floor(z) % 8 === 0 && z % 1 < 0.5) {
        const [sx, sy] = iso.proj(F(u, z));
        r.set(sx, sy, "#cbbda3");
      }
  const lit = [false, true, false, night, false, true];
  [16, 48, 86, 118, 156, 186].forEach((u0, k) => {
    iso.quad([F(u0, 62), F(u0 + 16, 62), F(u0 + 16, 86), F(u0, 86)], "#efe9dc", "#6d6150");
    iso.quad([F(u0 + 1.5, 63.5), F(u0 + 14.5, 63.5), F(u0 + 14.5, 84.5), F(u0 + 1.5, 84.5)], lit[k] ? (night ? "#ffd76b" : "#9fd2ef") : night ? "#2a3150" : "#8fbfdc");
    iso.line(F(u0 + 8, 63.5), F(u0 + 8, 84.5), "#efe9dc");
  });
  for (const bx of [16, 80, 144]) {
    iso.quad([F(bx, 0), F(bx + 52, 0), F(bx + 52, 46), F(bx, 46)], "#5a5348", "#3d372f");
    iso.quad([F(bx + 2, 0), F(bx + 50, 0), F(bx + 50, 38), F(bx + 2, 38)], night ? "#1b1d24" : "#2a2d35");
    for (let z = 38; z < 46; z += 2) iso.line(F(bx + 2, z), F(bx + 50, z), "#9aa0a6");
  }
  iso.box(72, 0, 30, 4, 3, 6, "#2b2b2e");
  iso.quad([F(73, 31), F(75, 31), F(75, 35), F(73, 35)], night ? "#ffe39a" : "#e8e2c8");

  // tree at the end of the building, lamp post at the curb
  iso.box(196, 8, 0, 12, 12, 4, "#6b4a33", { top: "#3f6b34" });
  iso.box(200.5, 12.5, 4, 3, 3, 22, "#6b4a33");
  for (const [x, y, z, s] of [[195, 7, 24, 14], [197, 9, 32, 10], [198.5, 10.5, 40, 7]]) iso.box(x, y, z, s, s, 8, "#3f8f45", { top: "#57ad5c" });
  iso.box(6, 82, 0, 3, 3, 64, "#3a3d44");
  iso.box(4, 76, 64, 5, 12, 3, "#3a3d44");
  iso.box(5, 77, 62, 3, 6, 2, night ? "#ffe39a" : "#d8d8d0");

  for (const c of cars) r.blit(c.r, c.x, c.y);
  return r;
}

export function garagePoints() {
  return { avatar: P(70, 52, 0), lamp: P(6, 80, 62), wallLamp: P(74, 0, 33) };
}

/** Which parked car (if any) is under this canvas point. */
export function carAt(cars: ParkedCar[], x: number, y: number): ParkedCar | null {
  for (let k = cars.length - 1; k >= 0; k--) {
    const c = cars[k];
    const px = Math.floor(x - c.x), py = Math.floor(y - c.y);
    if (px < 0 || py < 0 || px >= c.r.w || py >= c.r.h) continue;
    if (c.r.data[(py * c.r.w + px) * 4 + 3] > 0) return c;
  }
  return null;
}
