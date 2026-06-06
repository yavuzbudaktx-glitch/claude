"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles, X, Send, Trash2, Key, AlertCircle, ExternalLink, ChevronDown,
} from "lucide-react";
import { usePref } from "@/components/PrefsProvider";

// A floating "Ask Claude" panel that talks directly to Anthropic's API from
// the browser using the user's own API key. The key is saved in the synced
// prefs blob (so it follows you across devices) and never leaves your
// browser → Anthropic; we don't proxy it through any server.
//
// Streaming is implemented over fetch + SSE so responses appear as they're
// generated, exactly like a real chat. Conversation history is held in
// state (per-session); a "clear" button resets it.

const MODELS = [
  { id: "claude-opus-4-8",            label: "Opus 4.8   · most capable" },
  { id: "claude-sonnet-4-6",          label: "Sonnet 4.6 · balanced (default)" },
  { id: "claude-haiku-4-5-20251001",  label: "Haiku 4.5  · fastest" },
];
const DEFAULT_MODEL = "claude-sonnet-4-6";

interface Msg { role: "user" | "assistant"; content: string }

export function ClaudeChat() {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = usePref<string>("claude.apiKey", "");
  const [model, setModel] = usePref<string>("claude.model", DEFAULT_MODEL);
  const [history, setHistory] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [showModelPick, setShowModelPick] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Mask the key for display: sk-ant-…XXXXabcd
  const maskedKey = useMemo(() => {
    if (!apiKey) return "";
    if (apiKey.length < 14) return "•".repeat(apiKey.length);
    return `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}`;
  }, [apiKey]);

  // Scroll to the bottom whenever the conversation grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, streaming]);

  // Esc closes the panel; Cmd/Ctrl+Enter sends.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // First time opening with no key → show the key setup pane.
  useEffect(() => {
    if (open && !apiKey) setShowKeySetup(true);
  }, [open, apiKey]);

  function saveKey() {
    const k = keyDraft.trim();
    if (!k) return;
    setApiKey(k);
    setKeyDraft("");
    setShowKeySetup(false);
    setError(null);
  }
  function clearKey() {
    setApiKey("");
    setShowKeySetup(true);
  }
  function clearChat() {
    setHistory([]);
    setError(null);
    abortRef.current?.abort();
    setStreaming(false);
  }

  async function send() {
    const text = draft.trim();
    if (!text || streaming) return;
    if (!apiKey) { setShowKeySetup(true); return; }

    const userMsg: Msg = { role: "user", content: text };
    const next: Msg[] = [...history, userMsg, { role: "assistant", content: "" }];
    setHistory(next);
    setDraft("");
    setError(null);
    setStreaming(true);

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          // Direct-from-browser is opt-in on Anthropic's side — required for
          // any client-side call. The key never leaves the browser → API.
          "anthropic-dangerous-direct-browser-access": "true",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          stream: true,
          system:
            "You are a helpful assistant embedded in a personal dashboard. " +
            "Be concise, warm, and direct. Use Markdown sparingly.",
          messages: [...history, userMsg].map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const detail = await safeReadError(res);
        throw new Error(detail);
      }

      // Parse the SSE stream incrementally. Anthropic sends events like:
      //   event: content_block_delta
      //   data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"…"}}
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // Process complete events terminated by a blank line.
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const evt = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = evt.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          const json = dataLine.slice(5).trim();
          if (!json || json === "[DONE]") continue;
          try {
            const obj = JSON.parse(json);
            if (obj.type === "content_block_delta" && obj.delta?.type === "text_delta") {
              const chunk = obj.delta.text as string;
              setHistory((cur) => {
                const copy = cur.slice();
                const last = copy[copy.length - 1];
                if (last && last.role === "assistant") {
                  copy[copy.length - 1] = { ...last, content: last.content + chunk };
                }
                return copy;
              });
            }
          } catch { /* ignore malformed event */ }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      // Drop the empty assistant placeholder on a failed call.
      setHistory((cur) => {
        if (cur.length && cur[cur.length - 1].role === "assistant" && !cur[cur.length - 1].content) {
          return cur.slice(0, -1);
        }
        return cur;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Ask Claude"
        title="Ask Claude"
        className={`btn-ghost ${open ? "!text-accent !border-[var(--accent)]" : ""}`}
      >
        <Sparkles className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[65] bg-black/30 backdrop-blur-sm animate-fadeIn" onClick={() => setOpen(false)} />
          <aside
            role="dialog"
            aria-label="Ask Claude"
            className="fixed right-2 top-2 bottom-2 z-[70] w-[min(420px,calc(100vw-1rem))] flex flex-col rounded-2xl border border-[var(--glass-border)] bg-[var(--paper-2)] backdrop-blur-xl shadow-[var(--shadow-hover)] animate-fadeIn overflow-hidden"
          >
            <header className="flex items-center gap-2 px-3 py-2 border-b border-[var(--rule-soft)]">
              <Sparkles className="h-4 w-4 text-accent" />
              <span className="text-[14px] font-semibold text-ink">Ask Claude</span>
              <button
                onClick={() => setShowModelPick((v) => !v)}
                className="ml-2 inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-muted hover:text-accent transition"
                title="Choose model"
              >
                {model.replace("claude-", "")} <ChevronDown className="h-3 w-3" />
              </button>
              <div className="ml-auto flex items-center gap-1">
                {history.length > 0 && (
                  <button onClick={clearChat} className="btn-ghost !h-8 !w-8" title="Clear conversation" aria-label="Clear conversation">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="btn-ghost !h-8 !w-8" title="Close" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            {showModelPick && (
              <div className="px-3 py-2 border-b border-[var(--rule-soft)] space-y-1">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setShowModelPick(false); }}
                    className={`block w-full text-left text-[12px] px-2 py-1.5 rounded-md transition ${model === m.id ? "bg-accent-soft text-accent" : "text-ink-soft hover:bg-[var(--rule-soft)]"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            {showKeySetup ? (
              <KeySetup
                hasKey={!!apiKey}
                masked={maskedKey}
                keyDraft={keyDraft}
                setKeyDraft={setKeyDraft}
                saveKey={saveKey}
                cancel={() => setShowKeySetup(false)}
              />
            ) : (
              <>
                <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
                  {history.length === 0 && (
                    <div className="text-center text-muted-2 text-[12px] italic mt-12 px-4">
                      Start a conversation. Your key sits in your synced prefs;
                      messages go straight to Anthropic.
                    </div>
                  )}
                  {history.map((m, i) => (
                    <Bubble key={i} role={m.role} content={m.content} />
                  ))}
                  {error && (
                    <div className="rounded-lg border border-[var(--down)] bg-[color-mix(in_srgb,var(--down)_10%,transparent)] px-3 py-2 text-[12px] text-down inline-flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-px" />
                      <span className="min-w-0 break-words">{error}</span>
                    </div>
                  )}
                </div>

                <footer className="border-t border-[var(--rule-soft)] p-2.5 space-y-2">
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
                    }}
                    placeholder={apiKey ? "Type a message — ⌘↵ to send" : "Set your API key to start"}
                    rows={2}
                    className="w-full resize-none rounded-lg bg-[var(--paper)] border border-[var(--rule)] px-3 py-2 text-[13px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowKeySetup(true)}
                      className="inline-flex items-center gap-1 text-[10.5px] text-muted hover:text-accent transition"
                      title="Manage API key"
                    >
                      <Key className="h-3 w-3" /> {apiKey ? maskedKey : "Set key"}
                    </button>
                    <div className="ml-auto flex items-center gap-1.5">
                      {streaming ? (
                        <button onClick={stop} className="chip normal-case !px-3 !py-1 !text-[11.5px]">Stop</button>
                      ) : (
                        <button
                          onClick={send}
                          disabled={!draft.trim() || !apiKey}
                          className="chip chip-active normal-case !px-3 !py-1 !text-[11.5px] inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Send className="h-3 w-3" /> Send
                        </button>
                      )}
                    </div>
                  </div>
                </footer>
              </>
            )}
          </aside>
        </>
      )}
    </>
  );
}

function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[88%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? "bg-accent-soft text-ink border border-[var(--accent)]"
            : "bg-[var(--paper)] text-ink-soft border border-[var(--rule)]"
        }`}
      >
        {content || (isUser ? "" : <span className="text-muted-2 italic">…</span>)}
      </div>
    </div>
  );
}

function KeySetup({
  hasKey, masked, keyDraft, setKeyDraft, saveKey, cancel,
}: {
  hasKey: boolean; masked: string; keyDraft: string;
  setKeyDraft: (v: string) => void; saveKey: () => void; cancel: () => void;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 text-[12.5px] text-ink-soft">
      <div className="font-display text-lg text-ink">Your Anthropic API key</div>
      <p className="leading-relaxed">
        The key is saved in your synced preferences and used to call
        <code className="font-mono text-[11.5px] bg-[var(--rule-soft)] px-1.5 py-0.5 rounded mx-1">api.anthropic.com</code>
        directly from this browser. It never goes through any other server.
      </p>
      {hasKey && (
        <div className="rounded-lg border border-[var(--rule)] bg-[var(--paper)] px-3 py-2 inline-flex items-center gap-2 font-mono text-[11px]">
          <Key className="h-3.5 w-3.5 text-accent" /> {masked}
        </div>
      )}
      <input
        type="password"
        autoComplete="off"
        placeholder="sk-ant-…"
        value={keyDraft}
        onChange={(e) => setKeyDraft(e.target.value)}
        className="w-full font-mono rounded-lg bg-[var(--paper)] border border-[var(--rule)] px-3 py-2 text-[12.5px] text-ink focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={saveKey}
          disabled={!keyDraft.trim()}
          className="chip chip-active normal-case !px-3 !py-1 !text-[12px] disabled:opacity-50"
        >
          Save key
        </button>
        <button onClick={cancel} className="chip normal-case !px-3 !py-1 !text-[12px]">
          Cancel
        </button>
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted hover:text-accent transition"
        >
          Get a key <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j?.error?.message) return `${res.status}: ${j.error.message}`;
    return `${res.status}: ${res.statusText}`;
  } catch {
    return `${res.status}: ${res.statusText}`;
  }
}
