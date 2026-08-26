// Server-side helpers shared by the daily + weekly digest emails. Both
// emails read the user's prefs blob + their stored Google refresh token from
// Supabase, fetch a few public APIs, and send through Resend. Pulled out so
// either route stays under ~150 lines.

interface Task {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
  quadrant: "Q1" | "Q2" | "Q3" | "Q4" | null;
  completed?: string | null;   // ISO timestamp set when status → done
  due?: string | null;         // ISO date
  created_at: string;
}

export interface DigestEnv {
  resendKey: string;
  from: string;
  to: string;
  supaUrl: string;
  supaServiceKey: string;
  userId: string;
}

export function readEnv(): DigestEnv | null {
  const e = {
    resendKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.DIGEST_FROM ?? "",
    to: process.env.DIGEST_TO ?? "",
    supaUrl: process.env.SUPABASE_URL ?? "",
    supaServiceKey: process.env.SUPABASE_SERVICE_KEY ?? "",
    userId: process.env.DIGEST_USER_ID ?? "",
  };
  if (Object.values(e).some((v) => !v)) return null;
  return e as DigestEnv;
}

// Tiny REST helpers (no Supabase SDK — keeps the digest routes free of
// any client-side bundle bloat). Service key bypasses RLS.
export async function supaGet<T>(env: DigestEnv, table: string, qs: string): Promise<T[]> {
  const r = await fetch(`${env.supaUrl}/rest/v1/${table}?${qs}`, {
    headers: { apikey: env.supaServiceKey, Authorization: `Bearer ${env.supaServiceKey}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) return [];
  return (await r.json()) as T[];
}

export async function fetchPrefs(env: DigestEnv): Promise<Record<string, unknown>> {
  const rows = await supaGet<{ prefs: unknown }>(env, "user_settings", `select=prefs&user_id=eq.${env.userId}&limit=1`);
  const p = rows[0]?.prefs;
  return (p && typeof p === "object") ? (p as Record<string, unknown>) : {};
}

export async function fetchGoogleRefresh(env: DigestEnv): Promise<string | null> {
  const rows = await supaGet<{ google_refresh_token: string | null }>(env, "user_settings", `select=google_refresh_token&user_id=eq.${env.userId}&limit=1`);
  return rows[0]?.google_refresh_token ?? null;
}

// The column is `due_date` and the status enum is not_started/planning/
// in_progress/on_hold/complete. This used to ask for a column called `due`,
// which PostgREST rejects outright — so the request 400'd, supaGet swallowed it,
// and the task section of every digest has been silently empty. Ask for the real
// columns and map them onto the shape the callers already expect.
interface TaskRow {
  id: string; title: string; status: string | null; quadrant: Task["quadrant"];
  completed: boolean | null; due_date: string | null; created_at: string;
}
export async function fetchTasks(env: DigestEnv): Promise<Task[]> {
  const rows = await supaGet<TaskRow>(
    env, "tasks", `select=id,title,status,quadrant,completed,due_date,created_at&user_id=eq.${env.userId}`,
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status === "complete" ? "done"
      : r.status === "in_progress" || r.status === "planning" ? "doing"
        : "todo",
    quadrant: r.quadrant,
    completed: r.completed ? r.created_at : null,
    due: r.due_date,
    created_at: r.created_at,
  }));
}

export async function fetchWeightEntries(env: DigestEnv): Promise<Array<{ date: string; weight: number }>> {
  const rows = await supaGet<{ payload: { entries?: Array<{ date: string; weight: number }> } | null }>(
    env, "body_profile", `select=payload&user_id=eq.${env.userId}&limit=1`,
  );
  return rows[0]?.payload?.entries ?? [];
}

// ---- Google Calendar via stored refresh token --------------------------

export async function fetchCalendarEvents(refreshToken: string, daysAhead = 3): Promise<Array<{ summary: string; start: string; allDay: boolean }>> {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return [];
  // Exchange the refresh token for a fresh access token.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id, client_secret: secret,
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) return [];
  const tok = (await tokenRes.json()) as { access_token?: string };
  if (!tok.access_token) return [];

  const now = new Date();
  const timeMax = new Date(now.getTime() + daysAhead * 86400 * 1000);
  const params = new URLSearchParams({
    maxResults: "25", singleEvents: "true", orderBy: "startTime",
    timeMin: now.toISOString(), timeMax: timeMax.toISOString(),
  });
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${tok.access_token}` }, cache: "no-store",
  });
  if (!r.ok) return [];
  const j = (await r.json()) as { items?: Array<{ summary?: string; start?: { dateTime?: string; date?: string } }> };
  return (j.items ?? []).map((e) => ({
    summary: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    allDay: !e.start?.dateTime && !!e.start?.date,
  }));
}

