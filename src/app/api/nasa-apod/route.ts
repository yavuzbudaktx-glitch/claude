// NASA's Astronomy Picture of the Day. Their public DEMO_KEY is fine for
// personal use (50 req/hour); set NASA_API_KEY for higher limits. Cached
// for an hour — the picture only changes once a day anyway.

import { NextResponse } from "next/server";

export const revalidate = 3600;

interface ApodResp {
  date?: string;
  title?: string;
  explanation?: string;
  url?: string;
  hdurl?: string;
  media_type?: string;
  copyright?: string;
}

export async function GET() {
  const key = process.env.NASA_API_KEY || "DEMO_KEY";
  try {
    const r = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${key}`, {
      next: { revalidate: 3600 },
    });
    if (!r.ok) return NextResponse.json({ error: `nasa_${r.status}` }, { status: 502 });
    const j = (await r.json()) as ApodResp;
    return NextResponse.json({
      date: j.date,
      title: j.title,
      explanation: j.explanation,
      url: j.url,
      hdurl: j.hdurl,
      media_type: j.media_type,
      copyright: j.copyright,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "nasa_unavailable" },
      { status: 502 },
    );
  }
}
