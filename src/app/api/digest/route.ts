// Weekly digest — generates a rich HTML email summarising the week from
// every dataset the dashboard tracks. Triggered weekly by GitHub Actions
// (Friday evening) and on-demand from this route. Sends through Resend
// when configured; otherwise renders the HTML for preview at `/api/digest`.
//
// Env needed for sending:
//   RESEND_API_KEY      — https://resend.com/api-keys
//   DIGEST_FROM         — sender, e.g. "Brief Digest <digest@yourdomain.com>"
//   DIGEST_TO           — recipient (your own email)
//   SUPABASE_URL,
//   SUPABASE_SERVICE_KEY — server-side Supabase access to read user prefs
//                          and body_profile. Service key bypasses RLS so
//                          the cron job can pull data without a session.
//   DIGEST_USER_ID      — your user_id (Supabase auth.users.id) to pull
//                          prefs for. Optional — when absent the route
//                          will render preview HTML using mock data.
//
// Trigger this route once with `?send=1` to email yourself, or just open
// it in the browser to preview the HTML.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// --- types pulled straight from the prefs blob ----------------------------

interface LineItem { id: string; label: string; amount: number }
interface Snapshot { month: string; net: number; assets: number; debt: number }
interface Sub { id: string; name: string; amount: number; cycle: "mo" | "yr"; nextBill: string }
interface CpaEntry { status: string; hours: number; examDate: string; score: string }
type CpaSection = "AUD" | "FAR" | "REG" | "TCP";
interface AppItem { id: string; company: string; role: string; stage: string; deadline: string }
interface FocusDaily { date: string; seconds: number; sessions: number }
interface CustomDeadline { id: string; title: string; date: string; note?: string }

interface Prefs {
  "hub.income"?: LineItem[]; "hub.expenses"?: LineItem[];
  "hub.investments"?: LineItem[]; "hub.debts"?: LineItem[];
  "hub.subscriptions"?: Sub[]; "hub.cpa"?: Record<CpaSection, CpaEntry>;
  "hub.apps"?: AppItem[]; "hub.networth.history"?: Snapshot[];
  "hub.deadlines.custom"?: CustomDeadline[];
  "hub.focus.daily"?: FocusDaily; "hub.focus.lifetimeSeconds"?: number;
  habits?: Record<string, string[]>; habitList?: string[];
  scratchpad?: string;
}

// --- helpers --------------------------------------------------------------

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const localKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function daysOf(s: Date, e: Date): string[] {
  const out: string[] = []; const c = new Date(s);
  while (c <= e) { out.push(localKey(c)); c.setDate(c.getDate() + 1); }
  return out;
}
function daysUntil(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return Infinity;
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000);
}

// --- data fetch ----------------------------------------------------------

async function fetchPrefs(): Promise<Prefs | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const uid = process.env.DIGEST_USER_ID;
  if (!url || !key || !uid) return null;
  try {
    const r = await fetch(`${url}/rest/v1/user_settings?user_id=eq.${uid}&select=prefs`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const rows = (await r.json()) as Array<{ prefs?: Prefs }>;
    return rows[0]?.prefs ?? {};
  } catch { return null; }
}

// --- analysis ------------------------------------------------------------

