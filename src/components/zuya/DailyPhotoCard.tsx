"use client";

import useSWR from "swr";
import { ImageIcon } from "lucide-react";
import { Card } from "@/components/Card";
import { zuyaToday, zuyaSeedIdx } from "@/lib/zuya/day";

interface PhotoEntry {
  file: string;
  caption?: string;
}

const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : []));

// One photo of us per day, picked deterministically from the folder committed
// to the repo (public/zuya/daily + manifest.json). Same photo all day, new one
// tomorrow.
export function DailyPhotoCard() {
  const { data } = useSWR<PhotoEntry[]>("/zuya/daily/manifest.json", fetcher, {
    revalidateOnFocus: false,
  });

  const entries = Array.isArray(data) ? data : [];
  const today = zuyaToday();
  const pick = entries.length > 0 ? entries[zuyaSeedIdx(`${today}-zuya-photo`, entries.length)] : null;

  return (
    <Card id="zuya-photo-card" title="Photo of the day" collapsible={false}>
      {pick ? (
        <div
          className="rounded-2xl overflow-hidden border border-[var(--rule-soft)] bg-[var(--paper-2)] grid place-items-center"
          style={{ height: 360 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/zuya/daily/${encodeURIComponent(pick.file)}`}
            alt="us"
            className="max-h-full max-w-full object-contain"
          />
        </div>
      ) : (
        <div className="grid place-items-center text-center py-10">
          <span className="grid place-items-center h-12 w-12 rounded-full bg-[var(--accent-soft)] mb-3">
            <ImageIcon className="h-5 w-5 text-accent" />
          </span>
          <p className="text-[13.5px] text-ink-soft max-w-[260px]">
            No photos yet. Add some to <code className="font-mono text-[12px]">public/zuya/daily</code>,
            run the manifest script, and a new memory shows up here every day.
          </p>
        </div>
      )}
    </Card>
  );
}
