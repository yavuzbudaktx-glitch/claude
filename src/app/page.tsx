import { redirect } from "next/navigation";
import { CURRENT } from "@/lib/app-config";

export const dynamic = "force-dynamic";

// Root sends you to whichever app this deployment is configured as.
export default function Page() {
  redirect(CURRENT.home);
}
