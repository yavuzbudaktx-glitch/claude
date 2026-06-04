import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/Card";
import { AccountingGate } from "@/components/AccountingGate";
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
import {
  NetWorthSection,
  CashFlowSection,
  SubscriptionsSection,
  ApplicationsSection,
  CpaSection,
  CpaVideoSection,
  RedditFeedSection,
  AccountingHeaderStats,
} from "@/components/Hub";

export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AccountingGate>
    <main className="max-w-[1480px] mx-auto px-5 md:px-10 pt-3 md:pt-4 pb-6 md:pb-8 space-y-5">
      <TopUtilityBar
        context="accounting"
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

      <header className="flex flex-wrap items-center justify-end gap-4">
        <AccountingHeaderStats />
      </header>

      {/* Row 1 — CPA Exam (left, wide) + Daily CPA video (right). */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5 items-stretch">
        <div className="[&>*]:h-full">
          <Card title="CPA Exam"><CpaSection /></Card>
        </div>
        <div className="[&>*]:h-full">
          <Card title="CPA Video" meta="daily pick"><CpaVideoSection /></Card>
        </div>
      </div>

      {/* Row 2 — Community feed (wide) + Net Worth (compact). */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5 items-stretch">
        <div className="[&>*]:h-full">
          <Card title="Community" meta="r/CPA · r/Accounting"><RedditFeedSection /></Card>
        </div>
        <div className="[&>*]:h-full">
          <Card title="Net Worth" meta="12-month trend"><NetWorthSection /></Card>
        </div>
      </div>

      {/* Row 3 — Applications kanban (full width). */}
      <Card title="Applications">
        <ApplicationsSection />
      </Card>

      {/* Row 4 — Operating cash flow + recurring subscriptions. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <div className="[&>*]:h-full">
          <Card title="Cash Flow"><CashFlowSection /></Card>
        </div>
        <div className="[&>*]:h-full">
          <Card title="Subscriptions" meta="recurring spend"><SubscriptionsSection /></Card>
        </div>
      </div>
    </main>
    </AccountingGate>
  );
}
