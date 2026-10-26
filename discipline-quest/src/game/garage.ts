import { Iso, type P3 } from "./iso";
import { Raster } from "./raster";
import { carSprite } from "./sprites/cars";

/** Outside the building: facade with an open garage, driveway, curb, street, lamp post and a tree. */
export const GARAGE = { W: 272, H: 258, ox: 128, oy: 118 };

const X1 = 140, Y1 = 124;
/** The car is drawn mirrored so its nose points out of the garage toward the street (+Y). */
const CAR_AT = { x: 30, y: 6 };

function skyColors(hour: number): [string, string] {
  if (hour >= 7 && hour < 17) return ["#7cc4f2", "#bfe6ff"];
  if (hour >= 17 && hour < 20) return ["#f08a4b", "#ffd08a"];
  if (hour >= 5 && hour < 7) return ["#9a8ad6", "#ffc9a3"];
  return ["#0d1330", "#24305e"];
}

export const isNight = (hour: number) => hour >= 20 || hour < 6;

export function buildGarage(hour: number, carId: string): Raster {
  const { W, H, ox, oy } = GARAGE;
  const r = new Raster(W, H);
  const [sky1, sky2] = skyColors(hour);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const mix = (a: string, b: string) => {
      const pa = [1, 3, 5].map((k) => parseInt(a.slice(k, k + 2), 16));
      const pb = [1, 3, 5].map((k) => parseInt(b.slice(k, k + 2), 16));
      return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
    };
    r.rect(0, y, W, 1, mix(sky1, sky2));
  }
  const night = isNight(hour);
  if (night) for (let k = 0; k < 40; k++) r.set((k * 97) % W, (k * 53) % 70, k % 3 ? "#ffffff" : "#c9d6ff");
  const iso = new Iso(r, ox, oy);

  // ground: driveway, curb, road
  iso.box(0, 0, -5, X1, Y1, 5, "#7b7f86", { top: "#b9bcc1" });
  for (let x = 0; x < X1; x += 0.5)
    for (let y = 0; y < Y1; y += 0.5) {
      let c: string;
      if (y < 80) c = x % 20 < 0.6 || y % 20 < 0.6 ? "#a6aab0" : "#c3c6cb";
      else if (y < 86) c = "#d9dadc";
      else c = Math.abs(y - 105) < 0.8 && x % 16 < 9 ? "#f2d24b" : (Math.floor(x * 3) + Math.floor(y * 7)) % 11 === 0 ? "#45484d" : "#3a3d42";
      const [sx, sy] = iso.proj([x, y, 0]);
      r.set(sx, sy, c);
    }
  iso.box(0, 80, 0, X1, 6, 1.5, "#d9dadc");

  // building facade along the back with the open garage
  const F = (u: number, z: number): P3 => [u, 0, z];
  iso.box(-6, -6, 0, X1 + 6, 6, 96, "#d8cbb3", { left: "#d8cbb3", top: "#eee5d3", outline: "#6d6150" });
  for (let z = 0; z < 96; z += 0.5)
    for (let u = 0; u < X1; u += 0.5) {
      if ((Math.floor(z) % 8 === 0 && z % 1 < 0.5) || hashDot(u, z)) {
        const [sx, sy] = iso.proj(F(u, z));
        r.set(sx, sy, "#cbbda3");
      }
    }
  // windows upstairs (one lit: home)
  for (const [u0, lit] of [[18, false], [52, true], [86, false], [116, night]] as [number, boolean][]) {
    iso.quad([F(u0, 60), F(u0 + 16, 60), F(u0 + 16, 82), F(u0, 82)], "#efe9dc", "#6d6150");
    iso.quad([F(u0 + 1.5, 61.5), F(u0 + 14.5, 61.5), F(u0 + 14.5, 80.5), F(u0 + 1.5, 80.5)], lit ? (night ? "#ffd76b" : "#9fd2ef") : night ? "#2a3150" : "#8fbfdc");
    iso.line(F(u0 + 8, 61.5), F(u0 + 8, 80.5), "#efe9dc");
  }
  // garage opening, raised door, interior
  iso.quad([F(14, 0), F(98, 0), F(98, 46), F(14, 46)], "#5a5348", "#3d372f");
  iso.quad([F(16, 0), F(96, 0), F(96, 38), F(16, 38)], night ? "#1b1d24" : "#2a2d35");
  for (let z = 38; z < 46; z += 2) iso.line(F(16, z), F(96, z), "#9aa0a6");
  iso.quad([F(16, 0), F(96, 0), F(96, 3), F(16, 3)], "#3a3d44");
  // wall lamp + house number
  iso.box(102, 0, 30, 4, 3, 6, "#2b2b2e");
  iso.quad([F(103, 31), F(105, 31), F(105, 35), F(103, 35)], night ? "#ffe39a" : "#e8e2c8");
  iso.quad([F(110, 30), F(122, 30), F(122, 38), F(110, 38)], "#2e3a4d", "#1d2533");

  // planter strip + tree on the left, lamp post on the right of the curb
  iso.box(118, 6, 0, 14, 14, 4, "#6b4a33", { top: "#3f6b34" });
  iso.box(123.5, 11.5, 4, 3, 3, 22, "#6b4a33");
  for (const [x, y, z, s] of [[118, 6, 24, 14], [120, 8, 32, 10], [121.5, 9.5, 40, 7]]) iso.box(x, y, z, s, s, 8, "#3f8f45", { top: "#57ad5c" });
  iso.box(6, 82, 0, 3, 3, 64, "#3a3d44");
  iso.box(4, 76, 64, 5, 12, 3, "#3a3d44");
  iso.box(5, 77, 62, 3, 6, 2, night ? "#ffe39a" : "#d8d8d0");

  // the parked car, nose toward the street (mirrored sprite = X and Y swapped)
  const car = carSprite(carId);
  const [cx, cy] = iso.proj([CAR_AT.x, CAR_AT.y, 0]);
  r.blit(car.r, Math.round(cx - (car.r.w - 1 - car.ax)), Math.round(cy - car.ay), true);
  return r;
}

function hashDot(u: number, z: number) {
  const h = (Math.floor(u * 2) * 73856093) ^ (Math.floor(z * 2) * 19349663);
  return (h >>> 0) % 97 === 0;
}

/** Screen points for overlays: where the avatar stands, headlights, the lamp. */
const CAR_LEN: Record<string, number> = { "car-mini": 53, "car-q50": 67, "car-ioniq5": 65 };

export function garagePoints(carId: string) {
  const { ox, oy } = GARAGE;
  const P = (x: number, y: number, z: number) => [ox + x - y, oy + (x + y) / 2 - z] as const;
  const L = CAR_LEN[carId] ?? 60;
  return {
    avatar: P(100, 46, 0),
    headlights: [P(CAR_AT.x + 6, CAR_AT.y + L, 11), P(CAR_AT.x + 24, CAR_AT.y + L, 11)],
    lamp: P(6, 80, 62),
    wallLamp: P(104, 0, 33),
    car: P(CAR_AT.x + 15, CAR_AT.y + 32, 10),
  };
}

