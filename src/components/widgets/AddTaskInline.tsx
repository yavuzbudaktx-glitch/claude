"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Quadrant } from "@/types/db";

export function AddTaskInline({
  quadrant,
  onAdd,
}: {
  quadrant: Quadrant;
  onAdd: (input: { title: string; due_date: string | null; quadrant: Quadrant }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await onAdd({ title: title.trim(), due_date: due || null, quadrant });
      setTitle("");
      setDue("");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted hover:text-accent transition"
      >
        <Plus className="h-3 w-3" /> add
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs doing?"
        className="w-full bg-transparent border-b rule px-0 py-1 text-sm focus:outline-none focus:border-[var(--ink)]"
      />
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="bg-transparent border-b rule px-0 py-1 font-mono text-[11px] text-muted focus:outline-none focus:border-[var(--ink)]"
        />
        <button
          type="submit"
          disabled={busy}
          className="ml-auto font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border rule hover:bg-[var(--ink)] hover:text-[var(--bg)] hover:border-[var(--ink)] transition disabled:opacity-50"
        >
          add
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTitle("");
            setDue("");
          }}
          className="font-mono text-[10px] uppercase tracking-wider text-muted hover:text-ink"
        >
          cancel
        </button>
      </div>
    </form>
  );
}
