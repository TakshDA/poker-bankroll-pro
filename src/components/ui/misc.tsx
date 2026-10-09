import * as React from "react";
import { cn } from "@/lib/utils";
import { money, toneOf } from "@/lib/format";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2 xl:shrink-0 xl:justify-end">{actions}</div> : null}
    </div>
  );
}

export function Money({ amount, currency, signed = false, className, colored = true }: { amount: number | null | undefined; currency: string; signed?: boolean; className?: string; colored?: boolean }) {
  const tone = colored ? toneOf(amount) : "neutral";
  return (
    <span className={cn("num", tone === "positive" && "text-positive", tone === "negative" && "text-negative", className)}>{money(amount, currency, { signed })}</span>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
      {icon ? <div className="rounded-full bg-surface-2 p-3 text-fg-muted [&_svg]:size-5">{icon}</div> : null}
      <div>
        <p className="font-medium">{title}</p>
        {description ? <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Alert({ tone = "warning", title, children, className }: { tone?: "warning" | "negative" | "positive" | "info"; title?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        tone === "warning" && "border-warning/30 bg-warning-soft text-warning",
        tone === "negative" && "border-negative/30 bg-negative-soft text-negative",
        tone === "positive" && "border-positive/30 bg-positive-soft text-positive",
        tone === "info" && "border-border bg-surface-2 text-fg-muted",
        className,
      )}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} />;
}
