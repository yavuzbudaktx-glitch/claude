"use client";

import { useZuya } from "@/components/zuya/ZuyaProvider";
import type { ZuyaMemberRow } from "@/types/zuya";

// Avatar with a soft heart-gradient ring; falls back to the first letter of
// the display name when no picture is uploaded yet.
export function ZuyaAvatar({
  member,
  size = 44,
  className = "",
}: {
  member: ZuyaMemberRow;
  size?: number;
  className?: string;
}) {
  const { avatars } = useZuya();
  const url = avatars[member.user_id];
  const inner = size - 5;

  return (
    <span
      className={`inline-grid place-items-center rounded-full shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, var(--grad-from), var(--grad-via), var(--grad-to))",
        padding: 2.5,
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={member.display_name}
          className="rounded-full object-cover"
          style={{ width: inner, height: inner }}
        />
      ) : (
        <span
          className="rounded-full grid place-items-center font-display font-bold text-ink bg-[var(--paper-2)]"
          style={{ width: inner, height: inner, fontSize: size * 0.42 }}
        >
          {member.display_name.charAt(0)}
        </span>
      )}
    </span>
  );
}
