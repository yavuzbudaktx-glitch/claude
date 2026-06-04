"use client";

import { useState } from "react";
import { Type, Crown, Worm, Grid3x3, Hash } from "lucide-react";
import { Wordle } from "./Wordle";
import { ChessPuzzle } from "./ChessPuzzle";
import { Snake } from "./Snake";
import { Game2048 } from "./Game2048";
import { TicTacToe } from "./TicTacToe";

type GameTab = "chess" | "wordle" | "2048" | "snake" | "tictactoe";

export function GamesCard() {
  const [tab, setTab] = useState<GameTab>("chess");

  return (
    // Fixed inner height so the games card never stretches the row regardless
    // of which game is active — each game just scrolls/centers inside this
    // bound.
    <div className="flex flex-col gap-3 h-[560px]">
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        {(
          [
            { id: "chess",     label: "Chess",  icon: Crown },
            { id: "wordle",    label: "Wordle", icon: Type },
            { id: "2048",      label: "2048",   icon: Grid3x3 },
            { id: "snake",     label: "Snake",  icon: Worm },
            { id: "tictactoe", label: "Tic-Tac-Toe", icon: Hash },
          ] as Array<{ id: GameTab; label: string; icon: typeof Type }>
        ).map((g) => {
          const Icon = g.icon;
          const on = tab === g.id;
          return (
            <button
              key={g.id}
              onClick={() => setTab(g.id)}
              className={`chip normal-case !px-2.5 !py-0.5 !text-[11px] inline-flex items-center gap-1 ${on ? "chip-active" : ""}`}
            >
              <Icon className="h-3 w-3" /> {g.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "chess" && <ChessPuzzle />}
        {tab === "wordle" && <Wordle />}
        {tab === "2048" && <Game2048 />}
        {tab === "snake" && <Snake />}
        {tab === "tictactoe" && <TicTacToe />}
      </div>
    </div>
  );
}
