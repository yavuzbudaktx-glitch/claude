import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COLS =
  "id, parent_id, kind, title, url, body, secret_ciphertext, storage_key, mime, size, favorite, hidden, updated_at";
const EDITABLE = ["title", "url", "body", "secret_ciphertext", "parent_id", "favorite", "hidden"] as const;

// Edit an item's fields (RLS scopes to the owner).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in b) patch[k] = b[k];
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("vault_items")
    .update(patch)
    .eq("id", params.id)
    .select(COLS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

// Delete an item. Folders cascade in the DB; file blobs are removed from Storage first.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: rows } = await supabase
    .from("vault_items")
    .select("id, storage_key")
    .or(`id.eq.${params.id},parent_id.eq.${params.id}`);

  const keys = (rows ?? [])
    .map((r) => (r.storage_key ? r.storage_key.replace(/^vault\//, "") : null))
    .filter((k): k is string => !!k);
  if (keys.length) await supabase.storage.from("vault").remove(keys);

  const { error } = await supabase.from("vault_items").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
