import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// This deployment is Doc Anywhere — send the root straight to the vault.
// (Unauthenticated users hit /files, which redirects them to /login.)
export default function Page() {
  redirect("/files");
}
