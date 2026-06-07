// Sunday wrap-up — fires once a week via Vercel Cron (see vercel.json,
// "0 4 * * 1" = Mon 04:00 UTC = 11 PM Sun CDT / 10 PM Sun CST in Dallas).
// Sends a snapshot of the week's habits, weight delta, and count of
// Eisenhower tasks completed this week (calendar events excluded).
//
// Trigger:
//   GET /api/digest/weekly?send=1     — emails the digest
//   GET /api/digest/weekly            — renders preview HTML (no send)
//
// Same env vars as /api/digest/daily.

import { NextResponse } from "next/server";
import {
  readEnv, fetchPrefs, fetchTasks, fetchWeightEntries,
  sendEmail, esc, shell, localDateKey, weekDaysFor,
} from "@/lib/digest/shared";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface Task { id: string; title: string; status: "todo" | "doing" | "done"; quadrant: string | null; completed?: string | null }

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wantSend = url.searchParams.get("send") === "1";
  const env = readEnv();
  if (!env) {
    return new Response(
      "<h1>Weekly digest preview unavailable.</h1><p>Missing env: RESEND_API_KEY / DIGEST_FROM / DIGEST_TO / SUPABASE_URL / SUPABASE_SERVICE_KEY / DIGEST_USER_ID.</p>",
      { headers: { "Content-Type": "text/html" } },
    );
  }
  const cronHeader = req.headers.get("x-vercel-signature") ?? req.headers.get("user-agent") ?? "";
  const fromCron = /vercel/i.test(cronHeader);
  const tokenOk = url.searchParams.get("token") === process.env.CRON_SECRET;
  if (wantSend && !fromCron && !tokenOk) {
    return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }

  const [prefs, tasks, weights] = await Promise.all([
    fetchPrefs(env),
    fetchTasks(env),
    fetchWeightEntries(env),
  ]);

  // ---- Habits this week ------------------------------------------------
  const today = localDateKey();
  const week = weekDaysFor(today);
  const habitList = (prefs.habitList as string[] | undefined) ?? [];
  const habitDone = (prefs.habits as Record<string, string[]> | undefined) ?? {};
  const habitsRows = habitList.map((h) => {
    const done = (habitDone[h] ?? []).filter((d) => week.includes(d));
    return { habit: h, count: done.length, days: done.length };
  });

  // ---- Weight delta this week -----------------------------------------
  const inWeek = weights.filter((e) => week.includes(e.date));
  const sortedThis = [...inWeek].sort((a, b) => a.date.localeCompare(b.date));
  // Compare to whatever was logged just before this week began.
  const before = [...weights].filter((e) => e.date < week[0]).sort((a, b) => a.date.localeCompare(b.date));
  const start = sortedThis[0]?.weight ?? before[before.length - 1]?.weight ?? null;
  const end = sortedThis[sortedThis.length - 1]?.weight ?? start;
  const delta = start != null && end != null ? +(end - start).toFixed(1) : null;

  // ---- Eisenhower tasks completed this week ---------------------------
  // The matrix carries quadrants Q1-Q4; calendar events live elsewhere, so
  // restricting to tasks with a quadrant naturally excludes them.
  const weekStartMs = +new Date(week[0] + "T00:00:00");
  const weekEndMs = +new Date(week[6] + "T23:59:59");
  const eisenhowerTasks = (tasks as Task[]).filter((t) => t.quadrant);
  const completedThisWeek = eisenhowerTasks.filter((t) => {
    if (t.status !== "done" || !t.completed) return false;
    const c = +new Date(t.completed);
    return c >= weekStartMs && c <= weekEndMs;
  });
  const byQuad: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  for (const t of completedThisWeek) if (t.quadrant && byQuad[t.quadrant] != null) byQuad[t.quadrant]++;

  // ---- HTML composition ------------------------------------------------
  const habitsBlock = habitsRows.length === 0
    ? `<p style="color:#6b6b6b;margin:6px 0 0;">No habits tracked.</p>`
    : `<table style="border-collapse:collapse;margin:6px 0 0;font-size:13px;">
        ${habitsRows.map((r) => {
          const bar = "■".repeat(r.days) + "·".repeat(7 - r.days);
          return `<tr><td style="padding:3px 12px 3px 0;">${esc(r.habit)}</td>
                      <td style="padding:3px 0;font-family:monospace;letter-spacing:2px;color:#1b6e3c;">${bar}</td>
                      <td style="padding:3px 0 3px 12px;color:#6b6b6b;font-family:monospace;">${r.days}/7</td></tr>`;
        }).join("")}
      </table>`;

  const weightLine = delta == null
    ? `<p style="color:#6b6b6b;margin:6px 0 0;">No weight entries this week.</p>`
    : `<p style="margin:6px 0 0;">
        ${start != null ? `Started <strong>${start}</strong>` : ""} ·
        ${end != null ? `Ended <strong>${end}</strong>` : ""} ·
        <strong style="color:${delta > 0 ? "#b3261e" : delta < 0 ? "#1b6e3c" : "#6b6b6b"};">
          ${delta > 0 ? "+" : ""}${delta} lb
        </strong>
      </p>`;

  const tasksTotal = completedThisWeek.length;
  const tasksBlock = `
    <p style="margin:6px 0 0;font-size:18px;"><strong>${tasksTotal}</strong> completed.</p>
    <p style="margin:4px 0 0;color:#6b6b6b;font-size:12px;">
      Urgent + Important <strong>${byQuad.Q1}</strong> ·
      Important <strong>${byQuad.Q2}</strong> ·
      Urgent <strong>${byQuad.Q3}</strong> ·
      Neither <strong>${byQuad.Q4}</strong>
    </p>`;

  const weekLabel = `${new Date(week[0] + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(week[6] + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  const body = `
    <h1 style="font-size:22px;margin:0 0 6px;line-height:1.2;font-weight:700;">Sunday wrap-up</h1>
    <div style="color:#6b6b6b;font-size:13px;margin-bottom:22px;">Week of ${esc(weekLabel)}</div>

    <h2 style="font-size:14px;margin:0 0 0;">Habits</h2>
    ${habitsBlock}

    <h2 style="font-size:14px;margin:22px 0 0;">Weight</h2>
    ${weightLine}

    <h2 style="font-size:14px;margin:22px 0 0;">Eisenhower tasks completed</h2>
    ${tasksBlock}
  `;
  const html = shell("Sunday wrap-up", body);

  if (wantSend) {
    const r = await sendEmail(env, `Sunday wrap-up · week of ${weekLabel}`, html);
    return NextResponse.json(r);
  }
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}
