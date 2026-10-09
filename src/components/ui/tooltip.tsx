"use client";
import { Tooltip as T } from "radix-ui";
import { Info } from "lucide-react";
import * as React from "react";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <T.Provider delayDuration={150}>{children}</T.Provider>;
}

export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactNode }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content sideOffset={6} className="z-50 max-w-xs rounded-lg border border-border bg-surface-3 px-3 py-2 text-xs leading-relaxed text-fg shadow-xl">
          {content}
          <T.Arrow className="fill-[var(--surface-3)]" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

/** Small info icon with an explanatory tooltip (e.g. a formula). */
export function InfoTip({ content, label = "More information" }: { content: React.ReactNode; label?: string }) {
  return (
    <Tooltip content={content}>
      <button type="button" aria-label={label} className="inline-flex text-fg-subtle hover:text-fg-muted">
        <Info className="size-3.5" />
      </button>
    </Tooltip>
  );
}
