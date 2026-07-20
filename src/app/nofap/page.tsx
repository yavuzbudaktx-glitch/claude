import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/Card";
import { TopUtilityBar } from "@/components/widgets/TopUtilityBar";
import { FocusButton } from "@/components/FocusButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FullscreenToggle } from "@/components/FullscreenToggle";
import { SignOutButton } from "@/components/SignOutButton";
import { StreakCard } from "@/components/nofap/StreakCard";
import { QuotesCard } from "@/components/nofap/QuotesCard";
import { MilestonesCard } from "@/components/nofap/MilestonesCard";
import { ReasonsCard } from "@/components/nofap/ReasonsCard";
import { RelapseLogCard } from "@/components/nofap/RelapseLogCard";

export const dynamic = "force-dynamic";

export const metadata = { title: "Discipline" };

export default async function NofapPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="max-w-[1100px] mx-auto px-5 md:px-10 pt-3 md:pt-4 pb-6 md:pb-8 space-y-5">
      <TopUtilityBar
        context="nofap"
        right={
          <>
            <FocusButton />
            <ThemeToggle />
            <FullscreenToggle />
            <SignOutButton />
          </>
        }
      />

      {/* The streak IS the page — full width, panic button lives inside it. */}
      <Card id="nofap.streak" title="The streak">
        <StreakCard />
      </Card>

      <Card id="nofap.quotes" title="No mercy">
        <QuotesCard />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5 items-start">
        <Card id="nofap.milestones" title="Milestones">
          <MilestonesCard />
        </Card>
        <Card id="nofap.reasons" title="Your reasons">
          <ReasonsCard />
        </Card>
      </div>

      <Card id="nofap.log" title="Relapse log">
        <RelapseLogCard />
      </Card>
    </main>
  );
}
