"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Camera, KeyRound, CalendarCheck2, Unplug } from "lucide-react";
import { Card } from "@/components/Card";
import { useZuya } from "@/components/zuya/ZuyaProvider";
import { ZuyaAvatar } from "@/components/zuya/ZuyaAvatar";

const MAX_AVATAR_BYTES = 6 * 1024 * 1024;

export default function ZuyaSettingsPage() {
  const { supabase, me, refreshAvatar } = useZuya();
  const params = useSearchParams();
  const googleFlash = params.get("google"); // "connected" | "error" | null

  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(me.display_name);
  const [nameMsg, setNameMsg] = useState<string | null>(null);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [googleBusy, setGoogleBusy] = useState(false);

  async function uploadAvatar(file: File) {
    if (!file.type.startsWith("image/")) {
      setAvatarMsg("Pick an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarMsg("Max 6 MB — pick a smaller photo.");
      return;
    }
    setAvatarBusy(true);
    setAvatarMsg(null);
    try {
      const { error } = await supabase.storage
        .from("zuya")
        .upload(`avatars/${me.user_id}`, file, { upsert: true, contentType: file.type });
      if (error) {
        setAvatarMsg(error.message);
        return;
      }
      await supabase
        .from("zuya_members")
        .update({ avatar_updated_at: new Date().toISOString() })
        .eq("user_id", me.user_id);
      refreshAvatar(me.user_id);
      setAvatarMsg("Saved.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) return;
    const { error } = await supabase
      .from("zuya_members")
      .update({ display_name: name })
      .eq("user_id", me.user_id);
    setNameMsg(error ? error.message : "Saved.");
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) {
      setPwMsg("At least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setPwMsg("Passwords don't match.");
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      setPwMsg(error ? error.message : "Password changed.");
      if (!error) {
        setPw("");
        setPw2("");
      }
    } finally {
      setPwBusy(false);
    }
  }

  async function disconnectGoogle() {
    setGoogleBusy(true);
    try {
      await fetch("/api/zuya/google/disconnect", { method: "POST" });
      window.location.href = "/zuya/settings";
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <main className="space-y-5 pt-5 max-w-xl mx-auto">
      <Link href="/zuya" className="label inline-flex items-center gap-1.5 hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" /> back to us
      </Link>

      <Card title="Profile picture" collapsible={false}>
        <div className="flex items-center gap-5">
          <ZuyaAvatar member={me} size={72} />
          <div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={avatarBusy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-to))" }}
            >
              <Camera className="h-4 w-4" />
              {avatarBusy ? "Uploading…" : "Upload a photo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadAvatar(f);
                e.target.value = "";
              }}
            />
            {avatarMsg && <p className="text-[12px] text-muted mt-2">{avatarMsg}</p>}
          </div>
        </div>
      </Card>

      <Card title="Display name" collapsible={false}>
        <form onSubmit={saveName} className="flex gap-2.5">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button className="px-4 py-2.5 rounded-2xl text-[13px] font-semibold border border-[var(--rule)] hover:border-[var(--accent)] transition">
            Save
          </button>
        </form>
        {nameMsg && <p className="text-[12px] text-muted mt-2">{nameMsg}</p>}
      </Card>

      <Card title="Google Calendar" collapsible={false}>
        {googleFlash === "connected" && (
          <p className="text-[13px] text-up mb-3">Google Calendar connected ✓</p>
        )}
        {googleFlash === "error" && (
          <p className="text-[13px] text-down mb-3">Google connection failed — try again.</p>
        )}
        {me.google_connected ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-ink-soft inline-flex items-center gap-2">
              <CalendarCheck2 className="h-4 w-4 text-up" /> Connected — your availability shows on
              our calendar.
            </p>
            <button
              onClick={disconnectGoogle}
              disabled={googleBusy}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-down transition shrink-0"
            >
              <Unplug className="h-3.5 w-3.5" /> Disconnect
            </button>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-muted mb-3">
              Connect your Google Calendar so we can see each other&apos;s availability and accepted
              dates land on both calendars.
            </p>
            <a
              href="/api/zuya/google/start"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold border border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--accent)] transition"
            >
              <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2c-2.1 1.5-4.7 2.4-7.3 2.4-5.3 0-9.7-3.3-11.3-8L6.3 33C9.6 39.7 16.3 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.6l6.2 5.2c-.4.3 6.7-4.9 6.7-14.8 0-1.3-.1-2.4-.4-3.5z"/>
              </svg>
              Connect Google Calendar
            </a>
          </>
        )}
      </Card>

      <Card title="Password" collapsible={false}>
        <form onSubmit={changePassword} className="space-y-2.5">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="New password (min 8)"
            minLength={8}
            required
            className="w-full px-4 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="Repeat it"
            minLength={8}
            required
            className="w-full px-4 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button
            disabled={pwBusy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold border border-[var(--rule)] hover:border-[var(--accent)] transition disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" /> Change password
          </button>
          {pwMsg && <p className="text-[12px] text-muted">{pwMsg}</p>}
        </form>
        <p className="text-[11.5px] text-muted-2 mt-3">
          Forgot your password? Yavuz can reset it from the Supabase dashboard.
        </p>
      </Card>
    </main>
  );
}
