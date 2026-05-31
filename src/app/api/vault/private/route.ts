import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const hash = (pin: string) => createHash("sha256").update(`docanywhere:${pin}`).digest("hex");

// GET → whether the user has set up a private vault yet.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("vault_private")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ exists: !!data });
}

// POST → create the private vault PIN (first time only). { pin }
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { pin } = (await request.json().catch(() => ({}))) as { pin?: string };
  if (!pin || !/^\d{4,12}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be 4–12 digits" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("vault_private")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "already set" }, { status: 409 });

  const { error } = await supabase
    .from("vault_private")
    .insert({ user_id: user.id, pin_hash: hash(pin) });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok", unlocked: true });
}

// PUT → verify a PIN to unlock. { pin } → { unlocked: boolean }
export async function PUT(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { pin } = (await request.json().catch(() => ({}))) as { pin?: string };
  if (!pin) return NextResponse.json({ error: "missing pin" }, { status: 400 });

  const { data } = await supabase
    .from("vault_private")
    .select("pin_hash")
    .eq("user_id", user.id)
    .maybeSingle();

  const ok = !!data && data.pin_hash === hash(pin);
  return NextResponse.json({ unlocked: ok });
}
