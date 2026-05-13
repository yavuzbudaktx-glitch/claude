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
      <div className="grid grid-cols-[auto_1fr] gap-5">
        <div className="pr-5 border-r rule-soft border-r-[var(--rule-soft)] min-w-[120px]">
          <PrayerChecks />
        </div>

        <div>
          <div className="label mb-2 text-right">Hadith of the Day</div>
          {isLoading && <p className="text-muted text-sm text-right">Loading…</p>}
          {h && h.arabic && (
            <p
              dir="rtl"
              lang="ar"
              className="font-arabic text-base leading-loose text-right"
            >
              {h.arabic}
            </p>
          )}
          {h && (
            <div className="font-mono text-[10px] tracking-wider text-muted mt-2 uppercase text-right">
              {h.bookName} · № {h.hadithNumber}
              {h.sectionName ? ` · ${h.sectionName}` : ""}
            </div>
          )}
        </div>
      </div>

      {h && (
        <div className="mt-4 pt-4 border-t rule">
          {h.narrator && (
            <div className="font-mono text-[10px] tracking-wider text-muted mb-1 uppercase">
              Narrated · {h.narrator}
            </div>
          )}
          <p className="font-serif italic text-[15px] leading-relaxed">
            &ldquo;{h.english}&rdquo;
          </p>
        </div>
      )}
    </Card>
  );
}
