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
        className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-white"
      >
        <Plus className="h-3.5 w-3.5" /> Add task
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs doing?"
        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent/50"
      />
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-muted focus:outline-none focus:border-accent/50"
        />
        <button
          type="submit"
          disabled={busy}
          className="ml-auto text-xs px-3 py-1 rounded bg-accent/80 hover:bg-accent text-white disabled:opacity-50"
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
          className="text-xs text-muted hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
