"use client";

import { useState } from "react";
import { Globe2, Crown, Worm } from "lucide-react";
import { Worldle } from "./Worldle";
import { ChessPuzzle } from "./ChessPuzzle";
import { Snake } from "./Snake";

type GameTab = "worldle" | "chess" | "snake";

export function GamesCard() {
  const [tab, setTab] = useState<GameTab>("worldle");

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex items-center gap-1.5">
        {(
          [
            { id: "worldle", label: "Worldle", icon: Globe2 },
            { id: "chess",   label: "Chess",   icon: Crown },
            { id: "snake",   label: "Snake",   icon: Worm  },
          ] as Array<{ id: GameTab; label: string; icon: typeof Globe2 }>
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

      <div className="flex-1 min-h-0">
        {tab === "worldle" && <Worldle />}
        {tab === "chess" && <ChessPuzzle />}
        {tab === "snake" && <Snake />}
      </div>
    </div>
  );
}
