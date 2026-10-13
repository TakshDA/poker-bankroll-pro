"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Device", icon: Monitor },
];

const EVENT = "pbp-theme";

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: t }));
}

/** Light / dark / match-device switch. Applies instantly and remembers the choice for a year. */
export function ThemeSwitch({ initial, className }: { initial: Theme; className?: string }) {
  const [theme, setTheme] = useState(initial);
  // Keep every switch on the page (sidebar, settings) in sync.
  useEffect(() => {
    const on = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const choose = (t: Theme) => {
    applyTheme(t);
  };
  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn("grid grid-cols-3 gap-1 rounded-lg border border-border bg-surface-2 p-1", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          onClick={() => choose(o.value)}
          className={cn("flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs", theme === o.value ? "bg-surface text-fg shadow-card" : "text-fg-muted hover:text-fg")}
        >
          <o.icon className="size-3.5" aria-hidden /> {o.label}
        </button>
      ))}
    </div>
  );
}
