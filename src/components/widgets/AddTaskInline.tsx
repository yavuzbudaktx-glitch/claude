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
        className="mt-3 flex items-center gap-1 text-xs text-muted hover:text-amber-500 transition"
      >
        <Plus className="h-3.5 w-3.5" /> Add task
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
        className="w-full bg-[var(--glass-strong)] border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="bg-[var(--glass-strong)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-muted focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <button
          type="submit"
          disabled={busy}
          className="ml-auto text-xs px-3 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-900 font-medium disabled:opacity-50 transition"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTitle("");
            setDue("");
          }}
          className="text-xs text-muted hover:text-current"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
