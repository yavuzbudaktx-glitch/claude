import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Zuya",
  description: "How Zuya handles data.",
};

const UPDATED = "July 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16 text-[15px] leading-relaxed text-ink">
      <h1 className="font-display text-3xl mb-2">Privacy Policy</h1>
      <p className="text-muted text-[13px] mb-8">Last updated: {UPDATED}</p>

      <section className="space-y-5">
        <p>
          Zuya is a private application built for two specific people to share updates with each
          other. It is not a public service, is not open for sign-ups, and is not a social network.
          This policy explains what data the app handles and why.
        </p>

        <div>
          <h2 className="font-semibold text-lg mb-1.5">What we collect</h2>
          <ul className="list-disc pl-5 space-y-1 text-ink-soft">
            <li>Account details — a username, display name, and password (stored hashed).</li>
            <li>Content you create — messages, daily answers, photos, lists, and status updates.</li>
            <li>Location — only when you explicitly turn on sharing, and only shared with your partner.</li>
            <li>
              Connected services — if you link Google, Spotify, or Pinterest, we store access tokens
              so the app can show your calendar, current track, or a shared board. We never post on
              your behalf, and you can disconnect any of them in Settings at any time.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-semibold text-lg mb-1.5">How it&apos;s used</h2>
          <p className="text-ink-soft">
            Data is used solely to make the app work for the two of you — to show each other your
            updates. We do not sell data, we do not use it for advertising, and we do not share it
            with third parties beyond the service providers listed below that are required to run the
            app.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg mb-1.5">Where it&apos;s stored</h2>
          <p className="text-ink-soft">
            Data is stored using Supabase (database, authentication, and file storage) and hosted on
            Vercel. Optional integrations exchange data with Google, Spotify, and Pinterest only when
            you choose to connect them. Notifications, if enabled, are delivered through your
            browser&apos;s push service.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg mb-1.5">Retention &amp; your control</h2>
          <p className="text-ink-soft">
            Your content stays until you delete it or the account is removed. You can disconnect
            integrations, clear content within the app, or request full deletion of an account and
            its data at any time.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-lg mb-1.5">Contact</h2>
          <p className="text-ink-soft">
            Questions about this policy or your data? Email{" "}
            <a href="mailto:yavuzbudaktx@gmail.com" className="text-accent underline underline-offset-2">
              yavuzbudaktx@gmail.com
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
