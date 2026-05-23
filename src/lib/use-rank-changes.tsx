"use client";

import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

// Tracks rank movement for an ordered list of stable IDs (fighters, teams)
// across loads, persisted per-device in localStorage. When the order
// changes, each moved entry gets a delta (+ = moved up) stamped with the
// time it moved; the arrow then shows for a week before expiring. The
// snapshot is rewritten every load so a move is recorded once and then
// carried by its timestamp — exactly the behaviour the UFC / league sites
// use for their up/down indicators.

export interface RankChange {
  delta: number; // positive = moved up the rankings
  since: number; // epoch ms when the move was detected
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored {
  order: string[];
  changes: Record<string, RankChange>;
}

export function useRankChanges(
  storageKey: string,
  order: string[] | null | undefined,
): Record<string, RankChange> {
  const [changes, setChanges] = useState<Record<string, RankChange>>({});

  const orderSig = order && order.length ? order.join("|") : "";

  useEffect(() => {
    if (!order || order.length === 0) return;

    let stored: Stored | null = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) stored = JSON.parse(raw) as Stored;
    } catch {
      stored = null;
    }

    const now = Date.now();
    const next: Record<string, RankChange> = {};

    // Carry forward any still-unexpired changes from before.
    for (const [id, c] of Object.entries(stored?.changes ?? {})) {
      if (now - c.since < WEEK_MS) next[id] = c;
    }

    // Compare against the previous snapshot and record fresh moves.
    if (stored?.order && stored.order.length) {
      const prevIndex = new Map(stored.order.map((id, i) => [id, i]));
      order.forEach((id, i) => {
        const pi = prevIndex.get(id);
        if (pi != null && pi !== i) {
          next[id] = { delta: pi - i, since: now };
        }
      });
    }

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ order, changes: next } satisfies Stored),
      );
    } catch {
      // ignore persistence failures
    }

    setChanges(next);
    // orderSig captures content changes; storageKey scopes the snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, orderSig]);

  return changes;
}

export function RankArrow({ change }: { change?: RankChange }) {
  if (!change || change.delta === 0) return null;
  const up = change.delta > 0;
  return (
    <span
      className={`inline-flex items-center gap-px text-[10px] font-semibold tabular-nums ${
        up ? "text-up" : "text-down"
      }`}
      title={`${up ? "Up" : "Down"} ${Math.abs(change.delta)} this week`}
    >
      {up ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      {Math.abs(change.delta)}
    </span>
  );
}
