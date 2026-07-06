"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, ImagePlus, Link2, X } from "lucide-react";
import { Card } from "@/components/Card";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import { toUploadableJpeg } from "@/lib/zuya/image";

interface Pin {
  id: string;
  created_by: string;
  storage_key: string | null;
  image_url: string | null;
  caption: string | null;
  created_at: string;
}

// "Panomuz" — a shared board. Pin photos (uploaded) or image links, both of you.
export function BoardCard() {
  const { supabase, me } = useZuya();
  const [pins, setPins] = useState<Pin[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({}); // signed URLs for uploads
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("zuya_board").select("*").order("created_at", { ascending: false });
    const rows = (data as Pin[]) ?? [];
    setPins(rows);
    // Sign the uploaded images.
    const toSign = rows.filter((p) => p.storage_key).map((p) => p.storage_key!) as string[];
    if (toSign.length) {
      const { data: signed } = await supabase.storage.from("zuya").createSignedUrls(toSign, 60 * 60 * 24 * 7);
      const map: Record<string, string> = {};
      (signed ?? []).forEach((s) => { if (s.signedUrl && s.path) map[s.path] = s.signedUrl; });
      setUrls((u) => ({ ...u, ...map }));
    }
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);
  useZuyaTableEvent("zuya_board", () => void load());

  async function addUpload(file: File) {
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const key = `board/${id}`;
      const { blob, type } = await toUploadableJpeg(file, 1080, 0.85);
      const { error: upErr } = await supabase.storage.from("zuya").upload(key, blob, { contentType: type, upsert: true });
      if (upErr) return;
      await supabase.from("zuya_board").insert({ created_by: me.user_id, storage_key: key, caption: caption.trim() || null });
      resetForm();
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function addLink() {
    const url = linkUrl.trim();
    if (!url) return;
    setBusy(true);
    try {
      await supabase.from("zuya_board").insert({ created_by: me.user_id, image_url: url, caption: caption.trim() || null });
      resetForm();
      void load();
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setAdding(false);
    setLinkUrl("");
    setCaption("");
  }

  async function remove(pin: Pin) {
    if (pin.storage_key) await supabase.storage.from("zuya").remove([pin.storage_key]);
    await supabase.from("zuya_board").delete().eq("id", pin.id);
    void load();
  }

  function srcFor(p: Pin): string | null {
    if (p.storage_key) return urls[p.storage_key] ?? null;
    return p.image_url;
  }

  return (
    <Card
      id="zuya-board-card"
      title="Panomuz"
      collapsible={false}
      action={
        <button
          onClick={() => setAdding((v) => !v)}
          className="grid place-items-center h-7 w-7 rounded-full text-white transition hover:brightness-110"
          style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
          aria-label="Ekle"
        >
          {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      }
    >
      {adding && (
        <div className="mb-3 space-y-2 rounded-2xl border border-[var(--rule-soft)] p-3">
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Bir not (opsiyonel)"
            maxLength={200}
            className="w-full px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 text-sm outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-to))" }}
            >
              <ImagePlus className="h-4 w-4" /> {busy ? "…" : "Fotoğraf"}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void addUpload(f); e.target.value = ""; }} />
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-2" />
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="…veya resim linki yapıştır"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 text-sm outline-none"
              />
            </div>
            <button
              onClick={addLink}
              disabled={busy || !linkUrl.trim()}
              className="px-3 py-2 rounded-xl text-[13px] font-semibold border border-[var(--rule)] hover:border-[var(--accent)] transition disabled:opacity-40"
            >
              Ekle
            </button>
          </div>
        </div>
      )}

      {pins.length === 0 && !adding && (
        <p className="text-[13px] text-muted text-center py-6">Boş — ilk anıyı pinle 📌</p>
      )}

      <div className="columns-2 sm:columns-3 gap-2 [&>*]:mb-2">
        {pins.map((p) => {
          const src = srcFor(p);
          return (
            <div key={p.id} className="break-inside-avoid relative group rounded-xl overflow-hidden border border-[var(--rule-soft)]">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={p.caption ?? ""} className="w-full block" loading="lazy" />
              ) : (
                <div className="aspect-square grid place-items-center bg-[var(--rule-soft)] text-muted-2 text-[11px]">yükleniyor…</div>
              )}
              {p.caption && (
                <div className="absolute bottom-0 inset-x-0 px-2 py-1.5 text-[11px] text-white bg-gradient-to-t from-black/60 to-transparent">
                  {p.caption}
                </div>
              )}
              <button
                onClick={() => remove(p)}
                className="absolute top-1.5 right-1.5 grid place-items-center h-6 w-6 rounded-full bg-black/45 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                aria-label="Kaldır"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
