import { Card } from "@/components/Card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FullscreenToggle } from "@/components/FullscreenToggle";
import { NofapGate } from "@/components/nofap/NofapGate";
import { StreakCard } from "@/components/nofap/StreakCard";
import { QuotesCard } from "@/components/nofap/QuotesCard";
import { MilestonesCard } from "@/components/nofap/MilestonesCard";
import { ReasonsCard } from "@/components/nofap/ReasonsCard";
import { RelapseLogCard } from "@/components/nofap/RelapseLogCard";

// Deliberately standalone: no Supabase login gate and no link from the rest
// of the app. You reach it by URL, unlock it with the passcode in NofapGate,
// and it stands on its own. Data lives in this browser (localStorage).
export const metadata = { title: "Discipline" };

export default function NofapPage() {
  return (
    <NofapGate>
      <main className="max-w-[1100px] mx-auto px-5 md:px-10 pt-4 md:pt-6 pb-6 md:pb-8 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-lg md:text-xl text-ink">Stay disciplined.</h1>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <FullscreenToggle />
          </div>
        </div>

        {/* The streak IS the page — full width, panic button lives inside it. */}
        <Card id="nofap.streak" title="The streak">
          <StreakCard />
        </Card>

        <Card id="nofap.quotes" title="Words">
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
    </NofapGate>
  );
}
