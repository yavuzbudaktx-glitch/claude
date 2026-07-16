"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCcw, SendHorizontal, X, SwitchCamera, Sparkles, Lock } from "lucide-react";
import { Card } from "@/components/Card";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import { zuyaToday } from "@/lib/zuya/day";

// "Anlık" — Zuya's BeReal. Once a day (random push between 8 AM and noon,
// see /api/zuya/bereal/tick) both partners take a DUAL-camera photo: back
// camera first, then the front camera, composed into one image (front cam
// as a rounded picture-in-picture, just like the real thing). The partner's
// photo stays blurred until you've posted yours.

interface PostRow {
  id: string;
  user_id: string;
  day: string;
  storage_key: string;
  caption: string | null;
  created_at: string;
}

type CaptureStep = "back" | "front" | "review";

// roundRect with a manual-path fallback (Safari < 16 lacks ctx.roundRect).
function roundedPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Compose the two shots: main photo cover-cropped to 3:4 portrait, the
// second shot as a mirrored PiP card top-left. Returns a JPEG blob.
async function composeShots(
  main: HTMLCanvasElement,
  pip: HTMLCanvasElement | null,
): Promise<Blob | null> {
  const W = 1080;
  const H = 1440;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  // Cover-crop the main shot.
  const scale = Math.max(W / main.width, H / main.height);
  const dw = main.width * scale;
  const dh = main.height * scale;
  ctx.drawImage(main, (W - dw) / 2, (H - dh) / 2, dw, dh);

  if (pip) {
    const pw = Math.round(W * 0.3);
    const ph = Math.round(pw * (4 / 3));
    const px = 28;
    const py = 28;
    const r = 26;
    // Rounded-rect clip + white border, like the original.
    ctx.save();
    ctx.beginPath();
    roundedPath(ctx, px, py, pw, ph, r);
    ctx.clip();
    const ps = Math.max(pw / pip.width, ph / pip.height);
    const pdw = pip.width * ps;
    const pdh = pip.height * ps;
    ctx.drawImage(pip, px + (pw - pdw) / 2, py + (ph - pdh) / 2, pdw, pdh);
    ctx.restore();
    ctx.beginPath();
    roundedPath(ctx, px, py, pw, ph, r);
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.stroke();
  }

  return new Promise((resolve) => out.toBlob((b) => resolve(b), "image/jpeg", 0.86));
}

function grabFrame(video: HTMLVideoElement, mirror: boolean): HTMLCanvasElement | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const c = document.createElement("canvas");
  // Cap the long edge at 1600px so uploads stay lean.
  const cap = 1600 / Math.max(w, h);
  const s = Math.min(1, cap);
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  if (mirror) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, c.width, c.height);
  return c;
}

