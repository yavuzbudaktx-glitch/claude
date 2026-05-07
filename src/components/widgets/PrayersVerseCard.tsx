"use client";

import useSWR from "swr";
import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { PrayerChecks } from "./PrayerChecks";
import type { AyahPayload } from "@/lib/quran";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function localDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function msUntilLocalMidnight() {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return tomorrow.getTime() - now.getTime();
}

export function PrayersVerseCard() {
  // Cache key is the user's *local* date so the verse rotates at local
  // midnight, not at UTC midnight (which is mid-evening in CST).
  const [dateKey, setDateKey] = useState(() => localDateKey());

  useEffect(() => {
    const t = setTimeout(() => setDateKey(localDateKey()), msUntilLocalMidnight());
    return () => clearTimeout(t);
  }, [dateKey]);

  const { data: a, isLoading } = useSWR<AyahPayload>(
    `/api/quran?d=${dateKey}`,
    fetcher,
    { refreshInterval: 1000 * 60 * 30, revalidateOnFocus: true, keepPreviousData: true },
  );

  return (
    <Card num="01" title="Prayer · Verse">
      <div className="grid grid-cols-[auto_1fr] gap-5">
        <div className="pr-5 border-r rule-soft border-r-[var(--rule-soft)] min-w-[120px]">
          <PrayerChecks />
        </div>

        <div>
          <div className="label mb-2 text-right">Verse of the Day</div>
          {isLoading && <p className="text-muted text-sm text-right">Loading…</p>}
          {a && (
            <div>
              <p
                dir="rtl"
                lang="ar"
                className="font-arabic text-xl md:text-[22px] leading-loose text-right"
              >
                {a.arabic}
              </p>
              <div className="font-mono text-[10px] tracking-wider text-muted mt-2 uppercase text-right">
                {a.surahNameEnglish} · {a.surahNameTranslation} · {a.numberInSurah}
              </div>
            </div>
          )}
        </div>
      </div>

      {a && (
        <div className="mt-4 pt-4 border-t rule">
          <p className="font-serif italic text-[15px] leading-relaxed">
            &ldquo;{a.english}&rdquo;
          </p>
          <div className="font-mono text-[10px] tracking-wider text-muted mt-2 uppercase">
            Translation · {a.englishTranslator}
          </div>
        </div>
      )}
    </Card>
  );
}
