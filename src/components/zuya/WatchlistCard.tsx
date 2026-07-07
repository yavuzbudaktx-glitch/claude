"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Star, Check, Trash2, Film, Tv, Search, Loader2 } from "lucide-react";
import { Card } from "@/components/Card";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import type { ZuyaWatchlistRow } from "@/types/zuya";

interface Hit {
  title: string;
  year: string;
  cover: string;
}

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
          className={readOnly ? "cursor-default" : "hover:scale-125 transition"}
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

function Poster({ cover, kind, size }: { cover: string | null; kind: string; size: number }) {
  const Icon = kind === "show" ? Tv : Film;
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg bg-[var(--paper-2)] border border-[var(--rule-soft)]"
      style={{ width: size, height: size * 1.5 }}
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-muted-2">
          <Icon className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

export function WatchlistCard() {
  const { supabase, me, partner } = useZuya();
  const [items, setItems] = useState<ZuyaWatchlistRow[]>([]);
  const [kind, setKind] = useState<"movie" | "show">("movie");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

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

  // Debounced poster search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/zuya/movie?q=${encodeURIComponent(term)}&kind=${kind}`);
        const json = await res.json();
        setHits(json.results ?? []);
        setOpen(true);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, kind]);

  // Close the results on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function add(hit: Hit | null) {
    const title = (hit?.title ?? q).trim();
    if (!title) return;
    setQ("");
    setHits([]);
    setOpen(false);
    const { error } = await supabase.from("zuya_watchlist").insert({
      added_by: me.user_id,
      title,
      kind,
      cover: hit?.cover ?? null,
      year: hit?.year ?? null,
    });
    if (!error) void load();
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
    const myR = row.ratings?.[me.user_id] ?? 0;
    const theirR = partner?.user_id ? row.ratings?.[partner.user_id] ?? 0 : 0;
    return (
      <div className="group flex items-start gap-3 py-2.5">
        <Poster cover={row.cover} kind={row.kind} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`text-[13.5px] font-medium truncate ${row.watched ? "text-muted" : "text-ink"}`}>
              {row.title}
            </span>
            {row.year && <span className="text-[11px] text-muted-2 shrink-0">{row.year}</span>}
          </div>
          {row.watched ? (
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="w-14 truncate">{me.display_name}</span>
                <Stars value={myR} onSet={(n) => void rate(row, n)} />
              </div>
              {partner?.user_id && partner.user_id !== "pending-partner" && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="w-14 truncate">{partner.display_name}</span>
                  <Stars value={theirR} readOnly />
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => void toggleWatched(row)}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent transition"
            >
              <Check className="h-3 w-3" /> mark watched
            </button>
          )}
        </div>
        {row.watched && (
          <button
            onClick={() => void toggleWatched(row)}
            className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-2 hover:text-ink transition shrink-0"
            title="Move back to queue"
          >
            undo
          </button>
        )}
        <button
          onClick={() => void remove(row)}
          className="mt-0.5 text-muted-2 opacity-0 group-hover:opacity-100 hover:text-down transition shrink-0"
          aria-label="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <Card id="zuya-watchlist" title="Watch together" collapsible={false} className="flex flex-col">
      <div ref={boxRef} className="relative mb-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setKind((k) => (k === "movie" ? "show" : "movie"))}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 h-10 rounded-2xl border border-[var(--rule)] text-[12px] font-medium text-muted hover:text-accent hover:border-[var(--accent)] transition"
            title="Switch between movies and shows"
          >
            {kind === "movie" ? <Film className="h-4 w-4" /> : <Tv className="h-4 w-4" />}
            {kind === "movie" ? "Movie" : "Show"}
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => hits.length && setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void add(hits[0] ?? null);
                }
              }}
              placeholder={`Search a ${kind}…`}
              className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-2 animate-spin" />
            )}
          </div>
        </div>

        {open && hits.length > 0 && (
          <div className="absolute z-20 mt-1.5 left-0 right-0 rounded-2xl border border-[var(--rule)] bg-[var(--paper)] shadow-[var(--shadow-card)] overflow-hidden max-h-72 overflow-y-auto">
            {hits.map((h, i) => (
              <button
                key={`${h.title}-${i}`}
                onClick={() => void add(h)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--hl)] transition"
              >
                <Poster cover={h.cover} kind={kind} size={34} />
                <span className="min-w-0">
                  <span className="block text-[13px] text-ink truncate">{h.title}</span>
                  {h.year && <span className="block text-[11px] text-muted">{h.year}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-[220px] max-h-[400px] overflow-y-auto pr-1 divide-y divide-[var(--rule-soft)]">
        {items.length === 0 && (
          <p className="text-muted text-[13px] text-center pt-10">
            Nothing queued yet — search a movie or show above.
          </p>
        )}
        {toWatch.map((row) => (
          <Row key={row.id} row={row} />
        ))}
        {watched.length > 0 && (
          <div className="pt-1">
            <p className="label pt-2 pb-1">Seen it</p>
            {watched.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
