"use client";

import { useState } from "react";
import { Hand } from "lucide-react";
import { useZuya } from "@/components/zuya/ZuyaProvider";
import { MemberChip } from "@/components/zuya/StatusPicker";

// Top-of-dashboard: both of us + a "Dürt" button that buzzes the other's
// phone. No counter, no mush — just a quick, playful poke.
export function NudgeStrip() {
  const { supabase, me, partner } = useZuya();
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);

  async function nudge() {
    if (busy || partner.user_id === "pending-partner") return;
    setBusy(true);
    try {
      await supabase.from("zuya_notifications").insert({
        user_id: partner.user_id,
        kind: "nudge",
        payload: {},
      });
      try { navigator.vibrate?.(40); } catch {}
      setJustSent(true);
      setTimeout(() => setJustSent(false), 1400);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card !p-4 md:!p-5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 min-w-0">
          <MemberChip member={me} isMe />
          <MemberChip member={partner} isMe={false} />
        </div>

        <button
          onClick={nudge}
          disabled={busy}
          className="ml-auto shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-full text-[14px] font-semibold text-white transition active:scale-[0.95] hover:brightness-110 disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))",
            boxShadow: "0 12px 30px -10px var(--glow)",
          }}
        >
          <Hand className={`h-5 w-5 ${justSent ? "animate-ping" : ""}`} />
          {justSent ? "Dürttün!" : `${partner.display_name}'i dürt`}
        </button>
      </div>
    </section>
  );
}
