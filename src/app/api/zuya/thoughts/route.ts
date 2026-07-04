import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getZuyaMember } from "@/lib/zuya/server";
import { zuyaToday } from "@/lib/zuya/day";

export const dynamic = "force-dynamic";

const COOLDOWN_MS = 5 * 60 * 1000;

// GET: today's counts for both of us (the client also live-updates via
// realtime; this is the initial load).
export async function GET() {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data } = await service
    .from("zuya_thoughts")
    .select("user_id, day, count, last_click_at")
    .eq("day", zuyaToday());
  return NextResponse.json({ day: zuyaToday(), rows: data ?? [] });
}

// POST: "I thought of you" — one increment per 5 minutes, enforced here with
// an atomic conditional update so it can't be bypassed or raced.
export async function POST() {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const day = zuyaToday();
  const now = new Date();

  // Ensure today's row exists (no-op when it does).
  const { error: upsertErr } = await service
    .from("zuya_thoughts")
    .upsert(
      { user_id: auth.userId, day, count: 0 },
      { onConflict: "user_id,day", ignoreDuplicates: true },
    );
  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  // Read the current row, then do a conditional bump keyed on the exact
  // last_click_at we read — a second racer's update matches 0 rows.
  const { data: row } = await service
    .from("zuya_thoughts")
    .select("id, count, last_click_at")
    .eq("user_id", auth.userId)
    .eq("day", day)
    .single();
  if (!row) return NextResponse.json({ error: "row missing" }, { status: 500 });

  const last = row.last_click_at ? new Date(row.last_click_at).getTime() : 0;
  const elapsed = now.getTime() - last;
  if (elapsed < COOLDOWN_MS) {
    return NextResponse.json(
      { error: "cooldown", retryAfterSec: Math.ceil((COOLDOWN_MS - elapsed) / 1000) },
      { status: 429 },
    );
  }

  let bump = service
    .from("zuya_thoughts")
    .update({ count: row.count + 1, last_click_at: now.toISOString() })
    .eq("id", row.id);
  bump = row.last_click_at === null
    ? bump.is("last_click_at", null)
    : bump.eq("last_click_at", row.last_click_at);
  const { data: updated } = await bump.select("count, last_click_at");

  if (!updated || updated.length === 0) {
    // Lost a race with another click from the same user — treat as cooldown.
    return NextResponse.json(
      { error: "cooldown", retryAfterSec: Math.ceil(COOLDOWN_MS / 1000) },
      { status: 429 },
    );
  }

  return NextResponse.json({ ok: true, count: updated[0].count, day });
}
