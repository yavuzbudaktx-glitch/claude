import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getZuyaMember } from "@/lib/zuya/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const service = createServiceClient();
  await service.from("zuya_pinterest_tokens").delete().eq("user_id", auth.userId);
  await service.from("zuya_members").update({ pinterest_connected: false }).eq("user_id", auth.userId);
  return NextResponse.json({ ok: true });
}
