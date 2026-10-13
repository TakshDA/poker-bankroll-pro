"use client";
import { ThemeSwitch } from "@/components/theme-switch";
import type { Theme } from "@/lib/theme";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Gauge, ListOrdered, LogOut, Menu, Spade, Wallet } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ALL_NAV } from "./nav-items";
import { QuickLog } from "./quick-log";
import { isActive } from "./sidebar";

export function MobileTopBar({ title }: { title?: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-bg/90 px-4 backdrop-blur lg:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="flex size-7 items-center justify-center rounded-md border border-gold/30 bg-gold-soft text-gold">
        <Spade className="size-3.5" />
      </div>
      <span className="text-sm font-semibold">{title ?? "Bankroll Pro"}</span>
    </header>
  );
}

export function MobileNav({ email, signOut, alertCount, theme }: { email: string; signOut: () => Promise<void>; alertCount: number; theme: Theme }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const tabs = [
    { href: "/", label: "Home", icon: Gauge },
    { href: "/sessions", label: "Sessions", icon: ListOrdered },
  ];
  const tabs2 = [{ href: "/bankroll", label: "Bankroll", icon: Wallet }];
  const tab = (t: (typeof tabs)[number]) => {
    const active = isActive(pathname, t.href);
    return (
      <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]", active ? "text-positive" : "text-fg-muted")}>
        <t.icon className="size-5" />
        {t.label}
      </Link>
    );
  };
  return (
    <>
      <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="mx-auto flex max-w-md items-end">
          {tabs.map(tab)}
          <div className="flex flex-1 justify-center">
            <QuickLog compact />
          </div>
          {tabs2.map(tab)}
          <button type="button" onClick={() => setOpen(true)} className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-fg-muted" aria-label="More navigation">
            <Menu className="size-5" />
            More
            {alertCount > 0 ? <span className="absolute right-5 top-1.5 size-2 rounded-full bg-negative" /> : null}
          </button>
        </div>
      </nav>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Menu" description={email}>
          <ul className="grid grid-cols-3 gap-2">
            {ALL_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border border-border px-2 py-3 text-center text-xs",
                    isActive(pathname, item.href) ? "bg-surface-3 text-fg" : "text-fg-muted",
                  )}
                >
                  <item.icon className="size-5" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <ThemeSwitch initial={theme} className="mt-4" />
          <form action={signOut} className="mt-4">
            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2.5 text-sm text-fg-muted">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
