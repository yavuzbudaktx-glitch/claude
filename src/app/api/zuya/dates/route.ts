import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getZuyaMember } from "@/lib/zuya/server";
import { pushToUser } from "@/lib/zuya/push";

export const dynamic = "force-dynamic";

// GET: all suggestions, newest first (clients also select directly under RLS;
// this exists for symmetry with POST and returns the same shape).
export async function GET() {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data } = await service
    .from("zuya_date_suggestions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  return NextResponse.json({ suggestions: data ?? [] });
}

// POST: propose a date. The partner becomes `pending_from` (their turn) and
// gets a notification.
export async function POST(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: {
    title?: string;
    day?: string;
    start_at?: string;
    end_at?: string | null;
    place?: string | null;
    note?: string | null;
    bucket_item_id?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title || title.length > 200) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  if (!body.day || !body.start_at || isNaN(Date.parse(body.start_at))) {
    return NextResponse.json({ error: "day and start time required" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: partner } = await service
    .from("zuya_members")
    .select("user_id")
    .neq("user_id", auth.userId)
    .maybeSingle();
  if (!partner) {
    return NextResponse.json({ error: "partner hasn't joined yet" }, { status: 409 });
  }

  const { data: row, error } = await service
    .from("zuya_date_suggestions")
    .insert({
      proposer_id: auth.userId,
      pending_from: partner.user_id,
      status: "pending",
      title,
      day: body.day,
      start_at: body.start_at,
      end_at: body.end_at ?? null,
      place: body.place?.trim() || null,
      note: body.note?.trim() || null,
      bucket_item_id: body.bucket_item_id ?? null,
    })
    .select("*")
    .single();
  if (error || !row) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  }

  await service.from("zuya_notifications").insert({
    user_id: partner.user_id,
    kind: "date_suggested",
    payload: { id: row.id, title: row.title, day: row.day },
  });

  await pushToUser(partner.user_id, {
    title: auth.member.display_name,
    body: `Buluşma teklifi: ${row.title}`,
    url: "/zuya",
    tag: "zuya-date",
  });

  return NextResponse.json({ suggestion: row });
}
