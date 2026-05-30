import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Vault } from "@/components/vault/Vault";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <Vault />;
}
