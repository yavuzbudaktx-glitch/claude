import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashToken } from "@/lib/agent-auth";

export const dynamic = "force-dynamic";

// List the user's devices (never returns token material).
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("devices")
    .select("id, name, platform, sync_cursor, last_seen_at, revoked, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ devices: data });
}

// Create a device. Returns the raw bearer token exactly once; only its hash is
// stored. The user pastes the token into the agent's config.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { name, platform } = await request.json().catch(() => ({}));
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "missing name" }, { status: 400 });
  }

  const token = randomBytes(32).toString("base64url");
  const { data, error } = await supabase
    .from("devices")
    .insert({
      user_id: user.id,
      name,
      platform: typeof platform === "string" ? platform : null,
      token_hash: hashToken(token),
    })
    .select("id, name, platform, created_at")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "create failed" }, { status: 500 });
  }
  return NextResponse.json({ device: data, token });
}

// Revoke a device by id (soft — keeps the row for audit).
export async function DELETE(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { error } = await supabase.from("devices").update({ revoked: true }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "revoked" });
}
