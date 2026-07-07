"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/Card";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";

interface Pin {
  id: string;
  link: string;
  image: string;
  description: string;
}

export function PinterestCard() {
  const { supabase } = useZuya();
  const [board, setBoard] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    const { data } = await supabase
      .from("zuya_settings")
      .select("value")
      .eq("key", "pinterest_board")
      .maybeSingle();
    setBoard(((data as { value: string | null } | null)?.value ?? "").trim() || null);
  }, [supabase]);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  // If the other person changes the board, refresh.
  useZuyaTableEvent("zuya_settings", () => void loadBoard());

  const loadPins = useCallback(async () => {
    if (!board) {
      setPins([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/zuya/pinterest?board=${encodeURIComponent(board)}`);
      const json = await res.json();
      if (json.error) setErr(json.error);
      setPins((json.pins ?? []).filter((p: Pin) => p.image));
    } catch {
      setErr("Board couldn't be reached.");
    } finally {
      setLoading(false);
    }
  }, [board]);

  useEffect(() => {
    void loadPins();
  }, [loadPins]);

  const boardLink = board
    ? board.startsWith("http")
      ? board
      : `https://www.pinterest.com/${board.replace(/^\/+/, "")}`
    : null;

  const action = board ? (
    <button
      onClick={() => void loadPins()}
      className="text-muted hover:text-accent transition"
      title="Refresh"
      aria-label="Refresh"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
    </button>
  ) : null;

  return (
    <Card title="Pinboard" collapsible={false} action={action} className="flex flex-col">
      {!board ? (
        <div className="text-[13px] text-muted py-6 text-center">
          <p className="mb-2">Connect your shared Pinterest board.</p>
          <Link href="/zuya/settings" className="text-accent underline underline-offset-2">
            Add it in settings →
          </Link>
        </div>
      ) : loading && pins.length === 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-black/5 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : pins.length === 0 ? (
        <p className="text-[13px] text-muted py-6 text-center">
          {err ?? "No pins yet — or this board is private."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {pins.map((p) => (
              <a
                key={p.id}
                href={p.link}
                target="_blank"
                rel="noreferrer"
                title={p.description}
                className="group relative block aspect-square overflow-hidden rounded-lg bg-black/5 dark:bg-white/5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.image}
                  alt={p.description || "pin"}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              </a>
            ))}
          </div>
          {boardLink && (
            <a
              href={boardLink}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent transition"
            >
              <ExternalLink className="h-3 w-3" /> Open board on Pinterest
            </a>
          )}
        </>
      )}
    </Card>
  );
}
