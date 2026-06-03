"use client";

import { useState } from "react";
import { Type, Crown, Worm } from "lucide-react";
import { Wordle } from "./Wordle";
import { ChessPuzzle } from "./ChessPuzzle";
import { Snake } from "./Snake";

type GameTab = "wordle" | "chess" | "snake";

export function GamesCard() {
  const [tab, setTab] = useState<GameTab>("wordle");

  return (
    // Fixed inner height so the games card never stretches the row regardless
    // of which game is active — each game just scrolls/centers inside this
    // bound. Card content is constrained to ~560px tall.
    <div className="flex flex-col gap-3 h-[560px]">
      <div className="flex items-center gap-1.5 shrink-0">
        {(
          [
            { id: "wordle", label: "Wordle", icon: Type },
            { id: "chess",  label: "Chess",  icon: Crown },
            { id: "snake",  label: "Snake",  icon: Worm  },
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
        {tab === "wordle" && <Wordle />}
        {tab === "chess" && <ChessPuzzle />}
        {tab === "snake" && <Snake />}
      </div>
    </div>
  );
}
