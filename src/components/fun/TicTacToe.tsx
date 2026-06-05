"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw, X as XIcon, Circle, Cpu, Users } from "lucide-react";

// Tic-Tac-Toe — you're X. Play a friend (2-player), the computer on Moderate
// (plays well but slips often enough that you can win), or Hard (minimax,
// unbeatable — best you'll get is a draw). Running tally of X / O / draws.

type Cell = "X" | "O" | null;
type Mode = "cpu-moderate" | "cpu-hard" | "two";

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winnerOf(b: Cell[]): { who: Cell; line: number[] | null } {
  for (const l of LINES) {
    const [a, c, d] = l;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { who: b[a], line: l };
  }
  return { who: null, line: null };
}
const isFull = (b: Cell[]) => b.every(Boolean);

// Minimax for the CPU (O maximises). Returns a score for the board.
function minimax(b: Cell[], turn: "X" | "O"): number {
  const { who } = winnerOf(b);
  if (who === "O") return 10;
  if (who === "X") return -10;
  if (isFull(b)) return 0;
  const scores: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (!b[i]) {
      b[i] = turn;
      scores.push(minimax(b, turn === "X" ? "O" : "X"));
      b[i] = null;
    }
  }
  return turn === "O" ? Math.max(...scores) : Math.min(...scores);
}
function bestMove(b: Cell[]): number {
  let best = -Infinity, idx = -1;
  for (let i = 0; i < 9; i++) {
    if (!b[i]) {
      b[i] = "O";
      const s = minimax(b, "X");
      b[i] = null;
      if (s > best) { best = s; idx = i; }
    }
  }
  return idx;
}
function randomMove(b: Cell[]): number {
  const empty = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  return empty[Math.floor(Math.random() * empty.length)];
}
// Moderate: optimal most of the time, but with a real chance of a human-like
// slip (a random legal move) so the game is genuinely winnable without being
// trivial. ~45% slip lands between "too easy" (pure random) and "always a
// draw" (pure minimax).
function moderateMove(b: Cell[]): number {
  return Math.random() < 0.45 ? randomMove(b) : bestMove(b.slice());
}

export function TicTacToe() {
  const [mode, setMode] = useState<Mode>("cpu-moderate");
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [turn, setTurn] = useState<"X" | "O">("X");
  const [tally, setTally] = useState({ x: 0, o: 0, d: 0 });
  const settled = useRef(false);

  const { who, line } = winnerOf(board);
  const full = isFull(board);
  const gameOver = !!who || full;

  // Record the result once per game.
  useEffect(() => {
    if (gameOver && !settled.current) {
      settled.current = true;
      setTally((t) => who === "X" ? { ...t, x: t.x + 1 } : who === "O" ? { ...t, o: t.o + 1 } : { ...t, d: t.d + 1 });
    }
  }, [gameOver, who]);

  // CPU move when it's O's turn in a CPU mode.
  useEffect(() => {
    if (mode === "two" || gameOver || turn !== "O") return;
    const t = setTimeout(() => {
      setBoard((b) => {
        if (winnerOf(b).who || isFull(b)) return b;
        const idx = mode === "cpu-hard" ? bestMove(b.slice()) : moderateMove(b);
        if (idx < 0) return b;
        const nb = b.slice(); nb[idx] = "O";
        return nb;
      });
      setTurn("X");
    }, 380);
    return () => clearTimeout(t);
  }, [turn, mode, gameOver]);

  function play(i: number) {
    if (board[i] || gameOver) return;
    if (mode !== "two" && turn !== "X") return;
    const nb = board.slice();
    nb[i] = turn;
    setBoard(nb);
    setTurn(turn === "X" ? "O" : "X");
  }

  function reset(keepTally = true) {
    settled.current = false;
    setBoard(Array(9).fill(null));
    setTurn("X");
    if (!keepTally) setTally({ x: 0, o: 0, d: 0 });
  }

  function changeMode(m: Mode) { setMode(m); reset(false); }

  const status = who
    ? (mode === "two" ? `${who} wins!` : who === "X" ? "You win! 🎉" : "Computer wins")
    : full ? "Draw"
    : mode === "two" ? `${turn}'s turn`
    : turn === "X" ? "Your turn" : "Computer thinking…";

  const MODES: Array<{ id: Mode; label: string; icon: typeof Cpu }> = [
    { id: "cpu-moderate", label: "Moderate", icon: Cpu },
    { id: "cpu-hard", label: "Hard", icon: Cpu },
    { id: "two", label: "2P", icon: Users },
  ];

  return (
    <div className="flex flex-col gap-3 h-full min-h-0 items-center">
      <div className="flex items-center justify-between w-full shrink-0">
        <div className="flex items-center gap-1">
          {MODES.map((m) => {
            const Icon = m.icon;
            const on = mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => changeMode(m.id)}
                className={`chip normal-case !px-2 !py-0.5 !text-[10.5px] inline-flex items-center gap-1 ${on ? "chip-active" : ""}`}
              >
                <Icon className="h-3 w-3" /> {m.label}
              </button>
            );
          })}
        </div>
        <button onClick={() => reset(true)} className="btn-ghost !h-8 !w-8" title="New round" aria-label="New round">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div className="text-[12.5px] font-semibold text-ink-soft shrink-0">{status}</div>

      <div className="flex-1 min-h-0 w-full grid place-items-center" style={{ containerType: "size" }}>
      <div className="relative" style={{ width: "100cqmin", height: "100cqmin" }}>
        <div className="grid grid-cols-3 grid-rows-3 gap-2 h-full">
          {board.map((v, i) => {
            const inWin = line?.includes(i);
            return (
              <button
                key={i}
                onClick={() => play(i)}
                disabled={!!v || gameOver}
                className="grid place-items-center rounded-xl border transition active:scale-95 disabled:cursor-default"
                style={{
                  background: inWin ? "color-mix(in srgb, var(--up) 18%, transparent)" : "var(--rule-soft)",
                  borderColor: inWin ? "var(--up)" : "var(--rule)",
                }}
              >
                {v === "X" && <XIcon className="h-9 w-9" style={{ color: "var(--accent)" }} strokeWidth={3} />}
                {v === "O" && <Circle className="h-8 w-8" style={{ color: "var(--accent-2)" }} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </div>
      </div>

      <div className="flex items-center gap-2.5 mt-auto shrink-0 text-[11px]">
        <Score label={mode === "two" ? "X" : "You"} value={tally.x} color="var(--accent)" />
        <Score label="Draw" value={tally.d} color="var(--muted)" />
        <Score label={mode === "two" ? "O" : "CPU"} value={tally.o} color="var(--accent-2)" />
      </div>
    </div>
  );
}

function Score({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg px-3 py-1 text-center" style={{ background: "var(--rule-soft)" }}>
      <div className="text-[8.5px] uppercase tracking-wider text-muted-2 leading-none">{label}</div>
      <div className="text-[14px] font-bold tabular-nums leading-tight" style={{ color }}>{value}</div>
    </div>
  );
}
