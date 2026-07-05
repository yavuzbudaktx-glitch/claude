import { createServiceClient } from "@/lib/supabase/service";

// Server-only helpers around zuya_spotify_tokens (policy-less table, service
// role only). Uses SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET.

export const ZUYA_SPOTIFY_SCOPES = ["user-read-currently-playing", "user-read-playback-state"].join(" ");

export function spotifyClientId(): string {
  return process.env.SPOTIFY_CLIENT_ID ?? "";
}
function basicAuth(): string {
  return Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
}
export function spotifyRedirectUri(requestUrl: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(requestUrl).origin;
  return `${base.replace(/\/$/, "")}/api/zuya/spotify/callback`;
}

/** Exchange an auth code for tokens; returns the refresh token. */
export async function spotifyExchangeCode(code: string, redirectUri: string): Promise<string | null> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { refresh_token?: string };
  return json.refresh_token ?? null;
}

async function spotifyAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

export interface NowPlaying {
  playing: boolean;
  track?: string;
  artist?: string;
  art?: string;
  url?: string;
}

/** What a user is currently playing (or their most recent), or null if not
 * connected / nothing available. */
export async function spotifyNowPlaying(userId: string): Promise<NowPlaying | null> {
  const service = createServiceClient();
  const { data: row } = await service
    .from("zuya_spotify_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (!row?.refresh_token) return null;

  const token = await spotifyAccessToken(row.refresh_token);
  if (!token) return null;

  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 204) return { playing: false };
  if (!res.ok) return { playing: false };

  const data = (await res.json()) as {
    is_playing?: boolean;
    item?: {
      name?: string;
      artists?: { name: string }[];
      album?: { images?: { url: string }[] };
      external_urls?: { spotify?: string };
    };
  };
  const item = data.item;
  if (!item) return { playing: false };
  return {
    playing: !!data.is_playing,
    track: item.name,
    artist: (item.artists ?? []).map((a) => a.name).join(", "),
    art: item.album?.images?.[item.album.images.length - 1]?.url ?? item.album?.images?.[0]?.url,
    url: item.external_urls?.spotify,
  };
}
