import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DeviceManager } from "@/components/files/DeviceManager";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="max-w-[1100px] mx-auto px-5 md:px-10 py-6 md:py-8 space-y-5">
      <DeviceManager />
    </main>
  );
}
