import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Masthead } from "@/components/widgets/Masthead";
import { AnalogClock } from "@/components/AnalogClock";
import { PrayersVerseCard } from "@/components/widgets/PrayersVerseCard";
import { CalendarCard } from "@/components/widgets/CalendarCard";
import { NewsCard } from "@/components/widgets/NewsCard";
import { EisenhowerMatrix } from "@/components/widgets/EisenhowerMatrix";
import { PortfolioCard } from "@/components/widgets/PortfolioCard";
import { SuperLigCard } from "@/components/widgets/SuperLigCard";
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
    <main className="max-w-[1480px] mx-auto px-5 md:px-10 pt-3 md:pt-4 pb-6 md:pb-8 space-y-5">
      <section className="pb-4 border-b rule">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6 items-center">
          <Masthead
            name={name}
            actions={
              <>
                <ThemeToggle />
                <SignOutButton />
              </>
            }
          />
          <div className="flex items-center justify-center lg:justify-end">
            <AnalogClock />
          </div>
        </div>
      </section>

      <div className="h-6 md:h-10" aria-hidden />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <CalendarCard />
        <PrayersVerseCard />
        <NewsCard />
      </div>

      <EisenhowerMatrix userId={user.id} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <PortfolioCard />
        </div>
        <SuperLigCard />
      </div>
    </main>
  );
}
