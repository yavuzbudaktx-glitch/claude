"use client";
import { useEffect, useMemo, useState } from "react";
import { CATALOG, EQUIP_SLOT, ITEMS, type CatalogItem, type Category } from "@/engine/catalog";
import { buyItem, canBuy, isLocked, owns, type BuyResult } from "@/engine/engine";
import { levelFor } from "@/engine/rules";
import type { GameState } from "@/engine/types";
import { WALL_ITEMS, buildPiece, stylePreview, wallItemPreview } from "@/game/furniture";
import { lockedCopy } from "@/game/iso";
import { renderCat } from "@/game/sprites/cat";
import { carSprite } from "@/game/sprites/cars";
import { useGame } from "@/store/useGame";
import PixelIcon from "./PixelIcon";
import RasterCanvas from "./RasterCanvas";

const TABS: { label: string; cats: Category[] }[] = [
  { label: "Furniture", cats: ["furniture"] },
  { label: "Faith", cats: ["faith"] },
  { label: "Wall decor", cats: ["wall"] },
  { label: "Walls & floors", cats: ["wallpaper", "floor"] },
  { label: "Rugs", cats: ["rug"] },
  { label: "Rooms", cats: ["room"] },
  { label: "Pets", cats: ["pet"] },
];

export function previewFor(item: CatalogItem, locked = false) {
  const lock = (s: ReturnType<typeof buildPiece>) => (locked ? lockedCopy(s) : s);
  switch (item.category) {
    case "wallpaper": return lock(stylePreview({ wallpaper: item.id })).r;
    case "floor": return lock(stylePreview({ floor: item.id })).r;
    case "room": return lock(stylePreview({ size: item.id === "room-penthouse" ? 56 : item.id === "room-apartment" ? 46 : 36 })).r;
    case "rug": return lock(buildPiece(`prayerrug:${item.id}`)).r;
    case "car": return lock(carSprite(item.id)).r;
    case "fixture": return buildPiece(item.id === "prayerrug" ? "prayerrug:rug-green" : item.id === "kitchen" ? "kitchen:wall" : item.id).r;
    case "pet": return renderCat("sit");
    default: return lock(WALL_ITEMS.includes(item.id) ? wallItemPreview(item.id) : buildPiece(item.id)).r;
  }
}

export function isNew(s: GameState, item: CatalogItem) {
  return !s.seen.includes(item.id) && levelFor(s.xp).level >= item.level && !owns(s, item.id);
}

const REASON: Record<Exclude<BuyResult, "ok" | "owned" | "not-for-sale">, (i: CatalogItem) => string> = {
  level: (i) => `Level ${i.level}`,
  tier: (i) => `Needs ${ITEMS[`room-${i.tier}`]?.name ?? i.tier}`,
  debt: () => "In debt",
  poor: (i) => `${i.price} coins`,
};

export default function Catalog() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const equip = useGame((s) => s.equip);
  const markSeen = useGame((s) => s.markSeen);
  const [tab, setTab] = useState(0);
  const items = useMemo(() => CATALOG.filter((c) => TABS[tab].cats.includes(c.category)), [tab]);

  // Clear NEW tags for what you've looked at, when you leave the tab.
  useEffect(() => {
    const ids = items.filter((i) => isNew(game, i)).map((i) => i.id);
    return () => markSeen(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);


  return (
    <section className="panel">
      <div className="panel-head">
        <span className="flex items-center gap-1.5">
          <PixelIcon name="bag" size={12} color="#fff" /> Catalog
        </span>
        <span className="normal-case">{game.coins} coins</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto border-b-2 border-black bg-[var(--panel-2)] p-2">
        {TABS.map((t, k) => {
          const fresh = CATALOG.some((c) => t.cats.includes(c.category) && isNew(game, c));
          return (
            <button key={t.label} className={`tab relative shrink-0 ${k === tab ? "bg-[var(--head)] text-white" : "bg-white"}`} onClick={() => setTab(k)}>
              {t.label}
              {fresh && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-black bg-[#ff4fc3]" />}
            </button>
          );
        })}
      </div>
      {game.coins < 0 && <p className="border-b-2 border-black bg-[#f9d6d5] px-3 py-2 text-base">You are {Math.abs(game.coins)} coins in debt. Buying reopens at 0.</p>}
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
        {items.map((item) => {
          const have = owns(game, item.id);
          const locked = isLocked(game, item.id);
          const slot = EQUIP_SLOT[item.category];
          const equipped = slot && game.equipped[slot] === item.id;
          const status = canBuy(game, item.id);
          const gated = !have && status !== "ok" && status !== "poor" && status !== "debt" && status !== "not-for-sale";
          return (
            <article key={item.id} className={`relative flex flex-col items-center rounded-[4px] border-2 border-black p-2 text-center ${equipped ? "bg-[#e3f1ff]" : "bg-white"}`}>
              {isNew(game, item) && <span className="new-tag absolute left-1 top-1">NEW</span>}
              <div className="flex h-20 w-full items-center justify-center">
                <RasterCanvas make={() => previewFor(item, locked || gated)} deps={[item.id, locked, gated]} className="max-h-full max-w-full" style={{ width: "100%", height: "100%" }} />
              </div>
              <h3 className="font-pixel text-[8px] leading-tight">{item.name}</h3>
              <p className="mb-1.5 mt-0.5 text-base leading-tight text-[var(--muted)]">{item.blurb}</p>
              <div className="mt-auto w-full">
                {have ? (
                  locked ? (
                    <span className="chip w-full justify-center bg-[#d9d4c4]">
                      <PixelIcon name="lock" size={10} /> {game.inventory.find((i) => i.itemId === item.id)?.lockDaysLeft}d
                    </span>
                  ) : slot ? (
                    <button className={`btn w-full ${equipped ? "btn-blue" : ""}`} disabled={!!equipped} onClick={() => equip(item.id, `${item.name}. Nice.`)}>
                      {equipped ? "Equipped" : "Use"}
                    </button>
                  ) : (
                    <span className="chip w-full justify-center bg-[#d9f0d9]">
                      <PixelIcon name="check" size={10} color="var(--good)" /> Owned
                    </span>
                  )
                ) : item.price === null ? (
                  <span className="chip w-full justify-center bg-[#efe6ff] text-sm">Not for sale</span>
                ) : (
                  <button
                    className="btn btn-gold w-full"
                    disabled={status !== "ok"}
                    onClick={() => act((s, n) => buyItem(s, n, item.id), { kind: "buy", say: `New ${item.name.toLowerCase()}!` })}
                  >
                    {status === "ok" ? (
                      <>
                        <PixelIcon name="coin" size={10} color="#7a5a00" /> {item.price}
                      </>
                    ) : (
                      <>
                        {gated && <PixelIcon name="lock" size={10} />} {REASON[status as keyof typeof REASON]?.(item) ?? status}
                      </>
                    )}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
