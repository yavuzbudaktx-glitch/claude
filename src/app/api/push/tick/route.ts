import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { pushToUser, pushConfigured, type PushPayload } from "@/lib/push";
import { supaGet, fetchTasks, fetchBesiktasNext, type DigestEnv } from "@/lib/digest/shared";

// The scheduler behind Rest Area notifications.
//
// Web Push has no "deliver this later" — a notification is sent the moment you
// call the push service. So something has to wake up periodically and ask
// what's due. That's this endpoint, called by .github/workflows/push-tick.yml.
//
// Every send is written to `push_log` with a slot key describing the THING
// being announced ("2026-08-26:asr"), not the time it went out. The unique
// constraint then makes a duplicate send impossible no matter how often, or how
// erratically, the tick runs — which matters, because GitHub's scheduler is
// best-effort and will happily fire twice in a minute or skip half an hour.
//
// Auth: set PUSH_TICK_SECRET and pass ?token=… to lock it down. Without the env
// var the endpoint is open, which is safe by construction — it only ever sends
// what is genuinely due, and the ledger means calling it repeatedly does
// nothing at all.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** How late a scheduled moment may be picked up, in minutes. Must exceed the
 *  cron interval so a moment is never skipped between two ticks. */
const WINDOW_MIN = 20;

/** Local hour for the once-a-day notifications. */
const MORNING_HOUR = 8;

interface PushEnv { supaUrl: string; supaServiceKey: string; userId: string }

function readPushEnv(): PushEnv | null {
  const supaUrl = process.env.SUPABASE_URL ?? "";
  const supaServiceKey = process.env.SUPABASE_SERVICE_KEY ?? "";
  const userId = process.env.DIGEST_USER_ID ?? "";
  if (!supaUrl || !supaServiceKey || !userId) return null;
  return { supaUrl, supaServiceKey, userId };
}

/** supaGet/fetchTasks only ever touch the Supabase fields, so the mail-related
 *  half of DigestEnv is irrelevant here. */
function asDigestEnv(e: PushEnv): DigestEnv {
  return { ...e, resendKey: "", from: "", to: "" };
}

/* ------------------------------------------------------------ helpers ---- */

