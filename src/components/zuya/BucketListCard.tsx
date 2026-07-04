"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Sparkles, Trash2 } from "lucide-react";
import { Card } from "@/components/Card";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import type { ZuyaBucketItemRow } from "@/types/zuya";

// Things we'll do together — a joint checklist. "Plan it" hands the item to
// the calendar card's suggest-a-date form via a DOM event.
export function BucketListCard() {
  const { supabase, me } = useZuya();
  const [items, setItems] = useState<ZuyaBucketItemRow[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("zuya_bucket_list")
      .select("*")
      .order("done", { ascending: true })
      .order("created_at", { ascending: false });
    setItems((data as ZuyaBucketItemRow[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useZuyaTableEvent("zuya_bucket_list", () => void load());

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("zuya_bucket_list")
        .insert({ created_by: me.user_id, title });
      if (!error) {
        setDraft("");
        void load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: ZuyaBucketItemRow) {
    await supabase
      .from("zuya_bucket_list")
      .update({ done: !item.done, done_at: item.done ? null : new Date().toISOString() })
      .eq("id", item.id);
    void load();
  }

  async function remove(item: ZuyaBucketItemRow) {
    await supabase.from("zuya_bucket_list").delete().eq("id", item.id);
    void load();
  }

  function planIt(item: ZuyaBucketItemRow) {
    window.dispatchEvent(
      new CustomEvent("zuya:plan-date", { detail: { bucketId: item.id, title: item.title } }),
    );
    document.getElementById("zuya-calendar")?.scrollIntoView({ behavior: "smooth" });
  }

  const done = items.filter((i) => i.done).length;

  return (
    <Card
      id="zuya-bucket-card"
      title="Bucket list"
      meta={items.length > 0 ? `${done}/${items.length} done` : undefined}
      collapsible={false}
    >
      <form onSubmit={add} className="flex gap-2 mb-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Something we should do together…"
          maxLength={300}
          className="flex-1 px-3.5 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          disabled={busy || !draft.trim()}
          className="grid place-items-center h-10 w-10 rounded-full text-white transition hover:brightness-110 active:scale-95 disabled:opacity-40 shrink-0"
          style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
          aria-label="Add"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>

      {items.length === 0 && (
        <p className="text-[13px] text-muted text-center py-6">
          Nothing here yet.
        </p>
      )}

      <div className="divide-rule max-h-[300px] overflow-y-auto pr-1">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2.5 py-2 group">
            <button
              onClick={() => toggle(item)}
              className={`grid place-items-center h-5.5 w-5.5 rounded-full border-2 transition shrink-0 ${
                item.done
                  ? "border-transparent text-white"
                  : "border-[var(--rule)] text-transparent hover:border-[var(--accent)]"
              }`}
              style={{
                width: 22,
                height: 22,
                background: item.done
                  ? "linear-gradient(135deg, var(--grad-from), var(--grad-via))"
                  : undefined,
              }}
              aria-label={item.done ? "Mark not done" : "Mark done"}
            >
              <Check className="h-3 w-3" />
            </button>
            <span
              className={`flex-1 min-w-0 text-[13.5px] leading-snug break-words ${
                item.done ? "line-through text-muted-2" : "text-ink"
              }`}
            >
              {item.title}
            </span>
            {!item.done && (
              <button
                onClick={() => planIt(item)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent opacity-0 group-hover:opacity-100 focus:opacity-100 transition shrink-0"
              >
                <Sparkles className="h-3 w-3" /> Plan it
              </button>
            )}
            <button
              onClick={() => remove(item)}
              className="text-muted-2 hover:text-down opacity-0 group-hover:opacity-100 focus:opacity-100 transition shrink-0"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
