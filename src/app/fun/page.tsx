import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/Card";
import { TopUtilityBar } from "@/components/widgets/TopUtilityBar";
import { Scratchpad } from "@/components/Scratchpad";
import { Calculator } from "@/components/Calculator";
import { Bookmarks } from "@/components/Bookmarks";
import { RadioButton } from "@/components/RadioButton";
import { ThemeVariantButton } from "@/components/ThemeVariantButton";
import { FocusButton } from "@/components/FocusButton";
import { FullscreenToggle } from "@/components/FullscreenToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignOutButton } from "@/components/SignOutButton";
import { NasaApod } from "@/components/fun/NasaApod";
import { GamesCard } from "@/components/fun/GamesCard";
import { TypingTest } from "@/components/fun/TypingTest";
import { NatureShort } from "@/components/fun/NatureShort";
import { TRex } from "@/components/fun/TRex";
import { AmbientVideo } from "@/components/fun/AmbientVideo";

export const dynamic = "force-dynamic";

export default async function FunPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="max-w-[1480px] mx-auto px-5 md:px-10 pt-3 md:pt-4 pb-6 md:pb-8 space-y-5">
      <TopUtilityBar
        context="fun"
        right={
          <>
            <RadioButton />
            <Scratchpad />
            <Bookmarks />
            <Calculator />
            <FocusButton />
            <ThemeVariantButton />
            <ThemeToggle />
            <FullscreenToggle />
            <SignOutButton />
          </>
        }
      />

      {/* Row 0 — full-width ambient video (Country Life / Bob Ross / Elif) */}
      <Card id="fun.ambient" title="Long view" meta="put one on in the background">
        <div className="h-[440px] md:h-[540px]"><AmbientVideo /></div>
      </Card>

      {/* Row 1 — NASA / Art + games box. items-start so collapsing one card
          doesn't leave the other stretched to its (now-empty) height. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5 items-start">
        <Card id="fun.apod" title="Frame of the day" meta="NASA · Art Institute">
          <div className="h-[560px]"><NasaApod /></div>
        </Card>
        <Card id="fun.games" title="Unwind">
          <GamesCard />
        </Card>
      </div>

      {/* Row 2 — typing tape */}
      <Card id="fun.typing" title="Cadence" meta="practice your hands">
        <TypingTest />
      </Card>

      {/* Row 3 — Nature short kept exactly as thin as a 9:16 Short (300px
          column); the T-Rex game gets the rest of the width and matches the
          short's fixed height so the two cards read as a matched pair. */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
        <Card id="fun.short" title="Wildlife" meta="BBC Earth">
          <div className="h-[520px]"><NatureShort /></div>
        </Card>
        <Card id="fun.trex" title="Dino">
          <div className="h-[520px]"><TRex /></div>
        </Card>
      </div>
    </main>
  );
}
