import { NextResponse } from "next/server";

// Diagnostic for the Süper Lig + UFC cards.
//
// Both cards go dark for one of two very different reasons, and from the
// outside they look identical:
//   (a) the upstream refuses THIS SERVER — Vercel's datacenter IP gets a 403 /
//       451 / connection reset. The fix is a different path to the data.
//   (b) the upstream answers 200 but the payload is empty or its shape moved.
//       The fix is in our parsing.
// Guessing between those has cost several rounds, so this probes each source
// directly and reports the raw status, byte count and a sample. Pair it with
// /sports-debug, which runs the same probes from the BROWSER — if the server
// column fails and the browser column succeeds, it is (a).

export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function pad(n: number) { return String(n).padStart(2, "0"); }
function ymd(d: Date) { return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; }

interface Probe {
  name: string;
  url: string;
  status: number | string;
  ok: boolean;
  bytes: number;
  /** Parsed hint: how many rows/events we could actually see. */
  found: string;
  sample: string;
  ms: number;
}

async function probe(name: string, url: string, count: (j: unknown) => string): Promise<Probe> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json,text/html;q=0.9,*/*;q=0.8" },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    const text = await r.text();
    let found = "—";
    try { found = count(JSON.parse(text)); } catch { found = "not JSON"; }
    return {
      name, url,
      status: r.status,
      ok: r.ok,
      bytes: text.length,
      found,
      sample: text.slice(0, 160).replace(/\s+/g, " "),
      ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      name, url,
      status: "ERR",
      ok: false,
      bytes: 0,
      found: "—",
      sample: e instanceof Error ? e.message : String(e),
      ms: Date.now() - t0,
    };
  }
}

interface AnyObj { [k: string]: unknown }
function arrLen(v: unknown): number { return Array.isArray(v) ? v.length : 0; }

export async function GET() {
  const now = new Date();
  const from = ymd(new Date(now.getTime() - 120 * 86400000));
  const to = ymd(new Date(now.getTime() + 180 * 86400000));
  const seasonA = now.getMonth() >= 6 ? `${now.getFullYear()}-${now.getFullYear() + 1}` : `${now.getFullYear() - 1}-${now.getFullYear()}`;

  const probes = await Promise.all([
    probe(
      "ESPN standings (tur.1)",
      "https://site.api.espn.com/apis/v2/sports/soccer/tur.1/standings",
      (j) => {
        const o = j as AnyObj;
        const direct = arrLen((o.standings as AnyObj)?.entries);
        const child = arrLen(((o.children as AnyObj[])?.[0]?.standings as AnyObj)?.entries);
        return `entries: direct=${direct} child=${child}`;
      },
    ),
    probe(
      "ESPN Beşiktaş schedule (tur.1, id 1895)",
      "https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/teams/1895/schedule",
      (j) => `events: ${arrLen((j as AnyObj).events)}`,
    ),
    probe(
      "ESPN UFC scoreboard",
      `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${from}-${to}`,
      (j) => `events: ${arrLen((j as AnyObj).events)}`,
    ),
    probe(
      "TheSportsDB table",
      `https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=4339&s=${seasonA}`,
      (j) => `rows: ${arrLen((j as AnyObj).table)}`,
    ),
    probe(
      "TheSportsDB next (Beşiktaş)",
      "https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=133611",
      (j) => `events: ${arrLen((j as AnyObj).events)}`,
    ),
  ]);

  // What our own routes actually return right now.
  return NextResponse.json({
    now: now.toISOString(),
    note: "server column. Compare with /sports-debug which runs the same probes in your browser.",
    probes,
  });
}
