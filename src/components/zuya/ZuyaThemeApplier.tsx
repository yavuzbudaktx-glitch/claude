"use client";

import { useEffect } from "react";
import { applyZuyaThemeDom, getZuyaTheme } from "@/lib/zuya/theme";

// Applies the saved Zuya theme to the .zuya-scope element on load.
export function ZuyaThemeApplier() {
  useEffect(() => {
    applyZuyaThemeDom(getZuyaTheme());
  }, []);
  return null;
}
