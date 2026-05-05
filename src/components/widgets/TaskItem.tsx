"use client";

import { Trash2 } from "lucide-react";
import { format, isPast, isToday, parseISO } from "date-fns";
import type { Task } from "@/types/db";

export function TaskItem({
  task,
  onToggle,
  onDelete,
}: {
  task: Task;
  onToggle: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const due = task.due_date ? parseISO(task.due_date) : null;
  const overdue = due && !task.completed && isPast(due) && !isToday(due);
  const today = due && isToday(due);

  return (
    <li className="group flex items-start gap-2.5 py-2">
      <button
        onClick={() => onToggle(task)}
        aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
        className={`mt-1 h-4 w-4 shrink-0 rounded-sm border transition flex items-center justify-center ${
          task.completed
            ? "bg-[var(--ink)] border-[var(--ink)]"
            : "border-[var(--rule)] hover:border-[var(--ink)]"
        }`}
      >
        {task.completed && (
          <svg viewBox="0 0 12 12" className="h-3 w-3 text-[var(--bg)]">
            <path d="M2.5 6.5l2.5 2 4-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-sm leading-snug ${task.completed ? "line-through text-muted" : ""}`}>
          {task.title}
        </div>
        {due && (
          <div
            className={`font-mono text-[10px] uppercase tracking-wider mt-0.5 ${
              overdue ? "text-accent" : today ? "text-accent" : "text-muted"
            }`}
          >
            {overdue ? "overdue · " : today ? "today · " : ""}
            {format(due, "MMM d")}
          </div>
        )}
      </div>
      <button
        onClick={() => onDelete(task)}
        className="opacity-0 group-hover:opacity-100 text-muted hover:text-accent transition shrink-0"
        aria-label="Delete task"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
