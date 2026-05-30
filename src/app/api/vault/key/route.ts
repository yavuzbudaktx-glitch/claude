import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET → the user's master-password material (salt + verifier), or {exists:false}
// if they haven't set one yet.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("vault_keys")
    .select("salt, verifier")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ exists: false });
  return NextResponse.json({ exists: true, salt: data.salt, verifier: data.verifier });
}

// POST → set the master-password material for the first time. Refuses to
// overwrite an existing one (changing it would orphan all existing secrets).
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = await request.json().catch(() => null);
  if (!b?.salt || !b?.verifier) {
    return NextResponse.json({ error: "missing salt/verifier" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("vault_keys")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "already set" }, { status: 409 });

  const { error } = await supabase
    .from("vault_keys")
    .insert({ user_id: user.id, salt: b.salt, verifier: b.verifier });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
