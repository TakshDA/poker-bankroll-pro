"use client";
import { DropdownMenu as M } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;

export function DropdownMenuContent({ className, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={6} align="end" className={cn("z-50 min-w-44 rounded-lg border border-border bg-surface-2 p-1 shadow-xl", className)} {...props} />
    </M.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn("flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm text-fg outline-none data-[highlighted]:bg-surface-3 [&_svg]:size-4 [&_svg]:text-fg-muted", className)}
      {...props}
    />
  );
}
export const DropdownMenuSeparator = ({ className, ...props }: React.ComponentProps<typeof M.Separator>) => (
  <M.Separator className={cn("my-1 h-px bg-border", className)} {...props} />
);
