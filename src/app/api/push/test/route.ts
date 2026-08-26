import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushToUser, pushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return NextResponse.json({ message: "Not signed in." }, { status: 401 });
  if (!pushConfigured()) {
    return NextResponse.json({ message: "Server has no VAPID keys configured." }, { status: 503 });
  }

  const sent = await pushToUser(userId, {
    title: "Rest Area",
    body: "Notifications are working.",
    url: "/dashboard",
    tag: "test",
  });
  return NextResponse.json({
    ok: sent > 0,
    message: sent > 0
      ? `Sent to ${sent} device${sent === 1 ? "" : "s"}.`
      : "No subscribed devices — turn notifications on first.",
  });
}