function analyse(p: Prefs) {
  const inc = (p["hub.income"] ?? []).reduce((s, x) => s + x.amount, 0);
  const exp = (p["hub.expenses"] ?? []).reduce((s, x) => s + x.amount, 0);
  const inv = (p["hub.investments"] ?? []).reduce((s, x) => s + x.amount, 0);
  const debt = (p["hub.debts"] ?? []).reduce((s, x) => s + x.amount, 0);
  const surplus = inc - exp;
  const net = inv - debt;
  const subs = p["hub.subscriptions"] ?? [];
  const subsMo = subs.reduce((s, x) => s + (x.cycle === "yr" ? x.amount / 12 : x.amount), 0);

  // Net worth delta
  const hist = p["hub.networth.history"] ?? [];
  const prevSnap = hist.length > 1 ? hist[hist.length - 2] : null;
  const netDelta = prevSnap ? net - prevSnap.net : 0;

  // Top expenses
  const topExpenses = [...(p["hub.expenses"] ?? [])].sort((a, b) => b.amount - a.amount).slice(0, 3);

  // CPA
  const cpa = p["hub.cpa"] ?? {} as Record<CpaSection, CpaEntry>;
  const cpaSections: CpaSection[] = ["AUD", "FAR", "REG", "TCP"];
  const passed = cpaSections.filter((s) => cpa[s]?.status === "Passed").length;
  const totalHours = cpaSections.reduce((s, k) => s + (cpa[k]?.hours ?? 0), 0);
  const nextExam = cpaSections
    .map((s) => ({ sec: s, date: cpa[s]?.examDate, status: cpa[s]?.status }))
    .filter((x) => x.date && x.status !== "Passed" && daysUntil(x.date!) >= 0)
    .map((x) => ({ ...x, days: daysUntil(x.date!) }))
    .sort((a, b) => a.days - b.days)[0];

  // Subs due this week
  const subsThisWeek = subs.filter((s) => {
    if (!s.nextBill) return false;
    const d = daysUntil(s.nextBill);
    return d >= 0 && d <= 7;
  });

  // Apps activity counts
  const apps = p["hub.apps"] ?? [];
  const appStages: Record<string, number> = {};
  for (const a of apps) appStages[a.stage] = (appStages[a.stage] ?? 0) + 1;

  // Tax/key dates next 14 days — federal + Texas + cpa exam dates + custom
  const upcoming: Array<{ title: string; date: string; days: number; note?: string }> = [];
  const yr = new Date().getFullYear();
  const federalAndState: Array<[string, [number, number]]> = [
    ["1040 Individual return", [4, 15]],
    ["Q1 estimated tax", [4, 15]],
    ["Q2 estimated tax", [6, 15]],
    ["Q3 estimated tax", [9, 15]],
    ["Q4 estimated tax (prior year)", [1, 15]],
    ["S-corp / Partnership", [3, 15]],
    ["C-corp 1120 return", [4, 15]],
    ["FBAR (FinCEN 114)", [4, 15]],
    ["Form 5500", [7, 31]],
    ["S-corp/Partnership extension", [9, 15]],
    ["1040 / C-corp extension", [10, 15]],
    ["Texas Franchise Tax", [5, 15]],
    ["1099 / W-2 to recipients", [1, 31]],
  ];
  for (const [name, [m, d]] of federalAndState) {
    const candidates = [`${yr}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, `${yr + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`];
    for (const c of candidates) {
      const du = daysUntil(c);
      if (du >= 0 && du <= 14) upcoming.push({ title: name, date: c, days: du });
    }
  }
  for (const sec of cpaSections) {
    const e = cpa[sec]; if (!e?.examDate || e.status === "Passed") continue;
    const du = daysUntil(e.examDate);
    if (du >= 0 && du <= 14) upcoming.push({ title: `CPA · ${sec} exam`, date: e.examDate, days: du });
  }
  for (const c of (p["hub.deadlines.custom"] ?? [])) {
    const du = daysUntil(c.date);
    if (du >= 0 && du <= 14) upcoming.push({ title: c.title, date: c.date, days: du });
  }
  upcoming.sort((a, b) => a.days - b.days);

  // Habits this week
  const habitList = p.habitList ?? [];
  const habitDone = p.habits ?? {};
  const today = new Date(); today.setHours(0,0,0,0);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - 6);
  const weekDays = daysOf(weekStart, today);
  const habits = habitList.map((h) => {
    const done = (habitDone[h] ?? []).filter((d) => weekDays.includes(d));
    return { name: h, count: done.length, pct: Math.round((done.length / weekDays.length) * 100) };
  });

  // Focus today (the daily bucket; weekly aggregation would need a history)
  const focusDaily = p["hub.focus.daily"];
  const todayFocusSec = focusDaily?.date === localKey(today) ? focusDaily.seconds : 0;
  const lifetimeHrs = Math.floor((p["hub.focus.lifetimeSeconds"] ?? 0) / 3600);

  return {
    cashFlow: { inc, exp, surplus, savingsRate: inc > 0 ? Math.round((surplus / inc) * 100) : 0 },
    balance: { inv, debt, net, netDelta },
    topExpenses,
    subsMo, subsThisWeek,
    cpa: { passed, totalHours, nextExam, sections: cpaSections.map((s) => ({ s, ...cpa[s] })) },
    apps: { total: apps.length, byStage: appStages },
    upcoming,
    habits,
    focus: { todaySec: todayFocusSec, lifetimeHrs },
    scratch: (p.scratchpad ?? "").trim().slice(0, 280),
  };
}

// --- HTML render ---------------------------------------------------------

function fmtMin(s: number) {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function row(label: string, value: string, tone?: "up" | "down") {
  const c = tone === "up" ? "#0ea5e9" : tone === "down" ? "#dc2626" : "#0a0c15";
  return `<tr>
    <td style="padding:8px 0;color:#5d5f6e;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">${label}</td>
    <td style="padding:8px 0;text-align:right;color:${c};font-family:'JetBrains Mono',monospace;font-weight:600;font-size:14px;">${value}</td>
  </tr>`;
}

function section(title: string, body: string) {
  return `<table style="width:100%;border-collapse:collapse;margin:18px 0;">
    <tr><td style="border-top:1px solid #e6e6ee;padding:12px 0 8px;color:#0a0c15;font-weight:700;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;">${title}</td></tr>
    <tr><td>${body}</td></tr>
  </table>`;
}

function renderHtml(d: ReturnType<typeof analyse>): string {
  const cf = section("Cash flow this month", `
    <table style="width:100%;border-collapse:collapse;">
      ${row("Surplus", money(d.cashFlow.surplus), d.cashFlow.surplus >= 0 ? "up" : "down")}
      ${row("Income", money(d.cashFlow.inc))}
      ${row("Expenses", money(d.cashFlow.exp), "down")}
      ${row("Savings rate", `${d.cashFlow.savingsRate}%`)}
    </table>
    ${d.topExpenses.length ? `<p style="margin:10px 0 0;color:#5d5f6e;font-size:12px;">Top expenses: ${d.topExpenses.map((e) => `<b style="color:#0a0c15;">${e.label}</b> ${money(e.amount)}`).join(" · ")}</p>` : ""}
  `);

  const nw = section("Net worth", `
    <table style="width:100%;border-collapse:collapse;">
      ${row("Total", money(d.balance.net), d.balance.net >= 0 ? "up" : "down")}
      ${row("Investments & assets", money(d.balance.inv))}
      ${row("Debt & liabilities", money(d.balance.debt), "down")}
      ${row("Vs. last month", `${d.balance.netDelta >= 0 ? "+" : ""}${money(d.balance.netDelta)}`, d.balance.netDelta >= 0 ? "up" : "down")}
    </table>
  `);

  const subs = section("Subscriptions", `
    <table style="width:100%;border-collapse:collapse;">
      ${row("Per month", money(d.subsMo))}
      ${row("Per year", money(d.subsMo * 12))}
    </table>
    ${d.subsThisWeek.length ? `<p style="margin:10px 0 0;color:#5d5f6e;font-size:12px;">Due this week: ${d.subsThisWeek.map((s) => `<b style="color:#0a0c15;">${s.name}</b>`).join(" · ")}</p>` : `<p style="margin:10px 0 0;color:#9ea0ad;font-size:12px;font-style:italic;">Nothing billing this week.</p>`}
  `);

  const cpaBody = `
    <table style="width:100%;border-collapse:collapse;">
      ${row("Sections passed", `${d.cpa.passed} / 4`, d.cpa.passed === 4 ? "up" : undefined)}
      ${row("Hours logged", String(d.cpa.totalHours))}
      ${d.cpa.nextExam ? row(`Next exam · ${d.cpa.nextExam.sec}`, `in ${d.cpa.nextExam.days} day${d.cpa.nextExam.days === 1 ? "" : "s"}`) : ""}
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:8px;">
      <tr>
        ${d.cpa.sections.map((s) => `
          <td style="padding:8px 6px;border:1px solid #e6e6ee;border-radius:4px;background:#fafafd;font-size:11px;text-align:center;">
            <div style="font-weight:700;color:#0a0c15;font-size:14px;">${s.s}</div>
            <div style="color:#5d5f6e;margin-top:2px;">${s.status ?? "—"}</div>
            <div style="color:#9ea0ad;font-family:'JetBrains Mono',monospace;margin-top:2px;">${s.hours ?? 0}h</div>
          </td>
        `).join("")}
      </tr>
    </table>`;
  const cpaSec = section("CPA exam", cpaBody);

  const dl = section("Upcoming deadlines (14 days)",
    d.upcoming.length
      ? `<ul style="margin:0;padding:0;list-style:none;">${d.upcoming.map((u) => `
        <li style="padding:8px 0;border-top:1px solid #f0f0f5;color:#0a0c15;font-size:13px;">
          <span>${u.title}</span>
          <span style="color:#5d5f6e;font-family:'JetBrains Mono',monospace;float:right;">${u.date} · in ${u.days}d</span>
        </li>`).join("")}</ul>`
      : `<p style="margin:0;color:#9ea0ad;font-size:12px;font-style:italic;">Nothing on the horizon — enjoy.</p>`);

  const apps = section("Applications",
    `<p style="margin:0;color:#0a0c15;font-size:13px;">${d.apps.total} total · ${Object.entries(d.apps.byStage).map(([k, v]) => `<b>${k}</b> ${v}`).join(" · ") || "no entries"}</p>`);

  const habitsBody = d.habits.length
    ? `<table style="width:100%;border-collapse:collapse;">${d.habits.map((h) => `
        <tr>
          <td style="padding:8px 0;color:#0a0c15;font-size:13px;">${h.name}</td>
          <td style="padding:8px 0;text-align:right;font-family:'JetBrains Mono',monospace;color:${h.pct >= 70 ? "#0ea5e9" : "#5d5f6e"};font-size:12px;">${h.count}/7 · ${h.pct}%</td>
        </tr>`).join("")}</table>`
    : `<p style="margin:0;color:#9ea0ad;font-size:12px;font-style:italic;">No habits tracked yet.</p>`;
  const habitsSec = section("Habits (last 7 days)", habitsBody);

  const focus = section("Focus", `
    <table style="width:100%;border-collapse:collapse;">
      ${row("Today", fmtMin(d.focus.todaySec))}
      ${row("Lifetime", `${d.focus.lifetimeHrs}h`)}
    </table>`);

  const scratch = d.scratch ? section("From your scratchpad", `<blockquote style="margin:0;padding:10px 14px;border-left:3px solid #0e7490;background:#fafafd;color:#0a0c15;font-size:13px;font-style:italic;white-space:pre-wrap;">${d.scratch}</blockquote>`) : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Weekly digest</title></head>
<body style="margin:0;padding:32px 16px;background:#eef0f5;color:#0a0c15;font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;box-shadow:0 12px 36px -18px rgba(8,12,25,0.18);">
    <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#5d5f6e;font-weight:600;">Rest Area · Weekly digest</div>
    <h1 style="margin:6px 0 0;font-size:30px;line-height:1.05;color:#0a0c15;letter-spacing:-0.03em;">
      <span style="background:linear-gradient(118deg,#0c4a6e,#0e7490 45%,#a16207);-webkit-background-clip:text;background-clip:text;color:transparent;">Week of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}</span>
    </h1>
    <p style="margin:8px 0 0;color:#5d5f6e;font-size:13px;">Everything the dashboard tracked — boiled down into a single page.</p>
    ${nw}${cf}${subs}${cpaSec}${dl}${apps}${habitsSec}${focus}${scratch}
    <p style="margin:24px 0 0;color:#9ea0ad;font-size:11px;text-align:center;">Generated by Rest Area · Visit your dashboard for live data.</p>
  </div>
</body></html>`;
}

// --- send via Resend -----------------------------------------------------

async function sendEmail(html: string): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.DIGEST_FROM;
  const to = process.env.DIGEST_TO;
  if (!key || !from || !to) return { ok: false, error: "missing_env" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to,
        subject: `Rest Area · Week of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}`,
        html,
      }),
    });
    if (!r.ok) return { ok: false, error: `resend ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send_failed" };
  }
}

// --- handler -------------------------------------------------------------

export async function GET(req: Request) {
  const url = new URL(req.url);
  const send = url.searchParams.get("send") === "1";

  let prefs = await fetchPrefs();
  if (!prefs) {
    // No Supabase env yet — render with empty data so preview still works.
    prefs = {};
  }
  const html = renderHtml(analyse(prefs));

  if (send) {
    const result = await sendEmail(html);
    return NextResponse.json({ sent: result.ok, error: result.error });
  }

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
