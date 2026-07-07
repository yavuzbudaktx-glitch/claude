import { ZuyaCalendarCard } from "@/components/zuya/calendar/ZuyaCalendarCard";
import { DailyPhotoCard } from "@/components/zuya/DailyPhotoCard";
import { WatchlistCard } from "@/components/zuya/WatchlistCard";
import { DailyQuestionCard } from "@/components/zuya/DailyQuestionCard";
import { PinterestCard } from "@/components/zuya/PinterestCard";
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

      {/* A photo of us + the watch-together queue. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
        <div id="zuya-photo" className="scroll-mt-20 [&>*]:h-full">
          <DailyPhotoCard />
        </div>
        <div id="zuya-watchlist" className="scroll-mt-20 [&>*]:h-full">
          <WatchlistCard />
        </div>
      </div>

      {/* The fun row. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
        <div id="zuya-question" className="scroll-mt-20 [&>*]:h-full">
          <DailyQuestionCard />
        </div>
        <div id="zuya-board" className="scroll-mt-20 [&>*]:h-full">
          <PinterestCard />
        </div>
      </div>
    </main>
  );
}
