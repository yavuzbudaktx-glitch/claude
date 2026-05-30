import { NextResponse } from "next/server";
import { requireDevice } from "@/lib/agent-auth";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Persist the device's sync cursor (highest rev fully processed). Monotonic:
// never moves the cursor backwards.
export async function POST(request: Request) {
  const device = await requireDevice(request);
  if (!device) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { cursor } = await request.json().catch(() => ({ cursor: null }));
  const next = Number(cursor);
  if (!Number.isFinite(next)) {
    return NextResponse.json({ error: "missing cursor" }, { status: 400 });
  }
  if (next <= device.sync_cursor) {
    return NextResponse.json({ cursor: device.sync_cursor });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("devices")
    .update({ sync_cursor: next })
    .eq("id", device.id)
    .eq("user_id", device.user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cursor: next });
}
