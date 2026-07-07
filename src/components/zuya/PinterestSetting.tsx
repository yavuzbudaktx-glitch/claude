"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Unplug, Check } from "lucide-react";
import { useZuya } from "@/components/zuya/ZuyaProvider";

export function PinterestSetting() {
  const { supabase, me } = useZuya();
  const params = useSearchParams();
  const flash = params.get("pinterest"); // "connected" | "error" | null
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("zuya_settings")
        .select("value")
        .eq("key", "pinterest_board")
        .maybeSingle();
      setValue(((data as { value: string | null } | null)?.value ?? "") as string);
    })();
  }, [supabase]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from("zuya_settings")
      .upsert({ key: "pinterest_board", value: value.trim(), updated_at: new Date().toISOString() });
    setMsg(error ? error.message : "Saved.");
    setBusy(false);
  }

  async function disconnect() {
    await fetch("/api/zuya/pinterest/disconnect", { method: "POST" });
    window.location.href = "/zuya/settings";
  }

  return (
    <div className="space-y-4">
      {flash === "connected" && <p className="text-[13px] text-up">Pinterest bağlandı ✓</p>}
      {flash === "error" && <p className="text-[13px] text-down">Bağlanamadı — tekrar dene.</p>}

      {me.pinterest_connected ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-ink-soft inline-flex items-center gap-2">
            <Check className="h-4 w-4 text-up" /> Connected — your board&apos;s latest pins show on the dashboard.
          </p>
          <button
            onClick={disconnect}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-down transition shrink-0"
          >
            <Unplug className="h-3.5 w-3.5" /> Disconnect
          </button>
        </div>
      ) : (
        <>
          <p className="text-[13px] text-muted">
            Connect Pinterest so the dashboard can pull your shared board&apos;s latest pins.
          </p>
          <a
            href="/api/zuya/pinterest/start"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold text-white transition hover:brightness-110"
            style={{ background: "#e60023" }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#fff" aria-hidden>
              <path d="M12 0C5.4 0 0 5.4 0 12c0 5 3.1 9.3 7.5 11.1-.1-.9-.2-2.4 0-3.4.2-.9 1.4-5.8 1.4-5.8s-.4-.7-.4-1.8c0-1.7 1-2.9 2.2-2.9 1 0 1.5.8 1.5 1.7 0 1.1-.7 2.7-1 4.2-.3 1.2.6 2.3 1.8 2.3 2.2 0 3.8-2.3 3.8-5.6 0-2.9-2.1-5-5.1-5-3.5 0-5.6 2.6-5.6 5.3 0 1 .4 2.2.9 2.8.1.1.1.2.1.3-.1.4-.3 1.2-.3 1.4-.1.2-.2.3-.4.2-1.5-.7-2.4-2.9-2.4-4.6 0-3.8 2.7-7.2 7.9-7.2 4.1 0 7.4 3 7.4 6.9 0 4.1-2.6 7.5-6.2 7.5-1.2 0-2.4-.6-2.8-1.4l-.7 2.9c-.3 1-1 2.3-1.5 3.1 1.1.3 2.3.5 3.5.5 6.6 0 12-5.4 12-12S18.6 0 12 0z" />
            </svg>
            Connect Pinterest
          </a>
        </>
      )}

      <form onSubmit={save} className="space-y-2.5 pt-1">
        <label className="text-[12px] text-muted block">Which board? Paste its link.</label>
        <div className="flex gap-2.5">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="pinterest.com/user/our-board"
            className="flex-1 px-4 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button
            disabled={busy}
            className="px-4 py-2.5 rounded-2xl text-[13px] font-semibold border border-[var(--rule)] hover:border-[var(--accent)] transition disabled:opacity-50"
          >
            Save
          </button>
        </div>
        {msg && <p className="text-[12px] text-muted">{msg}</p>}
      </form>
    </div>
  );
}
