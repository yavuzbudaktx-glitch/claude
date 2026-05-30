import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Mint a short-lived signed URL for a vault file the user owns. `inline=1`
// previews in-browser (photos); otherwise it downloads.
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const inline = url.searchParams.get("inline") === "1";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const { data: item } = await supabase
    .from("vault_items")
    .select("id, title, kind")
    .eq("id", id)
    .maybeSingle();
  if (!item || item.kind !== "file") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from("vault")
    .createSignedUrl(`${user.id}/${id}`, 300, inline ? {} : { download: item.title || true });

  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? "sign failed" }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl });
}
