"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { Card } from "@/components/Card";
import { usePref } from "@/components/PrefsProvider";

// Push notifications for Rest Area.
//
// Two separate things live here and it's worth keeping them straight:
//
//  - THIS DEVICE's subscription — a browser permission plus a PushSubscription,
//    which is per-browser and cannot sync. Every device you want notified has to
//    be turned on from that device.
//  - WHAT you get notified about — ordinary synced prefs, so changing them here
//    changes them everywhere.

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

const KINDS: Array<{ key: string; label: string; hint: string }> = [
  { key: "notifyPrayer",   label: "Prayer times",     hint: "At each of the five times, for your saved location." },
  { key: "notifyTasks",    label: "Tasks due",        hint: "One morning summary of what's due today and what's late." },
  { key: "notifyBesiktas", label: "Beşiktaş kickoff", hint: "Two hours before the match starts." },
  { key: "notifyUfc",      label: "UFC event day",    hint: "On the morning of a numbered card." },
];

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(label)), ms)),
  ]);
}

function KindToggle({ k }: { k: (typeof KINDS)[number] }) {
  const [on, setOn] = usePref<boolean>(k.key, true);
  return (
    <label className="flex items-start gap-2.5 py-2 cursor-pointer group">
      <input
        type="checkbox"
        checked={on !== false}
        onChange={(e) => setOn(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--accent)] shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-[13px] leading-snug group-hover:text-accent transition">{k.label}</span>
        <span className="block text-[11.5px] text-muted leading-snug mt-0.5">{k.hint}</span>
      </span>
    </label>
  );
}

export function NotificationSettings() {
  const [enabled, setEnabled] = usePref<boolean>("notifyEnabled", false);
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      !!VAPID;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  async function getReg(): Promise<ServiceWorkerRegistration> {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
    return withTimeout(navigator.serviceWorker.ready, 8000, "The service worker never became ready — fully close the app and reopen it.");
  }

  async function turnOn() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await withTimeout(Notification.requestPermission(), 20000, "The permission prompt didn't respond — try again.");
      if (perm !== "granted") {
        setMsg(
          perm === "denied"
            ? "Permission is blocked. Allow notifications for this site in your browser settings, then try again."
            : "Permission wasn't granted. On iPhone, add this to your Home Screen and open it from there first.",
        );
        return;
      }
      const reg = await getReg();
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await withTimeout(
          reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID!) as BufferSource,
          }),
          12000,
          "Couldn't reach the push service — check your connection and try again.",
        ));
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setMsg(d?.error ? `Couldn't save: ${d.error}` : "Couldn't save this device.");
        return;
      }
      setSubscribed(true);
      setEnabled(true);
      setMsg("This device is on. Send a test to check it.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
      setMsg("This device won't be notified any more.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const d = await res.json().catch(() => null);
      setMsg(d?.message ?? "Couldn't send the test.");
    } catch {
      setMsg("Couldn't send the test.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card num="—" title="Notifications">
      {!supported ? (
        <p className="text-[12.5px] text-muted">
          This browser can&rsquo;t do push notifications. On iPhone, Safari only allows them for
          sites added to the Home Screen — add Rest Area, open it from the icon, and this will work.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={subscribed ? turnOff : turnOn}
              disabled={busy}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold border transition disabled:opacity-50 ${
                subscribed
                  ? "border-[var(--rule)] text-muted hover:text-down hover:border-[var(--down)]"
                  : "border-[var(--accent)] text-accent hover:bg-[var(--accent-soft)]"
              }`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : subscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              {subscribed ? "Turn off on this device" : "Turn on for this device"}
            </button>
            {subscribed && (
              <button
                onClick={sendTest}
                disabled={busy}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[12.5px] font-semibold border border-[var(--rule)] hover:border-[var(--accent)] transition disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" /> Send a test
              </button>
            )}
          </div>
          {msg && <p className="text-[12px] text-muted mt-2">{msg}</p>}

          <div className="mt-4 pt-3 border-t rule">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled === true}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="text-[13px] font-medium">Send scheduled notifications</span>
            </label>
            <p className="text-[11.5px] text-muted mt-1 ml-[26px]">
              The master switch, synced across your devices. Off means nothing is sent to anything.
            </p>

            <div className={`mt-2 ml-[26px] divide-rule ${enabled === true ? "" : "opacity-40 pointer-events-none"}`}>
              {KINDS.map((k) => <KindToggle key={k.key} k={k} />)}
            </div>
          </div>

          <p className="text-[11px] text-muted-2 mt-4 pt-3 border-t rule">
            Each device has to be turned on from that device — a browser&rsquo;s notification
            permission can&rsquo;t be synced. What you get notified about is shared everywhere.
          </p>
        </>
      )}
    </Card>
  );
}
