import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Case-insensitive substring search over document paths.
export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ documents: [] });

  const escaped = q.replace(/[%_\\]/g, (m) => `\\${m}`);
  const { data, error } = await supabase
    .from("documents")
    .select("id, path, size, mime, version, updated_at")
    .eq("deleted", false)
    .ilike("path", `%${escaped}%`)
    .order("path", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ documents: data });
}
