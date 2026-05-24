"use client";

import { Maximize, Minimize } from "lucide-react";
import { useEffect, useState } from "react";

export function FullscreenToggle() {
  const [fs, setFs] = useState(false);

  useEffect(() => {
    const onChange = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // some browsers block fullscreen without a user gesture / on iOS
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={fs ? "Exit full screen" : "Enter full screen"}
      title={fs ? "Exit full screen" : "Full screen"}
      className="btn-ghost"
    >
      {fs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
    </button>
  );
}
