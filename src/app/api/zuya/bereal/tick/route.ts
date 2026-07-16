import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { pushToUser } from "@/lib/zuya/push";
import { zuyaToday, zuyaSeedIdx, ZUYA_TZ } from "@/lib/zuya/day";

export const dynamic = "force-dynamic";

// The Anlık (BeReal) scheduler tick. Deterministically picks a random-feeling
// moment between 8:00 AM and noon (America/Chicago) for each day, and the
// first tick at/after that moment pushes "time to take today's photo" to BOTH
// partners. Idempotent and race-safe (atomic claim on notified_at), and
// cheap — safe to call from the client on every app open AND from a cron.
//
// Unauthenticated by design: it exposes nothing and can only cause the one
// daily notification both partners want anyway.

const WINDOW_START = 8 * 60;   // 8:00 AM
const WINDOW_LEN = 4 * 60;     // → target ∈ [8:00 AM, 11:59 AM]
const TOO_LATE = 13 * 60;      // past 1 PM: skip quietly, card still works

function nowMinutesInTz(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZUYA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

export async function GET() {
  const day = zuyaToday();
  const target = WINDOW_START + zuyaSeedIdx(`${day}-zuya-bereal`, WINDOW_LEN);
  const nowMin = nowMinutesInTz();
  const service = createServiceClient();

  // Ensure the day row exists (idempotent).
  await service.from("zuya_bereal_days").upsert({ day, target_minute: target }, { onConflict: "day", ignoreDuplicates: true });

  if (nowMin < target) {
    return NextResponse.json({ ok: true, state: "waiting", target });
  }

  // Atomic claim: only the tick that flips notified_at from null sends.
  const { data: claimed } = await service
    .from("zuya_bereal_days")
    .update({ notified_at: new Date().toISOString() })
    .eq("day", day)
    .is("notified_at", null)
    .select("day");
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ ok: true, state: "already" });
  }

  // Claimed but the window is long gone (first tick of a lazy afternoon) —
  // stay quiet; a 3 PM "take your morning photo" push is just noise.
  if (nowMin >= TOO_LATE) {
    return NextResponse.json({ ok: true, state: "skipped" });
  }

  const { data: members } = await service.from("zuya_members").select("user_id");
  await Promise.all(
    (members ?? []).flatMap((m) => [
      pushToUser(m.user_id, {
        title: "Anlık 📸",
        body: "Şimdi! İkiniz de çift kamera fotoğrafınızı çekin.",
        url: "/zuya",
        tag: "zuya-bereal",
      }),
      service
        .from("zuya_notifications")
        .insert({ user_id: m.user_id, kind: "bereal_time", payload: { day } })
        .then(() => {}, () => {}),
    ]),
  );

  return NextResponse.json({ ok: true, state: "sent", target });
}
