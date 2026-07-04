import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getZuyaMember } from "@/lib/zuya/server";
import { zuyaAccessTokenFor } from "@/lib/zuya/google";
import { fetchEventsBetween, type CalendarEvent } from "@/lib/google/calendar";
import type { ZuyaUsername } from "@/lib/zuya/config";

export const dynamic = "force-dynamic";

export type ZuyaConnState = "connected" | "not_connected" | "needs_reconnect" | "error";

export interface ZuyaCalendarEvent extends CalendarEvent {
  owner: ZuyaUsername;
}

// Both partners' Google Calendars merged for a time window. Tokens are read
// server-side with the service client — neither browser ever sees them.
export async function GET(req: Request) {
  const auth = await getZuyaMember();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const now = Date.now();
  const from = url.searchParams.get("from") ?? new Date(now - 7 * 86400_000).toISOString();
  const to = url.searchParams.get("to") ?? new Date(now + 45 * 86400_000).toISOString();

  const service = createServiceClient();
  const { data: members } = await service
    .from("zuya_members")
    .select("user_id, username");

  const events: ZuyaCalendarEvent[] = [];
  const connected: Record<string, ZuyaConnState> = {};
  const details: Record<string, string> = {};

  await Promise.all(
    (members ?? []).map(async (m) => {
      const username = m.username as ZuyaUsername;
      const tok = await zuyaAccessTokenFor(m.user_id);
      if ("error" in tok) {
        connected[username] = tok.error;
        if (tok.detail) details[username] = tok.detail;
        return;
      }
      try {
        const evs = await fetchEventsBetween(tok.token, from, to);
        connected[username] = "connected";
        for (const e of evs) events.push({ ...e, owner: username });
      } catch (e) {
        connected[username] = "error";
        details[username] = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      }
    }),
  );

  events.sort((a, b) => a.start.localeCompare(b.start));
  return NextResponse.json({ events, connected, details, from, to });
}
