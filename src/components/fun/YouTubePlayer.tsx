"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Play } from "lucide-react";

// A YouTube player that shows a poster first, then mounts the real YouTube
// embed WITH native controls on click. We use the native HUD on purpose:
// fullscreen, quality/settings, captions and the scrubber all come for free,
// which a custom overlay can't replicate. Click is a real user gesture so the
// video starts with sound.

export function YouTubePlayer({
  videoId,
  title,
  poster,
  loop = false,
  aspect = "video",
  className = "",
}: {
  videoId: string;
  title?: string;
  poster?: string;
  loop?: boolean;
  aspect?: "video" | "short";
  className?: string;
}) {
  const [started, setStarted] = useState(false);

  // Reset to the poster whenever the video changes.
  useEffect(() => { setStarted(false); }, [videoId]);

  const ratio = aspect === "short" ? "9 / 16" : "16 / 9";
  const thumb = poster || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  const fallbackThumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  const src =
    `https://www.youtube.com/embed/${videoId}` +
    `?autoplay=1&rel=0&modestbranding=1&playsinline=1` +
    (loop ? `&loop=1&playlist=${videoId}` : "");

  return (
    <div className={`relative overflow-hidden bg-black ${className}`} style={{ aspectRatio: ratio }}>
      {!started ? (
        <button onClick={() => setStarted(true)} aria-label="Play" className="absolute inset-0 group">
          <img
            src={thumb}
            alt={title ?? ""}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            onError={(e) => { const t = e.currentTarget as HTMLImageElement; if (t.src !== fallbackThumb) t.src = fallbackThumb; }}
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-white/15 backdrop-blur-md border border-white/30 text-white shadow-2xl transition group-hover:scale-110 group-hover:bg-white/25">
              <Play className="h-7 w-7 translate-x-[2px]" fill="currentColor" strokeWidth={0} />
            </span>
          </span>
          {title && (
            <span className="absolute inset-x-0 bottom-0 p-3 text-left">
              <span className="block text-[13px] font-semibold text-white leading-snug line-clamp-2 drop-shadow">{title}</span>
            </span>
          )}
        </button>
      ) : (
        <iframe
          key={videoId}
          src={src}
          title={title ?? "YouTube video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      )}
    </div>
  );
}
