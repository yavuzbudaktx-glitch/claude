"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { PrayerTimes, PrayerTicker } from "./PrayerTimes";
import type { HadithPayload } from "@/lib/hadith";
import { localDateKey, msUntilLocalMidnight } from "@/lib/local-date";

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

  return (
    <Card num="01" title="Prayer · Hadith">
      <PrayerTimes />

      <div className="mt-4 pt-4 border-t rule">
        <div className="flex items-baseline justify-between mb-2">
          <div className="label">Günün Hadisi</div>
          {h && (
            <div className="font-mono text-[10px] tracking-wider text-muted uppercase">
              {h.bookName} · № {h.hadithNumber}
            </div>
          )}
        </div>
        {isLoading && <p className="text-muted text-sm">Loading…</p>}
        {h && (
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

        {/* Motivational reminder: a compact next-prayer ticker that lives
            right under the hadith — same data as the top, dedup'd by SWR. */}
        <PrayerTicker />
      </div>
    </Card>
  );
}
