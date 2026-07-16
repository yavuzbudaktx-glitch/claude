"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Settings, CalendarHeart } from "lucide-react";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import { MemberChip } from "@/components/zuya/StatusPicker";
import { ZuyaAvatar } from "@/components/zuya/ZuyaAvatar";
import { KissButton } from "@/components/zuya/KissButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { zuyaToday } from "@/lib/zuya/day";

// Tiny countdown to the next ACCEPTED buluşma — a quiet "something to look
// forward to" pinned in the header. Hidden when nothing's planned.
function NextDateChip() {
  const { supabase } = useZuya();
  const [next, setNext] = useState<{ title: string; day: string } | null>(null);

  const load = useCallback(async () => {
    const today = zuyaToday();
    const { data } = await supabase
      .from("zuya_date_suggestions")
      .select("title, day")
      .eq("status", "accepted")
      .gte("day", today)
      .order("day", { ascending: true })
      .limit(1);
    setNext((data?.[0] as { title: string; day: string } | undefined) ?? null);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);
  useZuyaTableEvent("zuya_date_suggestions", () => void load());

  if (!next) return null;
  const days = Math.round(
    (new Date(`${next.day}T12:00`).getTime() - new Date(`${zuyaToday()}T12:00`).getTime()) / 86_400_000,
  );
  const label = days <= 0 ? "bugün!" : days === 1 ? "yarın" : `${days} gün`;
  return (
    <a
      href="#zuya-calendar"
      title={`${next.title} · ${next.day}`}
      className="hidden min-[440px]:inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-[var(--accent-soft)] bg-[var(--accent-soft)] text-accent text-[11.5px] font-semibold shrink-0 hover:brightness-105 transition"
    >
      <CalendarHeart className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

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
          <NextDateChip />
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
