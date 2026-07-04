import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getZuyaMember } from "@/lib/zuya/server";
import { zuyaAccessTokenFor } from "@/lib/zuya/google";
import { insertCalendarEvent } from "@/lib/google/calendar";
import type { ZuyaDateSuggestionRow } from "@/types/zuya";

export const dynamic = "force-dynamic";

const EDITABLE = ["title", "day", "start_at", "end_at", "place", "note"] as const;
type Editable = (typeof EDITABLE)[number];

// PATCH { action: "accept" | "reject" | "counter" | "cancel", fields? }
// Turn-based: only the user in `pending_from` may accept / reject / counter;
// only the other side (whoever proposed the current version) may cancel.
// Accept writes the event into BOTH Google Calendars.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { action?: string; fields?: Partial<Record<Editable, string | null>> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const action = body.action;
  if (!action || !["accept", "reject", "counter", "cancel"].includes(action)) {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data } = await service
    .from("zuya_date_suggestions")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  const sug = data as ZuyaDateSuggestionRow | null;
  if (!sug) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (sug.status !== "pending") {
    return NextResponse.json({ error: "already resolved" }, { status: 409 });
  }

  const isMyTurn = sug.pending_from === auth.userId;
  const { data: partnerRow } = await service
    .from("zuya_members")
    .select("user_id")
    .neq("user_id", auth.userId)
    .maybeSingle();
  const partnerId = partnerRow?.user_id as string | undefined;
  if (!partnerId) return NextResponse.json({ error: "partner missing" }, { status: 409 });

  // ---- cancel: withdrawn by whoever is waiting (not their turn) ------------
  if (action === "cancel") {
    if (isMyTurn) {
      return NextResponse.json(
        { error: "it's your turn — accept, edit or decline instead" },
        { status: 409 },
      );
    }
    await service
      .from("zuya_date_suggestions")
      .update({ status: "cancelled", pending_from: null })
      .eq("id", sug.id)
      .eq("status", "pending");
    await service.from("zuya_notifications").insert({
      user_id: partnerId,
      kind: "date_cancelled",
      payload: { id: sug.id, title: sug.title, day: sug.day },
    });
    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  if (!isMyTurn) {
    return NextResponse.json({ error: "not your turn" }, { status: 409 });
  }

  // ---- reject --------------------------------------------------------------
  if (action === "reject") {
    await service
      .from("zuya_date_suggestions")
      .update({ status: "rejected", pending_from: null })
      .eq("id", sug.id)
      .eq("status", "pending");
    await service.from("zuya_notifications").insert({
      user_id: partnerId,
      kind: "date_rejected",
      payload: { id: sug.id, title: sug.title, day: sug.day },
    });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // ---- counter: edit fields, flip the turn ----------------------------------
  if (action === "counter") {
    const fields = body.fields ?? {};
    const updates: Record<string, string | null> = {};
    const previous: Record<string, unknown> = {};
    for (const k of EDITABLE) {
      if (k in fields && fields[k] !== undefined && fields[k] !== sug[k]) {
        updates[k] = fields[k] ?? null;
        previous[k] = sug[k];
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "nothing changed" }, { status: 400 });
    }
    if ("title" in updates && !(updates.title ?? "").trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    if ("start_at" in updates && (!updates.start_at || isNaN(Date.parse(updates.start_at)))) {
      return NextResponse.json({ error: "invalid start time" }, { status: 400 });
    }

    const historyEntry = { by: auth.userId, at: new Date().toISOString(), fields: previous };
    const { data: updatedRows } = await service
      .from("zuya_date_suggestions")
      .update({
        ...updates,
        pending_from: partnerId,
        history: [...(sug.history ?? []), historyEntry],
      })
      .eq("id", sug.id)
      .eq("status", "pending")
      .eq("pending_from", auth.userId) // concurrency guard: still my turn
      .select("*");
    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json({ error: "not your turn" }, { status: 409 });
    }

    await service.from("zuya_notifications").insert({
      user_id: partnerId,
      kind: "date_countered",
      payload: { id: sug.id, title: (updates.title as string) ?? sug.title, day: updates.day ?? sug.day },
    });
    return NextResponse.json({ ok: true, suggestion: updatedRows[0] });
  }

  // ---- accept: write to BOTH Google Calendars -------------------------------
  const start = new Date(sug.start_at);
  const end = sug.end_at ? new Date(sug.end_at) : new Date(start.getTime() + 2 * 3600_000);
  const gcalIds: Record<string, string> = { ...(sug.gcal_event_ids ?? {}) };
  const warnings: string[] = [];

  const { data: members } = await service.from("zuya_members").select("user_id, username");
  for (const m of members ?? []) {
    const tok = await zuyaAccessTokenFor(m.user_id);
    if ("error" in tok) {
      warnings.push(`${m.username}: Google ${tok.error.replace("_", " ")}`);
      continue;
    }
    try {
      const eventId = await insertCalendarEvent(tok.token, {
        summary: `❤ ${sug.title}`,
        description: [sug.note, "— planned on Zuya"].filter(Boolean).join("\n\n"),
        location: sug.place ?? undefined,
        start: start.toISOString(),
        end: end.toISOString(),
      });
      gcalIds[m.user_id] = eventId;
    } catch {
      warnings.push(`${m.username}: calendar write failed`);
    }
  }

  const { data: acceptedRows } = await service
    .from("zuya_date_suggestions")
    .update({ status: "accepted", pending_from: null, gcal_event_ids: gcalIds })
    .eq("id", sug.id)
    .eq("status", "pending")
    .eq("pending_from", auth.userId)
    .select("*");
  if (!acceptedRows || acceptedRows.length === 0) {
    return NextResponse.json({ error: "not your turn" }, { status: 409 });
  }

  await service.from("zuya_notifications").insert({
    user_id: partnerId,
    kind: "date_accepted",
    payload: { id: sug.id, title: sug.title, day: sug.day, warnings },
  });

  return NextResponse.json({ ok: true, status: "accepted", warnings, gcal_event_ids: gcalIds });
}
