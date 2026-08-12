"use client";

import { useEffect, useState } from "react";
import { fetchUfcRankings, lastRankingsAttempts, type RankingsAttempt } from "@/lib/ufc-rankings-client";

// Side-by-side diagnostic for the Süper Lig + UFC cards.
//
// LEFT is what the Vercel server sees, RIGHT is what YOUR BROWSER sees, both
// hitting the same upstreams. That comparison is the whole point:
//
//   server fails + browser works  → the upstream is blocking the datacenter IP
//                                   (fix: read it in the browser, like Reddit)
//   both work, rows = 0           → the data genuinely isn't there yet
//                                   (preseason, or the season key is wrong)
//   both work, rows > 0           → our parsing is the problem, not the network
//   browser fails w/ CORS error   → the browser fallback can't be the answer
//
// Open /sports-debug and send me the table.

interface Probe {
  name: string; url: string; status: number | string; ok: boolean;
  bytes: number; found: string; sample: string; ms: number;
}
interface ServerResp { now: string; probes: Probe[] }

const BROWSER_TARGETS: Array<{ name: string; url: string; count: (j: unknown) => string }> = [
  {
    name: "ESPN standings (tur.1)",
    url: "https://site.api.espn.com/apis/v2/sports/soccer/tur.1/standings",
    count: (j) => {
      const o = j as Record<string, unknown>;
      const s = o.standings as Record<string, unknown> | undefined;
      const kids = o.children as Array<Record<string, unknown>> | undefined;
      const kid = kids?.[0]?.standings as Record<string, unknown> | undefined;
      const a = Array.isArray(s?.entries) ? (s!.entries as unknown[]).length : 0;
      const b = Array.isArray(kid?.entries) ? (kid!.entries as unknown[]).length : 0;
      return `entries: direct=${a} child=${b}`;
    },
  },
  {
    name: "ESPN Beşiktaş schedule",
    url: "https://site.api.espn.com/apis/site/v2/sports/soccer/tur.1/teams/1895/schedule",
    count: (j) => `events: ${Array.isArray((j as Record<string, unknown>).events) ? ((j as Record<string, unknown>).events as unknown[]).length : 0}`,
  },
  {
    name: "ESPN UFC scoreboard",
    url: (() => {
      const now = new Date();
      const p = (n: number) => String(n).padStart(2, "0");
      const ymd = (d: Date) => `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
      return `https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=${ymd(new Date(now.getTime() - 120 * 86400000))}-${ymd(new Date(now.getTime() + 180 * 86400000))}`;
    })(),
    count: (j) => `events: ${Array.isArray((j as Record<string, unknown>).events) ? ((j as Record<string, unknown>).events as unknown[]).length : 0}`,
  },
];

function Row({ p }: { p: Probe }) {
  return (
    <tr className="align-top">
      <td className="py-1.5 pr-3 text-[12px] text-ink-soft">{p.name}</td>
      <td className={`py-1.5 pr-3 font-mono text-[12px] ${p.ok ? "text-up" : "text-down"}`}>{String(p.status)}</td>
      <td className="py-1.5 pr-3 font-mono text-[12px] tabular-nums text-muted">{p.bytes}</td>
      <td className="py-1.5 pr-3 font-mono text-[12px] text-ink">{p.found}</td>
      <td className="py-1.5 pr-3 font-mono text-[11px] tabular-nums text-muted-2">{p.ms}ms</td>
      <td className="py-1.5 font-mono text-[11px] text-muted-2 break-all">{p.sample}</td>
    </tr>
  );
}

export default function SportsDebugPage() {
  const [server, setServer] = useState<ServerResp | null>(null);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [browser, setBrowser] = useState<Probe[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/sports-debug", { cache: "no-store" });
        setServer((await r.json()) as ServerResp);
      } catch (e) {
        setServerErr(e instanceof Error ? e.message : String(e));
      }

      const out: Probe[] = [];
      for (const t of BROWSER_TARGETS) {
        const t0 = Date.now();
        try {
          // Simple GET, no headers — anything else triggers a CORS preflight.
          const r = await fetch(t.url, { signal: AbortSignal.timeout(9000), cache: "no-store" });
          const text = await r.text();
          let found = "—";
          try { found = t.count(JSON.parse(text)); } catch { found = "not JSON"; }
          out.push({
            name: t.name, url: t.url, status: r.status, ok: r.ok,
            bytes: text.length, found, sample: text.slice(0, 160).replace(/\s+/g, " "),
            ms: Date.now() - t0,
          });
        } catch (e) {
          out.push({
            name: t.name, url: t.url, status: "ERR", ok: false, bytes: 0, found: "—",
            sample: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
            ms: Date.now() - t0,
          });
        }
        setBrowser([...out]);
      }
      setRunning(false);
    })();
  }, []);

  return (
    <main className="max-w-[1100px] mx-auto px-5 py-8 space-y-6">
      <div>
        <h1 className="font-display text-3xl mb-1">Sports data diagnostic</h1>
        <p className="text-sm text-muted">
          Same upstreams, hit two ways. Send me both tables and I&rsquo;ll know exactly what to fix.
          {running ? " Running…" : " Done."}
        </p>
      </div>

      <section className="card">
        <h2 className="font-display text-lg mb-2">1 · From the server (Vercel)</h2>
        {serverErr && <p className="text-down text-sm">Failed: {serverErr}</p>}
        {!server && !serverErr && <p className="text-muted text-sm">Loading…</p>}
        {server && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="label"><th>Source</th><th>Status</th><th>Bytes</th><th>Parsed</th><th>Time</th><th>Sample</th></tr></thead>
              <tbody className="divide-rule">{server.probes.map((p) => <Row key={p.name} p={p} />)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="font-display text-lg mb-2">2 · From your browser</h2>
        <p className="text-[12px] text-muted mb-2">
          A CORS/TypeError here means the browser fallback can&rsquo;t work and we need a different route to the data.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="label"><th>Source</th><th>Status</th><th>Bytes</th><th>Parsed</th><th>Time</th><th>Sample</th></tr></thead>
            <tbody className="divide-rule">{browser.map((p) => <Row key={p.name} p={p} />)}</tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="font-display text-lg mb-2">3 · What our own routes return</h2>
        <LiveRoutes />
      </section>

      <section className="card">
        <h2 className="font-display text-lg mb-2">4 · UFC rankings, source by source</h2>
        <p className="text-[12px] text-muted mb-2">
          Every source the rankings fetcher tries, in order, with what each one gave back.
          The first row with divisions &gt; 0 is the one that won.
        </p>
        <RankingsProbe />
      </section>
    </main>
  );
}

function LiveRoutes() {
  const [out, setOut] = useState<string>("Loading…");
  useEffect(() => {
    (async () => {
      const lines: string[] = [];
      for (const url of ["/api/ufc", "/api/superlig?team=Be%C5%9Fikta%C5%9F&teamId=1895"]) {
        try {
          const t0 = Date.now();
          const r = await fetch(url, { cache: "no-store" });
          const j = (await r.json()) as Record<string, unknown>;
          const ms = Date.now() - t0;
          if (url.startsWith("/api/ufc")) {
            lines.push(`${url} → ${r.status} in ${ms}ms · previous=${j.previous ? "yes" : "NO"} upcoming=${j.upcoming ? "yes" : "NO"} source=${String(j.source)}`);
          } else {
            const st = Array.isArray(j.standings) ? (j.standings as unknown[]).length : 0;
            lines.push(`${url} → ${r.status} in ${ms}ms · standings=${st} last=${j.last ? "yes" : "NO"} next=${j.next ? "yes" : "NO"} source=${String(j.source)}`);
          }
        } catch (e) {
          lines.push(`${url} → ERROR ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      setOut(lines.join("\n"));
    })();
  }, []);
  return <pre className="font-mono text-[12px] text-ink-soft whitespace-pre-wrap break-all">{out}</pre>;
}

