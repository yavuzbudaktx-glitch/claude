"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SendHorizontal, Check, CheckCheck } from "lucide-react";
import { Card } from "@/components/Card";
import { useZuya, useZuyaTableEvent } from "@/components/zuya/ZuyaProvider";
import type { ZuyaMessageRow } from "@/types/zuya";

const QUICK_EMOJI = ["❤️", "😘", "🔥", "😂", "🥺", "😍", "😉", "🙄"];
const PAGE = 120;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400_000);
  const key = d.toDateString();
  if (key === today.toDateString()) return "Today";
  if (key === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function MessagesCard() {
  const { supabase, me, partner, unreadMessages } = useZuya();
  const [messages, setMessages] = useState<ZuyaMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const visibleRef = useRef(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("zuya_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE);
    setMessages(((data as ZuyaMessageRow[]) ?? []).reverse());
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = useCallback(async () => {
    if (!visibleRef.current) return;
    await supabase
      .from("zuya_messages")
      .update({ read_at: new Date().toISOString() })
      .neq("sender_id", me.user_id)
      .is("read_at", null);
  }, [supabase, me.user_id]);

  useZuyaTableEvent("zuya_messages", (p) => {
    const row = p.new as ZuyaMessageRow | undefined;
    if (p.eventType === "INSERT" && row) {
      setMessages((ms) => (ms.some((m) => m.id === row.id) ? ms : [...ms, row]));
      if (row.sender_id !== me.user_id) void markRead();
    } else if (p.eventType === "UPDATE" && row) {
      setMessages((ms) => ms.map((m) => (m.id === row.id ? row : m)));
    }
  });

  // Mark partner messages read while the card is actually on screen.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting;
        if (entry.isIntersecting) void markRead();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [markRead]);

  useEffect(() => {
    if (unreadMessages > 0) void markRead();
  }, [unreadMessages, markRead]);

  // Stick to the bottom on new messages.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function send(text?: string) {
    const body = (text ?? draft).trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { error } = await supabase
        .from("zuya_messages")
        .insert({ sender_id: me.user_id, body });
      if (!error && !text) setDraft("");
      if (error) {
        console.warn("zuya message send failed:", error.message);
      } else {
        // Push the partner (best-effort; fine if push isn't set up).
        fetch("/api/zuya/push/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "message", text: body }),
        }).catch(() => {});
      }
    } finally {
      setSending(false);
    }
  }

  let lastDay = "";

  return (
    <Card id="zuya-messages" title="Messages" collapsible={false} className="flex flex-col">
      <div
        ref={listRef}
        className="flex-1 min-h-[260px] max-h-[380px] overflow-y-auto pr-1 space-y-1.5"
      >
        {messages.length === 0 && (
          <p className="text-muted text-[13px] text-center pt-10">
            No messages yet.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === me.user_id;
          const day = dayLabel(m.created_at);
          const divider = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {divider && (
                <div className="flex items-center gap-3 py-2">
                  <span className="flex-1 h-px bg-[var(--rule-soft)]" />
                  <span className="label">{day}</span>
                  <span className="flex-1 h-px bg-[var(--rule-soft)]" />
                </div>
              )}
              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-[13.5px] leading-relaxed whitespace-pre-wrap break-words ${
                    mine
                      ? "text-white rounded-br-md"
                      : "bg-[var(--paper-2)] text-ink border border-[var(--rule-soft)] rounded-bl-md"
                  }`}
                  style={
                    mine
                      ? { background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }
                      : undefined
                  }
                >
                  {m.body}
                  <span
                    className={`block text-[10px] mt-0.5 text-right ${
                      mine ? "text-white/70" : "text-muted-2"
                    }`}
                  >
                    {hhmm(m.created_at)}
                    {mine &&
                      (m.read_at ? (
                        <CheckCheck className="inline h-3 w-3 ml-1" />
                      ) : (
                        <Check className="inline h-3 w-3 ml-1" />
                      ))}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-3 mt-2 border-t border-[var(--rule-soft)]">
        <div className="flex gap-1.5 mb-2">
          {QUICK_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setDraft((d) => (d + e).slice(0, 2000))}
              className="h-8 w-8 grid place-items-center rounded-full hover:bg-[var(--hl)] transition text-[18px]"
              aria-label={`Add ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Write to ${partner.display_name}…`}
            maxLength={2000}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button
            disabled={sending || !draft.trim()}
            className="grid place-items-center h-10 w-10 rounded-full text-white transition hover:brightness-110 active:scale-95 disabled:opacity-40 shrink-0"
            style={{ background: "linear-gradient(135deg, var(--grad-from), var(--grad-via))" }}
            aria-label="Send"
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </form>
      </div>
    </Card>
  );
}
