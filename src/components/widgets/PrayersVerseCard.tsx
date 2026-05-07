"use client";

import useSWR from "swr";
import { Card } from "@/components/Card";
import { PrayerChecks } from "./PrayerChecks";
import type { AyahPayload } from "@/lib/quran";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function utcDateKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function PrayersVerseCard() {
  // The UTC date in the SWR key flips the cache bucket at midnight UTC so the
  // verse rotates without waiting for the refresh interval to land.
  const { data: a, isLoading } = useSWR<AyahPayload>(
    `/api/quran?d=${utcDateKey()}`,
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
