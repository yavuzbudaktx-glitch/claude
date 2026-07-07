import { NextResponse } from "next/server";
import { getZuyaMember } from "@/lib/zuya/server";
import { createServiceClient } from "@/lib/supabase/service";
import { pinterestBoardPins } from "@/lib/zuya/pinterest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const board = new URL(req.url).searchParams.get("board") ?? "";

  // Either partner's connected account can read the shared board — grab any
  // stored refresh token (service-role only table).
  const service = createServiceClient();
  const { data: tokens } = await service
    .from("zuya_pinterest_tokens")
    .select("refresh_token")
    .limit(1);
  const refreshToken = (tokens?.[0] as { refresh_token: string } | undefined)?.refresh_token;
  if (!refreshToken) {
    return NextResponse.json({ pins: [], notConnected: true });
  }

  try {
    const pins = await pinterestBoardPins(refreshToken, board);
    if (pins == null) {
      return NextResponse.json({ pins: [], error: "Couldn't reach Pinterest — reconnect in settings." });
    }
    return NextResponse.json({ pins: pins.filter((p) => p.image) });
  } catch {
    return NextResponse.json({ pins: [], error: "Couldn't load the board." });
  }
}
