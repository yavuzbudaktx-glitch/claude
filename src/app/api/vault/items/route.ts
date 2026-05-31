import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLS =
  "id, parent_id, kind, title, url, body, secret_ciphertext, storage_key, mime, size, favorite, hidden, updated_at";

// List the user's vault items. Hidden (private-vault) items are excluded unless
// the request carries the unlocked flag (?private=1), which the client only
// sends after the PIN has been verified this session.
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const includePrivate = new URL(request.url).searchParams.get("private") === "1";

  let query = supabase
    .from("vault_items")
    .select(COLS)
    .order("kind", { ascending: true })
    .order("title", { ascending: true });
  if (!includePrivate) query = query.eq("hidden", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

// Create a non-file item: folder | link | note | secret.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = await request.json().catch(() => null);
  if (!b || !["folder", "link", "note", "secret"].includes(b.kind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  if (!b.title || typeof b.title !== "string") {
    return NextResponse.json({ error: "missing title" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("vault_items")
    .insert({
      user_id: user.id,
      parent_id: b.parent_id ?? null,
      kind: b.kind,
      title: b.title.trim(),
      url: b.url ?? null,
      body: b.body ?? null,
      secret_ciphertext: b.secret_ciphertext ?? null,
      hidden: b.hidden === true,
    })
    .select(COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
