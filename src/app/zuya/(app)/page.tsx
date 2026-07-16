import { ZuyaCalendarCard } from "@/components/zuya/calendar/ZuyaCalendarCard";
import { BeRealCard } from "@/components/zuya/BeRealCard";
import { WatchlistCard } from "@/components/zuya/WatchlistCard";
import { DailyQuestionCard } from "@/components/zuya/DailyQuestionCard";
import { LocationCard } from "@/components/zuya/LocationCard";
import { NowPlayingCard } from "@/components/zuya/NowPlayingCard";

export const dynamic = "force-dynamic";

export default function ZuyaDashboard() {
  return (
    <main className="space-y-3.5 pt-3.5">
      {/* Listening now (only renders if someone's connected Spotify). */}
      <NowPlayingCard />

      {/* Where we are. */}
      <div id="zuya-location" className="scroll-mt-20">
        <LocationCard />
      </div>

      {/* Our calendars, merged + date suggestions. */}
      <div id="zuya-calendar" className="scroll-mt-20 [&>*]:h-full">
        <ZuyaCalendarCard />
      </div>

      {/* Anlık (our BeReal) + the question of the day. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
        <div id="zuya-bereal" className="scroll-mt-20 [&>*]:h-full">
          <BeRealCard />
        </div>
        <div id="zuya-question" className="scroll-mt-20 [&>*]:h-full">
          <DailyQuestionCard />
        </div>
      </div>

      {/* Watch-together queue + movie ratings. */}
      <div id="zuya-watchlist" className="scroll-mt-20">
        <WatchlistCard />
      </div>
    </main>
  );
}
