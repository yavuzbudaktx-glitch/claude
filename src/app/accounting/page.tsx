import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/Card";
import { CashFlowSection, ApplicationsSection, CpaSection } from "@/components/Hub";

export const dynamic = "force-dynamic";

export default async function AccountingPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="max-w-[1480px] mx-auto px-5 md:px-10 pt-3 md:pt-4 pb-6 md:pb-8 space-y-5">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to dashboard
          </Link>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight m-0">
            <span className="text-gradient">Accounting</span>
          </h1>
          <p className="text-[13px] text-muted">
            Cash flow, recruiting pipeline, and CPA exam progress — all in one place.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <div className="[&>*]:h-full">
          <Card title="Cash Flow"><CashFlowSection /></Card>
        </div>
        <div className="[&>*]:h-full">
          <Card title="CPA Exam"><CpaSection /></Card>
        </div>
      </div>

      <Card title="Applications">
        <ApplicationsSection />
      </Card>
    </main>
  );
}
