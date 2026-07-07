"use client";

import { useEffect, useState } from "react";

// A 💋 button. The first tap of the morning sends a "Günaydın", the first tap
// of the night sends an "İyi geceler öpücüğü", and every tap after that (until
// the period flips) just sends kisses. State is remembered per day+period so
// the greeting only fires once.
function periodOf(hour: number): "morning" | "night" | "day" {
  if (hour >= 19 || hour < 5) return "night";
  if (hour < 11) return "morning";
  return "day";
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function KissButton() {
  const [hour, setHour] = useState<number | null>(null);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    setHour(new Date().getHours());
    const t = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (hour == null) return null;

  const period = periodOf(hour);

  async function send() {
    let text = "Öpücük 💋";
    if (period === "morning" || period === "night") {
      const key = `zuya.greet.${period}.${todayKey()}`;
      const alreadyGreeted = typeof window !== "undefined" && localStorage.getItem(key);
      if (!alreadyGreeted) {
        text = period === "morning" ? "Günaydın aşkım ☀️💋" : "İyi geceler öpücüğü 🌙💋";
        try { localStorage.setItem(key, "1"); } catch {}
      }
    }
    setPop(true);
    setTimeout(() => setPop(false), 600);
    fetch("/api/zuya/push/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "kiss", text }),
    }).catch(() => {});
  }

  return (
    <button
      onClick={() => void send()}
      title="Öpücük gönder"
      aria-label="Send a kiss"
      className={`grid place-items-center h-9 w-9 rounded-full border border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--accent)] transition ${
        pop ? "scale-125" : "scale-100"
      }`}
      style={{ transitionDuration: "180ms" }}
    >
      <span className="text-[17px] leading-none" aria-hidden>💋</span>
    </button>
  );
}
