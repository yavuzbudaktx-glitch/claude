export type Quadrant = "do" | "schedule" | "delegate" | "eliminate";

export const QUADRANTS: {
  id: Quadrant;
  title: string;
  subtitle: string;
  number: string;
}[] = [
  { id: "do",        number: "I",   title: "Do Now",     subtitle: "Urgent · Important" },
  { id: "schedule",  number: "II",  title: "Schedule",   subtitle: "Important · Not Urgent" },
  { id: "delegate",  number: "III", title: "Delegate",   subtitle: "Urgent · Not Important" },
  { id: "eliminate", number: "IV",  title: "Eliminate",  subtitle: "Neither" },
];

export type TaskStatus = "not_started" | "planning" | "in_progress" | "on_hold" | "complete";

export const TASK_STATUSES: { id: TaskStatus; label: string; fill: number; hold?: boolean }[] = [
  { id: "not_started", label: "Not Started", fill: 0 },
  { id: "planning",    label: "Planning",    fill: 0.12 },
  { id: "in_progress", label: "In Progress", fill: 0.6 },
  { id: "complete",    label: "Complete",    fill: 1 },
  { id: "on_hold",     label: "On Hold",     fill: 0.4, hold: true },
];

export interface Task {
  id: string;
  user_id: string;
  title: string;
  due_date: string | null;
  quadrant: Quadrant;
  completed: boolean;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  google_refresh_token: string | null;
  weather_lat: number;
  weather_lon: number;
}

export interface DocumentRow {
  id: string;
  user_id: string;
  path: string;
  content_hash: string | null;
  size: number;
  mime: string | null;
  version: number;
  deleted: boolean;
  rev: number;
  storage_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeviceRow {
  id: string;
  user_id: string;
  name: string;
  platform: string | null;
  sync_cursor: number;
  last_seen_at: string | null;
  revoked: boolean;
  created_at: string;
  updated_at: string;
}
