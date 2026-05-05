"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { QUADRANTS, type Task, type Quadrant } from "@/types/db";
import { Card } from "@/components/Card";
import { TaskItem } from "./TaskItem";
import { AddTaskInline } from "./AddTaskInline";

export function EisenhowerMatrix({ userId }: { userId: string }) {
  const supabase = createClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("tasks")
      .select("*")
      .order("completed", { ascending: true })
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

  async function add({ title, due_date, quadrant }: { title: string; due_date: string | null; quadrant: Quadrant }) {
    const { data, error } = await supabase
      .from("tasks")
      .insert({ title, due_date, quadrant, user_id: userId })
      .select()
      .single();
    if (!error && data) setTasks((t) => [data as Task, ...t]);
  }

  async function toggle(task: Task) {
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t)));
    await supabase.from("tasks").update({ completed: !task.completed }).eq("id", task.id);
  }

  async function remove(task: Task) {
    setTasks((ts) => ts.filter((t) => t.id !== task.id));
    await supabase.from("tasks").delete().eq("id", task.id);
  }

  return (
    <Card title="Tasks · Eisenhower Matrix">
      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {QUADRANTS.map((q) => {
            const items = tasks.filter((t) => t.quadrant === q.id);
            return (
              <div
                key={q.id}
                className={`rounded-xl border bg-gradient-to-br p-3 ${q.tone}`}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <h3 className="font-semibold text-white/90">{q.title}</h3>
                  <span className="text-[10px] uppercase tracking-wider text-muted">
                    {q.subtitle}
                  </span>
                </div>
                <ul className="divide-y divide-white/5">
                  {items.length === 0 && (
                    <li className="text-muted text-xs py-1">Nothing here.</li>
                  )}
                  {items.map((t) => (
                    <TaskItem key={t.id} task={t} onToggle={toggle} onDelete={remove} />
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
