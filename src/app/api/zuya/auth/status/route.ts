import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ZUYA_USERNAMES } from "@/lib/zuya/config";

export const dynamic = "force-dynamic";

// Which of the two usernames have completed first-time registration — plus,
// when the backend isn't ready, a machine-readable `problem` so the login
// page can say exactly what's wrong instead of dying silently. Always
// returns 200 JSON: the client treats `ready:false` as the error channel.
export async function GET() {
  try {
    const service = createServiceClient();
    const { data, error } = await service.from("zuya_members").select("username");

    if (error) {
      const migrationMissing =
        error.code === "42P01" || /does not exist|relation .*zuya_members/i.test(error.message);
      return NextResponse.json({
        ready: false,
        problem: migrationMissing ? "migration_missing" : "db_error",
        detail: error.message,
      });
    }

    const taken = new Set((data ?? []).map((r) => r.username as string));
    const out: Record<string, boolean | true> = { ready: true };
    for (const u of ZUYA_USERNAMES) out[u] = taken.has(u);
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const missingKey = /SERVICE_ROLE|SUPABASE_URL/i.test(msg);
    return NextResponse.json({
      ready: false,
      problem: missingKey ? "missing_service_key" : "server_error",
      detail: msg,
    });
  }
}
