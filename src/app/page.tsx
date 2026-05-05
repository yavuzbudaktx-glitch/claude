import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Masthead } from "@/components/widgets/Masthead";
import { AnalogClock } from "@/components/AnalogClock";
import { PrayersVerseCard } from "@/components/widgets/PrayersVerseCard";
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
    <main className="max-w-[1480px] mx-auto px-5 md:px-10 py-5 md:py-6 space-y-5">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <CalendarCard />
        <PrayersVerseCard />
        <NewsCard />
      </div>

      <EisenhowerMatrix userId={user.id} />
    </main>
  );
}
