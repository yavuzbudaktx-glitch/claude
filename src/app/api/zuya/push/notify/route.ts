import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getZuyaMember } from "@/lib/zuya/server";
import { pushToUser } from "@/lib/zuya/push";

export const dynamic = "force-dynamic";

// Send a push to the PARTNER on the caller's behalf. Used after a message is
// sent client-side. The body text is trusted-but-clamped; the recipient is
// always the other member (never arbitrary).
export async function POST(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { kind?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: partner } = await service
    .from("zuya_members")
    .select("user_id, display_name")
    .neq("user_id", auth.userId)
    .maybeSingle();
  if (!partner) return NextResponse.json({ ok: true }); // no partner yet

  const title = auth.member.display_name;
  const text = (body.text ?? "").slice(0, 140) || "Yeni mesaj";
  await pushToUser(partner.user_id, {
    title,
    body: body.kind === "message" ? text : text,
    url: "/zuya",
    tag: body.kind === "message" ? "zuya-message" : "zuya",
  });

  return NextResponse.json({ ok: true });
}
