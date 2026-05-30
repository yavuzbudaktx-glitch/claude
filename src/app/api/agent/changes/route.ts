import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/agent-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Pull: return all document rows with rev > `since`, ordered by rev, so the
// agent can apply them in order and advance its cursor to the last rev seen.
export async function GET(request: Request) {
  const device = await requireDevice(request);
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since") ?? "0") || 0;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, path, content_hash, size, mime, version, deleted, rev")
    .eq("user_id", device.user_id) // service-role bypasses RLS — scope explicitly
    .gt("rev", since)
    .order("rev", { ascending: true })
    .limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cursor = data.length ? data[data.length - 1].rev : since;
  return NextResponse.json({ changes: data, cursor });
}
