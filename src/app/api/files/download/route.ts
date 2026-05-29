import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Mint a short-lived signed URL for a document the user owns. RLS on the
// documents lookup and the Storage policy both enforce ownership.
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { data: doc } = await supabase
    .from("documents")
    .select("id, path, deleted")
    .eq("id", id)
    .maybeSingle();
  if (!doc || doc.deleted) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(`${user.id}/${id}`, 300, {
      download: doc.path.split("/").pop() || true,
    });

  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "sign failed" }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl });
}
