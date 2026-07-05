import { ZuyaCalendarCard } from "@/components/zuya/calendar/ZuyaCalendarCard";
import { DailyPhotoCard } from "@/components/zuya/DailyPhotoCard";
import { MessagesCard } from "@/components/zuya/MessagesCard";
import { DailyQuestionCard } from "@/components/zuya/DailyQuestionCard";
import { BucketListCard } from "@/components/zuya/BucketListCard";
import { LocationCard } from "@/components/zuya/LocationCard";

export const dynamic = "force-dynamic";

export default function ZuyaDashboard() {
  return (
    <main className="space-y-5 pt-5">
      {/* Where we are. */}
      <div id="zuya-location" className="scroll-mt-20">
        <LocationCard />
      </div>

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
        <div id="zuya-question" className="scroll-mt-20 [&>*]:h-full">
          <DailyQuestionCard />
        </div>
        <div id="zuya-bucket" className="scroll-mt-20 [&>*]:h-full">
          <BucketListCard />
        </div>
      </div>
    </main>
  );
}
