// Zuya-wide constants shared by client and server code.

// Dedicated auth-cookie name. The personal dashboard uses @supabase/ssr's
// default (project-ref-derived) cookie; giving Zuya its own name means both
// sessions coexist in one browser — signing into Zuya never evicts the
// personal dashboard session.
export const ZUYA_COOKIE_NAME = "zuya-auth";

// The two — and only two — people this app is for.
export const ZUYA_USERNAMES = ["yavuz", "zuleyha"] as const;
export type ZuyaUsername = (typeof ZUYA_USERNAMES)[number];

export const ZUYA_DISPLAY_NAMES: Record<ZuyaUsername, string> = {
  yavuz: "Yavuz",
  zuleyha: "Züleyha",
};

// Synthetic email domain — these addresses never receive mail; users are
// created pre-confirmed via the Admin API and recover passwords through the
// Supabase dashboard.
export const ZUYA_EMAIL_DOMAIN = "zuya.local";

export function zuyaEmail(username: ZuyaUsername): string {
  return `${username}@${ZUYA_EMAIL_DOMAIN}`;
}

export function isZuyaEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith(`@${ZUYA_EMAIL_DOMAIN}`);
}
