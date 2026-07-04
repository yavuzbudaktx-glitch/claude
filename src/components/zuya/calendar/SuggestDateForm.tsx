"use client";

import { useEffect, useState } from "react";
import { CalendarHeart, MapPin } from "lucide-react";
import { useZuya } from "@/components/zuya/ZuyaProvider";
import type { ZuyaBucketItemRow, ZuyaDateSuggestionRow } from "@/types/zuya";

export interface DateFormValues {
  title: string;
  day: string;
  time: string;
  place: string;
  note: string;
  bucket_item_id: string | null;
}

function toLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function valuesFromSuggestion(s: ZuyaDateSuggestionRow): DateFormValues {
  return {
    title: s.title,
    day: s.day,
    time: toLocalTime(s.start_at),
    place: s.place ?? "",
    note: s.note ?? "",
    bucket_item_id: s.bucket_item_id,
  };
}

/** Compose the API payload from form values (start_at in the local timezone —
 * both of you live in the same one). */
export function payloadFromValues(v: DateFormValues) {
  const start = new Date(`${v.day}T${v.time || "19:00"}`);
  return {
    title: v.title.trim(),
    day: v.day,
    start_at: start.toISOString(),
    end_at: null,
    place: v.place.trim() || null,
    note: v.note.trim() || null,
    bucket_item_id: v.bucket_item_id,
  };
}

// Shared by "suggest a date" (create) and "suggest edits" (counter).
export function SuggestDateForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<DateFormValues>;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (values: DateFormValues) => void;
  onCancel?: () => void;
}) {
  const { supabase } = useZuya();
  const [values, setValues] = useState<DateFormValues>({
    title: initial?.title ?? "",
    day: initial?.day ?? "",
    time: initial?.time ?? "19:00",
    place: initial?.place ?? "",
    note: initial?.note ?? "",
    bucket_item_id: initial?.bucket_item_id ?? null,
  });
  const [bucket, setBucket] = useState<ZuyaBucketItemRow[]>([]);

  // Keep the day in sync when the user taps a different day on the grid.
  useEffect(() => {
    if (initial?.day) setValues((v) => ({ ...v, day: initial.day! }));
  }, [initial?.day]);

  useEffect(() => {
    supabase
      .from("zuya_bucket_list")
      .select("*")
      .eq("done", false)
      .order("created_at", { ascending: false })
      .then(({ data }) => setBucket((data as ZuyaBucketItemRow[]) ?? []));
  }, [supabase]);

  function set<K extends keyof DateFormValues>(k: K, v: DateFormValues[K]) {
    setValues((s) => ({ ...s, [k]: v }));
  }

  const inputCls =
    "w-full px-3.5 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!values.title.trim() || !values.day) return;
        onSubmit(values);
      }}
      className="space-y-2.5"
    >
      {bucket.length > 0 && (
        <select
          value={values.bucket_item_id ?? ""}
          onChange={(e) => {
            const id = e.target.value || null;
            const item = bucket.find((b) => b.id === id);
            setValues((v) => ({
              ...v,
              bucket_item_id: id,
              title: item ? item.title : v.title,
            }));
          }}
          className={inputCls}
        >
          <option value="">…or pick from the bucket list</option>
          {bucket.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      )}

      <input
        value={values.title}
        onChange={(e) => set("title", e.target.value)}
        placeholder="What are we doing? (dinner, movie night…)"
        maxLength={200}
        required
        className={inputCls}
      />

      <div className="grid grid-cols-2 gap-2.5">
        <input
          type="date"
          value={values.day}
          onChange={(e) => set("day", e.target.value)}
          required
          className={inputCls}
        />
        <input
          type="time"
          value={values.time}
          onChange={(e) => set("time", e.target.value)}
          required
          className={inputCls}
        />
      </div>

      <div className="relative">
        <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-2" />
        <input
          value={values.place}
          onChange={(e) => set("place", e.target.value)}
          placeholder="Where?"
          maxLength={200}
          className={`${inputCls} !pl-10`}
        />
      </div>

      <textarea
        value={values.note}
        onChange={(e) => set("note", e.target.value)}
        placeholder="A little note… (optional)"
        maxLength={1000}
        rows={2}
        className={`${inputCls} resize-none`}
      />

      <div className="flex gap-2.5">
        <button
          type="submit"
          disabled={busy || !values.title.trim() || !values.day}
          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-[13.5px] font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))",
            boxShadow: "0 10px 26px -10px var(--glow)",
          }}
        >
          <CalendarHeart className="h-4 w-4" />
          {busy ? "…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-3 rounded-2xl text-[13px] border border-[var(--rule)] hover:border-[var(--accent)] transition"
          >
            Never mind
          </button>
        )}
      </div>
    </form>
  );
}
