# Morning Dashboard

A personal "open this first thing in the morning" page. Date, Dallas weather, a daily Quran verse (Arabic + Turkish), Google Calendar, customized news headlines, and an Eisenhower-matrix task list. Built as a PWA so you install it on your phone and get the same view (with the same tasks) on desktop.

Stack: **Next.js 14 (App Router) · Tailwind · Supabase (auth + Postgres) · Vercel · `@ducanh2912/next-pwa`**.

## One-time setup

### 1. Supabase

1. Create a project at <https://supabase.com>.
2. SQL Editor → paste `supabase/migrations/0001_init.sql` and run.
3. Settings → API: copy **Project URL** and **anon key** into `.env.local`.
4. Authentication → Providers → Google: enable. In **Additional scopes** add:
   ```
   https://www.googleapis.com/auth/calendar.readonly
   ```

### 2. Google Cloud (for Calendar OAuth)

1. <https://console.cloud.google.com> → new project.
2. APIs & Services → Library → enable **Google Calendar API**.
3. APIs & Services → OAuth consent screen → External, add yourself as a test user. Add scope `.../auth/calendar.readonly`.
4. Credentials → Create OAuth client ID → **Web application**.
   - Authorized redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`
5. Copy the client ID + secret. Paste them:
   - Into Supabase Auth → Google provider config (so Supabase can run the OAuth flow).
   - Into `.env.local` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (so this app can refresh access tokens).

### 3. Local

```bash
cp .env.local.example .env.local   # then fill in the values
npm install
npm run dev                         # http://localhost:3000
```

Sign in with Google. Your refresh token is stored in `user_settings.google_refresh_token` so calendar reads keep working.

### 4. Deploy

1. Push to GitHub, import on Vercel.
2. Set the same env vars in Vercel (update `NEXT_PUBLIC_SITE_URL` to your prod URL).
3. Add the prod URL to Google Cloud OAuth client's authorized redirect URIs (Supabase callback stays the same).
4. On iPhone Safari: Share → Add to Home Screen. On Android Chrome: install prompt appears.

## Data sources

| Widget   | Source                         | Auth   | Cache |
| -------- | ------------------------------ | ------ | ----- |
| Weather  | Open-Meteo (no key)            | none   | 10 m  |
| Quran    | api.alquran.cloud              | none   | 24 h  |
| News     | RSS aggregation (10 feeds)     | none   | 15 m  |
| Calendar | Google Calendar API v3         | OAuth  | live  |
| Tasks    | Supabase `tasks` table         | RLS    | live  |

## Tweaks

- **City**: edit `DALLAS_LAT/DALLAS_LON` in `src/app/api/weather/route.ts`.
- **News feeds**: edit the `FEEDS` array in `src/lib/feeds.ts`.
- **Quran translation**: change the editions in `src/lib/quran.ts` (e.g. `en.sahih`).

## Verification checklist

- `curl http://localhost:3000/api/weather` → JSON with `current.temperature_2m`.
- `curl http://localhost:3000/api/quran` → same Arabic + Turkish payload all day.
- `curl http://localhost:3000/api/news` → grouped headlines, <2 s.
- Sign in, then `curl http://localhost:3000/api/calendar` (with browser session cookie) → upcoming 5 events.
- Add tasks across all 4 quadrants in one browser, refresh in another → same state (sync confirmed).
- Lighthouse PWA audit ≥ 90; Chrome DevTools → Application → Manifest shows icons; "Install app" works.
