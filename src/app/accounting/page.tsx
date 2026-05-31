import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/Card";
import {
  NetWorthSection,
  CashFlowSection,
  SubscriptionsSection,
  ApplicationsSection,
  CpaSection,
  AccountingHeaderStats,
} from "@/components/Hub";

export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="max-w-[1480px] mx-auto px-5 md:px-10 pt-3 md:pt-4 pb-6 md:pb-8 space-y-5">
      <header className="space-y-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to dashboard
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-4xl md:text-5xl tracking-tight m-0">
            <span className="text-gradient">Accounting</span>
          </h1>
          <AccountingHeaderStats />
        </div>
      </header>

      {/* Hero: net worth + 12-month trend, with the balance-sheet lists below */}
      <Card title="Net Worth" meta="12-month trend">
        <NetWorthSection />
      </Card>

      {/* Operating view: monthly cash flow beside recurring subscriptions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        <div className="[&>*]:h-full">
          <Card title="Cash Flow"><CashFlowSection /></Card>
        </div>
        <div className="[&>*]:h-full">
          <Card title="Subscriptions" meta="recurring spend"><SubscriptionsSection /></Card>
        </div>
      </div>

      <Card title="CPA Exam">
        <CpaSection />
      </Card>

      <Card title="Applications">
        <ApplicationsSection />
      </Card>
    </main>
  );
}
