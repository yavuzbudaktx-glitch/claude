import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Browser upload: raw bytes in the body, target path in x-path. Computes the
// content hash server-side, stores the blob, and registers/updates the row.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const path = request.headers.get("x-path");
  const mime = request.headers.get("x-mime") || "application/octet-stream";
  if (!path) return NextResponse.json({ error: "missing x-path" }, { status: 400 });

  const body = Buffer.from(await request.arrayBuffer());
  if (body.length === 0) return NextResponse.json({ error: "empty body" }, { status: 400 });
  const contentHash = createHash("sha256").update(body).digest("hex");

  const { data: row, error: upErr } = await supabase
    .from("documents")
    .upsert(
      {
        user_id: user.id,
        path,
        content_hash: contentHash,
        size: body.length,
        mime,
        deleted: false,
        rev: 0,
      },
      { onConflict: "user_id,path" },
    )
    .select("id, version")
    .single();
  if (upErr || !row) {
    return NextResponse.json({ error: upErr?.message ?? "upsert failed" }, { status: 500 });
  }

  const storageKey = `${user.id}/${row.id}`;
  const { error: stErr } = await supabase.storage
    .from("documents")
    .upload(storageKey, body, { contentType: mime, upsert: true });
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });

  const { data: revData, error: revErr } = await supabase.rpc("next_user_rev", { uid: user.id });
  if (revErr) return NextResponse.json({ error: revErr.message }, { status: 500 });

  const { data: final, error: finErr } = await supabase
    .from("documents")
    .update({
      rev: revData as number,
      storage_key: `documents/${storageKey}`,
      version: row.version + 1,
    })
    .eq("id", row.id)
    .select("id, path, version, rev")
    .single();
  if (finErr || !final) {
    return NextResponse.json({ error: finErr?.message ?? "finalize failed" }, { status: 500 });
  }
  return NextResponse.json({ status: "ok", ...final });
}
