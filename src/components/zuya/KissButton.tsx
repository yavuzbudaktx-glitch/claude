"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Heart } from "lucide-react";
import { useZuya } from "@/components/zuya/ZuyaProvider";

// A time-aware one-tap button: at night it sends an "iyi geceler öpücüğü",
// in the morning a "günaydın", and a plain kiss the rest of the day. Lands as
// a push on your partner's phone.
export function KissButton() {
  const { partner } = useZuya();
  const [hour, setHour] = useState<number | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setHour(new Date().getHours());
    const t = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(t);
  }, []);

  const partnerReal = !!partner?.user_id && partner.user_id !== "pending-partner";
  if (!partnerReal || hour == null) return null;

  const mode = hour >= 19 || hour < 5 ? "night" : hour < 11 ? "morning" : "day";
  const cfg =
    mode === "night"
      ? { Icon: Moon, title: "İyi geceler öpücüğü gönder", text: "İyi geceler öpücüğü 😘🌙" }
      : mode === "morning"
        ? { Icon: Sun, title: "Günaydın gönder", text: "Günaydın aşkım ☀️😘" }
        : { Icon: Heart, title: "Öpücük gönder", text: "Öpücük 😘" };

  async function send() {
    if (sent) return;
    setSent(true);
    fetch("/api/zuya/push/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "kiss", text: cfg.text }),
    }).catch(() => {});
    setTimeout(() => setSent(false), 5000);
  }

  const Icon = sent ? Heart : cfg.Icon;

  return (
    <button
      onClick={() => void send()}
      disabled={sent}
      title={cfg.title}
      aria-label={cfg.title}
      className={`relative grid place-items-center h-9 w-9 rounded-full border transition ${
        sent
          ? "border-transparent text-white"
          : "border-[var(--rule)] bg-[var(--paper)] text-accent hover:border-[var(--accent)]"
      }`}
      style={sent ? { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" } : undefined}
    >
      <Icon className="h-4 w-4" fill={sent ? "currentColor" : "none"} />
    </button>
  );
}
