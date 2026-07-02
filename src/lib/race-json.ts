// Shared JSON fetcher for the daily-content routes (art / bird / wiki).
//
// Two hard-won lessons baked in:
//
// 1. RACE, never walk. The old helper tried direct → allorigins → codetabs
//    SEQUENTIALLY with 10s timeouts. When an upstream tarpits datacenter IPs
//    (hangs instead of 403ing fast), one call ate up to 30s — and Vercel
//    hard-kills the function at 10s, so the whole tab died. Racing all
//    candidates with 4s timeouts bounds every call to ~4s worst case.
//
// 2. HONEST User-Agent. Wikimedia's robot policy blocks fake browser UAs
//    coming from cloud IP space (bot masquerading). The routes that always
//    sent a descriptive tool UA kept working through the same window in
//    which every fake-Chrome route went dark. Send who we really are.

export const TOOL_UA = "morning-dashboard/1.0 (personal dashboard; single user)";

const PER_TRY_TIMEOUT_MS = 4000;

function candidates(url: string): string[] {
  return [
    url,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  ];
}

export async function raceJson<T>(url: string): Promise<T | null> {
  const tries = candidates(url);
  return new Promise<T | null>((resolve) => {
    let pending = tries.length;
    let done = false;
    const settle = (v: T | null) => {
      if (done) return;
      if (v !== null) { done = true; resolve(v); return; }
      if (--pending === 0) { done = true; resolve(null); }
    };
    for (const u of tries) {
      (async () => {
        try {
          const r = await fetch(u, {
            headers: { "User-Agent": TOOL_UA, Accept: "application/json" },
            signal: AbortSignal.timeout(PER_TRY_TIMEOUT_MS),
            cache: "no-store",
          });
          if (!r.ok) return settle(null);
          const text = await r.text();
          if (!text || (text[0] !== "{" && text[0] !== "[")) return settle(null);
          settle(JSON.parse(text) as T);
        } catch { settle(null); }
      })();
    }
  });
}
