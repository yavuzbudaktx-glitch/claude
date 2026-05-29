import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FileBrowser } from "@/components/files/FileBrowser";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="max-w-[1100px] mx-auto px-5 md:px-10 py-6 md:py-8 space-y-5">
      <FileBrowser />
    </main>
  );
}
