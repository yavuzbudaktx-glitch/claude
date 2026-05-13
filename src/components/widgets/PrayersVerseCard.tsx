"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { PrayerChecks } from "./PrayerChecks";
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
      <PrayerChecks />

      <div className="mt-4 pt-4 border-t rule">
        <div className="flex items-baseline justify-between mb-2">
          <div className="label">Hadith of the Day</div>
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
                Narrated · {h.narrator}
              </div>
            )}
            <p className="font-serif italic text-[15px] leading-relaxed">
              &ldquo;{h.english}&rdquo;
            </p>
            {h.sectionName && (
              <div className="font-mono text-[10px] tracking-wider text-muted mt-2 uppercase">
                {h.sectionName}
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
