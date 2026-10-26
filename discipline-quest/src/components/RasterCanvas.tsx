"use client";
import { useEffect, useRef } from "react";
import type { Raster } from "@/game/raster";

/** Draws a pixel raster crisply, scaled to fit the box. */
export default function RasterCanvas({ make, deps, className = "", style, label }: { make: () => Raster; deps: unknown[]; className?: string; style?: React.CSSProperties; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const r = make();
    const c = ref.current!;
    c.width = r.w;
    c.height = r.h;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.w, r.h), 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return (
    <canvas
      ref={ref}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ imageRendering: "pixelated", objectFit: "contain", ...style }}
    />
  );
}
