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

// Events in an arbitrary window — used by Zuya's merged couple calendar.
export async function fetchEventsBetween(
  accessToken: string,
  timeMin: string,
  timeMax: string,
  maxResults = 250,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
    timeMin,
    timeMax,
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

// Insert an event into the primary calendar (needs the calendar.events
// scope). Returns the created event id.
export async function insertCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    location?: string;
    start: string; // ISO datetime
    end: string;   // ISO datetime
  },
): Promise<string> {
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: { dateTime: event.start },
        end: { dateTime: event.end },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Calendar insert ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
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
