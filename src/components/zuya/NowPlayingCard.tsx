"use client";

import useSWR from "swr";
import { Music } from "lucide-react";
import { useZuya } from "@/components/zuya/ZuyaProvider";
import type { ZuyaUsername } from "@/lib/zuya/config";
import type { NowPlaying } from "@/lib/zuya/spotify";

type Entry = (NowPlaying & { connected: boolean }) | { connected: false };
type Resp = Record<ZuyaUsername, Entry>;

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function Row({ name, entry }: { name: string; entry: Entry | undefined }) {
  const playing = entry && "playing" in entry && entry.playing && entry.track;
  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <div className="h-11 w-11 rounded-lg overflow-hidden bg-[var(--rule-soft)] grid place-items-center shrink-0">
        {playing && entry.art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.art} alt="" className="h-full w-full object-cover" />
        ) : (
          <Music className="h-4 w-4 text-muted-2" />
        )}
      </div>
      <div className="min-w-0">
        <p className="label !text-[9px]">{name}</p>
        {playing ? (
          <>
            <p className="text-[13px] font-semibold text-ink truncate">{entry.track}</p>
            <p className="text-[11px] text-muted truncate">{entry.artist}</p>
          </>
        ) : (
          <p className="text-[12px] text-muted-2 truncate">
            {entry?.connected ? "şu an sessiz" : "bağlı değil"}
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
    refreshInterval: 20_000,
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
