import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getZuyaMember } from "@/lib/zuya/server";

export const dynamic = "force-dynamic";

// Save (or refresh) this device's push subscription for the signed-in member.
export async function POST(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from("zuya_push_subs").upsert(
    { user_id: auth.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Remove this device's subscription (turn notifications off).
export async function DELETE(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  if (!body.endpoint) return NextResponse.json({ error: "no endpoint" }, { status: 400 });
  const service = createServiceClient();
  await service.from("zuya_push_subs").delete().eq("endpoint", body.endpoint).eq("user_id", auth.userId);
  return NextResponse.json({ ok: true });
}
