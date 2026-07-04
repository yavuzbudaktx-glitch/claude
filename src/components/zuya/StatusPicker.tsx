"use client";

import { useEffect, useRef, useState } from "react";
import { ZUYA_STATUSES, zuyaStatus } from "@/lib/zuya/statuses";
import { useZuya } from "@/components/zuya/ZuyaProvider";
import { ZuyaAvatar } from "@/components/zuya/ZuyaAvatar";
import type { ZuyaMemberRow } from "@/types/zuya";

// Small icon chip overlapping the avatar's bottom-right corner.
export function StatusBadge({ member, size = 20 }: { member: ZuyaMemberRow; size?: number }) {
  const st = zuyaStatus(member.status);
  const Icon = st.icon;
  return (
    <span
      className="absolute -bottom-0.5 -right-0.5 grid place-items-center rounded-full border-2 border-[var(--bg)]"
      style={{ width: size, height: size, background: st.color }}
      title={`${st.en} · ${st.tr}`}
    >
      <Icon className="text-white" style={{ width: size * 0.58, height: size * 0.58 }} />
    </span>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// One user in the header: avatar + badge + name + status line. The logged-in
// user's own entry opens the status picker.
export function MemberChip({ member, isMe }: { member: ZuyaMemberRow; isMe: boolean }) {
  const { supabase } = useZuya();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const st = zuyaStatus(member.status);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function setStatus(slug: string) {
    setOpen(false);
    await supabase
      .from("zuya_members")
      .update({ status: slug, status_updated_at: new Date().toISOString() })
      .eq("user_id", member.user_id);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => isMe && setOpen((v) => !v)}
        className={`flex items-center gap-2.5 rounded-2xl px-2 py-1.5 transition ${
          isMe ? "hover:bg-[var(--hl)] cursor-pointer" : "cursor-default"
        }`}
        title={isMe ? "Change your status" : undefined}
      >
        <span className="relative">
          <ZuyaAvatar member={member} size={40} />
          <StatusBadge member={member} />
        </span>
        <span className="text-left hidden min-[420px]:block">
          <span className="block text-[13px] font-semibold text-ink leading-tight">
            {member.display_name}
          </span>
          <span className="block text-[11px] text-muted leading-tight">
            {st.tr}
            {member.status_updated_at && (
              <span className="text-muted-2"> · {timeAgo(member.status_updated_at)}</span>
            )}
          </span>
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 w-64 card !p-2 max-h-[70vh] overflow-y-auto">
          <p className="label px-2 pt-1 pb-2">How are you, canım?</p>
          {ZUYA_STATUSES.map((s) => {
            const Icon = s.icon;
            const active = s.slug === member.status;
            return (
              <button
                key={s.slug}
                onClick={() => setStatus(s.slug)}
                className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-[var(--hl)] ${
                  active ? "bg-[var(--accent-soft)]" : ""
                }`}
              >
                <span
                  className="grid place-items-center rounded-full h-7 w-7 shrink-0"
                  style={{ background: s.color }}
                >
                  <Icon className="h-3.5 w-3.5 text-white" />
                </span>
                <span>
                  <span className="block text-[13px] font-medium text-ink leading-tight">{s.tr}</span>
                  <span className="block text-[11px] text-muted leading-tight">{s.en}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
