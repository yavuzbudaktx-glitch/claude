"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/Card";
import { PrayerTimes, PrayerChecklist } from "./PrayerTimes";
import type { HadithPayload } from "@/lib/hadith";
import { localDateKey, msUntilLocalMidnight } from "@/lib/local-date";
import { usePref } from "@/components/PrefsProvider";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function PrayersVerseCard() {
  // Cache key is the user's *local* date so the hadith rotates at local
  // midnight, not at UTC midnight.
  const [dateKey, setDateKey] = useState(() => localDateKey());

  useEffect(() => {
    const t = setTimeout(() => setDateKey(localDateKey()), msUntilLocalMidnight());
    return () => clearTimeout(t);
  }, [dateKey]);

  const { data: h, isLoading } = useSWR<HadithPayload>(
    `/api/hadith?d=${dateKey}`,
    fetcher,
    { refreshInterval: 1000 * 60 * 30, revalidateOnFocus: true, keepPreviousData: true },
  );

  // Collapse the (sometimes very long) hadith so the card shrinks back to
  // the height of the calendar / news cards beside it. Synced across devices.
  const [collapsed, setCollapsed] = usePref<boolean>("hub.hadith.collapsed", false);

  return (
    <Card num="01" title="Prayer · Hadith">
      <PrayerTimes />

      <div className="mt-4 pt-4 border-t rule">
        <div className="flex items-baseline justify-between mb-2 gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="label inline-flex items-center gap-1 hover:text-accent transition"
            title={collapsed ? "Show hadith" : "Hide hadith"}
            aria-expanded={!collapsed}
          >
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform"
              style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
            />
            Günün Hadisi
          </button>
          {h && !collapsed && (
            <div className="font-mono text-[10px] tracking-wider text-muted uppercase">
              {h.bookName} · № {h.hadithNumber}
            </div>
          )}
        </div>
        {isLoading && !collapsed && <p className="text-muted text-sm">Loading…</p>}
        {h && !collapsed && (
          <>
            {h.narrator && (
              <div className="font-mono text-[10px] tracking-wider text-muted mb-1 uppercase">
                {h.narrator}
              </div>
            )}
            <p className="font-serif italic text-[15px] leading-relaxed">
              {h.text}
            </p>
            {(h.sectionName || h.source) && (
              <div className="font-mono text-[10px] tracking-wider text-muted mt-2 uppercase flex items-baseline gap-1.5 flex-wrap">
                {h.sectionName && <span>{h.sectionName}</span>}
                {h.sectionName && h.source && <span className="text-muted-2">·</span>}
                {h.source && <span>{h.source}</span>}
              </div>
            )}
          </>
        )}

        {/* Daily accountability: five tap-to-mark prayer boxes under the
            hadith, persisted per day. */}
        <PrayerChecklist />
      </div>
    </Card>
  );
}
