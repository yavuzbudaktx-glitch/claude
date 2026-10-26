"use client";
import { useEffect, useState } from "react";
import { CATALOG } from "@/engine/catalog";
import { useGame } from "@/store/useGame";
import { useReminders } from "@/lib/reminders";
import { isClockShifted, getNow } from "@/lib/clock";
import Badges from "./Badges";
import Catalog, { isNew } from "./Catalog";
import Celebrate from "./Celebrate";
import Dialog from "./Dialog";
import Hud from "./Hud";
import PixelIcon, { type IconName } from "./PixelIcon";
import Room, { type RoomTap } from "./Room";
import Settings from "./Settings";
import Stats from "./Stats";
import Today, { DietCard, PrayersCard, WakeCard } from "./Today";
import Wardrobe from "./Wardrobe";

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: "today", label: "Today", icon: "home" },
  { id: "catalog", label: "Catalog", icon: "bag" },
  { id: "wardrobe", label: "Wardrobe", icon: "shirt" },
  { id: "badges", label: "Badges", icon: "medal" },
  { id: "stats", label: "Stats", icon: "chart" },
];

export default function App() {
  const tick = useGame((s) => s.tick);
  const game = useGame((s) => s.game);
  const [tab, setTab] = useState("today");
  const [sheet, setSheet] = useState<RoomTap | "settings" | null>(null);
  useReminders();

  useEffect(() => {
    tick();
    const id = setInterval(tick, 30_000);
    const onVis = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tick]);

  const freshCount = CATALOG.filter((c) => isNew(game, c)).length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col gap-3 px-4 pb-28 pt-[max(12px,env(safe-area-inset-top))]">
      {isClockShifted() && <div className="chip self-start bg-[#ffe680]">Test clock: {getNow().toLocaleString()}</div>}
      <Hud onSettings={() => setSheet("settings")} />
      <div className="panel overflow-hidden">
        <div className="bg-[radial-gradient(ellipse_at_center,#2c3560,#1a1f3b)]">
          <Room onTap={setSheet} />
        </div>
      </div>
      {tab === "today" && <Today />}
      {tab === "catalog" && <Catalog />}
      {tab === "wardrobe" && <Wardrobe />}
      {tab === "badges" && <Badges />}
      {tab === "stats" && <Stats />}

      {sheet === "pray" && (
        <Dialog title="Prayer rug" onClose={() => setSheet(null)}>
          <PrayersCard />
        </Dialog>
      )}
      {sheet === "wake" && (
        <Dialog title="Bed" onClose={() => setSheet(null)}>
          <WakeCard />
        </Dialog>
      )}
      {sheet === "diet" && (
        <Dialog title="Kitchen" onClose={() => setSheet(null)}>
          <DietCard />
        </Dialog>
      )}
      {sheet === "settings" && (
        <div className="fixed inset-0 z-40 overflow-y-auto bg-[var(--bg)] px-4 pb-10 pt-[max(12px,env(safe-area-inset-top))]">
          <div className="mx-auto max-w-[720px] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-pixel text-xs text-white">SETTINGS</h2>
              <button className="btn h-10 w-10 px-0" onClick={() => setSheet(null)} aria-label="Close settings">
                <PixelIcon name="close" size={14} />
              </button>
            </div>
            <Settings />
          </div>
        </div>
      )}
      <Celebrate />

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-black bg-[var(--chrome)] pb-[env(safe-area-inset-bottom,0px)]" aria-label="Sections">
        <div className="mx-auto grid max-w-[720px] grid-cols-5">
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                aria-current={on ? "page" : undefined}
                className={`relative flex flex-col items-center gap-1 py-2.5 font-pixel text-[8px] uppercase ${on ? "bg-[var(--head)] text-white" : "text-[var(--chrome-ink)]"}`}
              >
                <PixelIcon name={t.icon} size={18} color={on ? "#fff" : "#a9b6dc"} />
                {t.label}
                {t.id === "catalog" && freshCount > 0 && (
                  <span className="absolute right-[18%] top-1.5 min-w-[16px] rounded-full border border-black bg-[#ff4fc3] px-1 text-[8px] leading-[14px] text-white">{freshCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
