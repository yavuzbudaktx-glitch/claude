"use client";
import { levelFor } from "@/engine/rules";
import { useGame } from "@/store/useGame";

export default function Hud() {
  const { coins, xp } = useGame((s) => s.game);
  const lv = levelFor(xp);
  return (
    <div className="panel flex items-center gap-3 px-3 py-2">
      <div className="font-pixel text-[10px] leading-tight">
        <div className="text-[var(--head)]">DISCIPLINE</div>
        <div>QUEST</div>
      </div>
      <div className="flex-1">
        <div className="flex justify-between text-base">
          <span>Level {lv.level}</span>
          <span>
            {lv.into}/{lv.need} XP
          </span>
        </div>
        <div className="h-3 rounded-[3px] border-2 border-black bg-[#d9d4c4]">
          <div className="h-full bg-[#8e44ad]" style={{ width: `${(lv.into / lv.need) * 100}%` }} />
        </div>
      </div>
      <div
        className={`chip flex items-center gap-1 text-xl ${coins < 0 ? "bg-[#d64541] text-white" : "bg-[#f1c40f]"}`}
        title={coins < 0 ? "In debt: the shop is closed" : "Coins"}
      >
        <span className="inline-block h-3 w-3 rounded-full border-2 border-black bg-[#ffdf4d]" />
        {coins}
      </div>
    </div>
  );
}
