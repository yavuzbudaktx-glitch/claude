import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/agent-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Soft-delete (tombstone) a document by path so the deletion propagates to
// other devices on their next pull. The blob is left for a later GC pass.
export async function POST(request: Request) {
  const device = await requireDevice(request);
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { path } = await request.json().catch(() => ({ path: null }));
  if (!path) return NextResponse.json({ error: "missing path" }, { status: 400 });

  const supabase = createServiceClient();
  const userId = device.user_id;

  const { data: existing } = await supabase
    .from("documents")
    .select("id, deleted")
    .eq("user_id", userId)
    .eq("path", path)
    .maybeSingle();

  if (!existing || existing.deleted) {
    return NextResponse.json({ status: "noop" });
  }

  const { data: revData, error: revErr } = await supabase.rpc("next_user_rev", { uid: userId });
  if (revErr) return NextResponse.json({ error: revErr.message }, { status: 500 });

  const { data: row, error } = await supabase
    .from("documents")
    .update({ deleted: true, content_hash: null, rev: revData as number })
    .eq("id", existing.id)
    .eq("user_id", userId)
    .select("id, path, rev")
    .single();

  if (error || !row) {
    return NextResponse.json({ error: error?.message ?? "delete failed" }, { status: 500 });
  }
  return NextResponse.json({ status: "deleted", ...row });
}
