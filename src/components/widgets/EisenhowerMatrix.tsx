"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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

  return (
    <Card num="04" title="Eisenhower · Tasks">
      {loading ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 -mx-1">
          {QUADRANTS.map((q, i) => {
            const items = visibleTasks.filter((t) => t.quadrant === q.id);
            const open = items.filter((x) => x.status !== "complete").length;
            const isLast = i === QUADRANTS.length - 1;
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
                className={`px-3 py-1 rounded-xl transition-colors ${!isLast ? "lg:border-r border-r-[var(--rule-soft)]" : ""} ${
                  dragQuad === q.id ? "bg-hl" : ""
                }`}
              >
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-mono text-[10px] text-accent tracking-widest">{q.number}</span>
                  <h3 className="font-serif text-lg font-medium leading-none">{q.title}</h3>
                  <span className="ml-auto font-mono text-[10px] text-muted uppercase tracking-wider">
                    {open}
                  </span>
                </div>
                <div className="font-mono text-[10px] text-muted uppercase tracking-wider mb-3">
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
