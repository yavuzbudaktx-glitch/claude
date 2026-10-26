import type { Iso, P3 } from "../iso";

export type Draw = (i: Iso, variant?: string) => void;

export const WOOD = "#8a5a33";
export const WALNUT = "#5e3b22";
export const STEEL = "#c9ccd2";
export const BLACK = "#1d1d20";

/** Eight-sided "circle" on a plane (kept for chunky shapes). */
export function octagon(cx: number, cz: number, r: number, plane: (u: number, z: number) => P3): P3[] {
  const k = r * 0.41;
  return ([[k, r], [r, k], [r, -k], [k, -r], [-k, -r], [-r, -k], [-r, k], [-k, r]] as const).map(([du, dz]) => plane(cx + du, cz + dz));
}

/** A "world pixel" (s×s block) at a 3D point. */
export const px = (i: Iso, p: P3, c: string, w = 1, h = 1) => i.dot(p, c, w, h);

/** Planes for drawing on the visible faces of something. */
export const onX = (x: number) => (u: number, z: number): P3 => [x, u, z];
export const onY = (y: number) => (u: number, z: number): P3 => [u, y, z];
