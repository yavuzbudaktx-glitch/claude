import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Upload a file/photo into the vault: raw bytes in the body, metadata in headers.
// Creates the row first to mint an id, stores the blob at vault/{user}/{id},
// then records the storage key.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const title = request.headers.get("x-title") || "Untitled";
  const mime = request.headers.get("x-mime") || "application/octet-stream";
  const parentHeader = request.headers.get("x-parent");
  const parent_id = parentHeader && parentHeader !== "null" ? parentHeader : null;

  const body = Buffer.from(await request.arrayBuffer());
  if (body.length === 0) return NextResponse.json({ error: "empty body" }, { status: 400 });

  const { data: row, error: insErr } = await supabase
    .from("vault_items")
    .insert({ user_id: user.id, parent_id, kind: "file", title, mime, size: body.length })
    .select("id")
    .single();
  if (insErr || !row) {
    return NextResponse.json({ error: insErr?.message ?? "insert failed" }, { status: 500 });
  }

  const storageKey = `${user.id}/${row.id}`;
  const { error: stErr } = await supabase.storage
    .from("vault")
    .upload(storageKey, body, { contentType: mime, upsert: true });
  if (stErr) {
    await supabase.from("vault_items").delete().eq("id", row.id);
    return NextResponse.json({ error: stErr.message }, { status: 500 });
  }

  const { data: final, error: finErr } = await supabase
    .from("vault_items")
    .update({ storage_key: `vault/${storageKey}` })
    .eq("id", row.id)
    .select("id, parent_id, kind, title, url, body, secret_ciphertext, storage_key, mime, size, updated_at")
    .single();
  if (finErr || !final) {
    return NextResponse.json({ error: finErr?.message ?? "finalize failed" }, { status: 500 });
  }
  return NextResponse.json({ item: final });
}
