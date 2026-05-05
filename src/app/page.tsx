import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Masthead } from "@/components/widgets/Masthead";
import { AnalogClock } from "@/components/AnalogClock";
import { WeatherVerseCard } from "@/components/widgets/WeatherVerseCard";
import { CalendarCard } from "@/components/widgets/CalendarCard";
import { NewsCard } from "@/components/widgets/NewsCard";
import { EisenhowerMatrix } from "@/components/widgets/EisenhowerMatrix";
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
    <main className="max-w-[1480px] mx-auto px-5 md:px-10 py-6 md:py-7 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6 items-stretch">
        <div className="flex flex-col justify-between gap-4">
          <Masthead name={name} />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignOutButton />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted ml-auto">
              Hand-typeset · No ads · No tracking
            </span>
          </div>
        </div>
        <div className="flex items-center justify-center lg:justify-end">
          <AnalogClock />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <CalendarCard />
        <WeatherVerseCard />
        <NewsCard />
      </div>

      <EisenhowerMatrix userId={user.id} />

      <footer className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted text-center pt-6 border-t rule">
        Established 2026 · Printed for one · Synced everywhere
      </footer>
    </main>
  );
}
