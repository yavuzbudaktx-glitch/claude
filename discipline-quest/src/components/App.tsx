"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/store/useGame";
import { useReminders } from "@/lib/reminders";
import { isClockShifted, getNow } from "@/lib/clock";
import Hud from "./Hud";
import Room from "./Room";
import Today from "./Today";
import Shop from "./Shop";
import Stats from "./Stats";
import Settings from "./Settings";

const TABS = ["Today", "Shop", "Stats", "Settings"] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const tick = useGame((s) => s.tick);
  const [tab, setTab] = useState<Tab>("Today");
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

  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col gap-3 px-3 pb-24 pt-[max(12px,env(safe-area-inset-top))]">
      {isClockShifted() && (
        <div className="chip self-start bg-[#ffe680]">Test clock: {getNow().toLocaleString()}</div>
      )}
      <Hud />
      <div className="panel overflow-hidden">
        <div className="bg-[#232a46]">
          <Room />
        </div>
      </div>
      {tab === "Today" && <Today />}
      {tab === "Shop" && <Shop />}
      {tab === "Stats" && <Stats />}
      {tab === "Settings" && <Settings />}

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-black bg-[#232a46] pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-[720px] grid-cols-4">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-3 font-pixel text-[10px] uppercase ${tab === t ? "bg-[var(--head)] text-white" : "text-[#9fb0d8]"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
