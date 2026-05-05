export type Quadrant = "do" | "schedule" | "delegate" | "eliminate";

export const QUADRANTS: { id: Quadrant; title: string; subtitle: string; dot: string; aura: string }[] = [
  { id: "do",        title: "Do",        subtitle: "Urgent · Important",      dot: "bg-rose-400",    aura: "before:bg-rose-400/30" },
  { id: "schedule",  title: "Schedule",  subtitle: "Important · Not Urgent",  dot: "bg-emerald-400", aura: "before:bg-emerald-400/30" },
  { id: "delegate",  title: "Delegate",  subtitle: "Urgent · Not Important",  dot: "bg-amber-400",   aura: "before:bg-amber-400/30" },
  { id: "eliminate", title: "Eliminate", subtitle: "Neither",                 dot: "bg-slate-400",   aura: "before:bg-slate-400/30" },
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
