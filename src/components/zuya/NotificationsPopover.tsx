"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CalendarHeart, Check, X, Pencil } from "lucide-react";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import { AnchoredPanel } from "@/components/zuya/AnchoredPanel";
import type { ZuyaNotificationKind, ZuyaNotificationRow } from "@/types/zuya";

const KIND_META: Record<ZuyaNotificationKind, { icon: typeof Bell; text: (p: Record<string, unknown>) => string }> = {
  date_suggested: { icon: CalendarHeart, text: (p) => `New date idea: "${p.title}"` },
  date_countered: { icon: Pencil, text: (p) => `Suggested changes to "${p.title}"` },
  date_accepted: { icon: Check, text: (p) => `Accepted "${p.title}"` },
  date_rejected: { icon: X, text: (p) => `Can't make "${p.title}"` },
  date_cancelled: { icon: X, text: (p) => `Called off "${p.title}"` },
};

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NotificationsPopover() {
  const { supabase, me, partner, unreadNotifications } = useZuya();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ZuyaNotificationRow[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  async function load() {
    const { data } = await supabase
      .from("zuya_notifications")
      .select("*")
      .eq("user_id", me.user_id)
      .neq("kind", "nudge") // nudges buzz live; they don't live in the bell
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as ZuyaNotificationRow[]) ?? []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useZuyaTableEvent("zuya_notifications", () => void load());

  async function markAllRead() {
    await supabase
      .from("zuya_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", me.user_id)
      .is("read_at", null);
    void load();
  }

  function openBell() {
    setOpen((v) => {
      const next = !v;
      if (next) void markAllRead();
      return next;
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        onClick={openBell}
        className="relative grid place-items-center h-9 w-9 rounded-full border border-[var(--rule)] bg-[var(--paper)] hover:border-[var(--accent)] transition"
        aria-label="Notifications"
      >
        <Bell className="h-4.5 w-4.5 text-ink" style={{ width: 18, height: 18 }} />
        {unreadNotifications > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 grid place-items-center rounded-full text-[9.5px] font-bold text-white min-w-[17px] h-[17px] px-1"
            style={{ background: "var(--accent)" }}
          >
            {unreadNotifications}
          </span>
        )}
      </button>

      <AnchoredPanel open={open} onClose={() => setOpen(false)} anchorRef={btnRef} align="right" width={320}>
        <div className="card !p-3">
          <p className="label px-1 pb-2">From {partner.display_name}</p>
          {items.length === 0 && (
            <p className="text-[13px] text-muted px-1 pb-1">Nothing yet — quiet and cozy.</p>
          )}
          <div className="divide-rule">
            {items.map((n) => {
              const meta = KIND_META[n.kind];
              const Icon = meta?.icon ?? Bell;
              return (
                <div key={n.id} className="flex items-start gap-2.5 px-1 py-2.5">
                  <span className="grid place-items-center h-7 w-7 rounded-full bg-[var(--accent-soft)] shrink-0 mt-0.5">
                    <Icon className="h-3.5 w-3.5 text-accent" />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[13px] leading-snug ${n.read_at ? "text-ink-soft" : "text-ink font-medium"}`}>
                      {meta ? meta.text(n.payload) : n.kind}
                    </span>
                    <span className="block text-[11px] text-muted-2 mt-0.5">{timeAgo(n.created_at)} ago</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </AnchoredPanel>
    </div>
  );
}
