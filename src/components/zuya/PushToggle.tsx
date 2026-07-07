"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function PushToggle() {
  const [supported, setSupported] = useState(true);
  const [on, setOn] = useState(false);
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
    if (Notification.permission === "denied") {
      setMsg("Bildirim izni tarayıcı ayarlarından engellenmiş — oradan izin ver, sonra tekrar dene.");
    }
    // Reflect an existing subscription without hanging if the SW isn't ready.
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setOn(!!sub))
      .catch(() => {});
  }, []);

  // Get an active service-worker registration, registering it ourselves if
  // next-pwa's auto-registration hasn't landed yet, and never hang forever.
  async function getReg(): Promise<ServiceWorkerRegistration> {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
    // ready resolves once a SW is active; race it with a timeout so a stuck
    // install surfaces an error instead of spinning forever.
    const ready = navigator.serviceWorker.ready;
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("Service worker hazır olmadı — sayfayı yenile ve tekrar dene.")), 8000),
    );
    return (await Promise.race([ready, timeout])) as ServiceWorkerRegistration;
  }

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg(
          perm === "denied"
            ? "İzin engellenmiş. Tarayıcı/site ayarlarından bildirimlere izin ver."
            : "İzin verilmedi. iPhone'da uygulamayı Ana Ekrana ekleyip oradan aç, sonra tekrar dene.",
        );
        return;
      }
      const reg = await getReg();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID!) as BufferSource,
        }));
      const json = sub.toJSON();
      const res = await fetch("/api/zuya/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        setMsg(d?.error ? `Kaydedilemedi: ${d.error}` : "Kaydedilemedi (0016 migration çalıştı mı?).");
        return;
      }
      setOn(true);
      setMsg("Açık ✓ — 'Test gönder'e basıp dene.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Bir şeyler ters gitti.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/zuya/push/test", { method: "POST" });
      const d = await res.json().catch(() => null);
      setMsg(d?.message ?? "Test edilemedi.");
    } catch {
      setMsg("Test edilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/zuya/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setOn(false);
      setMsg(null);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <p className="text-[12.5px] text-muted">
        Bu cihaz/tarayıcı bildirim desteklemiyor. iPhone&apos;da: uygulamayı <b>Ana Ekrana Ekle</b>,
        sonra açtığında buradan aç.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={on ? disable : enable}
          disabled={busy}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold transition disabled:opacity-50 ${
            on
              ? "border border-[var(--rule)] text-muted hover:text-down hover:border-[var(--down)]"
              : "text-white hover:brightness-110"
          }`}
          style={on ? undefined : { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : on ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          {on ? "Bildirimleri kapat" : "Bildirimleri aç"}
        </button>
        {on && (
          <button
            onClick={sendTest}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold border border-[var(--rule)] hover:border-[var(--accent)] transition disabled:opacity-50"
          >
            <Bell className="h-4 w-4" /> Test gönder
          </button>
        )}
      </div>
      {msg && <p className="text-[12px] text-muted mt-2">{msg}</p>}
      <p className="text-[11px] text-muted-2 mt-2">
        Mesaj ve buluşma tekliflerinde telefonun bildirim alır (uygulama kapalıyken de).
      </p>
    </div>
  );
}
