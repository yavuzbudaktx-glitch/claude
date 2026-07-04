import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getZuyaMember } from "@/lib/zuya/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: row } = await service
    .from("zuya_google_tokens")
    .select("refresh_token")
    .eq("user_id", auth.userId)
    .maybeSingle();

  // Best-effort revoke at Google, then forget the token either way.
  if (row?.refresh_token) {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: row.refresh_token }),
      });
    } catch {
      // non-fatal
    }
  }

  await service.from("zuya_google_tokens").delete().eq("user_id", auth.userId);
  await service
    .from("zuya_members")
    .update({ google_connected: false })
    .eq("user_id", auth.userId);

  return NextResponse.json({ ok: true });
}
