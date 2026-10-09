import * as React from "react";
import { InfoTip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Metric tile: label, value, optional sub-line and formula tooltip. */
export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  info,
  className,
  large,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "positive" | "negative" | "neutral" | "gold";
  info?: React.ReactNode;
  className?: string;
  large?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-4 shadow-card", className)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
        {label}
        {info ? <InfoTip content={info} label={`How ${label} is calculated`} /> : null}
      </div>
      <div
        className={cn(
          "num mt-2 font-semibold tracking-tight",
          large ? "text-3xl" : "text-xl",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "gold" && "text-gold",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-fg-subtle">{sub}</div> : null}
    </div>
  );
}
