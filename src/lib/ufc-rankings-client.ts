// UFC rankings fetcher for the card.
//
// Order matters here, and it's the opposite of what it used to be. This file
// previously went straight to a chain of public CORS proxies, which is why the
// rankings section rendered "unavailable": those proxies rot, several now
// require an API key, and when the whole chain missed there was nothing to
// show and nothing to debug.
//
//   1. /api/ufc-rankings — our own route. No CORS, no proxy, real User-Agent.
//   2. the proxy chain, unchanged in spirit but with the dead hosts replaced,
//      for the case where the datacenter IP is the thing being blocked.
//
// Parsing lives in ufc-rankings-parse.ts so both paths produce the same shape.

import {
  dedupe,
  normalizeOctagon,
  parseUfcRankingsHtml,
  type DivisionRanking,
  type RankedFighter,
} from "@/lib/ufc-rankings-parse";

export type { DivisionRanking, RankedFighter };

/** What each source produced, for /sports-debug. Overwritten on every call. */
export interface RankingsAttempt {
  source: string;
  ok: boolean;
  status: number | string;
  bytes: number;
  divisions: number;
  ms: number;
}
let lastAttempts: RankingsAttempt[] = [];
export function lastRankingsAttempts(): RankingsAttempt[] {
  return lastAttempts;
}

interface ServerResp { divisions?: DivisionRanking[]; attempts?: RankingsAttempt[] }

async function fromServerRoute(): Promise<DivisionRanking[]> {
  const t0 = Date.now();
  try {
    const res = await fetch("/api/ufc-rankings", { signal: AbortSignal.timeout(12000) });
    if (!res.ok) {
      lastAttempts.push({ source: "/api/ufc-rankings", ok: false, status: res.status, bytes: 0, divisions: 0, ms: Date.now() - t0 });
      return [];
    }
    const json = (await res.json()) as ServerResp;
    // The route reports what each of ITS sources did — fold that in so the
    // diagnostic shows the whole chain, not just our half of it.
    for (const a of json.attempts ?? []) lastAttempts.push(a);
    const divisions = json.divisions ?? [];
    lastAttempts.push({
      source: "/api/ufc-rankings", ok: divisions.length > 0, status: res.status,
      bytes: 0, divisions: divisions.length, ms: Date.now() - t0,
    });
    return divisions;
  } catch (e) {
    lastAttempts.push({
      source: "/api/ufc-rankings", ok: false,
      status: e instanceof Error ? e.name : "ERR", bytes: 0, divisions: 0, ms: Date.now() - t0,
    });
    return [];
  }
}

// Public read-only proxies, in rough order of how reliable they've been.
// thingproxy is gone and corsproxy.io changed its parameter to ?url=, both of
// which were silently failing in the old list.
function proxied(target: string): string[] {
  return [
    target, // direct first — free when the source sends CORS headers
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
    `https://api.cors.lol/?url=${encodeURIComponent(target)}`,
  ];
}

async function fetchTextViaProxies(target: string, label: string): Promise<string | null> {
  for (const url of proxied(target)) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(9000) });
      const text = res.ok ? await res.text() : "";
      const via = url === target ? "direct" : new URL(url).hostname;
      lastAttempts.push({
        source: `${label} via ${via}`, ok: res.ok && text.length > 50,
        status: res.status, bytes: text.length, divisions: 0, ms: Date.now() - t0,
      });
      if (text && text.length > 50) return text;
    } catch (e) {
      const via = url === target ? "direct" : new URL(url).hostname;
      lastAttempts.push({
        source: `${label} via ${via}`, ok: false,
        status: e instanceof Error ? e.name : "ERR", bytes: 0, divisions: 0, ms: Date.now() - t0,
      });
    }
  }
  return null;
}

async function fromUfcCom(): Promise<DivisionRanking[]> {
  const html = await fetchTextViaProxies("https://www.ufc.com/rankings", "ufc.com");
  if (!html) return [];
  try { return parseUfcRankingsHtml(html); } catch { return []; }
}

async function fromOctagon(): Promise<DivisionRanking[]> {
  const text = await fetchTextViaProxies("https://api.octagon-api.com/rankings", "octagon-api");
  if (!text) return [];
  try { return normalizeOctagon(JSON.parse(text)); } catch { return []; }
}

export async function fetchUfcRankings(): Promise<DivisionRanking[]> {
  lastAttempts = [];

  const fromRoute = await fromServerRoute();
  if (fromRoute.length) return dedupe(fromRoute);

  const ufc = await fromUfcCom();
  if (ufc.length) return dedupe(ufc);

  return dedupe(await fromOctagon());
}
