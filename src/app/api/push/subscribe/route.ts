import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { PUSH_SUBS_TABLE, pushConfigured } from "@/lib/push";

// Register (or drop) this device for Rest Area notifications. Same device
// registry Zuya uses — one PushSubscription per browser — but authenticated as
// the ordinary dashboard user rather than as a Zuya member.

export const dynamic = "force-dynamic";

async function currentUserId(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!pushConfigured()) {
    return NextResponse.json(
      { error: "Push isn't configured on the server (VAPID keys missing)." },
      { status: 503 },
    );
  }

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
  const { error } = await service.from(PUSH_SUBS_TABLE).upsert(
    { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  if (!body.endpoint) return NextResponse.json({ error: "no endpoint" }, { status: 400 });
  const service = createServiceClient();
  await service.from(PUSH_SUBS_TABLE).delete().eq("endpoint", body.endpoint).eq("user_id", userId);
  return NextResponse.json({ ok: true });
}
