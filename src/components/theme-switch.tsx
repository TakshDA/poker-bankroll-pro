"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Device", icon: Monitor },
];

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.cookie = `${THEME_COOKIE}=${t}; path=/; max-age=31536000; samesite=lax`;
}

/** Light / dark / match-device switch. Applies instantly and remembers the choice for a year. */
export function ThemeSwitch({ initial, className }: { initial: Theme; className?: string }) {
  const [theme, setTheme] = useState(initial);
  const choose = (t: Theme) => {
    setTheme(t);
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
