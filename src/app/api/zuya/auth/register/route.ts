import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ZUYA_USERNAMES,
  ZUYA_DISPLAY_NAMES,
  zuyaEmail,
  type ZuyaUsername,
} from "@/lib/zuya/config";

export const dynamic = "force-dynamic";

// First-time registration: creates the auth user (pre-confirmed, so the
// synthetic @zuya.local address never needs to receive mail) and the member
// row. Unauthenticated by necessity — the username whitelist plus the unique
// constraint on zuya_members.username make it self-sealing: once both slots
// are claimed this endpoint is permanently dead.
export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const username = (body.username ?? "").toLowerCase().trim() as ZuyaUsername;
  const password = body.password ?? "";

  if (!ZUYA_USERNAMES.includes(username)) {
    return NextResponse.json({ error: "unknown user" }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 200) {
    return NextResponse.json(
      { error: "password must be at least 8 characters" },
      { status: 400 },
    );
  }

  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "Server isn't configured yet — SUPABASE_SERVICE_ROLE_KEY is missing on Vercel." },
      { status: 500 },
    );
  }

  const { data: existing, error: lookupErr } = await service
    .from("zuya_members")
    .select("user_id")
    .eq("username", username)
    .maybeSingle();
  if (lookupErr) {
    const migrationMissing =
      lookupErr.code === "42P01" || /does not exist/i.test(lookupErr.message);
    return NextResponse.json(
      {
        error: migrationMissing
          ? "The database isn't set up yet — run the Zuya migration in Supabase first."
          : lookupErr.message,
      },
      { status: 500 },
    );
  }
  if (existing) {
    return NextResponse.json({ error: "already registered" }, { status: 409 });
  }

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email: zuyaEmail(username),
    password,
    email_confirm: true,
    user_metadata: { zuya_username: username },
  });
  if (createErr || !created.user) {
    // "already registered" here means the auth user exists without a member
    // row (a previously interrupted registration) — surface a clear error.
    return NextResponse.json(
      { error: createErr?.message ?? "could not create user" },
      { status: 500 },
    );
  }

  const { error: memberErr } = await service.from("zuya_members").insert({
    user_id: created.user.id,
    username,
    display_name: ZUYA_DISPLAY_NAMES[username],
  });
  if (memberErr) {
    // Unique-constraint race (both devices registering simultaneously): roll
    // back the auth user so the slot stays claimable.
    await service.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: "already registered" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
