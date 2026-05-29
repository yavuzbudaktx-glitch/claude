import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/agent-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Push: the agent sends file metadata via headers and the raw bytes as the
// request body. Conflict handling uses optimistic concurrency on `version`:
// if the server's current version differs from the agent's base_version AND
// the content actually changed, we preserve both by writing a conflicted copy
// instead of overwriting.
export async function POST(request: Request) {
  const device = await requireDevice(request);
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const path = request.headers.get("x-path");
  const contentHash = request.headers.get("x-content-hash");
  const mime = request.headers.get("x-mime") || "application/octet-stream";
  const baseVersion = Number(request.headers.get("x-base-version") ?? "0") || 0;
  if (!path || !contentHash) {
    return NextResponse.json({ error: "missing x-path or x-content-hash" }, { status: 400 });
  }

  const body = Buffer.from(await request.arrayBuffer());
  const supabase = createServiceClient();
  const userId = device.user_id;

  const { data: existing } = await supabase
    .from("documents")
    .select("id, path, content_hash, version, deleted")
    .eq("user_id", userId)
    .eq("path", path)
    .maybeSingle();

  // No-op: identical content already stored and live.
  if (existing && !existing.deleted && existing.content_hash === contentHash) {
    return NextResponse.json({ status: "unchanged", id: existing.id, version: existing.version });
  }

  // Conflict: server moved on (version differs) AND content genuinely differs.
  let targetPath = path;
  let conflicted = false;
  if (
    existing &&
    !existing.deleted &&
    existing.version !== baseVersion &&
    existing.content_hash !== contentHash
  ) {
    conflicted = true;
    const date = new Date().toISOString().slice(0, 10);
    const dot = path.lastIndexOf(".");
    const safeName = device.name.replace(/[^\w.-]+/g, "_");
    targetPath =
      dot > path.lastIndexOf("/")
        ? `${path.slice(0, dot)} (conflicted copy ${date} from ${safeName})${path.slice(dot)}`
        : `${path} (conflicted copy ${date} from ${safeName})`;
  }

  return writeDocument(supabase, userId, targetPath, contentHash, mime, body, conflicted);
}

async function writeDocument(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  path: string,
  contentHash: string,
  mime: string,
  body: Buffer,
  conflicted: boolean,
) {
  const { data: row, error: upErr } = await supabase
    .from("documents")
    .upsert(
      {
        user_id: userId,
        path,
        content_hash: contentHash,
        size: body.length,
        mime,
        deleted: false,
        rev: 0, // placeholder; set below once we have the id and a fresh rev
      },
      { onConflict: "user_id,path" },
    )
    .select("id, version")
    .single();

  if (upErr || !row) {
    return NextResponse.json({ error: upErr?.message ?? "upsert failed" }, { status: 500 });
  }

  const storageKey = `${userId}/${row.id}`;
  const { error: stErr } = await supabase.storage
    .from("documents")
    .upload(storageKey, body, { contentType: mime, upsert: true });
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 });

  const { data: revData, error: revErr } = await supabase.rpc("next_user_rev", { uid: userId });
  if (revErr) return NextResponse.json({ error: revErr.message }, { status: 500 });

  const { data: final, error: finErr } = await supabase
    .from("documents")
    .update({
      rev: revData as number,
      storage_key: `documents/${storageKey}`,
      version: row.version + 1,
    })
    .eq("id", row.id)
    .eq("user_id", userId)
    .select("id, path, version, rev")
    .single();

  if (finErr || !final) {
    return NextResponse.json({ error: finErr?.message ?? "finalize failed" }, { status: 500 });
  }

  return NextResponse.json({ status: conflicted ? "conflict" : "ok", ...final });
}
