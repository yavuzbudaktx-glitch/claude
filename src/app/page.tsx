import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Masthead } from "@/components/widgets/Masthead";
import { AnalogClock } from "@/components/AnalogClock";
import { PrayersVerseCard } from "@/components/widgets/PrayersVerseCard";
import { CalendarCard } from "@/components/widgets/CalendarCard";
import { NewsCard } from "@/components/widgets/NewsCard";
import { EisenhowerMatrix } from "@/components/widgets/EisenhowerMatrix";
import { MoversCard } from "@/components/widgets/MoversCard";
import { SuperLigCard } from "@/components/widgets/SuperLigCard";
import { TodayInHistoryCard } from "@/components/widgets/TodayInHistoryCard";
import { UfcCard } from "@/components/widgets/UfcCard";
import { SignOutButton } from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <main className="max-w-[1480px] mx-auto px-5 md:px-10 pt-2 md:pt-3 pb-6 md:pb-8 space-y-5">
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6 lg:min-h-[240px]">
        <div className="flex flex-col justify-center gap-3">
          <Masthead
            name={name}
            actions={
              <>
                <ThemeToggle />
                <SignOutButton />
              </>
            }
          />
          <TodayInHistoryCard />
        </div>
        <div className="flex items-center justify-center lg:justify-end">
          <AnalogClock />
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <CalendarCard />
        <NewsCard />
        <PrayersVerseCard />
      </div>

      <EisenhowerMatrix userId={user.id} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        <div className="lg:col-span-2 [&>*]:h-full">
          <MoversCard />
        </div>
        <div className="[&>*]:h-full">
          <SuperLigCard />
        </div>
      </div>

      <UfcCard />

      <footer className="pt-6 pb-2 flex items-center gap-3 text-muted">
        <div className="flex-1 h-px bg-[var(--rule-soft)]" />
        <span className="font-mono text-[10px] tracking-[0.32em] uppercase">
          ✦ End of edition ✦
        </span>
        <div className="flex-1 h-px bg-[var(--rule-soft)]" />
      </footer>
    </main>
  );
}
