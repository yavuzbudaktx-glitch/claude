import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DateTimeHeader } from "@/components/widgets/DateTimeHeader";
import { WeatherCard } from "@/components/widgets/WeatherCard";
import { QuranCard } from "@/components/widgets/QuranCard";
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
    <main className="max-w-6xl mx-auto px-5 md:px-8 py-8 md:py-12 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <DateTimeHeader name={name} />
        <div className="flex items-center gap-2 shrink-0 mt-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <WeatherCard />
        <QuranCard />
        <CalendarCard />
        <NewsCard />
      </div>

      <EisenhowerMatrix userId={user.id} />

      <footer className="text-center text-xs text-muted py-6">
        Have a good day. Built for one — synced everywhere.
      </footer>
    </main>
  );
}
