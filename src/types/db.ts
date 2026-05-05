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
