import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/Card";
import { TopUtilityBar } from "@/components/widgets/TopUtilityBar";
import { Scratchpad } from "@/components/Scratchpad";
import { Calculator } from "@/components/Calculator";
import { Bookmarks } from "@/components/Bookmarks";
import { RadioButton } from "@/components/RadioButton";
import { ThemeVariantButton } from "@/components/ThemeVariantButton";
import { DocAnywhereButton } from "@/components/DocAnywhereButton";
import { FocusButton } from "@/components/FocusButton";
import { FullscreenToggle } from "@/components/FullscreenToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignOutButton } from "@/components/SignOutButton";
import { NasaApod } from "@/components/fun/NasaApod";
import { GamesCard } from "@/components/fun/GamesCard";
import { TypingTest } from "@/components/fun/TypingTest";
import { NatureShort } from "@/components/fun/NatureShort";
import { TRex } from "@/components/fun/TRex";

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
            <DocAnywhereButton />
            <ThemeVariantButton />
            <ThemeToggle />
            <FullscreenToggle />
            <SignOutButton />
          </>
        }
      />

      {/* Row 1 — NASA APOD + Games */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5 items-stretch">
        <div className="[&>*]:h-full">
          <Card title=""><NasaApod /></Card>
        </div>
        <div className="[&>*]:h-full">
          <Card title=""><GamesCard /></Card>
        </div>
      </div>

      {/* Row 2 — Wide typing speed tester */}
      <Card title="">
        <TypingTest />
      </Card>

      {/* Row 3 — Portrait nature short (narrow) + classic T-Rex (wide) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)] gap-5 items-stretch">
        <div className="[&>*]:h-full">
          <Card title=""><NatureShort /></Card>
        </div>
        <div className="[&>*]:h-full">
          <Card title=""><TRex /></Card>
        </div>
      </div>
    </main>
  );
}
