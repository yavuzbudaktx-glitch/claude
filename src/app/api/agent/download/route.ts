import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/agent-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Return a short-lived signed URL for a document blob. Agent downloads the
// bytes directly from Storage.
export async function GET(request: Request) {
  const device = await requireDevice(request);
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const supabase = createServiceClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, deleted")
    .eq("user_id", device.user_id)
    .eq("id", id)
    .maybeSingle();

  if (!doc || doc.deleted) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(`${device.user_id}/${id}`, 300);

  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "sign failed" }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl });
}
