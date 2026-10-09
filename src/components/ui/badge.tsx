import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium", {
  variants: {
    tone: {
      neutral: "bg-surface-3 text-fg-muted",
      positive: "bg-positive-soft text-positive",
      negative: "bg-negative-soft text-negative",
      gold: "bg-gold-soft text-gold",
      warning: "bg-warning-soft text-warning",
      outline: "border border-border text-fg-muted",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
