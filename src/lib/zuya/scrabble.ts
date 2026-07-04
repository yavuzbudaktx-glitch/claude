// Kelimelik / Turkish Scrabble engine: tile set, board premium squares, and
// move scoring. Trust-based — no dictionary validation. All logic is generic
// crossword-game math; nothing proprietary.

export const SIZE = 15;
export const CENTER = 112; // 7*15 + 7
export const RACK = 7;

export type Cell = { l: string; b?: boolean; u?: string } | null;
export type Placed = { idx: number; l: string; b: boolean };

// Turkish letter points.
export const POINTS: Record<string, number> = {
  A: 1, B: 3, C: 4, Ç: 4, D: 3, E: 1, F: 7, G: 5, Ğ: 8, H: 5, I: 2, İ: 1,
  J: 10, K: 1, L: 1, M: 2, N: 1, O: 2, Ö: 7, P: 5, R: 1, S: 2, Ş: 4, T: 1,
  U: 2, Ü: 3, V: 7, Y: 3, Z: 4, "*": 0,
};

// Tile counts (a reasonable Turkish distribution, ~100 tiles incl. 2 blanks).
const COUNTS: Record<string, number> = {
  A: 12, B: 2, C: 2, Ç: 2, D: 2, E: 8, F: 1, G: 1, Ğ: 1, H: 1, I: 4, İ: 7,
  J: 1, K: 7, L: 7, M: 4, N: 5, O: 3, Ö: 1, P: 1, R: 6, S: 3, Ş: 2, T: 5,
  U: 3, Ü: 2, V: 1, Y: 2, Z: 2, "*": 2,
};

export function freshBag(): string[] {
  const bag: string[] = [];
  for (const [l, n] of Object.entries(COUNTS)) for (let i = 0; i < n; i++) bag.push(l);
  // Fisher–Yates shuffle.
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

// Premium squares (standard 15x15 layout).
const TW = new Set([0, 7, 14, 105, 119, 210, 217, 224]);
const DW = new Set([16, 32, 48, 64, 160, 176, 192, 208, 28, 42, 56, 70, 154, 168, 182, 196, 112]);
const TL = new Set([20, 24, 76, 80, 84, 88, 136, 140, 144, 148, 200, 204]);
const DL = new Set([
  3, 11, 36, 38, 45, 52, 59, 92, 96, 98, 102, 108, 116, 122, 126, 128, 132,
  165, 172, 179, 186, 188, 213, 221,
]);

export type Bonus = "TW" | "DW" | "TL" | "DL" | "";
export function bonusAt(idx: number): Bonus {
  if (TW.has(idx)) return "TW";
  if (DW.has(idx)) return "DW";
  if (TL.has(idx)) return "TL";
  if (DL.has(idx)) return "DL";
  return "";
}

const rc = (idx: number) => [Math.floor(idx / SIZE), idx % SIZE] as const;
const ri = (r: number, c: number) => r * SIZE + c;

// Collect the contiguous word (indices) through `idx` along (dr,dc).
function wordLine(board: Cell[], idx: number, dr: number, dc: number): number[] {
  let [r, c] = rc(idx);
  while (true) {
    const pr = r - dr, pc = c - dc;
    if (pr < 0 || pr >= SIZE || pc < 0 || pc >= SIZE || !board[ri(pr, pc)]) break;
    r = pr; c = pc;
  }
  const out: number[] = [];
  while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[ri(r, c)]) {
    out.push(ri(r, c));
    r += dr; c += dc;
  }
  return out;
}

function scoreWord(board: Cell[], idxs: number[], placed: Set<number>): number {
  let sum = 0;
  let wordMult = 1;
  for (const i of idxs) {
    const cell = board[i]!;
    const base = cell.b ? 0 : POINTS[cell.l] ?? 0;
    if (placed.has(i)) {
      const b = bonusAt(i);
      let lp = base;
      if (b === "DL") lp = base * 2;
      if (b === "TL") lp = base * 3;
      if (b === "DW") wordMult *= 2;
      if (b === "TW") wordMult *= 3;
      sum += lp;
    } else {
      sum += base;
    }
  }
  return sum * wordMult;
}

export interface MoveResult {
  ok: boolean;
  error?: string;
  points: number;
  words: string[];
}

// Validate + score a set of freshly placed tiles against the board (which
// already includes those tiles). `firstMove` = board was empty before.
export function scoreMove(board: Cell[], placed: Placed[], firstMove: boolean): MoveResult {
  if (placed.length === 0) return { ok: false, error: "Hiç taş koymadın.", points: 0, words: [] };
  const idxs = placed.map((p) => p.idx);
  const rows = new Set(idxs.map((i) => Math.floor(i / SIZE)));
  const cols = new Set(idxs.map((i) => i % SIZE));
  const horizontal = rows.size === 1;
  const vertical = cols.size === 1;
  if (!horizontal && !vertical) {
    return { ok: false, error: "Taşlar tek sıra olmalı.", points: 0, words: [] };
  }

  const placedSet = new Set(idxs);
  // Main axis: prefer the one with length>1; single tile → whichever connects.
  const dir: [number, number] = horizontal ? [0, 1] : [1, 0];
  const mainLine = wordLine(board, idxs[0], dir[0], dir[1]);
  // Contiguity: the main word must contain every placed tile.
  for (const i of idxs) if (!mainLine.includes(i)) {
    return { ok: false, error: "Taşlar bitişik olmalı.", points: 0, words: [] };
  }

  if (firstMove) {
    if (!idxs.includes(CENTER)) {
      return { ok: false, error: "İlk kelime ortadan geçmeli.", points: 0, words: [] };
    }
  }

  // Collect all words: the main word (if >1) plus each perpendicular cross word.
  const perp: [number, number] = horizontal ? [1, 0] : [0, 1];
  const wordsIdx: number[][] = [];
  if (mainLine.length > 1) wordsIdx.push(mainLine);
  for (const i of idxs) {
    const cross = wordLine(board, i, perp[0], perp[1]);
    if (cross.length > 1) wordsIdx.push(cross);
  }

  if (wordsIdx.length === 0) {
    return { ok: false, error: "Geçerli bir kelime yok.", points: 0, words: [] };
  }

  // Non-first moves must connect to an existing tile.
  if (!firstMove) {
    const touches = wordsIdx.some((w) => w.some((i) => !placedSet.has(i)));
    if (!touches) {
      return { ok: false, error: "Mevcut kelimelere değmeli.", points: 0, words: [] };
    }
  }

  let points = 0;
  const words: string[] = [];
  for (const w of wordsIdx) {
    points += scoreWord(board, w, placedSet);
    words.push(w.map((i) => board[i]!.l).join(""));
  }
  if (placed.length === RACK) points += 50; // bingo

  return { ok: true, points, words };
}
