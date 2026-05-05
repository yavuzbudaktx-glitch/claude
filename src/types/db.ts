export type Quadrant = "do" | "schedule" | "delegate" | "eliminate";

export const QUADRANTS: { id: Quadrant; title: string; subtitle: string; tone: string }[] = [
  { id: "do", title: "Do", subtitle: "Urgent + Important", tone: "from-rose-500/20 to-rose-500/5 border-rose-500/30" },
  { id: "schedule", title: "Schedule", subtitle: "Important · Not Urgent", tone: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30" },
  { id: "delegate", title: "Delegate", subtitle: "Urgent · Not Important", tone: "from-amber-500/20 to-amber-500/5 border-amber-500/30" },
  { id: "eliminate", title: "Eliminate", subtitle: "Neither", tone: "from-slate-500/20 to-slate-500/5 border-slate-500/30" },
];

export interface Task {
  id: string;
  user_id: string;
  title: string;
  due_date: string | null;
  quadrant: Quadrant;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  google_refresh_token: string | null;
  weather_lat: number;
  weather_lon: number;
}
