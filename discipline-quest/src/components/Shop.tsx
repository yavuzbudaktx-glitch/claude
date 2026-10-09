"use client";
import { buyItem, canBuy, liveStreaks } from "@/engine/engine";
import { ITEMS, RULES, SHOP_ORDER } from "@/engine/rules";
import type { ItemId } from "@/engine/types";
import { useNow } from "@/lib/useNow";
import { useGame } from "@/store/useGame";
import PiecePreview from "./PiecePreview";

export default function Shop() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const now = useNow();
  const streaks = liveStreaks(game, now);
  const owned = (id: ItemId) => game.inventory.find((i) => i.itemId === id);

  const progress: Record<"car" | "pony", [number, number]> = {
    car: [streaks.clean, RULES.carCleanDays],
    pony: [game.streaks.prayers, RULES.ponyPrayerDays],
  };

  return (
    <div className="space-y-3">
      {game.coins < 0 && (
        <div className="panel bg-[#f9d6d5] p-3">You are {Math.abs(game.coins)} coins in debt. The shop reopens when you are back to 0.</div>
      )}
      <section className="panel">
        <div className="panel-head">Milestones</div>
        <div className="grid grid-cols-2 gap-2 p-3">
          {(["car", "pony"] as const).map((id) => {
            const [have, need] = progress[id];
            const o = owned(id);
            return (
              <div key={id} className="rounded-[4px] border-2 border-black bg-white p-2 text-center">
                <PiecePreview id={id} locked={!o || o.lockDaysLeft > 0} size={88} />
                <div className="font-pixel text-[9px]">{ITEMS[id].name}</div>
                <div className="text-base">
                  {o ? (o.lockDaysLeft > 0 ? `Locked: ${o.lockDaysLeft} clean days` : "Unlocked!") : `${Math.min(have, need)}/${need} ${id === "car" ? "clean days" : "full prayer days"}`}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <span>Furniture shop</span>
          <span className="normal-case">{game.coins} coins</span>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          {SHOP_ORDER.map((id) => {
            const item = ITEMS[id];
            const o = owned(id);
            const status = canBuy(game, id);
            return (
              <div key={id} className="flex flex-col items-center rounded-[4px] border-2 border-black bg-white p-2 text-center">
                <PiecePreview id={id} locked={!!o && o.lockDaysLeft > 0} size={72} />
                <div className="font-pixel text-[9px]">{item.name}</div>
                <div className="mb-1 text-base opacity-75">{item.blurb}</div>
                {o ? (
                  <span className="chip mt-auto bg-[#d9d4c4]">{o.lockDaysLeft > 0 ? `Locked ${o.lockDaysLeft}d` : "Owned"}</span>
                ) : (
                  <button
                    className="btn btn-gold mt-auto w-full"
                    disabled={status !== "ok"}
                    onClick={() => act((s, n) => buyItem(s, n, id), { kind: "buy", say: `New ${item.name.toLowerCase()}!` })}
                  >
                    {item.price} coins
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
