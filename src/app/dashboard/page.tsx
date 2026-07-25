import { redirect } from "next/navigation";
import Link from "next/link";
import { Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Masthead } from "@/components/widgets/Masthead";
import { TopUtilityBar } from "@/components/widgets/TopUtilityBar";
import { AnalogClock } from "@/components/AnalogClock";
import { PrayersVerseCard } from "@/components/widgets/PrayersVerseCard";
import { CalendarCard } from "@/components/widgets/CalendarCard";
import { NewsCard } from "@/components/widgets/NewsCard";
import { EisenhowerMatrix } from "@/components/widgets/EisenhowerMatrix";
import { MoversCard } from "@/components/widgets/MoversCard";
import { SuperLigCard } from "@/components/widgets/SuperLigCard";
import { TodaySummaryCard } from "@/components/widgets/TodaySummaryCard";
import { UfcCard } from "@/components/widgets/UfcCard";
import { BodyCard } from "@/components/widgets/BodyCard";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FullscreenToggle } from "@/components/FullscreenToggle";
import { Scratchpad } from "@/components/Scratchpad";
import { Calculator } from "@/components/Calculator";
import { Bookmarks } from "@/components/Bookmarks";
import { RadioButton } from "@/components/RadioButton";
import { ThemeVariantButton } from "@/components/ThemeVariantButton";
import { FocusButton } from "@/components/FocusButton";
import { ClaudeChat } from "@/components/ClaudeChat";

export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name =
    (user.user_metadata?.full_name as string | undefined)?.split(" ")[0] ??
    (user.user_metadata?.name as string | undefined) ??
    user.email?.split("@")[0];

  return (
    <main className="max-w-[1480px] mx-auto px-5 md:px-10 pt-[max(0.75rem,env(safe-area-inset-top))] md:pt-4 pb-6 md:pb-8 space-y-5">
      <section className="relative z-30 grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6 items-stretch lg:min-h-[220px]">
        <div className="flex flex-col gap-4 min-w-0">
          <TopUtilityBar
            context="dashboard"
            right={
              <>
                <RadioButton />
                <Scratchpad />
                <Bookmarks />
                <Calculator />
                <FocusButton />
                <ClaudeChat />
                <ThemeVariantButton />
                <ThemeToggle />
                <Link href="/dashboard/settings" className="btn-ghost" aria-label="Settings" title="Settings">
                  <Settings className="h-4 w-4" />
                </Link>
                <FullscreenToggle />
                <SignOutButton />
              </>
            }
          />
          <div className="flex flex-col justify-center gap-3 flex-1">
            <Masthead name={name} />
            <TodaySummaryCard />
          </div>
        </div>
        <div className="flex items-center justify-center lg:justify-end">
          <AnalogClock />
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
        <div id="sec-calendar" className="scroll-mt-4 [&>*]:h-full"><CalendarCard /></div>
        <div id="sec-news" className="scroll-mt-4 [&>*]:h-full"><NewsCard /></div>
        <div id="sec-prayer" className="scroll-mt-4 [&>*]:h-full"><PrayersVerseCard /></div>
      </div>

      <div id="sec-tasks" className="scroll-mt-4">
        <EisenhowerMatrix userId={user.id} />
      </div>

      {/* Body sits above the watchlist / Süper Lig row — it gets used far more
          often than either, so it earns the higher position. */}
      <div id="sec-body" className="scroll-mt-4">
        <BodyCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        <div id="sec-watchlist" className="scroll-mt-4 lg:col-span-2 [&>*]:h-full">
          <MoversCard />
        </div>
        <div id="sec-superlig" className="scroll-mt-4 [&>*]:h-full">
          <SuperLigCard />
        </div>
      </div>

      <div id="sec-ufc" className="scroll-mt-4">
        <UfcCard />
      </div>
    </main>
  );
}
