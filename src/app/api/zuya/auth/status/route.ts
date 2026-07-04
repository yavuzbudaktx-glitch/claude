import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ZUYA_USERNAMES } from "@/lib/zuya/config";

export const dynamic = "force-dynamic";

// Which of the two usernames have completed first-time registration. Booleans
// only — safe to expose unauthenticated (the login page needs it to decide
// between "set your password" and "enter your password").
export async function GET() {
  const service = createServiceClient();
  const { data, error } = await service.from("zuya_members").select("username");
  if (error) {
    return NextResponse.json({ error: "status unavailable" }, { status: 500 });
  }
  const taken = new Set((data ?? []).map((r) => r.username as string));
  const out: Record<string, boolean> = {};
  for (const u of ZUYA_USERNAMES) out[u] = taken.has(u);
  return NextResponse.json(out);
}
