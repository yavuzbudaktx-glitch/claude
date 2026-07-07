"use client";

import { useEffect, useState } from "react";
import { useZuya } from "@/components/zuya/ZuyaProvider";

export function PinterestSetting() {
  const { supabase } = useZuya();
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

  return (
    <form onSubmit={save} className="space-y-2.5">
      <p className="text-[13px] text-muted">
        Paste your shared board&apos;s link. The dashboard shows its latest 10 pins for both of you.
      </p>
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
  );
}
