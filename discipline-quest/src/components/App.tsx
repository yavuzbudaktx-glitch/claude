"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CATALOG } from "@/engine/catalog";
import { useGame } from "@/store/useGame";
import { gymCountInWeek, mondayOf } from "@/engine/engine";
import { dateKey } from "@/engine/dates";
import { useReminders } from "@/lib/reminders";
import { isClockShifted, getNow } from "@/lib/clock";
import { cloudStatus, loadCloud, onCloudStatus, saveGame } from "@/lib/cloudSave";
import Badges from "./Badges";
import Catalog, { isNew } from "./Catalog";
import Celebrate from "./Celebrate";
import Dialog from "./Dialog";
import Hud from "./Hud";
import PixelIcon, { type IconName } from "./PixelIcon";
import Room, { type RoomTap } from "./Room";
import Settings from "./Settings";
import Stats from "./Stats";
import Garage from "./Garage";
import Today, { BedtimeCard, DietCard, PrayersCard, WakeCard } from "./Today";
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
  const [scene, setScene] = useState<"room" | "gym" | "garage">("room");
  const [decorating, setDecorating] = useState(false);
  const [zoom, setZoom] = useState(false);
  const toggleLights = useGame((s) => s.toggleLights);
  useReminders();

  const cloud = useSyncExternalStore(onCloudStatus, cloudStatus, cloudStatus);
  useEffect(() => {
    // Start from the cloud save if there is one, then save every change from here on.
    let unsub = () => {};
    let alive = true;
    loadCloud().then((g) => {
      if (!alive) return;
      if (g) useGame.getState().replace(g);
      useGame.getState().tick();
      if (!g) saveGame(useGame.getState().game);
      unsub = useGame.subscribe((s, prev) => s.game !== prev.game && saveGame(s.game));
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

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

  if (cloud.mode === "loading")
    return <div className="p-8 text-center font-pixel text-[11px] text-white">Loading your save…</div>;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col gap-3 px-4 pb-32 pt-[max(12px,env(safe-area-inset-top))]">
      {isClockShifted() && (
        <div className="chip self-start bg-[#ffe680]">
          Test clock: {getNow().toLocaleString()}
        </div>
      )}
      <Hud onSettings={() => setSheet("settings")} />
      <div className="panel overflow-hidden">
        <div className="flex items-center gap-1.5 border-b-2 border-black bg-[var(--chrome)] p-1.5">
          <div className="seg flex" role="tablist" aria-label="Where to look">
            {(["room", "gym", "garage"] as const).map((k) => {
              const locked = k === "gym" && !game.equipped.gym;
              return (
                <button
                  key={k}
                  role="tab"
                  aria-selected={scene === k}
                  className={`seg-btn flex items-center gap-1 ${scene === k ? "seg-on" : ""}`}
                  onClick={() => {
                    setScene(k);
                    setDecorating(false);
                  }}
                >
                  {locked && <PixelIcon name="lock" size={10} />}
                  {k === "room" ? "Room" : k === "gym" ? "Gym" : "Garage"}
                </button>
              );
            })}
          </div>
          {scene !== "garage" && !(scene === "gym" && !game.equipped.gym) && (
            <div className="ml-auto flex items-center gap-1">
              {scene === "room" && (
                <button
                  className={`icon-btn ${game.settings.lights ? "bg-[#ffe680]" : "bg-[#3a3f5c] text-white"}`}
                  onClick={toggleLights}
                  aria-pressed={game.settings.lights}
                  aria-label={game.settings.lights ? "Turn lights off" : "Turn lights on"}
                >
                  <PixelIcon name={game.settings.lights ? "sun" : "moon"} size={13} />
                </button>
              )}
              <button
                className={`icon-btn ${zoom ? "bg-[var(--head)] text-white" : "bg-[#e6e2d6]"}`}
                onClick={() => setZoom((z) => !z)}
                aria-pressed={zoom}
                aria-label={zoom ? "Fit the room" : "Zoom in"}
              >
                <PixelIcon name="zoom" size={13} />
              </button>
              <button
                className={`icon-btn ${decorating ? "bg-[var(--gold)]" : "bg-[#e6e2d6]"}`}
                onClick={() => setDecorating((d) => !d)}
                aria-pressed={decorating}
                aria-label={decorating ? "Done decorating" : "Decorate"}
              >
                <PixelIcon name="brush" size={13} />
              </button>
            </div>
          )}
        </div>
        <div className="bg-[radial-gradient(ellipse_at_center,#2c3560,#1a1f3b)]">
          {scene === "garage" ? (
            <Garage />
          ) : scene === "gym" && !game.equipped.gym ? (
            <GymLocked />
          ) : (
            <Room
              key={scene}
              space={scene === "gym" ? "gym" : "home"}
              onTap={setSheet}
              decorating={decorating}
              onDoneDecorating={() => setDecorating(false)}
              zoom={zoom}
            />
          )}
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
      {sheet === "bed" && (
        <Dialog title="Bedtime" onClose={() => setSheet(null)}>
          <BedtimeCard />
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
              <h2 className="font-pixel text-[11px] text-white">SETTINGS</h2>
              <button
                className="btn h-10 w-10 px-0"
                onClick={() => setSheet(null)}
                aria-label="Close settings"
              >
                <PixelIcon name="close" size={14} />
              </button>
            </div>
            <Settings />
          </div>
        </div>
      )}
      <Celebrate />

      <nav className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(10px,env(safe-area-inset-bottom,0px))]" aria-label="Sections">
        <div className="dock">
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
                className={`dock-btn ${on ? "dock-on text-white" : "text-[var(--chrome-ink)]"}`}
              >
                <PixelIcon name={t.icon} size={18} color={on ? "#fff" : "#a9b6dc"} />
                {t.label}
                {t.id === "catalog" && freshCount > 0 && (
                  <span className="absolute right-[14%] top-1 min-w-[16px] rounded-full border border-black bg-[#ff4fc3] px-1 font-sans text-[10px] font-extrabold leading-[14px] text-white">
                    {freshCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </main>
  );
}

/** Before the first full gym week: what the gym room is and how close you are. */
function GymLocked() {
  const game = useGame((s) => s.game);
  const today = dateKey(getNow());
  const n = gymCountInWeek(game, mondayOf(today));
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center text-white">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10">
        <PixelIcon name="dumbbell" size={28} color="#ffd23f" />
      </div>
      <h2 className="font-pixel text-[11px] leading-relaxed">Your gym room is waiting</h2>
      <p className="max-w-xs text-[14px] text-white/80">
        Finish one full gym week (4 visits, Monday to Sunday) and a garage gym opens up. Then earn racks, ropes and posters with coins and gym visits.
      </p>
      <div className="flex gap-1.5" aria-label={`${n} of 4 visits this week`}>
        {[0, 1, 2, 3].map((k) => (
          <span key={k} className={`h-3 w-8 rounded-full ${k < n ? "bg-[#ffd23f]" : "bg-white/15"}`} />
        ))}
      </div>
      <p className="font-pixel text-[9px] text-white/70">{Math.min(n, 4)}/4 this week</p>
    </div>
  );
}
