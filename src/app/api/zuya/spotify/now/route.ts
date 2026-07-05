import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getZuyaMember } from "@/lib/zuya/server";
import { spotifyNowPlaying, type NowPlaying } from "@/lib/zuya/spotify";
import type { ZuyaUsername } from "@/lib/zuya/config";

export const dynamic = "force-dynamic";

// What each member is currently playing on Spotify.
export async function GET() {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: members } = await service.from("zuya_members").select("user_id, username");

  const out: Record<string, (NowPlaying & { connected: boolean }) | { connected: false }> = {};
  await Promise.all(
    (members ?? []).map(async (m) => {
      const username = m.username as ZuyaUsername;
      const np = await spotifyNowPlaying(m.user_id);
      out[username] = np ? { ...np, connected: true } : { connected: false };
    }),
  );
  return NextResponse.json(out);
}
