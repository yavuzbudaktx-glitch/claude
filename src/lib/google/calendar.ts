export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  htmlLink?: string;
}

interface RawEvent {
  id: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export async function fetchUpcomingEvents(
  accessToken: string,
  maxResults = 20,
  daysAhead = 5,
): Promise<CalendarEvent[]> {
  const now = new Date();
  const timeMax = new Date(now.getTime() + daysAhead * 86400 * 1000);
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: now.toISOString(),
    timeMax: timeMax.toISOString(),
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );

  if (!res.ok) {
    throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { items?: RawEvent[] };
  return (data.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date ?? "",
    end: e.end?.dateTime ?? e.end?.date ?? "",
    allDay: !e.start?.dateTime,
    location: e.location,
    htmlLink: e.htmlLink,
  }));
}
