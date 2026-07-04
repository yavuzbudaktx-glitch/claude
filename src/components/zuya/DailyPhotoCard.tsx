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
    <Card id="zuya-photo-card" title="Today's us" meta="günün karesi" collapsible={false}>
      {pick ? (
        <figure>
          <div className="rounded-2xl overflow-hidden border border-[var(--rule-soft)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/zuya/daily/${encodeURIComponent(pick.file)}`}
              alt={pick.caption || "us"}
              className="w-full max-h-[340px] object-cover"
            />
          </div>
          {pick.caption && (
            <figcaption className="text-center text-[13px] text-ink-soft italic mt-3">
              “{pick.caption}”
            </figcaption>
          )}
        </figure>
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