// ---- UFC + Besiktas (public routes already on our origin) ---------------

export async function fetchUfcMatches(origin: string): Promise<Array<{ event: string; date: string; main: string }>> {
  try {
    const r = await fetch(`${origin}/api/ufc`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const j = (await r.json()) as { upcoming?: Array<{ name?: string; date?: string; mainEvent?: string }> };
    const now = Date.now(), in3 = now + 3 * 86400 * 1000;
    return (j.upcoming ?? [])
      .filter((e) => { const t = +new Date(e.date ?? 0); return t >= now && t <= in3; })
      .map((e) => ({ event: e.name ?? "UFC card", date: e.date ?? "", main: e.mainEvent ?? "" }));
  } catch { return []; }
}

export async function fetchBesiktasNext(origin: string): Promise<{ home: string; away: string; date: string } | null> {
  try {
    const r = await fetch(`${origin}/api/superlig?team=Be%C5%9Fikta%C5%9F&teamId=1895`, {
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { next?: { home: string; away: string; date: string } | null };
    if (!j.next) return null;
    const t = +new Date(j.next.date);
    const in3 = Date.now() + 3 * 86400 * 1000;
    return t <= in3 ? j.next : null;
  } catch { return null; }
}

// ---- A tiny rotating quote pool — no network call ----------------------

const QUOTES: Array<{ text: string; who: string }> = [
  { text: "What you do every day matters more than what you do once in a while.", who: "Gretchen Rubin" },
  { text: "Discipline equals freedom.", who: "Jocko Willink" },
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", who: "Will Durant (paraphrasing Aristotle)" },
  { text: "Beware the barrenness of a busy life.", who: "Socrates" },
  { text: "The best time to plant a tree was twenty years ago. The second-best time is now.", who: "Chinese proverb" },
  { text: "Slow is smooth; smooth is fast.", who: "Navy SEALs maxim" },
  { text: "First we make our habits, then our habits make us.", who: "John Dryden" },
  { text: "Don't count the days; make the days count.", who: "Muhammad Ali" },
  { text: "Action is the antidote to despair.", who: "Joan Baez" },
  { text: "Compounding is the eighth wonder of the world. He who understands it, earns it.", who: "attributed to Einstein" },
  { text: "It is never too late to be what you might have been.", who: "George Eliot" },
  { text: "Energy and persistence conquer all things.", who: "Benjamin Franklin" },
  { text: "Whatever you can do, or dream you can, begin it. Boldness has genius, power, and magic in it.", who: "Goethe" },
  { text: "Be regular and orderly in your life, so that you may be violent and original in your work.", who: "Gustave Flaubert" },
  { text: "How we spend our days is, of course, how we spend our lives.", who: "Annie Dillard" },
];
export function quoteForDate(d = new Date()): { text: string; who: string } {
  const day = Math.floor(d.getTime() / 86400000);
  return QUOTES[((day % QUOTES.length) + QUOTES.length) % QUOTES.length];
}

// ---- Send via Resend ----------------------------------------------------

export async function sendEmail(env: DigestEnv, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.from, to: env.to, subject, html }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    return { ok: false, error: `resend ${r.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true };
}

// ---- Small templating helpers -----------------------------------------

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:28px;box-shadow:0 1px 0 rgba(0,0,0,0.04);">
  <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#6b6b6b;margin-bottom:10px;">${esc(title)}</div>
  ${body}
  <div style="margin-top:28px;font-size:11px;color:#9aa0a6;border-top:1px solid #eee;padding-top:14px;">Rest Area · ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
</div></body></html>`;
}

export function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function weekDaysFor(todayKey: string): string[] {
  const [y, m, d] = todayKey.split("-").map(Number);
  const today = new Date(y, m - 1, d);
  const dow = (today.getDay() + 6) % 7; // 0 = Monday
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(y, m - 1, d - dow + i);
    return localDateKey(dd);
  });
}
