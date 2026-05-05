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
    <li className="group flex items-start gap-2 py-1.5">
      <input
        type="checkbox"
        checked={task.completed}
        onChange={() => onToggle(task)}
        className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 accent-accent"
      />
      <div className="flex-1 min-w-0">
        <div className={`text-sm leading-snug ${task.completed ? "line-through text-muted" : ""}`}>
          {task.title}
        </div>
        {due && (
          <div
            className={`text-xs mt-0.5 ${
              overdue ? "text-rose-400" : today ? "text-amber-300" : "text-muted"
            }`}
          >
            {overdue ? "Overdue · " : today ? "Today · " : ""}
            {format(due, "MMM d")}
          </div>
        )}
      </div>
      <button
        onClick={() => onDelete(task)}
        className="opacity-0 group-hover:opacity-100 text-muted hover:text-rose-400 transition"
        aria-label="Delete task"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
