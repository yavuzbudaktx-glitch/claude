"use client";

import useSWR from "swr";
import { Music } from "lucide-react";
import { useZuya } from "@/components/zuya/ZuyaProvider";
import type { ZuyaUsername } from "@/lib/zuya/config";
import type { NowPlaying } from "@/lib/zuya/spotify";

type Entry = (NowPlaying & { connected: boolean }) | { connected: false };
type Resp = Record<ZuyaUsername, Entry>;

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "az önce";
  if (m < 60) return `${m}dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa önce`;
  return `${Math.floor(h / 24)}g önce`;
}

function Row({ name, entry }: { name: string; entry: Entry | undefined }) {
  const has = entry && "track" in entry && entry.track;
  const playing = has && entry.playing;
  return (
    <div className="flex items-center gap-2.5 min-w-0 flex-1">
      <div className="h-10 w-10 rounded-md overflow-hidden bg-[var(--rule-soft)] grid place-items-center shrink-0 relative">
        {has && entry.art ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entry.art} alt="" className={`h-full w-full object-cover ${playing ? "" : "opacity-70"}`} />
            {playing && (
              <span className="absolute bottom-0.5 right-0.5 flex gap-[1.5px] items-end h-2.5">
                <span className="w-[2px] bg-white animate-[zeq_0.8s_ease-in-out_infinite]" style={{ height: "60%" }} />
                <span className="w-[2px] bg-white animate-[zeq_0.8s_ease-in-out_infinite_0.2s]" style={{ height: "100%" }} />
                <span className="w-[2px] bg-white animate-[zeq_0.8s_ease-in-out_infinite_0.4s]" style={{ height: "40%" }} />
              </span>
            )}
          </>
        ) : (
          <Music className="h-4 w-4 text-muted-2" />
        )}
      </div>
      <div className="min-w-0">
        <p className="label !text-[9px]">{name}</p>
        {has ? (
          <>
            <p className="text-[13px] font-semibold text-ink truncate leading-tight">{entry.track}</p>
            <p className="text-[10.5px] text-muted truncate leading-tight">
              {entry.artist}
              {!playing && entry.playedAt && (
                <span className="text-muted-2"> · {timeAgo(entry.playedAt)}</span>
              )}
            </p>
          </>
        ) : (
          <p className="text-[12px] text-muted-2 truncate">
            {entry?.connected ? "henüz şarkı yok" : "bağlı değil"}
          </p>
        )}
      </div>
    </div>
  );
}

// Shows what each partner is playing on Spotify. Renders nothing until at
// least one of you has connected, so it stays out of the way otherwise.
export function NowPlayingCard() {
  const { me, partner } = useZuya();
  const { data } = useSWR<Resp>("/api/zuya/spotify/now", fetcher, {
    refreshInterval: 12_000,
    revalidateOnFocus: true,
  });

  if (!data) return null;
  const anyConnected = Object.values(data).some((e) => e && e.connected);
  if (!anyConnected) return null;

  return (
    <section className="card !p-3.5">
      <div className="flex items-center gap-4">
        <Row name={me.display_name} entry={data[me.username]} />
        <span className="w-px self-stretch bg-[var(--rule-soft)]" />
        <Row name={partner.display_name} entry={data[partner.username]} />
      </div>
    </section>
  );
}
