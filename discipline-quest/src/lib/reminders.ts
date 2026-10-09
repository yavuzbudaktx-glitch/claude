"use client";
import { useEffect } from "react";
import { dateKey, parseHM } from "@/engine/dates";
import { RULES } from "@/engine/rules";
import { useGame } from "@/store/useGame";
import { getNow } from "./clock";

/**
 * Local reminders while the app is open or backgrounded (no push server):
 * wake-up at the target time and the diet check-in at 21:00.
 */
export function useReminders() {
  const enabled = useGame((s) => s.game.settings.notifications);
  const target = useGame((s) => s.game.settings.wakeTarget);

  useEffect(() => {
    if (!enabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const fired = new Set<string>();
    const check = () => {
      const now = getNow();
      const g = useGame.getState().game;
      const day = g.days[dateKey(now)];
      if (!day) return;
      const m = now.getHours() * 60 + now.getMinutes();
      const k = dateKey(now);
      if (day.wake === "pending" && m >= parseHM(target) && m <= parseHM(target) + g.settings.wakeGraceMin && !fired.has(`wake${k}`)) {
        fired.add(`wake${k}`);
        notify("Wake up!", `Check in before ${target} + ${g.settings.wakeGraceMin} min or lose your streak.`);
      }
      if (day.diet === "pending" && now.getHours() >= 21 && now.getHours() >= RULES.diet.checkInFromHour && !fired.has(`diet${k}`)) {
        fired.add(`diet${k}`);
        notify("Diet check-in", "Did you stay on plan today? Check in before midnight.");
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [enabled, target]);
}

async function notify(title: string, body: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: "/icons/icon-192.png", tag: title });
    else new Notification(title, { body, icon: "/icons/icon-192.png" });
  } catch {
    /* notifications are best-effort */
  }
}
