import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ZUYA_USERNAMES, zuyaEmail, type ZuyaUsername } from "@/lib/zuya/config";

export const dynamic = "force-dynamic";

// "Start over" — wipe a user completely so it's as if they never registered.
// Deletes the auth user (which cascades away their zuya_members row and all
// their data) plus any dangling auth user with the same synthetic email. Then
// the username slot is free to register again. Unauthenticated by necessity
// (the person is locked out); acceptable for this private two-person app.
export async function POST(req: Request) {
  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const username = (body.username ?? "").toLowerCase().trim() as ZuyaUsername;
  if (!ZUYA_USERNAMES.includes(username)) {
    return NextResponse.json({ error: "unknown user" }, { status: 400 });
  }

  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "Server isn't configured (missing SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 500 },
    );
  }

  // Delete the member's auth user — cascades the zuya_members row + their data.
  const { data: member } = await service
    .from("zuya_members")
    .select("user_id")
    .eq("username", username)
    .maybeSingle();
  if (member?.user_id) {
    await service.auth.admin.deleteUser(member.user_id);
  }

  // Also clear any dangling auth user with this email but no member row
  // (a half-finished registration), so re-registering can't hit "email exists".
  const email = zuyaEmail(username);
  try {
    const { data } = await service.auth.admin.listUsers();
    const dangling = data.users.find((u) => u.email === email);
    if (dangling) await service.auth.admin.deleteUser(dangling.id);
  } catch {
    // listUsers is best-effort cleanup; ignore failures.
  }

  return NextResponse.json({ ok: true });
}
