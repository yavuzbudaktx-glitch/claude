import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { DashboardSettings } from "@/components/DashboardSettings";

export const dynamic = "force-dynamic";

export default async function DashboardSettingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="max-w-3xl mx-auto px-5 md:px-8 pt-[max(0.75rem,env(safe-area-inset-top))] md:pt-6 pb-10 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink transition"
        >
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="font-display text-lg text-ink">Settings</h1>
      </div>
      <DashboardSettings />
    </main>
  );
}
