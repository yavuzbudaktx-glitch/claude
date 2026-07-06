import { redirect } from "next/navigation";
import { createZuyaServerClient } from "@/lib/supabase/zuya-server";
import { getZuyaMember } from "@/lib/zuya/server";
import { ZuyaProvider } from "@/components/zuya/ZuyaProvider";
import { ZuyaHeader } from "@/components/zuya/ZuyaHeader";
import { PullToRefresh } from "@/components/zuya/PullToRefresh";
import { ZuyaThemeApplier } from "@/components/zuya/ZuyaThemeApplier";
import type { ZuyaMemberRow } from "@/types/zuya";

export const dynamic = "force-dynamic";

// Authoritative gate for everything inside Zuya except the login page.
// Middleware already redirects, but this re-verifies membership server-side.
export default async function ZuyaAppLayout({ children }: { children: React.ReactNode }) {
  const auth = await getZuyaMember();
  if (!auth) redirect("/zuya/login");

  const supabase = createZuyaServerClient();
  const { data: rows } = await supabase.from("zuya_members").select("*");
  const members = (rows ?? []) as ZuyaMemberRow[];
  const me = members.find((m) => m.user_id === auth.userId);
  const partner = members.find((m) => m.user_id !== auth.userId);

  if (!me) redirect("/zuya/login");

  // Until the partner registers, show a stand-in row so the dashboard still
  // renders (their chip shows "waiting for them to join").
  const partnerRow: ZuyaMemberRow =
    partner ??
    ({
      user_id: "pending-partner",
      username: me.username === "yavuz" ? "zuleyha" : "yavuz",
      display_name: me.username === "yavuz" ? "Züleyha" : "Yavuz",
      status: "free",
      status_updated_at: null,
      avatar_updated_at: null,
      google_connected: false,
      notif_prefs: {},
      created_at: "",
      updated_at: "",
    } as ZuyaMemberRow);

  return (
    <ZuyaProvider initialMe={me} initialPartner={partnerRow}>
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <ZuyaThemeApplier />
        <PullToRefresh>
          <ZuyaHeader />
          {children}
        </PullToRefresh>
      </div>
    </ZuyaProvider>
  );
}
