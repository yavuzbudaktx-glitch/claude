import type { ZuyaUsername } from "@/lib/zuya/config";

export interface ZuyaMemberRow {
  user_id: string;
  username: ZuyaUsername;
  display_name: string;
  status: string;
  status_updated_at: string | null;
  avatar_updated_at: string | null;
  google_connected: boolean;
  spotify_connected?: boolean;
  notif_prefs: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ZuyaThoughtRow {
  id: string;
  user_id: string;
  day: string;
  count: number;
  last_click_at: string | null;
}

export interface ZuyaMessageRow {
  id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
  audio_path: string | null;
  audio_dur: number | null;
}

export type ZuyaDateStatus = "pending" | "accepted" | "rejected" | "cancelled";

export interface ZuyaDateHistoryEntry {
  by: string;
  at: string;
  fields: Partial<Pick<ZuyaDateSuggestionRow, "title" | "day" | "start_at" | "end_at" | "place" | "note">>;
}

export interface ZuyaDateSuggestionRow {
  id: string;
  proposer_id: string;
  pending_from: string | null;
  status: ZuyaDateStatus;
  title: string;
  day: string;
  start_at: string;
  end_at: string | null;
  place: string | null;
  note: string | null;
  bucket_item_id: string | null;
  history: ZuyaDateHistoryEntry[];
  gcal_event_ids: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export type ZuyaNotificationKind =
  | "date_suggested"
  | "date_countered"
  | "date_accepted"
  | "date_rejected"
  | "date_cancelled"
  | "status_changed";

export interface ZuyaNotificationRow {
  id: string;
  user_id: string;
  kind: ZuyaNotificationKind;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface ZuyaDailyAnswerRow {
  id: string;
  user_id: string;
  day: string;
  question_idx: number;
  answer: string;
  created_at: string;
}

export interface ZuyaBucketItemRow {
  id: string;
  created_by: string;
  title: string;
  note: string | null;
  done: boolean;
  done_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ZuyaWordleResultRow {
  id: string;
  user_id: string;
  day: string;
  guesses: number; // 0 = failed
  time_ms: number;
  board: { ch: string; state: "right" | "present" | "wrong" }[][];
  created_at: string;
}