function RankingsProbe() {
  const [attempts, setAttempts] = useState<RankingsAttempt[]>([]);
  const [result, setResult] = useState<string>("Running…");
  useEffect(() => {
    (async () => {
      const t0 = Date.now();
      const divisions = await fetchUfcRankings();
      setAttempts(lastRankingsAttempts());
      setResult(
        divisions.length
          ? `${divisions.length} divisions in ${Date.now() - t0}ms · ` +
            divisions.map((d) => `${d.division}: ${d.champion ?? "no champ"} +${d.contenders.length}`).join(" | ")
          : `NOTHING — every source failed (${Date.now() - t0}ms)`,
      );
    })();
  }, []);
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr className="label"><th>Source</th><th>Status</th><th>Bytes</th><th>Divisions</th><th>Time</th></tr></thead>
          <tbody className="divide-rule">
            {attempts.map((a, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-3 text-[12px] text-ink-soft break-all">{a.source}</td>
                <td className={`py-1.5 pr-3 font-mono text-[12px] ${a.ok ? "text-up" : "text-down"}`}>{String(a.status)}</td>
                <td className="py-1.5 pr-3 font-mono text-[12px] tabular-nums text-muted">{a.bytes}</td>
                <td className="py-1.5 pr-3 font-mono text-[12px] tabular-nums text-ink">{a.divisions}</td>
                <td className="py-1.5 font-mono text-[11px] tabular-nums text-muted-2">{a.ms}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <pre className="font-mono text-[12px] text-ink-soft whitespace-pre-wrap break-all mt-2">{result}</pre>
    </>
  );
}
