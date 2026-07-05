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
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setOn(!!sub))
      .catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg("İzin verilmedi. Telefonda uygulamayı ana ekrana ekleyip tekrar dene.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID!) as BufferSource,
      });
      const json = sub.toJSON();
      const res = await fetch("/api/zuya/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) {
        setMsg("Kaydedilemedi — 0016 migration çalıştı mı?");
        return;
      }
      setOn(true);
      setMsg("Açık ✓");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Bir şeyler ters gitti.");
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
      {msg && <p className="text-[12px] text-muted mt-2">{msg}</p>}
      <p className="text-[11px] text-muted-2 mt-2">
        Mesaj ve buluşma tekliflerinde telefonun bildirim alır (uygulama kapalıyken de).
      </p>
    </div>
  );
}
