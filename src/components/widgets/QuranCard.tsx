"use client";

import useSWR from "swr";
import { BookOpen } from "lucide-react";
import { Card } from "@/components/Card";
import type { AyahPayload } from "@/lib/quran";

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<AyahPayload>);

export function QuranCard() {
  const { data, error, isLoading } = useSWR<AyahPayload>("/api/quran", fetcher);

  return (
    <Card title="Verse of the Day" icon={<BookOpen className="h-3.5 w-3.5" />}>
      {isLoading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-rose-400">Couldn&rsquo;t load verse.</p>}
      {data && (
        <div className="space-y-4">
          <p
            dir="rtl"
            lang="ar"
            className="font-arabic text-2xl md:text-3xl leading-loose text-right"
          >
            {data.arabic}
          </p>
          <p className="font-serif text-base md:text-lg leading-relaxed italic">
            &ldquo;{data.translation}&rdquo;
          </p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
            {data.surahName} · {data.surahNameTranslation} · {data.numberInSurah}
          </p>
        </div>
      )}
    </Card>
  );
}