function CaptureOverlay({ onDone, onClose }: { onDone: (blob: Blob, caption: string) => Promise<string | null>; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const backShotRef = useRef<HTMLCanvasElement | null>(null);
  const frontShotRef = useRef<HTMLCanvasElement | null>(null);
  const [step, setStep] = useState<CaptureStep>("back");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [caption, setCaption] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);

  // Generation counter: a getUserMedia that resolves AFTER the overlay closed
  // (or after a newer openCamera started) must not leak a live stream or
  // clobber the newer one.
  const genRef = useRef(0);

  const stopStream = useCallback(() => {
    genRef.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const adopt = useCallback(async (stream: MediaStream, gen: number): Promise<boolean> => {
    if (gen !== genRef.current) {
      // Stale resolve — someone closed the overlay / switched cameras since.
      stream.getTracks().forEach((t) => t.stop());
      return false;
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }
    return true;
  }, []);

  const openCamera = useCallback(async (mode: "environment" | "user") => {
    stopStream();
    const gen = genRef.current;
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 1706 } },
        audio: false,
      });
      const ok = await adopt(stream, gen);
      if (ok) setFacing(mode);
      return ok;
    } catch {
      // Fall back to ANY camera (laptops only have one).
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        return await adopt(stream, gen);
      } catch {
        if (gen === genRef.current) setErr("Kameraya erişilemedi — tarayıcı izinlerini kontrol et.");
        return false;
      }
    }
  }, [stopStream, adopt]);

  useEffect(() => {
    void openCamera("environment");
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function shutter() {
    const video = videoRef.current;
    if (!video) return;
    // Stream still warming up (videoWidth 0) — common right after mount or a
    // camera switch on iOS. Don't advance the flow on an empty frame.
    const shot = grabFrame(video, step === "front" ? true : facing === "user");
    if (!shot) {
      setErr("Kamera hazırlanıyor — bir saniye sonra tekrar dene.");
      return;
    }
    setErr(null);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);

    if (step === "back") {
      backShotRef.current = shot;
      // One-camera device? (facingMode is a soft constraint, so requesting
      // "user" on a laptop happily returns the same webcam — detect properly.)
      let cams = 2;
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        cams = devs.filter((d) => d.kind === "videoinput").length;
      } catch { /* assume two */ }
      if (cams < 2) {
        await finishCompose();
        return;
      }
      const ok = await openCamera("user");
      if (ok) {
        setStep("front");
      } else {
        await finishCompose();
      }
    } else if (step === "front") {
      frontShotRef.current = shot;
      await finishCompose();
    }
  }

  async function finishCompose() {
    stopStream();
    const main = backShotRef.current ?? frontShotRef.current;
    const pip = backShotRef.current ? frontShotRef.current : null;
    if (!main) {
      setErr("Fotoğraf alınamadı — tekrar dene.");
      setStep("back");
      void openCamera("environment");
      return;
    }
    const composed = await composeShots(main, pip);
    if (!composed) {
      setErr("Fotoğraf birleştirilemedi.");
      return;
    }
    setBlob(composed);
    setPreviewUrl(URL.createObjectURL(composed));
    setStep("review");
  }

  function retake() {
    backShotRef.current = null;
    frontShotRef.current = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setBlob(null);
    setStep("back");
    void openCamera("environment");
  }

  async function submit() {
    if (!blob || busy) return;
    setBusy(true);
    try {
      const errMsg = await onDone(blob, caption.trim());
      if (errMsg) setErr(errMsg);
      // Success: the parent closes the overlay.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-white/90 text-[14px] font-semibold inline-flex items-center gap-2">
          <Camera className="h-4 w-4" />
          {step === "back" ? "1/2 · Arka kamera" : step === "front" ? "2/2 · Ön kamera — gülümse!" : "Nasıl olmuş?"}
        </span>
        <button
          onClick={() => { stopStream(); onClose(); }}
          className="grid place-items-center h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
          aria-label="Kapat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="relative flex-1 min-h-0 mx-4 rounded-3xl overflow-hidden bg-black">
        {step !== "review" && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
          />
        )}
        {step === "review" && previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="preview" className="absolute inset-0 h-full w-full object-contain bg-black" />
        )}
        {flash && <div className="absolute inset-0 bg-white/80 animate-[zuyaFlash_0.2s_ease-out]" />}
        {err && (
          <div className="absolute inset-x-4 top-4 rounded-2xl bg-red-500/80 text-white text-[13px] px-4 py-3">
            {err}
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-3">
        {step !== "review" ? (
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={() => void openCamera(facing === "user" ? "environment" : "user")}
              className="grid place-items-center h-11 w-11 rounded-full bg-white/10 text-white hover:bg-white/20 transition"
              title="Kamerayı değiştir"
              aria-label="Kamerayı değiştir"
            >
              <SwitchCamera className="h-5 w-5" />
            </button>
            <button
              onClick={() => void shutter()}
              className="h-[72px] w-[72px] rounded-full border-4 border-white bg-white/25 hover:bg-white/40 active:scale-95 transition"
              aria-label="Çek"
            />
            <span className="h-11 w-11" />
          </div>
        ) : (
          <>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={200}
              placeholder="Bir not ekle (istersen)…"
              className="w-full px-4 py-3 rounded-2xl bg-white/10 text-white placeholder-white/40 text-[14px] outline-none focus:ring-2 focus:ring-white/40"
            />
            <div className="flex items-center gap-2.5">
              <button
                onClick={retake}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-white/10 text-white text-[13.5px] font-semibold hover:bg-white/20 transition"
              >
                <RefreshCcw className="h-4 w-4" /> Tekrar çek
              </button>
              <button
                onClick={() => void submit()}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-white text-[13.5px] font-bold transition hover:brightness-110 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
              >
                <SendHorizontal className="h-4 w-4" /> {busy ? "Gönderiliyor…" : "Gönder"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function BeRealCard() {
  const { supabase, me, partner } = useZuya();
  const today = zuyaToday();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [partnerPosted, setPartnerPosted] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    // RLS enforces the blind reveal: pre-post this returns only MY row; the
    // partner's row (and its storage key) only becomes selectable once I've
    // posted today. So we sign exactly what we're allowed to see.
    const { data } = await supabase
      .from("zuya_bereal_posts")
      .select("*")
      .eq("day", today);
    const rows = (data as PostRow[]) ?? [];
    setPosts(rows);
    const keys = rows.map((r) => r.storage_key);
    if (keys.length) {
      const { data: signed } = await supabase.storage.from("zuya").createSignedUrls(keys, 60 * 60 * 12);
      const map: Record<string, string> = {};
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
      }
      setUrls(map);
    }
    // "Did they post?" teaser without exposing the row — SECURITY DEFINER rpc.
    const hasTheirs = rows.some((r) => r.user_id !== me.user_id);
    if (hasTheirs) {
      setPartnerPosted(true);
    } else {
      const { data: pp } = await supabase.rpc("zuya_bereal_partner_posted", { d: today });
      setPartnerPosted(!!pp);
    }
  }, [supabase, today, me.user_id]);

  useEffect(() => { void load(); }, [load]);
  useZuyaTableEvent("zuya_bereal_posts", () => void load());

  // Scheduler heartbeat: pings the tick endpoint on mount and every 5 min
  // while the app is open. The endpoint is idempotent — the first ping at or
  // after the day's random 8AM–noon moment fires the push to both partners.
  useEffect(() => {
    const ping = () => { fetch("/api/zuya/bereal/tick").catch(() => {}); };
    ping();
    const id = setInterval(ping, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  const mine = posts.find((p) => p.user_id === me.user_id);
  const theirs = posts.find((p) => p.user_id === partner.user_id);

  async function upload(blob: Blob, caption: string): Promise<string | null> {
    const key = `bereal/${today}/${me.user_id}.jpg`;
    const { error: upErr } = await supabase.storage.from("zuya").upload(key, blob, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (upErr) return "Yükleme başarısız — tekrar dene.";
    // Atomic upsert (retake included) — never delete-then-insert, which could
    // lose the post if the second half failed.
    const { error: rowErr } = await supabase
      .from("zuya_bereal_posts")
      .upsert(
        { user_id: me.user_id, day: today, storage_key: key, caption: caption || null, created_at: new Date().toISOString() },
        { onConflict: "user_id,day" },
      );
    if (rowErr) return "Kaydedilemedi — tekrar dene.";
    // Nudge the partner that my half is up.
    fetch("/api/zuya/push/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "bereal", text: "Anlık fotoğrafını paylaştı 📸" }),
    }).catch(() => {});
    setCapturing(false);
    void load();
    return null;
  }

  function Tile({ post, who, isMine }: { post: PostRow | undefined; who: string; isMine: boolean }) {
    const url = post ? urls[post.storage_key] : null;
    // Partner posted but I haven't → RLS hid their row, so we have NO image
    // bytes (by design). Show a teaser lock instead of a blurred photo.
    const lockedTeaser = !isMine && !post && partnerPosted;
    return (
      <div className="min-w-0">
        <div
          className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-[var(--rule-soft)] bg-[var(--paper-2)]"
          onClick={() => { if (url) setLightbox(url); }}
          role={url ? "button" : undefined}
        >
          {post && url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={who} className="absolute inset-0 h-full w-full object-cover cursor-zoom-in" />
          ) : lockedTeaser ? (
            <div
              className="absolute inset-0 grid place-items-center"
              style={{ background: "linear-gradient(145deg, color-mix(in srgb, var(--grad-from) 55%, transparent), color-mix(in srgb, var(--grad-via) 45%, transparent))" }}
            >
              <div className="flex flex-col items-center gap-1.5 text-white text-center px-3">
                <Lock className="h-5 w-5" />
                <span className="text-[11.5px] font-semibold leading-tight">Çekti bile!<br />Seninkini çek, gör 👀</span>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <span className="text-[11.5px] text-muted-2 text-center px-3">
                {isMine ? "Henüz çekmedin" : "Henüz çekmedi"}
              </span>
            </div>
          )}
        </div>
        <div className="mt-1.5 px-0.5">
          <p className="label !text-[9px]">{who}</p>
          {post?.caption && (
            <p className="text-[11.5px] text-ink-soft leading-snug truncate" title={post.caption}>{post.caption}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card
      id="zuya-bereal-card"
      title="Anlık"
      collapsible={false}
      action={
        both(mine, theirs) ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-accent">
            <Sparkles className="h-3 w-3" /> ikisi de burada
          </span>
        ) : undefined
      }
    >
      <p className="text-[12px] text-muted mb-3 leading-snug">
        Günde bir kez, rastgele bir anda ikinize de bildirim gelir — çift kamera, tek kare.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Tile post={mine} who={me.display_name} isMine />
        <Tile post={theirs} who={partner.display_name} isMine={false} />
      </div>

      <button
        onClick={() => setCapturing(true)}
        className="mt-3.5 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-[13.5px] font-bold text-white transition hover:brightness-110"
        style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
      >
        <Camera className="h-4 w-4" />
        {mine ? "Tekrar çek" : "Bugünün fotoğrafını çek"}
      </button>

      {capturing && <CaptureOverlay onDone={upload} onClose={() => setCapturing(false)} />}

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm grid place-items-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-2xl object-contain" />
          <button
            className="absolute top-4 right-4 grid place-items-center h-10 w-10 rounded-full bg-white/10 text-white"
            style={{ marginTop: "env(safe-area-inset-top)" }}
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </Card>
  );
}

function both(a: unknown, b: unknown): boolean {
  return !!a && !!b;
}
