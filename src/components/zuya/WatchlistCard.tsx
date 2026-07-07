"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Star, Check, Trash2, Film, Tv } from "lucide-react";
import { Card } from "@/components/Card";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import type { ZuyaWatchlistRow } from "@/types/zuya";

function Stars({
  value,
  onSet,
  readOnly,
}: {
  value: number;
  onSet?: (n: number) => void;
  readOnly?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onSet?.(n)}
          className={readOnly ? "cursor-default" : "hover:scale-110 transition"}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            className={`h-3.5 w-3.5 ${n <= value ? "text-accent" : "text-[var(--rule)]"}`}
            fill={n <= value ? "currentColor" : "none"}
          />
        </button>
      ))}
    </span>
  );
}

export function WatchlistCard() {
  const { supabase, me, partner } = useZuya();
  const [items, setItems] = useState<ZuyaWatchlistRow[]>([]);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"movie" | "show">("movie");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("zuya_watchlist")
      .select("*")
      .order("watched", { ascending: true })
      .order("created_at", { ascending: false });
    setItems((data as ZuyaWatchlistRow[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useZuyaTableEvent("zuya_watchlist", () => void load());

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("zuya_watchlist")
        .insert({ added_by: me.user_id, title: t, kind });
      if (!error) {
        setTitle("");
        void load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleWatched(row: ZuyaWatchlistRow) {
    const next = !row.watched;
    setItems((xs) => xs.map((x) => (x.id === row.id ? { ...x, watched: next } : x)));
    await supabase
      .from("zuya_watchlist")
      .update({ watched: next, watched_at: next ? new Date().toISOString() : null })
      .eq("id", row.id);
  }

  async function rate(row: ZuyaWatchlistRow, n: number) {
    const ratings = { ...(row.ratings ?? {}), [me.user_id]: n };
    setItems((xs) => xs.map((x) => (x.id === row.id ? { ...x, ratings } : x)));
    await supabase.from("zuya_watchlist").update({ ratings }).eq("id", row.id);
  }

  async function remove(row: ZuyaWatchlistRow) {
    setItems((xs) => xs.filter((x) => x.id !== row.id));
    await supabase.from("zuya_watchlist").delete().eq("id", row.id);
  }

  const toWatch = items.filter((i) => !i.watched);
  const watched = items.filter((i) => i.watched);

  function Row({ row }: { row: ZuyaWatchlistRow }) {
    const Icon = row.kind === "show" ? Tv : Film;
    const myR = row.ratings?.[me.user_id] ?? 0;
    const theirR = partner?.user_id ? row.ratings?.[partner.user_id] ?? 0 : 0;
    return (
      <div className="group flex items-start gap-2.5 py-2">
        <button
          onClick={() => void toggleWatched(row)}
          className={`mt-0.5 grid place-items-center h-5 w-5 rounded-md border shrink-0 transition ${
            row.watched
              ? "border-transparent text-white"
              : "border-[var(--rule)] text-transparent hover:border-[var(--accent)]"
          }`}
          style={row.watched ? { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" } : undefined}
          aria-label={row.watched ? "Mark unwatched" : "Mark watched"}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-muted shrink-0" />
            <span className={`text-[13.5px] truncate ${row.watched ? "text-muted line-through" : "text-ink"}`}>
              {row.title}
            </span>
          </div>
          {row.watched && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1">
                {me.display_name}: <Stars value={myR} onSet={(n) => void rate(row, n)} />
              </span>
              {partner?.user_id && (
                <span className="inline-flex items-center gap-1">
                  {partner.display_name}: <Stars value={theirR} readOnly />
                </span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => void remove(row)}
          className="text-muted-2 opacity-0 group-hover:opacity-100 hover:text-down transition shrink-0"
          aria-label="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <Card id="zuya-watchlist" title="Watch together" collapsible={false} className="flex flex-col">
      <form onSubmit={add} className="flex gap-2 mb-3">
        <button
          type="button"
          onClick={() => setKind((k) => (k === "movie" ? "show" : "movie"))}
          className="shrink-0 grid place-items-center h-10 w-10 rounded-2xl border border-[var(--rule)] text-muted hover:text-accent hover:border-[var(--accent)] transition"
          title={kind === "movie" ? "Movie (tap for show)" : "Show (tap for movie)"}
          aria-label="Toggle movie or show"
        >
          {kind === "movie" ? <Film className="h-4 w-4" /> : <Tv className="h-4 w-4" />}
        </button>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a movie or show…"
          maxLength={200}
          className="flex-1 px-4 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <button
          disabled={busy || !title.trim()}
          className="grid place-items-center h-10 w-10 rounded-2xl text-white transition hover:brightness-110 active:scale-95 disabled:opacity-40 shrink-0"
          style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
          aria-label="Add"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>

      <div className="flex-1 min-h-[220px] max-h-[380px] overflow-y-auto pr-1 divide-y divide-[var(--rule-soft)]">
        {items.length === 0 && (
          <p className="text-muted text-[13px] text-center pt-10">
            Nothing queued yet — add the first one.
          </p>
        )}
        {toWatch.map((row) => (
          <Row key={row.id} row={row} />
        ))}
        {watched.length > 0 && (
          <div className="pt-2">
            <p className="label pt-2 pb-1">Watched</p>
            {watched.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
