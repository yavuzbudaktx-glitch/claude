"use client";

import { useEffect } from "react";
import { applyThemeDom, getTheme } from "@/lib/theme";

// Belt-and-suspenders for the theme variant: the boot script in <head> sets
// the class before paint, but anything that re-renders <html> attributes
// during hydration can strip it. This component runs once after mount and
// re-applies whatever's in localStorage so the chosen theme always sticks
// across refreshes.
export function ThemeRestorer() {
  useEffect(() => {
    applyThemeDom(getTheme());
  }, []);
  return null;
}
