"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];

/** Date-range filter shared by dashboard, analytics and reports (URL state). */
export function RangePicker({ current, defaultPreset = "all" }: { current: { preset: string; from: string | null; to: string | null }; defaultPreset?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (next.get("range") === defaultPreset) next.delete("range");
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return (
    <div className="flex flex-col gap-2 sm:items-end" aria-busy={pending}>
      <div role="group" aria-label="Date range" className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            aria-pressed={current.preset === p.value}
            onClick={() => go({ range: p.value, ...(p.value !== "custom" ? { from: null, to: null } : {}) })}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              current.preset === p.value ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      {current.preset === "custom" ? (
        <div className="flex gap-2">
          <Input type="date" aria-label="From" value={current.from ?? ""} onChange={(e) => go({ range: "custom", from: e.target.value })} className="h-9 w-40" />
          <Input type="date" aria-label="To" value={current.to ?? ""} onChange={(e) => go({ range: "custom", to: e.target.value })} className="h-9 w-40" />
        </div>
      ) : null}
    </div>
  );
}
