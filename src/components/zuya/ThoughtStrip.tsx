"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import { zuyaToday } from "@/lib/zuya/day";
import type { ZuyaThoughtRow } from "@/types/zuya";

const COOLDOWN_SEC = 5 * 60;

interface FloatingHeart {
  id: number;
  left: number;
  drift: number;
  spin: number;
  size: number;
}

// "Züleyha bugün seni N kez düşündü 💭" — plus the big button that bumps your
// own count for them (server-enforced: once per 5 minutes).
export function ThoughtStrip() {
  const { me, partner } = useZuya();
  const [rows, setRows] = useState<ZuyaThoughtRow[]>([]);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [hearts, setHearts] = useState<FloatingHeart[]>([]);
  const heartSeq = useRef(0);
  const btnRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/zuya/thoughts");
    if (!res.ok) return;
    const d = await res.json();
    setRows(d.rows ?? []);
    const mine = (d.rows as ZuyaThoughtRow[] | undefined)?.find((r) => r.user_id === me.user_id);
    if (mine?.last_click_at) {
      const left = Math.ceil(
        (new Date(mine.last_click_at).getTime() + COOLDOWN_SEC * 1000 - Date.now()) / 1000,
      );
      if (left > 0) setCooldownLeft(left);
    }
  }, [me.user_id]);

  useEffect(() => {
    void load();
  }, [load]);

  useZuyaTableEvent("zuya_thoughts", (p) => {
    const row = p.new as ZuyaThoughtRow | undefined;
    if (!row || row.day !== zuyaToday()) return;
    setRows((rs) => {
      const rest = rs.filter((r) => r.id !== row.id);
      return [...rest, row];
    });
  });

  // Cooldown ticker.
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = setInterval(() => setCooldownLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldownLeft > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = zuyaToday();
  const partnerCount = rows.find((r) => r.user_id === partner.user_id && r.day === today)?.count ?? 0;
  const myCount = rows.find((r) => r.user_id === me.user_id && r.day === today)?.count ?? 0;

  function burstHearts() {
    const burst: FloatingHeart[] = Array.from({ length: 7 }, () => ({
      id: heartSeq.current++,
      left: 12 + Math.random() * 76,
      drift: (Math.random() - 0.5) * 90,
      spin: (Math.random() - 0.5) * 50,
      size: 12 + Math.random() * 14,
    }));
    setHearts((h) => [...h, ...burst]);
    setTimeout(() => {
      setHearts((h) => h.filter((x) => !burst.some((b) => b.id === x.id)));
    }, 1500);
  }

  async function think() {
    if (cooldownLeft > 0) return;
    burstHearts();
    setCooldownLeft(COOLDOWN_SEC); // optimistic; corrected below on failure
    const res = await fetch("/api/zuya/thoughts", { method: "POST" });
    if (res.status === 429) {
      const d = await res.json().catch(() => ({}));
      setCooldownLeft(d.retryAfterSec ?? COOLDOWN_SEC);
    } else if (!res.ok) {
      setCooldownLeft(0);
    } else {
      void load();
    }
  }

  const mm = Math.floor(cooldownLeft / 60);
  const ss = String(cooldownLeft % 60).padStart(2, "0");

  return (
    <section className="card !p-5 md:!p-6 relative overflow-hidden">
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        <div className="text-center sm:text-left flex-1 min-w-0">
          <p className="label">bugün · today</p>
          <p className="text-ink mt-1.5 text-[17px] md:text-[19px] leading-snug">
            <b className="text-gradient font-display text-[26px] md:text-[30px] align-middle mr-1.5">
              {partnerCount}
            </b>
            {partnerCount === 1 ? "time" : "times"} {partner.display_name} thought about you today 💭
          </p>
          <p className="text-muted text-[12.5px] mt-1">
            You thought about {partner.display_name} <b className="text-ink-soft">{myCount}</b>{" "}
            {myCount === 1 ? "time" : "times"} — seni düşünmek güzel.
          </p>
        </div>

        <div className="relative shrink-0">
          <button
            ref={btnRef}
            onClick={think}
            disabled={cooldownLeft > 0}
            className={`relative inline-flex items-center gap-2.5 px-6 py-4 rounded-full text-[15px] font-semibold text-white transition active:scale-[0.96] disabled:opacity-60 ${
              cooldownLeft > 0 ? "" : "zuya-heartbeat"
            }`}
            style={{
              background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))",
              boxShadow: "0 14px 34px -10px var(--glow)",
            }}
          >
            <Heart className="h-5 w-5" fill="currentColor" />
            {cooldownLeft > 0 ? (
              <span className="tabular-nums">{mm}:{ss}</span>
            ) : (
              <span>Seni düşündüm</span>
            )}
          </button>

          {/* floating hearts burst */}
          {hearts.map((h) => (
            <Heart
              key={h.id}
              className="zuya-heart-float text-accent"
              fill="currentColor"
              style={{
                left: `${h.left}%`,
                bottom: "60%",
                width: h.size,
                height: h.size,
                ["--drift" as string]: `${h.drift}px`,
                ["--spin" as string]: `${h.spin}deg`,
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
