import { NextResponse } from "next/server";
import {
  dedupe,
  normalizeOctagon,
  parseUfcRankingsHtml,
  type DivisionRanking,
} from "@/lib/ufc-rankings-parse";

// UFC rankings, fetched server-side.
//
// The card used to get these in the browser through a chain of public CORS
// proxies (corsproxy.io, allorigins, codetabs, thingproxy). That chain is the
// reason the rankings section went blank: those proxies come and go, several
// now want an API key, and when they all miss there is no data and no error to
// look at either.
//
// A server route has no CORS to satisfy and no proxy in the way — it just asks
// the source. It also lets us send a real User-Agent, which ufc.com wants. The
// browser chain stays in place as a fallback for the case this route is the one
// getting blocked; between the two, something should always answer.

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

interface SourceAttempt {
  source: string;
  ok: boolean;
  status: number | string;
  bytes: number;
  divisions: number;
  ms: number;
}

async function get(url: string, accept: string, ms: number): Promise<{ text: string; status: number | string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(ms),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { text: "", status: res.status };
    return { text: await res.text(), status: res.status };
  } catch (e) {
    return { text: "", status: e instanceof Error ? e.name : "ERR" };
  }
}

export async function GET() {
  const attempts: SourceAttempt[] = [];

  const record = async (
    source: string,
    url: string,
    accept: string,
    ms: number,
    parse: (text: string) => DivisionRanking[],
  ): Promise<DivisionRanking[]> => {
    const t0 = Date.now();
    const { text, status } = await get(url, accept, ms);
    let divisions: DivisionRanking[] = [];
    if (text) {
      try { divisions = dedupe(parse(text)); } catch { divisions = []; }
    }
    attempts.push({
      source, ok: divisions.length > 0, status,
      bytes: text.length, divisions: divisions.length, ms: Date.now() - t0,
    });
    return divisions;
  };

  // ufc.com is the authoritative source and the one this app already scrapes
  // successfully elsewhere (the athlete pages), so it goes first.
  let divisions = await record(
    "ufc.com/rankings",
    "https://www.ufc.com/rankings",
    "text/html,application/xhtml+xml",
    8000,
    parseUfcRankingsHtml,
  );

  if (divisions.length === 0) {
    divisions = await record(
      "octagon-api",
      "https://api.octagon-api.com/rankings",
      "application/json",
      6000,
      (t) => normalizeOctagon(JSON.parse(t)),
    );
  }

  return NextResponse.json(
    { divisions, attempts },
    {
      headers: {
        // Rankings move once a week at most, so a long shared cache with
        // stale-while-revalidate keeps this off the critical path.
        "Cache-Control": divisions.length
          ? "s-maxage=3600, stale-while-revalidate=86400"
          : "no-store",
      },
    },
  );
}
