"use client";

import { Trash2, ChevronDown, Pencil, Check, X, AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { differenceInCalendarDays, format, isPast, isToday, parseISO } from "date-fns";
import type { Task, TaskStatus } from "@/types/db";
import { TASK_STATUSES } from "@/types/db";
import { StatusIcon } from "@/components/StatusIcon";

export function TaskItem({
  task,
  onChangeStatus,
  onDelete,
  onEdit,
}: {
  task: Task;
  onChangeStatus: (t: Task, s: TaskStatus) => void;
  onDelete: (t: Task) => void;
  onEdit: (t: Task, fields: { title: string; due_date: string | null }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDue, setEditDue] = useState(task.due_date ?? "");

  function startEdit() {
    setEditTitle(task.title);
    setEditDue(task.due_date ?? "");
    setEditing(true);
  }
  function saveEdit() {
    const title = editTitle.trim();
    if (!title) return;
    onEdit(task, { title, due_date: editDue || null });
    setEditing(false);
  }
  const due = task.due_date ? parseISO(task.due_date) : null;
  const isComplete = task.status === "complete";
  const overdue = !!due && !isComplete && isPast(due) && !isToday(due);
  const today = !!due && isToday(due);
  // "Soon" means due within the next 3 calendar days (not today, not past).
  const dueSoon = !!due && !isComplete && !overdue && !today &&
    differenceInCalendarDays(due, new Date()) <= 3;

  // Urgency drives the whole row: a coloured left spine, a pill on the date,
  // and a tinted background for anything overdue. Three distinct states so
  // "late", "due now" and "coming up" never look the same.
  const daysLate = overdue && due ? Math.abs(differenceInCalendarDays(due, new Date())) : 0;
  const urgency: {
    spine: string; pill: string; text: string; bg: string; label: string;
  } | null =
    overdue
      ? {
          spine: "var(--down)",
          pill: "bg-[var(--down)] text-white",
          text: "text-down",
          bg: "color-mix(in srgb, var(--down) 8%, transparent)",
          label: daysLate === 1 ? "1 day late" : `${daysLate} days late`,
        }
      : today
        ? {
            spine: "var(--accent)",
            pill: "bg-[var(--accent)] text-white",
            text: "text-accent",
            bg: "color-mix(in srgb, var(--accent) 7%, transparent)",
            label: "today",
          }
        : dueSoon
          ? {
              spine: "color-mix(in srgb, var(--accent) 55%, transparent)",
              pill: "bg-[var(--accent-soft)] text-accent",
              text: "text-accent",
              bg: "transparent",
              label: differenceInCalendarDays(due!, new Date()) === 1
                ? "tomorrow"
                : `in ${differenceInCalendarDays(due!, new Date())} days`,
            }
          : null;

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"visible" | "fading" | "gone">("visible");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Once a task is complete, give the user a moment to see the change, then
  // fade the row out and collapse it. The DB record stays — only the row hides.
  useEffect(() => {
    if (!isComplete) {
      setStage("visible");
      return;
    }
    const fadeAt = setTimeout(() => setStage("fading"), 2500);
    const goneAt = setTimeout(() => setStage("gone"), 5000);
    return () => {
      clearTimeout(fadeAt);
      clearTimeout(goneAt);
    };
  }, [isComplete]);

  if (stage === "gone") return null;

  return (
    <li
      draggable={!editing}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", task.id)}
      className={`group relative flex items-start gap-2.5 py-2 pl-2.5 rounded-lg transition-opacity ease-out ${editing ? "" : "cursor-grab active:cursor-grabbing"}`}
      style={{
        transitionDuration: "2200ms",
        opacity: stage === "fading" ? 0 : 1,
        pointerEvents: stage === "fading" ? "none" : undefined,
        background: urgency?.bg ?? "transparent",
      }}
    >
      {/* Urgency spine — red for late, accent for today, faded for coming up. */}
      {urgency && !isComplete && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-full"
          style={{ background: urgency.spine }}
        />
      )}
      <div className="relative mt-0.5" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Change status"
          className="flex items-center gap-0.5 text-ink hover:text-accent transition"
        >
          <StatusIcon status={task.status} size={14} />
          <ChevronDown className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60" />
        </button>
        {open && (
          <div className="absolute z-30 left-0 top-5 min-w-[150px] card !p-1.5 shadow-lg">
            {TASK_STATUSES.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  onChangeStatus(task, s.id);
                  setOpen(false);
                }}
                className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-hl ${
                  task.status === s.id ? "bg-hl" : ""
                }`}
              >
                <StatusIcon status={s.id} size={12} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex-1 min-w-0 space-y-1.5">
          <input
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditing(false); }}
            className="w-full bg-transparent border-b rule px-0 py-0.5 text-sm focus:outline-none focus:border-[var(--accent)]"
          />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={editDue}
              onChange={(e) => setEditDue(e.target.value)}
              className="bg-transparent border-b rule px-0 py-0.5 font-mono text-[11px] text-muted focus:outline-none focus:border-[var(--accent)]"
            />
            <button onClick={saveEdit} aria-label="Save" className="ml-auto text-accent hover:opacity-80">
              <Check className="h-4 w-4" />
            </button>
            <button onClick={() => setEditing(false)} aria-label="Cancel" className="text-muted hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <div className={`text-sm leading-snug ${isComplete ? "line-through text-muted" : ""}`}>
              {task.title}
            </div>
            {due && (
              <div className="mt-1 flex items-center gap-1.5">
                {urgency && !isComplete && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] font-mono text-[9.5px] uppercase tracking-wider ${urgency.pill}`}
                  >
                    {overdue && <AlertTriangle className="h-2.5 w-2.5" />}
                    {urgency.label}
                  </span>
                )}
                <span className={`metalabel ${urgency && !isComplete ? urgency.text : ""}`}>
                  {format(due, "MMM d")}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition">
            <button onClick={startEdit} className="text-muted hover:text-accent" aria-label="Edit task">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onDelete(task)} className="text-muted hover:text-accent" aria-label="Delete task">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </li>
  );
}
