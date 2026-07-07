"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { useZuya } from "@/components/zuya/ZuyaProvider";
import { MemberChip } from "@/components/zuya/StatusPicker";
import { ZuyaAvatar } from "@/components/zuya/ZuyaAvatar";
import { KissButton } from "@/components/zuya/KissButton";
import { ThemeToggle } from "@/components/ThemeToggle";

export function ZuyaHeader() {
  const { me, partner } = useZuya();

  return (
    <header
      className="sticky top-0 z-40 -mx-4 md:-mx-10 px-4 md:px-10 pb-2 backdrop-blur-xl bg-[var(--glass)] border-b border-[var(--rule-soft)]"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      <div className="max-w-[1200px] mx-auto flex items-center gap-2">
        {/* Both of us, statuses live. */}
        <div className="flex items-center gap-1 min-w-0">
          <MemberChip member={me} isMe />
          <MemberChip member={partner} isMe={false} />
        </div>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <KissButton />
          <ThemeToggle />
          <Link
            href="/zuya/settings"
            className="relative grid place-items-center h-9 w-9 rounded-full border border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--accent)] transition"
            title="Settings"
            aria-label="Settings"
          >
            <ZuyaAvatar member={me} size={24} />
            <span className="absolute -bottom-0.5 -right-0.5 grid place-items-center h-4 w-4 rounded-full bg-[var(--paper-2)] border border-[var(--rule)]">
              <Settings className="h-2.5 w-2.5 text-muted" />
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