/** Minutes past local midnight, and the local YYYY-MM-DD, in a given zone. */
function localNow(timeZone: string): { minutes: number; dateKey: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  // en-CA formats midnight as 24 in some runtimes; normalise it to 0.
  const hour = Number(get("hour")) % 24;
  return {
    minutes: hour * 60 + Number(get("minute")),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

/** "17:42" or "17:42 (+03)" → minutes past midnight. */
function hhmmToMinutes(s: string): number | null {
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** True when `target` has just passed — within the tick window, never before. */
function isDue(nowMinutes: number, target: number): boolean {
  const delta = nowMinutes - target;
  return delta >= 0 && delta < WINDOW_MIN;
}

/* -------------------------------------------------------------- sources -- */

interface PrayerResp {
  data?: {
    timings?: Record<string, string>;
    meta?: { timezone?: string };
  };
}

const PRAYERS: Array<{ key: string; label: string }> = [
  { key: "Fajr", label: "Fajr" },
  { key: "Dhuhr", label: "Dhuhr" },
  { key: "Asr", label: "Asr" },
  { key: "Maghrib", label: "Maghrib" },
  { key: "Isha", label: "Isha" },
];

async function fetchPrayer(lat: number, lon: number): Promise<PrayerResp["data"] | null> {
  try {
    const r = await fetch(
      `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lon}&method=2`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return null;
    return ((await r.json()) as PrayerResp).data ?? null;
  } catch {
    return null;
  }
}

/** Today's UFC card, read from our own route (which already filters to the big
 *  events). The digest helper can't be reused — it expects `upcoming` to be an
 *  array, and the route returns a single event. */
async function fetchUpcomingUfc(origin: string): Promise<{ name: string; date: string } | null> {
  try {
    const r = await fetch(`${origin}/api/ufc`, { cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { upcoming?: { shortName?: string; name?: string; date?: string } | null };
    const ev = j.upcoming;
    if (!ev?.date) return null;
    return { name: ev.shortName ?? ev.name ?? "UFC", date: ev.date };
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------- main -- */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.PUSH_TICK_SECRET;
  if (secret && url.searchParams.get("token") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }

  const env = readPushEnv();
  if (!env) {
    return NextResponse.json({ ok: false, error: "missing SUPABASE_URL / SUPABASE_SERVICE_KEY / DIGEST_USER_ID" }, { status: 500 });
  }
  if (!pushConfigured()) {
    return NextResponse.json({ ok: false, error: "missing VAPID keys" }, { status: 500 });
  }

  const dEnv = asDigestEnv(env);
  const settings = await supaGet<{ prefs: Record<string, unknown> | null; weather_lat: number | null; weather_lon: number | null }>(
    dEnv, "user_settings", `select=prefs,weather_lat,weather_lon&user_id=eq.${env.userId}&limit=1`,
  );
  const prefs = settings[0]?.prefs ?? {};
  const on = (key: string, dflt = true): boolean => {
    const v = prefs[key];
    return typeof v === "boolean" ? v : dflt;
  };
  // The master switch. Everything else is opt-out.
  if (!on("notifyEnabled", false)) {
    return NextResponse.json({ ok: true, skipped: "notifications off" });
  }

  const lat = settings[0]?.weather_lat ?? 32.7767;   // Dallas
  const lon = settings[0]?.weather_lon ?? -96.797;

  const service = createServiceClient();
  const sent: string[] = [];
  const problems: string[] = [];

  /** Send once, ever, for this (kind, slot). The ledger insert is the lock: if
   *  it conflicts, another tick already announced this and we stay quiet.
   *
   *  The insert deliberately comes BEFORE the send — a notification that goes
   *  missing is better than one that arrives on every tick for 20 minutes. */
  async function announce(kind: string, slot: string, payload: PushPayload) {
    const { error } = await service.from("push_log").insert({ user_id: env!.userId, kind, slot });
    if (error) {
      // 23505 is the unique violation, i.e. "already announced" — the normal
      // case. Anything else is a real fault (most likely migration 0027 hasn't
      // been run) and would otherwise silence every notification forever with
      // no visible symptom.
      if (error.code !== "23505") problems.push(`${kind}: ${error.message}`);
      return;
    }
    const n = await pushToUser(env!.userId, payload);
    sent.push(`${kind}:${slot}${n ? "" : " (no devices)"}`);
  }

  const origin = `${url.protocol}//${url.host}`;

  // ---- prayer times -------------------------------------------------------
  let timeZone = "America/Chicago";
  if (on("notifyPrayer")) {
    const data = await fetchPrayer(lat, lon);
    if (data?.timings) {
      timeZone = data.meta?.timezone ?? timeZone;
      const { minutes, dateKey } = localNow(timeZone);
      for (const p of PRAYERS) {
        const raw = data.timings[p.key];
        const at = raw ? hhmmToMinutes(raw) : null;
        if (at == null || !isDue(minutes, at)) continue;
        await announce("prayer", `${dateKey}:${p.key.toLowerCase()}`, {
          title: `${p.label} — ${raw!.match(/\d{1,2}:\d{2}/)?.[0] ?? ""}`,
          body: "Time to pray.",
          url: "/dashboard#sec-prayer",
          tag: `prayer-${p.key}`,
        });
      }
    }
  }

  const { minutes: nowMin, dateKey } = localNow(timeZone);
  const morningDue = isDue(nowMin, MORNING_HOUR * 60);

  // ---- tasks due today ----------------------------------------------------
  if (on("notifyTasks") && morningDue) {
    const tasks = await fetchTasks(dEnv);
    const open = tasks.filter((t) => t.status !== "done" && !t.completed && t.due);
    const overdue = open.filter((t) => (t.due ?? "") < dateKey);
    const today = open.filter((t) => (t.due ?? "").slice(0, 10) === dateKey);
    if (overdue.length || today.length) {
      const bits = [
        today.length ? `${today.length} due today` : null,
        overdue.length ? `${overdue.length} overdue` : null,
      ].filter(Boolean);
      await announce("tasks", dateKey, {
        title: `Tasks — ${bits.join(", ")}`,
        // Name the first couple so the notification is useful without opening it.
        body: [...today, ...overdue].slice(0, 3).map((t) => t.title).join(" · "),
        url: "/dashboard#sec-tasks",
        tag: "tasks",
      });
    }
  }

  // ---- Beşiktaş kickoff ---------------------------------------------------
  if (on("notifyBesiktas")) {
    const next = await fetchBesiktasNext(origin);
    const kickoff = next ? Date.parse(next.date) : NaN;
    if (next && Number.isFinite(kickoff)) {
      const minsUntil = (kickoff - Date.now()) / 60000;
      // First tick inside the last two hours wins; the ledger silences the rest.
      if (minsUntil > 0 && minsUntil <= 120) {
        await announce("besiktas", next.date, {
          title: `${next.home} vs ${next.away}`,
          body: `Kick-off in ${Math.max(1, Math.round(minsUntil))} min.`,
          url: "/dashboard#sec-superlig",
          tag: "besiktas",
        });
      }
    }
  }

  // ---- UFC event day ------------------------------------------------------
  if (on("notifyUfc") && morningDue) {
    const ufc = await fetchUpcomingUfc(origin);
    if (ufc) {
      const evDay = localNow(timeZone).dateKey;
      const eventDay = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
        .format(new Date(ufc.date));
      if (eventDay === evDay) {
        await announce("ufc", eventDay, {
          title: `${ufc.name} is tonight`,
          body: "Main card today.",
          url: "/dashboard#sec-ufc",
          tag: "ufc",
        });
      }
    }
  }

  return NextResponse.json({
    ok: problems.length === 0,
    sent,
    ...(problems.length ? { problems } : {}),
    at: new Date().toISOString(),
  });
}
