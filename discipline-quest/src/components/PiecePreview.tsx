"use client";
import { useEffect, useRef } from "react";
import { buildPiece, type PieceId } from "@/game/furniture";
import { lockedCopy } from "@/game/iso";

export default function PiecePreview({ id, locked = false, size = 64 }: { id: PieceId; locked?: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const s = locked ? lockedCopy(buildPiece(id)) : buildPiece(id);
    const c = ref.current!;
    c.width = s.r.w;
    c.height = s.r.h;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(s.r.data), s.r.w, s.r.h), 0, 0);
  }, [id, locked]);
  return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <canvas ref={ref} className="max-h-full max-w-full" style={{ imageRendering: "pixelated", width: "100%", height: "100%", objectFit: "contain" }} />
    </div>
  );
}
