"use client";

import Link from "next/link";
import { Settings, LogOut } from "lucide-react";
import { useZuya } from "@/components/zuya/ZuyaProvider";
import { MemberChip } from "@/components/zuya/StatusPicker";
import { NotificationsPopover } from "@/components/zuya/NotificationsPopover";
import { ZuyaAvatar } from "@/components/zuya/ZuyaAvatar";
import { ThemeToggle } from "@/components/ThemeToggle";

export function ZuyaHeader() {
  const { supabase, me, partner } = useZuya();

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/zuya/login";
  }

  return (
    <header className="sticky top-0 z-40 -mx-5 md:-mx-10 px-5 md:px-10 py-2.5 backdrop-blur-xl bg-[var(--glass)] border-b border-[var(--rule-soft)]">
      <div className="max-w-[1200px] mx-auto flex items-center gap-2">
        {/* Both of us, statuses live. */}
        <div className="flex items-center gap-1 min-w-0">
          <MemberChip member={me} isMe />
          <span className="text-accent text-sm px-0.5 select-none" aria-hidden>♥</span>
          <MemberChip member={partner} isMe={false} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <NotificationsPopover />
          <ThemeToggle />
          <Link
            href="/zuya/settings"
            className="relative grid place-items-center h-10 w-10 rounded-full border border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--accent)] transition"
            title="Settings"
            aria-label="Settings"
          >
            <ZuyaAvatar member={me} size={26} />
            <span className="absolute -bottom-0.5 -right-0.5 grid place-items-center h-4 w-4 rounded-full bg-[var(--paper-2)] border border-[var(--rule)]">
              <Settings className="h-2.5 w-2.5 text-muted" />
            </span>
          </Link>
          <button
            onClick={signOut}
            className="grid place-items-center h-10 w-10 rounded-full border border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--down)] hover:text-down transition text-muted"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </div>
    </header>
  );
}
