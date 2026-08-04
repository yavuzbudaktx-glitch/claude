#!/usr/bin/env node
/**
 * Builds public/system-map.html — a self-contained map of this app's backend.
 *
 *   node scripts/system-map.mjs        (or: npm run map)
 *
 * It reads src/ and writes one HTML file with the results baked in, so the map
 * is regenerated from the code rather than maintained by hand. Open it at
 * /system-map.html on a running dev server or deployment: served from the same
 * origin as the API, it can also probe every route and report what is live.
 *
 * What it extracts per API route, following local imports transitively so a
 * dependency pulled in through src/lib still counts:
 *   - the external hosts it talks to (and whether those are public CORS
 *     proxies or Invidious/Piped mirrors, which are the flaky ones)
 *   - the env vars it needs, and whether .env.local.example documents them
 *   - cache TTL, dynamic/runtime flags, auth signals, HTTP methods
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "public", "system-map.html");

/* ------------------------------------------------------------------ files */

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

const srcFiles = walk(SRC);

/* Resolve "@/x" and relative imports to a real file. */
function resolveImport(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/* --------------------------------------------------------------- patterns */

const IGNORE_HOST = /^(YOUR|localhost|127\.|0\.0\.0\.0|example\.|schemas?\.|www\.w3\.org)/i;
const PROXY_HOSTS = new Set([
  "api.allorigins.win", "api.codetabs.com", "corsproxy.io", "thingproxy.freeboard.io",
  "r.jina.ai", "proxy.cors.sh", "api.cors.lol", "whateverorigin.org", "cors-anywhere.herokuapp.com",
]);
const MIRROR_RE = /(^|\.)(piped|invidious|yewtu|inv|iv|vid)([.-]|$)|piped|invidious/i;

const hostKind = (h) => (PROXY_HOSTS.has(h) ? "proxy" : MIRROR_RE.test(h) ? "mirror" : "direct");

const envsIn = (s) => [...s.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]);
const hostsIn = (s) =>
  [...s.matchAll(/https?:\/\/([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g)]
    .map((m) => m[1].replace(/\.$/, ""))
    .filter((h) => !IGNORE_HOST.test(h));

/* Walk a file plus everything it imports from src/, unioning env vars + hosts. */
function collect(file, seen = new Set()) {
  if (seen.has(file)) return { envs: [], hosts: [], deps: [] };
  seen.add(file);
  const src = read(file);
  const envs = new Set(envsIn(src));
  const hosts = new Set(hostsIn(src));
  const deps = new Set();
  for (const m of src.matchAll(/(?:from\s+|import\s*\(\s*|require\(\s*)["']([^"']+)["']/g)) {
    const target = resolveImport(m[1], file);
    if (!target) continue;
    deps.add(rel(target));
    const sub = collect(target, seen);
    sub.envs.forEach((e) => envs.add(e));
    sub.hosts.forEach((h) => hosts.add(h));
    sub.deps.forEach((d) => deps.add(d));
  }
  return { envs: [...envs], hosts: [...hosts], deps: [...deps] };
}

/* ------------------------------------------------------- probe safety net */

/* Anything that can mutate state, spend a quota, or send a message must never
   be hit by the health check. Dynamic segments can't be probed either. */
const UNSAFE_PATH = /\[|\/(delete|disconnect|reset|upload|register|tick|notify|test|subscribe|callback|start|download)(\/|$)/;
const CAUTION_PATH = /^\/api\/(digest|agent)\b/;

function probeClass(urlPath, methods) {
  if (!methods.includes("GET")) return { probe: "unsafe", why: `no GET handler (${methods.join(", ")})` };
  if (UNSAFE_PATH.test(urlPath)) return { probe: "unsafe", why: "side effects or dynamic segment — never probed" };
  if (CAUTION_PATH.test(urlPath)) return { probe: "caution", why: "does real work upstream — opt in to probe" };
  return { probe: "safe", why: "read-only GET" };
}

/* ---------------------------------------------------------------- routes */

const routeFiles = srcFiles.filter((f) => /app[\\/]api[\\/].*route\.ts$/.test(f));

const routes = routeFiles.map((f) => {
  const src = read(f);
  const urlPath = "/" + path.relative(path.join(SRC, "app"), path.dirname(f)).split(path.sep).join("/");
  const { envs, hosts, deps } = collect(f);

  const methods = [...new Set([...src.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]))];
  const ttls = [...src.matchAll(/revalidate:\s*(\d+)/g)].map((m) => Number(m[1]));
  const pick = (re) => { const m = src.match(re); return m ? m[1] : null; };

  const auth = [];
  if (/getUser\(\)|auth\.getUser/.test(src)) auth.push("session");
  if (/getZuyaMember|zuya\/server/.test(src)) auth.push("zuya");
  if (/CRON_SECRET/.test(src)) auth.push("cron");
  if (/device[_-]?token/i.test(src)) auth.push("device");
  if (/createServiceClient|SERVICE_ROLE|SERVICE_KEY/.test(src)) auth.push("service-role");
  if (/\bpin\b|PIN_/i.test(src) && urlPath.includes("vault")) auth.push("pin");

  const group = urlPath.startsWith("/api/zuya") ? "zuya"
    : urlPath.startsWith("/api/vault") ? "vault"
    : /^\/api\/(agent|files|devices)/.test(urlPath) ? "files"
    : urlPath.startsWith("/api/digest") ? "digest"
    : "core";

  const uniq = [...new Set(hosts)].sort();
  const ms = methods.length ? methods : ["GET"];

  return {
    path: urlPath,
    file: rel(f),
    group,
    methods: ms,
    ...probeClass(urlPath, ms),
    envs: [...new Set(envs)].filter((e) => e !== "NODE_ENV").sort(),
    hosts: uniq,
    proxies: uniq.filter((h) => hostKind(h) === "proxy"),
    mirrors: uniq.filter((h) => hostKind(h) === "mirror"),
    libs: deps.filter((d) => d.startsWith("src/lib")).sort(),
    ttl: ttls.length ? Math.min(...ttls) : null,
    dynamic: pick(/export\s+const\s+dynamic\s*=\s*["']([^"']+)["']/),
    runtime: pick(/export\s+const\s+runtime\s*=\s*["']([^"']+)["']/),
    maxDuration: Number(pick(/export\s+const\s+maxDuration\s*=\s*(\d+)/)) || null,
    loc: src.split("\n").length,
    auth: [...new Set(auth)],
  };
}).sort((a, b) => a.path.localeCompare(b.path));

/* ------------------------------------------------------------- env vars */

const scanned = srcFiles.concat(walk(path.join(ROOT, "agent")), walk(path.join(ROOT, "worker")), walk(path.join(ROOT, "scripts")));
const envFiles = new Map();
for (const f of scanned) {
  for (const e of envsIn(read(f))) {
    if (!envFiles.has(e)) envFiles.set(e, new Set());
    envFiles.get(e).add(rel(f));
  }
}

const exampleSrc = read(path.join(ROOT, ".env.local.example"));
const documented = new Set([...exampleSrc.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]));

/* Hand-written notes for the vars whose purpose isn't obvious from the name.
   Anything missing falls back to "used by <n> file(s)". */
const ENV_NOTES = {
  NEXT_PUBLIC_SUPABASE_URL: "Supabase project URL. Settings → API.",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "Supabase anon key — safe to expose, RLS enforces access.",
  SUPABASE_SERVICE_ROLE_KEY: "Service-role key. Bypasses RLS. Server-only, never NEXT_PUBLIC_.",
  SUPABASE_SERVICE_KEY: "Second name for the service-role key, read only by the digest code.",
  SUPABASE_URL: "Second name for the project URL, read only by the digest code.",
  GOOGLE_CLIENT_ID: "Google OAuth client — refreshes Calendar access tokens.",
  GOOGLE_CLIENT_SECRET: "Google OAuth client secret.",
  YOUTUBE_API_KEY: "YouTube Data API v3 key. Without it the video libraries fall back to public mirrors.",
  YT_API_KEY: "Fallback name for YOUTUBE_API_KEY — either one works.",
  NEXT_PUBLIC_SITE_URL: "Public origin, used to build OAuth redirect URIs.",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "Web-push public key. Pair with VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys).",
  VAPID_PRIVATE_KEY: "Web-push private key. Without it push silently no-ops.",
  RESEND_API_KEY: "Resend API key for the digest emails.",
  DIGEST_FROM: 'Digest sender, e.g. "Rest Area <digest@yourdomain.com>".',
  DIGEST_TO: "Digest recipient address.",
  DIGEST_USER_ID: "Supabase auth.users.id the digest reads tasks and prefs for.",
  CRON_SECRET: "Shared secret for manually firing the digest (?token=…).",
  SPOTIFY_CLIENT_ID: "Spotify app client ID — the Zuya now-playing card.",
  SPOTIFY_CLIENT_SECRET: "Spotify app client secret.",
  REDDIT_CLIENT_ID: "Reddit script-app ID. Without it /api/reddit falls back to CORS proxies.",
  REDDIT_CLIENT_SECRET: "Reddit script-app secret.",
  NASA_API_KEY: "NASA APOD key. Falls back to DEMO_KEY, which is rate-limited hard.",
  OMDB_API_KEY: "OMDb key for the Zuya movie card.",
  ZUYA_GOOGLE_CLIENT_ID: "Separate Google OAuth client for the Zuya calendar.",
  ZUYA_GOOGLE_CLIENT_SECRET: "Zuya Google OAuth client secret.",
  ZUYA_SIGNUP_CODE: "Invite code gating Zuya registration.",
  NEXT_PUBLIC_APP: "Which sub-app the build targets.",
  DOCSYNC_SERVER: "docsync agent: base URL of this app.",
  DOCSYNC_TOKEN: "docsync agent: device token issued by /api/devices.",
  DOCSYNC_DIR: "docsync agent: local folder to mirror.",
  DOCSYNC_STATE: "docsync agent: path to its state file.",
  DOCSYNC_INTERVAL: "docsync agent: poll interval in seconds.",
  SCRAPINGBEE_API_KEY: "ScrapingBee key used by scripts/scrape-britannica.mjs to get past the anti-bot wall. The scrape throws without it.",
};

const envs = [...envFiles.entries()]
  .filter(([name]) => name !== "NODE_ENV")
  .map(([name, files]) => ({
    name,
    documented: documented.has(name),
    isPublic: name.startsWith("NEXT_PUBLIC_"),
    /* Client IDs are semi-public — only flag things that must never be shared. */
    secret: /KEY|SECRET|TOKEN|PRIVATE|_CODE$/.test(name) && !name.startsWith("NEXT_PUBLIC_"),
    files: [...files].sort(),
    routes: routes.filter((r) => r.envs.includes(name)).map((r) => r.path),
    note: ENV_NOTES[name] || "",
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/* ---------------------------------------------------------------- hosts */

const hostMap = new Map();
for (const r of routes) for (const h of r.hosts) {
  if (!hostMap.has(h)) hostMap.set(h, new Set());
  hostMap.get(h).add(r.path);
}
const hosts = [...hostMap.entries()]
  .map(([host, rs]) => ({ host, kind: hostKind(host), routes: [...rs].sort() }))
  .sort((a, b) => b.routes.length - a.routes.length || a.host.localeCompare(b.host));

/* ------------------------------------------------------------- findings */

const findings = [];
const undocumented = envs.filter((e) => !e.documented);

if (undocumented.length) {
  findings.push({
    level: "critical",
    title: `${undocumented.length} env vars are read by the code but missing from .env.local.example`,
    body:
      "A fresh clone (or a new Vercel environment) comes up with these unset. Most fail quietly — push " +
      "silently no-ops, the digest email never sends, Spotify and Reddit fall back to flaky public proxies. " +
      "The Config tab generates a complete replacement file.",
    items: undocumented.map((e) => e.name),
  });
}

const svcSplit = envs.find((e) => e.name === "SUPABASE_SERVICE_KEY");
const svcRole = envs.find((e) => e.name === "SUPABASE_SERVICE_ROLE_KEY");
if (svcSplit && svcRole) {
  findings.push({
    level: "critical",
    title: "Two different names for the same Supabase service-role key",
    body:
      `src/lib/digest/shared.ts reads SUPABASE_SERVICE_KEY (plus SUPABASE_URL), while ` +
      `src/lib/supabase/service.ts and everything else read SUPABASE_SERVICE_ROLE_KEY (plus ` +
      `NEXT_PUBLIC_SUPABASE_URL). Only the second pair is documented, so setting up from the example file ` +
      `leaves the digest unable to reach Supabase — and its failure path is an HTML page saying "preview ` +
      `unavailable", not an error anyone gets paged for. Either alias them in digest/shared.ts or set both.`,
    items: [`SUPABASE_SERVICE_KEY → ${svcSplit.routes.join(", ") || "digest only"}`,
            `SUPABASE_SERVICE_ROLE_KEY → ${svcRole.routes.length} routes`],
  });
}

const proxied = routes.filter((r) => r.proxies.length || r.mirrors.length);
if (proxied.length) {
  findings.push({
    level: "serious",
    title: `${proxied.length} routes depend on public CORS proxies or Invidious/Piped mirrors`,
    body:
      "These hosts are volunteer-run and disappear without notice — they are the most likely cause of a " +
      "card that worked last month and is empty today. Where a first-party key exists (REDDIT_CLIENT_ID, " +
      "YOUTUBE_API_KEY, NASA_API_KEY) setting it takes the proxy out of the path.",
    items: proxied.map((r) => `${r.path} → ${[...r.proxies, ...r.mirrors].length} proxy/mirror hosts`),
  });
}

const noCache = routes.filter((r) => r.hosts.length && r.ttl === null && r.probe === "safe");
if (noCache.length) {
  findings.push({
    level: "warning",
    title: `${noCache.length} routes call an external host with no revalidate window`,
    body:
      "Every request hits upstream. Fine for live data, wasteful for anything that changes daily — and on " +
      "rate-limited APIs it is what burns the quota.",
    items: noCache.map((r) => r.path),
  });
}

/* --------------------------------------------------------------- output */

const themes = fs.existsSync(path.join(SRC, "app/themes"))
  ? fs.readdirSync(path.join(SRC, "app/themes")).filter((f) => f.endsWith(".css")).map((f) => f.slice(0, -4)).sort()
  : [];

const data = {
  generated: new Date().toISOString(),
  routes, envs, hosts, findings, themes,
  totals: {
    routes: routes.length,
    hosts: hosts.length,
    envs: envs.length,
    undocumented: undocumented.length,
    proxied: proxied.length,
    files: srcFiles.length,
    loc: srcFiles.reduce((n, f) => n + read(f).split("\n").length, 0),
    themes: themes.length,
  },
};

/* ================================================================== HTML */

function renderHtml(d) {
  const json = JSON.stringify(d).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>System Map — Rest Area</title>
<style>${CSS}</style>
</head>
<body>
<div id="app"></div>
<script id="data" type="application/json">${json}</script>
<script>${JS}</script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ CSS */

const CSS = String.raw`
*,*::before,*::after{box-sizing:border-box}
:root{
  color-scheme:light;
  --plane:#f9f9f7; --surface:#fcfcfb; --raised:#ffffff;
  --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --ring:rgba(11,11,11,.10);
  --good:#0ca30c; --warning:#fab219; --serious:#ec835a; --critical:#d03b3b;
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --s4:#eda100; --s5:#e87ba4;
  --accent:#2a78d6;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",sans-serif;
}
@media (prefers-color-scheme:dark){
  :root:where(:not([data-theme="light"])){
    color-scheme:dark;
    --plane:#0d0d0d; --surface:#1a1a19; --raised:#212120;
    --ink:#fff; --ink-2:#c3c2b7; --muted:#898781;
    --grid:#2c2c2a; --axis:#383835; --ring:rgba(255,255,255,.10);
    --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500; --s5:#d55181;
    --accent:#3987e5;
  }
}
:root[data-theme="dark"]{
  color-scheme:dark;
  --plane:#0d0d0d; --surface:#1a1a19; --raised:#212120;
  --ink:#fff; --ink-2:#c3c2b7; --muted:#898781;
  --grid:#2c2c2a; --axis:#383835; --ring:rgba(255,255,255,.10);
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500; --s5:#d55181;
  --accent:#3987e5;
}
html,body{margin:0;padding:0}
body{background:var(--plane);color:var(--ink);font:15px/1.55 var(--sans);
  -webkit-font-smoothing:antialiased;overflow-x:hidden}
#app{max-width:1180px;margin:0 auto;padding:28px 20px 96px}
a{color:var(--accent)}
h1,h2,h3{margin:0;font-weight:640;letter-spacing:-.011em}
button{font:inherit;color:inherit}

/* header */
.top{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;justify-content:space-between;margin-bottom:8px}
.title h1{font-size:24px}
.title p{margin:6px 0 0;color:var(--ink-2);font-size:13.5px;max-width:62ch}
.stamp{color:var(--muted);font:12px/1.4 var(--mono)}
.iconbtn{background:var(--surface);border:1px solid var(--ring);border-radius:9px;
  padding:7px 11px;cursor:pointer;font-size:12.5px;color:var(--ink-2)}
.iconbtn:hover{border-color:var(--axis);color:var(--ink)}

/* tiles */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:10px;margin:22px 0}
.tile{background:var(--surface);border:1px solid var(--ring);border-radius:12px;padding:13px 15px}
.tile .v{font-size:27px;font-weight:660;letter-spacing:-.02em;line-height:1.15}
.tile .k{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.055em;margin-top:3px}
.tile .sub{font-size:11.5px;color:var(--ink-2);margin-top:5px}
.tile.flag .v{color:var(--critical)}

/* tabs */
.tabs{display:flex;gap:2px;border-bottom:1px solid var(--grid);margin:26px 0 0;overflow-x:auto}
.tab{background:none;border:0;border-bottom:2px solid transparent;padding:9px 13px;cursor:pointer;
  color:var(--ink-2);font-size:13.5px;white-space:nowrap}
.tab:hover{color:var(--ink)}
.tab[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--accent);font-weight:600}
.panel{padding-top:20px}
.panel[hidden]{display:none}

/* cards */
.card{background:var(--surface);border:1px solid var(--ring);border-radius:12px;padding:16px 18px;margin-bottom:12px}
.card h3{font-size:14.5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.card p{margin:9px 0 0;color:var(--ink-2);font-size:13.2px;max-width:82ch}
.chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:11px}
.chip{font:11.5px/1 var(--mono);background:var(--plane);border:1px solid var(--ring);
  border-radius:6px;padding:5px 7px;color:var(--ink-2)}
.chip.click{cursor:pointer}
.chip.click:hover{border-color:var(--accent);color:var(--ink)}

/* status pill: icon + label, never colour alone */
.pill{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;
  border-radius:999px;padding:3px 9px;border:1px solid;white-space:nowrap}
.pill svg{width:11px;height:11px;flex:none}
.p-good{color:var(--good);border-color:var(--good)}
.p-warning{color:#8a6100;border-color:var(--warning)}
.p-serious{color:#a24d24;border-color:var(--serious)}
.p-critical{color:var(--critical);border-color:var(--critical)}
.p-idle{color:var(--muted);border-color:var(--axis)}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .p-warning{color:var(--warning)}
  :root:where(:not([data-theme="light"])) .p-serious{color:var(--serious)}}
:root[data-theme="dark"] .p-warning{color:var(--warning)}
:root[data-theme="dark"] .p-serious{color:var(--serious)}

/* segmented bar */
.segbar{display:flex;height:26px;border-radius:7px;overflow:hidden;gap:2px;background:var(--surface);margin:6px 0 10px}
.segbar div{height:100%}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:var(--ink-2)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.swatch{width:10px;height:10px;border-radius:3px;flex:none}

/* controls */
.controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}
input[type=text],input[type=url],select{background:var(--surface);color:var(--ink);
  border:1px solid var(--ring);border-radius:9px;padding:8px 11px;font:13.5px var(--sans);min-width:0}
input:focus,select:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:transparent}
.grow{flex:1 1 210px}
.btn{background:var(--accent);color:#fff;border:0;border-radius:9px;padding:8px 14px;
  cursor:pointer;font-size:13.5px;font-weight:560}
.btn:disabled{opacity:.55;cursor:default}
.btn.ghost{background:var(--surface);color:var(--ink-2);border:1px solid var(--ring)}
.btn.ghost:hover:not(:disabled){color:var(--ink);border-color:var(--axis)}
label.check{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink-2);cursor:pointer}

/* table */
.wrap{overflow-x:auto;border:1px solid var(--ring);border-radius:12px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--grid);vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);
  font-weight:600;position:sticky;top:0;background:var(--surface);cursor:pointer;white-space:nowrap;z-index:1}
th:hover{color:var(--ink)}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover{background:var(--plane)}
td.path{font-family:var(--mono);font-size:12.3px;white-space:nowrap}
td.num{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink-2)}
.tag{display:inline-block;font:10.5px/1 var(--mono);padding:3px 5px;border-radius:5px;
  border:1px solid var(--ring);color:var(--ink-2);margin:1px 2px 1px 0}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;vertical-align:1px}
.empty{padding:30px;text-align:center;color:var(--muted);font-size:13.5px}
.muted{color:var(--muted)}
details.rowx td{background:var(--plane)}
details summary{cursor:pointer;font-size:12.5px;color:var(--accent);list-style:none}
details summary::-webkit-details-marker{display:none}
details summary::before{content:"▸ ";display:inline-block;transition:transform .12s}
details[open] summary::before{transform:rotate(90deg)}
pre.env{background:var(--plane);border:1px solid var(--ring);border-radius:10px;padding:14px;
  overflow-x:auto;font:12.3px/1.6 var(--mono);color:var(--ink-2);margin:0;white-space:pre}
.note{font-size:12.5px;color:var(--muted);margin-top:8px}
.bar{height:5px;border-radius:3px;background:var(--grid);overflow:hidden;min-width:56px;margin-top:5px}
.bar>i{display:block;height:100%;background:var(--accent)}
@media (max-width:640px){#app{padding:20px 13px 80px}.tile .v{font-size:23px}.title h1{font-size:20px}}
@media print{.tabs,.controls,.iconbtn{display:none}.panel[hidden]{display:block!important}}
`;

/* ------------------------------------------------------------------- JS */

const JS = String.raw`
const D = JSON.parse(document.getElementById("data").textContent);
const $ = (s, r) => (r || document).querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const GROUPS = ["core","zuya","files","vault","digest"];
const GC = { core:"var(--s1)", zuya:"var(--s2)", files:"var(--s3)", vault:"var(--s4)", digest:"var(--s5)" };

const ICON = {
  good:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.2 11.5 3 8.3l1.1-1.1 2.1 2.1 5.6-5.6L13 4.8z"/></svg>',
  warning:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5 15 14H1zM7.2 6v4h1.6V6zm0 5v1.6h1.6V11z"/></svg>',
  serious:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.8 3h1.6v5H7.2zm0 6.4h1.6V12H7.2z"/></svg>',
  critical:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zM5.4 4.3 8 6.9l2.6-2.6 1.1 1.1L9.1 8l2.6 2.6-1.1 1.1L8 9.1l-2.6 2.6-1.1-1.1L6.9 8 4.3 5.4z"/></svg>',
  idle:'<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="3"/></svg>'
};
const pill = (lvl, txt) => '<span class="pill p-' + lvl + '">' + (ICON[lvl]||ICON.idle) + esc(txt) + '</span>';
const fmtTtl = (t) => t == null ? "—" : t >= 3600 ? (t/3600) + "h" : t >= 60 ? (t/60) + "m" : t + "s";

/* ------------------------------------------------------------ shell */

function render() {
  const t = D.totals;
  $("#app").innerHTML = ''
  + '<div class="top"><div class="title">'
  +   '<h1>System Map</h1>'
  +   '<p>Every API route in this app, what it needs to work, and what it depends on out on the internet — '
  +   'read straight from <code>src/</code> by <code>scripts/system-map.mjs</code>. '
  +   'Open this page from a running server and it can probe the routes too.</p>'
  + '</div><div style="display:flex;gap:8px;align-items:center">'
  +   '<button class="iconbtn" id="theme">Theme</button>'
  +   '<span class="stamp">' + new Date(D.generated).toLocaleString() + '</span>'
  + '</div></div>'

  + '<div class="tiles">'
  +   tile(t.routes, "API routes", t.files + " src files · " + t.loc.toLocaleString() + " lines")
  +   tile(t.hosts, "External hosts", t.proxied + " routes via proxies/mirrors")
  +   tile(t.envs, "Env vars read", (t.envs - t.undocumented) + " documented")
  +   tile(t.undocumented, "Undocumented", "missing from .env.local.example", t.undocumented > 0)
  +   tile(D.routes.filter(r => r.auth.length).length, "Auth-guarded", "of " + t.routes + " routes")
  +   tile(t.themes, "Themes", "src/app/themes")
  + '</div>'

  + '<div class="tabs" role="tablist">'
  +   ["Overview","Routes","Env & config","Dependencies"].map((n,i) =>
        '<button class="tab" role="tab" data-i="' + i + '" aria-selected="' + (i===0) + '">' + n + '</button>').join("")
  + '</div>'
  + [0,1,2,3].map(i => '<div class="panel" id="p' + i + '"' + (i ? " hidden" : "") + '></div>').join("");

  $("#theme").onclick = () => {
    const r = document.documentElement;
    const now = r.getAttribute("data-theme");
    r.setAttribute("data-theme", now === "dark" ? "light" : now === "light" ? "auto" : "dark");
  };
  document.querySelectorAll(".tab").forEach(b => b.onclick = () => {
    document.querySelectorAll(".tab").forEach(x => x.setAttribute("aria-selected", x === b));
    [0,1,2,3].forEach(i => $("#p"+i).hidden = String(i) !== b.dataset.i);
  });

  overview(); routesPanel(); envPanel(); depsPanel();
}
const tile = (v, k, sub, flag) =>
  '<div class="tile' + (flag ? " flag" : "") + '"><div class="v">' + v + '</div><div class="k">' + esc(k) + '</div>'
  + (sub ? '<div class="sub">' + esc(sub) + '</div>' : "") + '</div>';

/* --------------------------------------------------------- overview */

function overview() {
  const counts = GROUPS.map(g => ({ g, n: D.routes.filter(r => r.group === g).length })).filter(x => x.n);
  const total = counts.reduce((a, b) => a + b.n, 0);

  $("#p0").innerHTML =
    D.findings.map(f =>
      '<div class="card"><h3>' + pill(f.level, f.level) + esc(f.title) + '</h3>'
      + '<p>' + esc(f.body) + '</p>'
      + '<div class="chips">' + f.items.slice(0, 26).map(i => '<span class="chip">' + esc(i) + '</span>').join("")
      + (f.items.length > 26 ? '<span class="chip muted">+' + (f.items.length - 26) + ' more</span>' : "")
      + '</div></div>').join("")

    + '<div class="card"><h3>Routes by area</h3>'
    + '<div class="segbar">' + counts.map(c =>
        '<div style="width:' + (c.n / total * 100) + '%;background:' + GC[c.g] + '" title="' + c.g + ': ' + c.n + '"></div>').join("")
    + '</div><div class="legend">' + counts.map(c =>
        '<span><i class="swatch" style="background:' + GC[c.g] + '"></i>' + c.g + ' <b>' + c.n + '</b></span>').join("")
    + '</div>'
    + '<p>Exact counts are labelled above and every route is listed in the Routes tab — the colour is a '
    + 'shortcut, not the only way to read this.</p></div>'

    + '<div class="card"><h3>How to use this page</h3><p>'
    + '<b>Routes</b> lists every endpoint with its cache window, auth, env vars and external hosts — and can '
    + 'health-check the safe ones against a running server. <b>Env &amp; config</b> shows which features each '
    + 'variable actually controls, and generates a complete <code>.env.local.example</code>. '
    + '<b>Dependencies</b> ranks the outside world by how much of this app leans on it. '
    + 'Regenerate any time with <code>npm run map</code>.</p></div>';
}

/* ----------------------------------------------------------- routes */

let sortKey = "path", sortAsc = true, health = {};

function routesPanel() {
  $("#p1").innerHTML =
      '<div class="controls">'
    +   '<input type="text" id="q" class="grow" placeholder="Filter by path, host, env var, lib…">'
    +   '<select id="g"><option value="">All areas</option>' + GROUPS.map(g => '<option>' + g + '</option>').join("") + '</select>'
    +   '<select id="f"><option value="">All routes</option><option value="proxy">Uses proxy/mirror</option>'
    +     '<option value="auth">Auth-guarded</option><option value="nocache">No cache window</option>'
    +     '<option value="env">Needs env vars</option></select>'
    + '</div>'
    + '<div class="card" style="padding:14px 16px">'
    +   '<div class="controls" style="margin:0">'
    +     '<input type="url" id="base" class="grow" placeholder="http://localhost:3000">'
    +     '<button class="btn" id="run">Health check</button>'
    +     '<label class="check"><input type="checkbox" id="caution"> include side-effect-ish routes</label>'
    +     '<span id="hs" class="muted" style="font-size:12.5px"></span>'
    +   '</div>'
    +   '<p class="note" id="hnote">Probes only read-only GET routes. Routes that upload, delete, notify or take a '
    +   'dynamic <code>[id]</code> are never called. Serve this page from the app itself '
    +   '(<code>/system-map.html</code>) so requests are same-origin and your login session applies.</p>'
    + '</div>'
    + '<div id="tbl"></div>';

  const base = $("#base");
  base.value = location.protocol.startsWith("http") ? location.origin : "http://localhost:3000";
  $("#q").oninput = $("#g").onchange = $("#f").onchange = drawTable;
  $("#run").onclick = runHealth;
  drawTable();
}

function filtered() {
  const q = ($("#q").value || "").toLowerCase().trim();
  const g = $("#g").value, f = $("#f").value;
  return D.routes.filter(r => {
    if (g && r.group !== g) return false;
    if (f === "proxy" && !r.proxies.length && !r.mirrors.length) return false;
    if (f === "auth" && !r.auth.length) return false;
    if (f === "nocache" && (r.ttl != null || !r.hosts.length)) return false;
    if (f === "env" && !r.envs.length) return false;
    if (!q) return true;
    return (r.path + " " + r.hosts.join(" ") + " " + r.envs.join(" ") + " " + r.libs.join(" ") + " " + r.auth.join(" "))
      .toLowerCase().includes(q);
  }).sort((a, b) => {
    const k = sortKey;
    let x = k === "hosts" ? a.hosts.length : k === "envs" ? a.envs.length : k === "ttl" ? (a.ttl ?? -1) : k === "loc" ? a.loc : a[k];
    let y = k === "hosts" ? b.hosts.length : k === "envs" ? b.envs.length : k === "ttl" ? (b.ttl ?? -1) : k === "loc" ? b.loc : b[k];
    if (typeof x === "string") { x = x.toLowerCase(); y = String(y).toLowerCase(); }
    return (x < y ? -1 : x > y ? 1 : 0) * (sortAsc ? 1 : -1);
  });
}

function drawTable() {
  const rows = filtered();
  const cols = [["path","Route"],["group","Area"],["ttl","Cache"],["auth","Auth"],["envs","Env"],["hosts","External"],["loc","LOC"]];
  $("#tbl").innerHTML = rows.length ? '<div class="wrap"><table><thead><tr>'
    + cols.map(c => '<th data-k="' + c[0] + '">' + c[1] + (sortKey === c[0] ? (sortAsc ? " ↑" : " ↓") : "") + '</th>').join("")
    + '<th>Status</th></tr></thead><tbody>'
    + rows.map(rowHtml).join("")
    + '</tbody></table></div>'
    : '<div class="wrap"><div class="empty">No routes match that filter.</div></div>';

  document.querySelectorAll("#tbl th[data-k]").forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    if (sortKey === k) sortAsc = !sortAsc; else { sortKey = k; sortAsc = true; }
    drawTable();
  });
}

function rowHtml(r) {
  const h = health[r.path];
  const risky = [...r.proxies, ...r.mirrors];
  const status = h ? pill(h.level, h.label)
    : r.probe === "unsafe" ? '<span class="muted" style="font-size:11.5px" title="' + esc(r.why) + '">not probed</span>'
    : pill("idle", "unchecked");

  return '<tr>'
    + '<td class="path"><span class="dot" style="background:' + GC[r.group] + '"></span>' + esc(r.path)
    +   (r.methods.join() !== "GET" ? ' <span class="tag">' + r.methods.join(" ") + '</span>' : "")
    +   '<div class="muted" style="font-size:11.5px;margin-top:3px">' + esc(r.file) + '</div>'
    +   (risky.length ? '<div style="margin-top:5px">' + pill("serious", risky.length + " proxy/mirror") + '</div>' : "")
    + '</td>'
    + '<td>' + r.group + '</td>'
    + '<td class="num">' + fmtTtl(r.ttl) + (r.dynamic ? '<div class="muted" style="font-size:10.5px">' + esc(r.dynamic) + '</div>' : "") + '</td>'
    + '<td>' + (r.auth.length ? r.auth.map(a => '<span class="tag">' + a + '</span>').join("") : '<span class="muted">public</span>') + '</td>'
    + '<td>' + (r.envs.length ? '<details><summary>' + r.envs.length + '</summary><div class="chips">'
        + r.envs.map(e => '<span class="chip">' + esc(e) + '</span>').join("") + '</div></details>' : '<span class="muted">—</span>') + '</td>'
    + '<td>' + (r.hosts.length ? '<details><summary>' + r.hosts.length + '</summary><div class="chips">'
        + r.hosts.map(x => '<span class="chip">' + esc(x) + '</span>').join("") + '</div></details>' : '<span class="muted">—</span>') + '</td>'
    + '<td class="num">' + r.loc + '</td>'
    + '<td>' + status + (h && h.ms != null ? '<div class="muted" style="font-size:11px;margin-top:3px">' + h.ms + ' ms</div>' : "") + '</td>'
    + '</tr>';
}

/* ----------------------------------------------------- health check */

async function runHealth() {
  const base = $("#base").value.replace(/\/+$/, "");
  if (!base) return;
  const includeCaution = $("#caution").checked;
  const list = D.routes.filter(r => r.probe === "safe" || (includeCaution && r.probe === "caution"));
  const btn = $("#run"); btn.disabled = true;
  health = {};
  let done = 0;

  const one = async (r) => {
    const t0 = performance.now();
    try {
      const res = await fetch(base + r.path, { method: "GET", credentials: "include", redirect: "follow" });
      const ms = Math.round(performance.now() - t0);
      const s = res.status;
      health[r.path] = s < 300 ? { level: "good", label: String(s), ms }
        : s === 401 || s === 403 ? { level: "warning", label: s + " auth", ms }
        : s < 500 ? { level: "serious", label: String(s), ms }
        : { level: "critical", label: String(s), ms };
    } catch (e) {
      health[r.path] = { level: "critical", label: "unreachable", ms: Math.round(performance.now() - t0) };
    }
    $("#hs").textContent = ++done + " / " + list.length;
    if (done % 4 === 0 || done === list.length) drawTable();
  };

  /* Small concurrency pool — these routes fan out to slow upstreams. */
  const queue = list.slice();
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (queue.length) await one(queue.shift());
  }));

  drawTable();
  btn.disabled = false;
  const vals = Object.values(health);
  const bad = vals.filter(v => v.level === "critical").length;
  const slow = vals.filter(v => v.ms > 2000).length;
  $("#hs").textContent = vals.length + " checked · " + bad + " failing · " + slow + " over 2 s";
  if (bad === vals.length && vals.length > 1) {
    $("#hnote").innerHTML = '<b>Every route failed.</b> If this page was opened straight from disk '
      + '(<code>file://</code>), the browser blocks the requests before they leave — serve it from the app at '
      + '<code>' + esc($("#base").value) + '/system-map.html</code> instead.';
  }
}

/* -------------------------------------------------------------- env */

function envPanel() {
  const undoc = D.envs.filter(e => !e.documented);
  $("#p2").innerHTML =
      '<div class="controls"><input type="text" id="eq" class="grow" placeholder="Filter variables…">'
    + '<button class="btn ghost" id="copyenv">Copy generated .env.local.example</button></div>'
    + '<div id="etbl"></div>'
    + '<div class="card"><h3>Generated .env.local.example</h3>'
    + '<p>Every variable the code actually reads, grouped, with the ' + undoc.length
    + ' currently-missing ones included. Values are placeholders — copy this over the real file and fill it in.</p>'
    + '<pre class="env" id="envout">' + esc(envFile()) + '</pre></div>';

  $("#eq").oninput = drawEnv;
  $("#copyenv").onclick = async (e) => {
    try { await navigator.clipboard.writeText(envFile()); e.target.textContent = "Copied"; }
    catch { e.target.textContent = "Select the text below"; }
    setTimeout(() => { e.target.textContent = "Copy generated .env.local.example"; }, 1800);
  };
  drawEnv();
}

function drawEnv() {
  const q = ($("#eq").value || "").toLowerCase().trim();
  const rows = D.envs.filter(e => !q || (e.name + " " + e.note + " " + e.routes.join(" ")).toLowerCase().includes(q));
  const max = Math.max(1, ...D.envs.map(e => e.routes.length));

  $("#etbl").innerHTML = rows.length ? '<div class="wrap"><table><thead><tr>'
    + '<th>Variable</th><th>Documented</th><th>What breaks without it</th><th>Routes</th></tr></thead><tbody>'
    + rows.map(e => '<tr>'
      + '<td class="path">' + esc(e.name)
        + (e.isPublic ? ' <span class="tag">public</span>' : e.secret ? ' <span class="tag">secret</span>' : "") + '</td>'
      + '<td>' + (e.documented ? pill("good", "yes") : pill("critical", "missing")) + '</td>'
      + '<td style="max-width:40ch">' + (e.note ? esc(e.note) : '<span class="muted">used in ' + e.files.length + ' file(s)</span>')
        + '<div class="muted" style="font-size:11px;margin-top:4px">' + esc(e.files.slice(0,3).join(", "))
        + (e.files.length > 3 ? " +" + (e.files.length - 3) : "") + '</div></td>'
      + '<td class="num">' + (e.routes.length || "—")
        + (e.routes.length ? '<div class="bar"><i style="width:' + (e.routes.length / max * 100) + '%"></i></div>' : "")
        + '</td></tr>').join("")
    + '</tbody></table></div>'
    : '<div class="wrap"><div class="empty">No variables match.</div></div>';
}

function envFile() {
  const S = [
    ["Supabase", /^(NEXT_PUBLIC_)?SUPABASE/],
    ["Google OAuth — calendar", /^GOOGLE_/],
    ["Web push", /VAPID/],
    ["Daily & weekly digest email", /^(RESEND|DIGEST|CRON)/],
    ["Zuya", /^ZUYA_/],
    ["Third-party content APIs", /^(YOUTUBE|YT|NASA|OMDB|REDDIT|SPOTIFY)/],
    ["docsync agent", /^DOCSYNC_/],
    ["Build & scrape scripts", /^SCRAPINGBEE/],
    ["App", /^NEXT_PUBLIC_(SITE_URL|APP)$/],
  ];
  const placeholder = (n) => n.endsWith("_URL") ? "https://" : n.includes("INTERVAL") ? "60" : "REPLACE_ME";
  const used = new Set();
  let out = "# Generated by scripts/system-map.mjs — every variable the code reads.\n"
          + "# Regenerate with: npm run map\n";

  for (const [title, re] of S) {
    const hits = D.envs.filter(e => re.test(e.name) && !used.has(e.name));
    if (!hits.length) continue;
    hits.forEach(e => used.add(e.name));
    out += "\n# " + title + "\n" + "# " + "-".repeat(title.length) + "\n";
    for (const e of hits) {
      if (e.note) out += "# " + e.note + "\n";
      if (!e.documented) out += "# (was missing from the previous example file)\n";
      out += e.name + "=" + placeholder(e.name) + "\n";
    }
  }
  const rest = D.envs.filter(e => !used.has(e.name));
  if (rest.length) {
    out += "\n# Other\n# -----\n";
    for (const e of rest) { if (e.note) out += "# " + e.note + "\n"; out += e.name + "=" + placeholder(e.name) + "\n"; }
  }
  return out;
}

/* ------------------------------------------------------------- deps */

function depsPanel() {
  const kinds = { proxy: "public CORS proxy", mirror: "Invidious/Piped mirror", direct: "direct" };
  const lvl = { proxy: "critical", mirror: "serious", direct: "good" };
  const max = Math.max(...D.hosts.map(h => h.routes.length));

  $("#p3").innerHTML =
      '<div class="controls"><input type="text" id="hq" class="grow" placeholder="Filter hosts…">'
    + '<select id="hk"><option value="">All kinds</option><option value="proxy">Proxies</option>'
    + '<option value="mirror">Mirrors</option><option value="direct">Direct</option></select></div>'
    + '<div id="htbl"></div>';

  const draw = () => {
    const q = ($("#hq").value || "").toLowerCase().trim(), k = $("#hk").value;
    const rows = D.hosts.filter(h => (!k || h.kind === k) && (!q || (h.host + " " + h.routes.join(" ")).toLowerCase().includes(q)));
    $("#htbl").innerHTML = rows.length ? '<div class="wrap"><table><thead><tr>'
      + '<th>Host</th><th>Kind</th><th>Routes depending on it</th></tr></thead><tbody>'
      + rows.map(h => '<tr>'
        + '<td class="path">' + esc(h.host) + '<div class="bar" style="max-width:120px"><i style="width:'
          + (h.routes.length / max * 100) + '%"></i></div></td>'
        + '<td>' + pill(lvl[h.kind], kinds[h.kind]) + '</td>'
        + '<td><details><summary>' + h.routes.length + ' route' + (h.routes.length > 1 ? "s" : "") + '</summary>'
        + '<div class="chips">' + h.routes.map(r => '<span class="chip">' + esc(r) + '</span>').join("") + '</div></details></td>'
        + '</tr>').join("")
      + '</tbody></table></div>'
      : '<div class="wrap"><div class="empty">No hosts match.</div></div>';
  };
  $("#hq").oninput = $("#hk").onchange = draw;
  draw();
}

render();
`;

/* ---------------------------------------------------------------- write */

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, renderHtml(data));

console.log(`system-map → ${rel(OUT)}`);
console.log(`  ${data.totals.routes} routes · ${data.totals.hosts} external hosts · ${data.totals.envs} env vars`);
console.log(`  ${data.totals.undocumented} undocumented env vars · ${data.totals.proxied} proxy-dependent routes`);
