"use client";

import { useEffect, useMemo, useState } from "react";
import { Dumbbell } from "lucide-react";
import { Card } from "@/components/Card";
import { CityPicker } from "@/components/CityPicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ThemeVariantButton } from "@/components/ThemeVariantButton";
import { usePref } from "@/components/PrefsProvider";
import { createClient } from "@/lib/supabase/client";
import {
  GYM_PREF_KEY,
  DEFAULT_GYM,
  ROLLOVER_PREF_KEY,
  DEFAULT_ROLLOVER_HOUR,
  GYM_CYCLE,
  gymLabel,
  isGymDay,
  WEEKDAYS_SHORT,
  MON_FIRST_ORDER,
  type GymSchedule,
  type GymDay,
} from "@/lib/dashboard/settings";

// The four gym states cycle on tap; give each a look.
function dayStyle(v: GymDay): { className: string; style?: React.CSSProperties } {
  if (v === "off") return { className: "text-muted border-[var(--rule)] bg-transparent" };
  return {
    className: "text-white border-transparent",
    style: { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" },
  };
}

function GymScheduleSection() {
  const [gym, setGym] = usePref<GymSchedule>(GYM_PREF_KEY, DEFAULT_GYM);
  const schedule = gym ?? DEFAULT_GYM;

  function cycle(day: number) {
    const cur = schedule[day] ?? "off";
    const next = GYM_CYCLE[(GYM_CYCLE.indexOf(cur) + 1) % GYM_CYCLE.length];
    setGym({ ...schedule, [day]: next });
  }

  const gymCount = MON_FIRST_ORDER.filter((d) => isGymDay(schedule[d] ?? "off")).length;

  return (
    <div>
      <p className="text-[13px] text-muted mb-3">
        Tap a day to cycle Rest → Gym → Workout A → Workout B. Today&apos;s plan shows on the Body card.
      </p>
      <div className="grid grid-cols-7 gap-1.5">
        {MON_FIRST_ORDER.map((day) => {
          const v = schedule[day] ?? "off";
          const s = dayStyle(v);
          return (
            <button
              key={day}
              onClick={() => cycle(day)}
              className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 transition ${s.className}`}
              style={s.style}
              title={gymLabel(v)}
            >
              <span className="text-[10px] uppercase tracking-wider opacity-80">
                {WEEKDAYS_SHORT[day]}
              </span>
              <span className="text-[13px] font-semibold leading-none">
                {v === "off" ? "·" : v === "gym" ? <Dumbbell className="h-3.5 w-3.5" /> : v}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[12px] text-muted mt-3">
        {gymCount === 0 ? "No gym days set." : `${gymCount} gym ${gymCount === 1 ? "day" : "days"} a week.`}
      </p>
    </div>
  );
}

function NutritionSection() {
  const supabase = useMemo(() => createClient(), []);
  const [rolloverHour, setRolloverHour] = usePref<number>(ROLLOVER_PREF_KEY, DEFAULT_ROLLOVER_HOUR);
  const [userId, setUserId] = useState<string | null>(null);
  const [calorieGoal, setCalorieGoal] = useState("");
  const [proteinGoal, setProteinGoal] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid) return;
      const { data } = await supabase
        .from("body_profile")
        .select("data")
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;
      const blob = (data?.data ?? {}) as { calorieGoal?: string; proteinGoal?: string };
      setCalorieGoal(typeof blob.calorieGoal === "string" ? blob.calorieGoal : "");
      setProteinGoal(typeof blob.proteinGoal === "string" ? blob.proteinGoal : "");
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  async function saveGoals() {
    if (!userId) {
      setMsg("Sign in to save goals across devices.");
      return;
    }
    setBusy(true);
    setMsg(null);
    // Read-merge-write so we only change the two goal fields and never wipe
    // weight history / today's counts held in the same blob.
    const { data } = await supabase
      .from("body_profile")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();
    const blob = (data?.data ?? {}) as Record<string, unknown>;
    const merged = { ...blob, calorieGoal: calorieGoal.trim(), proteinGoal: proteinGoal.trim() };
    const { error } = await supabase
      .from("body_profile")
      .upsert({ user_id: userId, data: merged, updated_at: new Date().toISOString() });
    setMsg(error ? error.message : "Saved.");
    setBusy(false);
  }

  const field =
    "w-24 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 text-sm font-mono tabular-nums outline-none focus:ring-2 focus:ring-[var(--accent)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-5">
        <label className="block">
          <span className="label mb-1.5 block">Calorie goal</span>
          <div className="flex items-baseline gap-2">
            <input type="number" inputMode="numeric" value={calorieGoal} placeholder="2200"
              onChange={(e) => setCalorieGoal(e.target.value)} className={field} />
            <span className="text-[11px] text-muted">kcal/day</span>
          </div>
        </label>
        <label className="block">
          <span className="label mb-1.5 block">Protein goal</span>
          <div className="flex items-baseline gap-2">
            <input type="number" inputMode="numeric" value={proteinGoal} placeholder="160"
              onChange={(e) => setProteinGoal(e.target.value)} className={field} />
            <span className="text-[11px] text-muted">g/day</span>
          </div>
        </label>
        <button
          onClick={saveGoals}
          disabled={busy}
          className="px-4 py-2 rounded-xl text-[13px] font-semibold border border-[var(--rule)] hover:border-[var(--accent)] transition disabled:opacity-50"
        >
          Save goals
        </button>
      </div>
      {msg && <p className="text-[12px] text-muted">{msg}</p>}

      <div className="pt-4 border-t rule">
        <span className="label mb-1.5 block">Daily reset hour</span>
        <p className="text-[12px] text-muted mb-2">
          When the nutrition day rolls over — a late-night snack before this hour still counts toward the day before.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="range" min={0} max={11} value={rolloverHour}
            onChange={(e) => setRolloverHour(Number(e.target.value))}
            className="flex-1 accent-[var(--accent)]"
          />
          <span className="w-16 text-right font-mono text-sm text-ink tabular-nums">
            {rolloverHour === 0 ? "12 AM" : `${rolloverHour} AM`}
          </span>
        </div>
      </div>
    </div>
  );
}

export function DashboardSettings() {
  return (
    <div className="space-y-5">
      <Card title="Gym · week schedule" collapsible={false}>
        <GymScheduleSection />
      </Card>

      <Card title="Nutrition & body" collapsible={false}>
        <NutritionSection />
      </Card>

      <Card title="Location & weather" collapsible={false}>
        <p className="text-[13px] text-muted mb-3">
          Sets the city for weather and prayer times across the dashboard.
        </p>
        <CityPicker />
      </Card>

      <Card title="Appearance" collapsible={false}>
        <div className="flex items-center gap-3">
          <ThemeVariantButton />
          <ThemeToggle />
          <span className="text-[13px] text-muted">Theme &amp; light/dark. Applies everywhere.</span>
        </div>
      </Card>
    </div>
  );
}
