// Server-only helpers around zuya_pinterest_tokens (policy-less table, service
// role only). Uses PINTEREST_CLIENT_ID / PINTEREST_CLIENT_SECRET.

export const ZUYA_PINTEREST_SCOPES = ["boards:read", "pins:read"].join(",");

const API = "https://api.pinterest.com/v5";

export function pinterestClientId(): string {
  return process.env.PINTEREST_CLIENT_ID ?? "";
}
function basicAuth(): string {
  return Buffer.from(
    `${process.env.PINTEREST_CLIENT_ID}:${process.env.PINTEREST_CLIENT_SECRET}`,
  ).toString("base64");
}
export function pinterestRedirectUri(requestUrl: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(requestUrl).origin;
  return `${base.replace(/\/$/, "")}/api/zuya/pinterest/callback`;
}

async function tokenRequest(body: URLSearchParams): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

/** Exchange an auth code for tokens; returns the refresh token. */
export async function pinterestExchangeCode(code: string, redirectUri: string): Promise<string | null> {
  const json = await tokenRequest(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  );
  return (json?.refresh_token as string) ?? null;
}

async function pinterestAccessToken(refreshToken: string): Promise<string | null> {
  const json = await tokenRequest(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  );
  return (json?.access_token as string) ?? null;
}

export interface PinterestPin {
  id: string;
  link: string;
  image: string;
  description: string;
}

interface Board {
  id: string;
  name: string;
}

async function apiGet(path: string, accessToken: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as Record<string, unknown>;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Pull an image URL out of a v5 pin's `media` object across its shapes.
function pinImage(media: Record<string, unknown> | undefined): string {
  if (!media) return "";
  const images = media.images as Record<string, { url?: string }> | undefined;
  if (images) {
    return (
      images["600x"]?.url ??
      images["400x300"]?.url ??
      images["1200x"]?.url ??
      Object.values(images)[0]?.url ??
      ""
    );
  }
  return (media.image_cover_url as string) ?? "";
}

/**
 * Latest pins from the shared board. `boardHint` is the saved board URL/slug —
 * we match it against the connected account's boards by normalized name. Falls
 * back to the first board if there's no match.
 */
export async function pinterestBoardPins(
  refreshToken: string,
  boardHint: string,
  limit = 10,
): Promise<PinterestPin[] | null> {
  const accessToken = await pinterestAccessToken(refreshToken);
  if (!accessToken) return null;

  const boardsResp = await apiGet("/boards?page_size=100", accessToken);
  const boards = ((boardsResp?.items as Board[]) ?? []).filter((b) => b?.id);
  if (boards.length === 0) return [];

  // The hint is usually a full board URL — the slug is its last path segment.
  const slug = boardHint.split("?")[0].split("#")[0].replace(/\/+$/, "").split("/").pop() ?? "";
  const target =
    boards.find((b) => norm(b.name) === norm(slug)) ??
    boards.find((b) => norm(b.name).includes(norm(slug)) && slug.length > 1) ??
    boards[0];

  const pinsResp = await apiGet(`/boards/${target.id}/pins?page_size=${limit}`, accessToken);
  const items = (pinsResp?.items as Array<Record<string, unknown>>) ?? [];
  return items.slice(0, limit).map((p) => {
    const id = String(p.id ?? "");
    return {
      id,
      link: id ? `https://www.pinterest.com/pin/${id}/` : "https://www.pinterest.com",
      image: pinImage(p.media as Record<string, unknown> | undefined),
      description: String((p.title as string) || (p.description as string) || ""),
    };
  });
}
