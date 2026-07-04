import { ThoughtStrip } from "@/components/zuya/ThoughtStrip";
import { ZuyaCalendarCard } from "@/components/zuya/calendar/ZuyaCalendarCard";
import { DailyPhotoCard } from "@/components/zuya/DailyPhotoCard";
import { MessagesCard } from "@/components/zuya/MessagesCard";
import { DailyQuestionCard } from "@/components/zuya/DailyQuestionCard";
import { BucketListCard } from "@/components/zuya/BucketListCard";
import { WordleRaceCard } from "@/components/zuya/WordleRaceCard";

export const dynamic = "force-dynamic";

export default function ZuyaDashboard() {
  return (
    <main className="space-y-5 pt-5">
      {/* "Thought about you N times today" — front and center. */}
      <ThoughtStrip />

      {/* Our calendars, merged + date suggestions. */}
      <div id="zuya-calendar" className="scroll-mt-20 [&>*]:h-full">
        <ZuyaCalendarCard />
      </div>

      {/* A photo of us + the message wall. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
        <div id="zuya-photo" className="scroll-mt-20 [&>*]:h-full">
          <DailyPhotoCard />
        </div>
        <div id="zuya-messages" className="scroll-mt-20 [&>*]:h-full">
          <MessagesCard />
        </div>
      </div>

      {/* The fun row. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
        <div id="zuya-question" className="scroll-mt-20 [&>*]:h-full">
          <DailyQuestionCard />
        </div>
        <div id="zuya-bucket" className="scroll-mt-20 [&>*]:h-full">
          <BucketListCard />
        </div>
        <div id="zuya-wordle" className="scroll-mt-20 md:col-span-2 xl:col-span-1 [&>*]:h-full">
          <WordleRaceCard />
        </div>
      </div>

      <p className="label text-center pt-2 pb-4">Zuya · bizim köşemiz ♥</p>
    </main>
  );
}
