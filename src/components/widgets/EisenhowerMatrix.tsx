"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { isPast, isToday, parseISO } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { QUADRANTS, type Task, type Quadrant, type TaskStatus } from "@/types/db";
import { Card } from "@/components/Card";
import { TaskItem } from "./TaskItem";
import { AddTaskInline } from "./AddTaskInline";

export function EisenhowerMatrix({ userId }: { userId: string }) {
  const supabase = createClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  // Track tasks completed during THIS session — only those get the fade
  // animation. Tasks that were already complete in the database when the
  // page loaded should never render (no flash on reload).
  const recentlyCompleted = useRef<Set<string>>(new Set());
  const [, forceRerender] = useState(0);
  const [dragQuad, setDragQuad] = useState<Quadrant | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    setTasks((data as Task[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("tasks_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, load]);

  async function add({
    title,
    due_date,
    quadrant,
  }: { title: string; due_date: string | null; quadrant: Quadrant }) {
    const { data, error } = await supabase
      .from("tasks")
      .insert({ title, due_date, quadrant, user_id: userId, status: "not_started" })
      .select()
      .single();
    if (!error && data) setTasks((t) => [data as Task, ...t]);
  }

  async function changeStatus(task: Task, status: TaskStatus) {
    const completed = status === "complete";
    if (completed) {
      // Mark as recently-completed so TaskItem still plays its fade-out
      // animation in-session; the next page load will skip it entirely.
      recentlyCompleted.current.add(task.id);
      forceRerender((n) => n + 1);
    } else {
      recentlyCompleted.current.delete(task.id);
    }
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status, completed } : t)));
    await supabase.from("tasks").update({ status, completed }).eq("id", task.id);
  }

  async function remove(task: Task) {
    setTasks((ts) => ts.filter((t) => t.id !== task.id));
    await supabase.from("tasks").delete().eq("id", task.id);
  }

  async function moveTask(id: string, quadrant: Quadrant) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.quadrant === quadrant) return;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, quadrant } : t)));
    await supabase.from("tasks").update({ quadrant }).eq("id", id);
  }

  async function editTask(task: Task, fields: { title: string; due_date: string | null }) {
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, ...fields } : t)));
    await supabase.from("tasks").update(fields).eq("id", task.id);
  }

  // Pre-load filter: drop tasks that were ALREADY complete in the DB when
  // we fetched. Tasks completed in this session stay until their fade
  // animation finishes.
  const visibleTasks = tasks.filter(
    (t) => t.status !== "complete" || recentlyCompleted.current.has(t.id),
  );

  // Headline counts for the card action: how much is actually on fire.
  const openTasks = visibleTasks.filter((t) => t.status !== "complete");
  const isOverdue = (t: Task) => {
    if (!t.due_date) return false;
    const due = parseISO(t.due_date);
    return isPast(due) && !isToday(due);
  };
  const overdueCount = openTasks.filter(isOverdue).length;
  const todayCount = openTasks.filter((t) => t.due_date && isToday(parseISO(t.due_date))).length;

  const summary = (
    <span className="inline-flex items-center gap-1.5">
      {overdueCount > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-mono text-[10px] uppercase tracking-wider text-white"
          style={{ background: "var(--down)" }}
          title={`${overdueCount} overdue`}
        >
          <AlertTriangle className="h-2.5 w-2.5" /> {overdueCount} late
        </span>
      )}
      {todayCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-mono text-[10px] uppercase tracking-wider bg-[var(--accent-soft)] text-accent">
          {todayCount} today
        </span>
      )}
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
        {openTasks.length} open
      </span>
    </span>
  );

  return (
    <Card num="04" title="Eisenhower · Tasks" action={summary}>
      {loading ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {QUADRANTS.map((q, i) => {
            const items = visibleTasks.filter((t) => t.quadrant === q.id);
            const open = items.filter((x) => x.status !== "complete").length;
            const late = items.filter((t) => t.status !== "complete" && isOverdue(t)).length;
            // Each quadrant gets its own hue so the four panels read as a real
            // matrix at a glance: 1 do-now (red), 2 schedule (accent),
            // 3 delegate (amber-ish up tone), 4 drop (muted).
            const hues = ["var(--down)", "var(--accent)", "var(--accent-2)", "var(--muted-2)"];
            const hue = hues[i] ?? "var(--muted-2)";
            const dropping = dragQuad === q.id;
            return (
              <div
                key={q.id}
                onDragOver={(e) => { e.preventDefault(); setDragQuad(q.id); }}
                onDragLeave={() => setDragQuad((d) => (d === q.id ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  setDragQuad(null);
                  if (id) moveTask(id, q.id);
                }}
                className="relative overflow-hidden rounded-xl border px-3 pt-3 pb-1 transition-all duration-200"
                style={{
                  borderColor: dropping ? hue : "var(--rule-soft)",
                  background: dropping
                    ? `color-mix(in srgb, ${hue} 10%, transparent)`
                    : "color-mix(in srgb, var(--ink) 2.5%, transparent)",
                  boxShadow: dropping ? `0 0 0 1px ${hue}, 0 8px 24px -14px ${hue}` : "none",
                }}
              >
                {/* Quadrant colour cap — spans the FULL top edge of the panel
                    and is clipped to the panel's own rounded corners, so it
                    reads as part of the box instead of a floating stub. */}
                <span
                  aria-hidden
                  className="absolute left-0 right-0 top-0 h-[3px] rounded-t-xl"
                  style={{ background: hue }}
                />
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-mono text-[10px] tracking-widest" style={{ color: hue }}>{q.number}</span>
                  <h3 className="font-display text-[17px] font-semibold leading-none tracking-tight">{q.title}</h3>
                  <span className="ml-auto inline-flex items-center gap-1">
                    {late > 0 && (
                      <span
                        className="rounded-full px-1.5 font-mono text-[9.5px] text-white"
                        style={{ background: "var(--down)" }}
                        title={`${late} overdue here`}
                      >
                        {late}
                      </span>
                    )}
                    <span className="font-mono tabular-nums text-[11px] text-muted">{open}</span>
                  </span>
                </div>
                <div className="metalabel mb-2.5">
                  {q.subtitle}
                </div>
                <ul className="divide-rule min-h-[80px]">
                  {items.length === 0 && (
                    <li className="text-muted text-xs italic py-2">No tasks.</li>
                  )}
                  {items.map((t) => (
                    <TaskItem
                      key={t.id}
                      task={t}
                      onChangeStatus={changeStatus}
                      onDelete={remove}
                      onEdit={editTask}
                    />
                  ))}
                </ul>
                <AddTaskInline quadrant={q.id} onAdd={add} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
