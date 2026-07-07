"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { ZUYA_THEMES, applyZuyaTheme, getZuyaTheme, type ZuyaThemeId } from "@/lib/zuya/theme";

export function ZuyaThemePicker() {
  const [active, setActive] = useState<ZuyaThemeId>("rose");
  useEffect(() => {
    setActive(getZuyaTheme());
  }, []);

  function pick(id: ZuyaThemeId) {
    applyZuyaTheme(id);
    setActive(id);
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {ZUYA_THEMES.map((t) => (
        <button
          key={t.id}
          onClick={() => pick(t.id)}
          className={`relative rounded-xl px-3 py-2.5 text-[12.5px] font-medium text-left border transition ${
            active === t.id
              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-ink"
              : "border-[var(--rule)] text-ink-soft hover:border-[var(--accent)]"
          }`}
        >
          {t.label}
          {active === t.id && <Check className="absolute top-2 right-2 h-3.5 w-3.5 text-accent" />}
        </button>
      ))}
    </div>
  );
}
