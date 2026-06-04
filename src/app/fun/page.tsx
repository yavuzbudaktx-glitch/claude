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
      <Card id="fun.ambient" title="" className="min-h-[420px] md:min-h-[520px]">
        <AmbientVideo />
      </Card>

      {/* Row 1 — NASA APOD + Games */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5 items-stretch">
        <div className="[&>*]:h-full">
          <Card id="fun.apod" title=""><NasaApod /></Card>
        </div>
        <div className="[&>*]:h-full">
          <Card id="fun.games" title=""><GamesCard /></Card>
        </div>
      </div>

      {/* Row 2 — Wide typing speed tester */}
      <Card id="fun.typing" title="">
        <TypingTest />
      </Card>

      {/* Row 3 — Nature short, kept exactly as thin as a 9:16 Short, with the
          rest of the width handed to the T-Rex game. Fixed row height. */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-stretch h-[520px]">
        <div className="[&>*]:h-full">
          <Card id="fun.short" title=""><NatureShort /></Card>
        </div>
        <div className="[&>*]:h-full">
          <Card id="fun.trex" title=""><TRex /></Card>
        </div>
      </div>
    </main>
  );
}
