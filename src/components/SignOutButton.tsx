"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const supabase = createClient();
  return (
    <button
      onClick={async () => {
        await supabase.auth.signOut();
        window.location.href = "/login";
      }}
      className="text-muted hover:text-white text-xs flex items-center gap-1 mt-2"
      aria-label="Sign out"
    >
      <LogOut className="h-3.5 w-3.5" /> Sign out
    </button>
  );
}
