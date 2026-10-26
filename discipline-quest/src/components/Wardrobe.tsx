"use client";
import { CATALOG } from "@/engine/catalog";
import { buyItem, canBuy, isLocked, owns } from "@/engine/engine";
import { renderAvatar, type BodyStage, type OutfitId } from "@/game/sprites/avatar";
import { useGame } from "@/store/useGame";
import PixelIcon from "./PixelIcon";
import RasterCanvas from "./RasterCanvas";

export default function Wardrobe() {
  const game = useGame((s) => s.game);
  const act = useGame((s) => s.act);
  const equip = useGame((s) => s.equip);
  const outfits = CATALOG.filter((c) => c.category === "outfit");
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="flex items-center gap-1.5">
          <PixelIcon name="shirt" size={12} color="#fff" /> Wardrobe
        </span>
        <span className="normal-case">{outfits.filter((o) => owns(game, o.id)).length}/{outfits.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
        {outfits.map((o) => {
          const have = owns(game, o.id);
          const locked = isLocked(game, o.id);
          const on = game.equipped.outfit === o.id;
          const status = canBuy(game, o.id);
          return (
            <article key={o.id} className={`flex flex-col items-center rounded-[4px] border-2 border-black p-2 text-center ${on ? "bg-[#e3f1ff]" : "bg-white"}`}>
              <div className={`flex h-28 w-full items-end justify-center rounded-[3px] bg-[linear-gradient(#cfe0f2,#a9c6dc)] ${have && !locked ? "" : "opacity-50 grayscale"}`}>
                <RasterCanvas make={() => renderAvatar("front", on ? "celebrate" : "idle", o.id as OutfitId, game.body.stage as BodyStage)} deps={[o.id, on, game.body.stage]} style={{ height: "96px" }} />
              </div>
              <h3 className="mt-1 font-pixel text-[8px] leading-tight">{o.name}</h3>
              <p className="mb-1.5 text-base leading-tight text-[var(--muted)]">{o.blurb}</p>
              <div className="mt-auto w-full">
                {have ? (
                  <button className={`btn w-full ${on ? "btn-blue" : ""}`} disabled={on || locked} onClick={() => equip(o.id, "Fresh fit.")}>
                    {locked ? <><PixelIcon name="lock" size={10} /> Locked</> : on ? "Wearing" : "Wear"}
                  </button>
                ) : (
                  <button className="btn btn-gold w-full" disabled={status !== "ok"} onClick={() => act((s, n) => buyItem(s, n, o.id), { kind: "buy", say: "New fit!" })}>
                    {status === "level" ? <><PixelIcon name="lock" size={10} /> Lv {o.level}</> : status === "debt" ? "In debt" : <><PixelIcon name="coin" size={10} color="#7a5a00" /> {o.price}</>}
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
