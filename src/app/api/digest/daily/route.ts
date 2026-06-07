// Daily digest — fires once a day via Vercel Cron (see vercel.json,
// "0 13 * * *" = 13:00 UTC = 8 AM CDT / 7 AM CST in Dallas). Sends a short
// briefing: today's calendar, a small quote, tasks due in the next 3 days,
// and any UFC/Beşiktaş matches in the next 3 days.
//
// Trigger:
//   GET /api/digest/daily?send=1     — emails the digest
//   GET /api/digest/daily            — renders preview HTML (no send)
//
// Required env (set in Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY             https://resend.com/api-keys
//   DIGEST_FROM                e.g. "Rest Area <digest@yourdomain.com>"
//   DIGEST_TO                  your email
//   SUPABASE_URL               your Supabase project URL
//   SUPABASE_SERVICE_KEY       service-role key (server-only, bypasses RLS)
//   DIGEST_USER_ID             your Supabase auth.users.id
//   GOOGLE_CLIENT_ID / SECRET  if calendar should appear in the email
//   CRON_SECRET                a long random string — Vercel Cron sets the
//                              `x-vercel-signature` header but we also accept
//                              `?token=…` for manual triggers.

import { NextResponse } from "next/server";
import {
  readEnv, fetchPrefs, fetchGoogleRefresh, fetchTasks,
  fetchCalendarEvents, fetchUfcMatches, fetchBesiktasNext,
  quoteForDate, sendEmail, esc, shell,
} from "@/lib/digest/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Task { id: string; title: string; status: "todo" | "doing" | "done"; due?: string | null }

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wantSend = url.searchParams.get("send") === "1";
  const env = readEnv();
  if (!env) {
    return new Response(
      "<h1>Daily digest preview unavailable.</h1><p>Missing env: RESEND_API_KEY / DIGEST_FROM / DIGEST_TO / SUPABASE_URL / SUPABASE_SERVICE_KEY / DIGEST_USER_ID.</p>",
      { headers: { "Content-Type": "text/html" } },
    );
  }
  // When the cron fires we let it through; manual fires need ?token=CRON_SECRET.
  const cronHeader = req.headers.get("x-vercel-signature") ?? req.headers.get("user-agent") ?? "";
  const fromCron = /vercel/i.test(cronHeader);
  const tokenOk = url.searchParams.get("token") === process.env.CRON_SECRET;
  if (wantSend && !fromCron && !tokenOk) {
    return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }

  // Pull data in parallel.
  const origin = `${url.protocol}//${url.host}`;
  const [prefs, googleRefresh, tasks, ufc, besiktas] = await Promise.all([
    fetchPrefs(env),
    fetchGoogleRefresh(env),
    fetchTasks(env),
    fetchUfcMatches(origin),
    fetchBesiktasNext(origin),
  ]);
  const calendar = googleRefresh ? await fetchCalendarEvents(googleRefresh, 1) : [];
  void prefs; // (not needed for the daily — kept for future expansions)

  const quote = quoteForDate();

  const inThreeDays = Date.now() + 3 * 86400 * 1000;
  const dueSoon = (tasks as Task[])
    .filter((t) => t.status !== "done" && t.due && +new Date(t.due) <= inThreeDays)
    .sort((a, b) => +new Date(a.due ?? 0) - +new Date(b.due ?? 0))
    .slice(0, 12);

  const today = new Date();
  const todayLabel = today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  // ---- HTML composition ------------------------------------------------
  const calBlock = calendar.length === 0
    ? `<p style="color:#6b6b6b;margin:6px 0 0;">Nothing on the calendar today.</p>`
    : `<ul style="margin:6px 0 0;padding-left:18px;">
        ${calendar.map((e) => {
          const when = e.allDay ? "all day" : new Date(e.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
          return `<li style="margin:4px 0;"><strong>${esc(when)}</strong> · ${esc(e.summary)}</li>`;
        }).join("")}
      </ul>`;

  const tasksBlock = dueSoon.length === 0
    ? `<p style="color:#6b6b6b;margin:6px 0 0;">No tasks due in the next 3 days.</p>`
    : `<ul style="margin:6px 0 0;padding-left:18px;">
        ${dueSoon.map((t) => {
          const due = t.due ? new Date(t.due).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "";
          return `<li style="margin:4px 0;"><strong>${esc(due)}</strong> · ${esc(t.title)}</li>`;
        }).join("")}
      </ul>`;

  const sportBits: string[] = [];
  if (besiktas) {
    const when = new Date(besiktas.date).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    sportBits.push(`<li style="margin:4px 0;">⚽ <strong>${esc(when)}</strong> · ${esc(besiktas.home)} vs ${esc(besiktas.away)}</li>`);
  }
  for (const u of ufc) {
    const when = new Date(u.date).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric" });
    sportBits.push(`<li style="margin:4px 0;">🥊 <strong>${esc(when)}</strong> · ${esc(u.event)}${u.main ? ` — <em>${esc(u.main)}</em>` : ""}</li>`);
  }
  const sportBlock = sportBits.length === 0
    ? ""
    : `<h2 style="font-size:14px;margin:22px 0 0;">Coming up</h2><ul style="margin:6px 0 0;padding-left:18px;">${sportBits.join("")}</ul>`;

  const body = `
    <h1 style="font-size:24px;margin:0 0 6px;line-height:1.2;font-weight:700;">${esc(todayLabel)}</h1>
    <div style="font-style:italic;color:#3c3c3c;margin:6px 0 22px;font-size:14px;">“${esc(quote.text)}” <span style="color:#9aa0a6;">— ${esc(quote.who)}</span></div>

    <h2 style="font-size:14px;margin:0 0 0;">Today's calendar</h2>
    ${calBlock}

    <h2 style="font-size:14px;margin:22px 0 0;">Due in the next 3 days</h2>
    ${tasksBlock}

    ${sportBlock}
  `;
  const html = shell("Daily briefing", body);

  if (wantSend) {
    const r = await sendEmail(env, `Daily briefing · ${todayLabel}`, html);
    return NextResponse.json(r);
  }
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
