import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Vault } from "@/components/vault/Vault";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Doc Anywhere",
  description: "Your personal cloud vault — links, notes, passwords and files, anywhere.",
};

export default async function FilesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <Vault />;
}
