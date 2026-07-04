# Zuya — setup & runbook

Zuya is the private couples hub at `/zuya` — completely separate from the
personal dashboard: its own login (usernames `yavuz` / `zuleyha`, password set
on first sign-in), its own theme, its own PWA identity, its own auth cookie
(so signing into Zuya never signs you out of the dashboard in the same
browser).

## One-time setup

### 1. Supabase (~2 min)

1. SQL Editor → paste **`supabase/migrations/0013_zuya.sql`** → Run.
2. Database → Replication → confirm the publication `supabase_realtime`
   includes the 8 `zuya_*` tables (the migration adds them; just verify).
3. Nothing to change in Auth settings — Zuya users are created pre-confirmed
   by the server, so the synthetic `@zuya.local` addresses never receive mail.

### 2. Google Cloud console (~5 min, same OAuth client as the dashboard)

1. **Credentials → your OAuth client → Authorized redirect URIs**, add:
   - `https://YOUR-PROD-DOMAIN/api/zuya/google/callback`
   - `http://localhost:3000/api/zuya/google/callback` (for dev)
2. **OAuth consent screen → Scopes**: add
   `https://www.googleapis.com/auth/calendar.events` (sensitive — needed to
   write accepted dates into your calendars).
3. **OAuth consent screen → Test users**: add **Züleyha's Google account**.
4. **Publishing status — important**: while the consent screen is in
   *Testing*, Google expires refresh tokens for sensitive scopes **every
   7 days**, which would force you both to reconnect Google weekly.
   Recommended: set Publishing status to **In production**. With an
   unverified app you'll each see a one-time "Google hasn't verified this
   app" screen (Advanced → continue) when connecting, and tokens then persist
   indefinitely. Zuya handles expiry gracefully either way — a "Reconnect
   Google" chip appears on the calendar card when a token dies.

### 3. Vercel

No new environment variables — Zuya reuses `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_SITE_URL`.

**Deploying**: production tracks `claude/morning-dashboard-ak4rc`, which the
daily-britannica GitHub Action **force-pushes** from its source branch — do
not push to it directly or the next scrape will erase your commit. Merge the
Zuya branch into the Action's source branch, then run the workflow manually
(Actions → daily Britannica → Run workflow) or wait for its next scheduled
run to refresh the deploy branch.

### 4. First run (both of you)

1. Open `https://YOUR-DOMAIN/zuya` → tap your name → set your password.
   Do this soon after deploying — the two username slots are first-come.
2. Settings (top-right avatar) → upload a profile picture → Connect Google
   Calendar.
3. Install the PWA: iPhone Safari → Share → **Add to Home Screen** (log in
   once inside the installed app — it keeps its own session).

## Daily photos

Drop photos into `public/zuya/daily/`, then:

```bash
node scripts/gen-zuya-manifest.mjs   # regenerates manifest.json, keeps captions
```

Edit the `caption` fields in `public/zuya/daily/manifest.json`, commit, and
deploy. One photo shows per day, picked deterministically by date.
(Heads-up: files in `public/` are technically reachable by URL without login —
fine for normal couple photos, don't put anything sensitive there.)

## Housekeeping

- **Forgot password**: `@zuya.local` addresses can't receive reset emails.
  Supabase dashboard → Authentication → Users → the user → Reset password.
- **Timezone**: every "daily" thing (thought counter reset, daily question,
  photo, wordle word) rolls over at midnight **America/Chicago** — change
  `ZUYA_TZ` in `src/lib/zuya/day.ts` if you two move.
- **Statuses**: edit the preset list in `src/lib/zuya/statuses.ts`.
- **Daily questions**: extend `src/lib/zuya/questions.ts` freely — past days
  keep their recorded question.

## How the pieces work (for future maintenance)

- **Auth**: two real Supabase users (`yavuz@zuya.local`, `zuleyha@zuya.local`)
  created via the Admin API by `/api/zuya/auth/register` (whitelisted, one-shot
  per username). Zuya sessions live in a dedicated `zuya-auth` cookie
  (`src/lib/supabase/zuya-*.ts`); `src/middleware.ts` routes `/zuya` +
  `/api/zuya` through the Zuya session guard and leaves every other path on
  the original code path.
- **Shared data**: RLS via `zuya_is_member()`; Google refresh tokens sit in
  `zuya_google_tokens` with zero policies (service-role only — partners can't
  read each other's tokens).
- **Rate limit**: the "thought of you" button hits `/api/zuya/thoughts`
  (service role, conditional update) — 5-minute cooldown holds even against
  curl.
- **Date flow**: `/api/zuya/dates` (+ `[id]`) implements the turn-based
  suggest → counter → accept/reject loop; accepting writes the event into
  both primary Google Calendars.
- **Blind reveal**: daily-question answers and wordle boards are hidden by
  RLS until you've submitted your own for that day — the data never reaches
  the other browser early.
