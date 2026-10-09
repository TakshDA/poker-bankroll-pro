"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Spade } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "./nav-items";
import { QuickLog } from "./quick-log";

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ email, signOut, alertCount }: { email: string; signOut: () => Promise<void>; alertCount: number }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex size-8 items-center justify-center rounded-lg border border-gold/30 bg-gold-soft text-gold">
          <Spade className="size-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Bankroll Pro</p>
          <p className="text-[10px] uppercase tracking-widest text-gold">Poker</p>
        </div>
      </div>
      <div className="px-3 pb-3">
        <QuickLog className="w-full" />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((g) => (
          <div key={g.label} className="mt-4 first:mt-1">
            <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-widest text-fg-subtle">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        active ? "bg-surface-3 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      <item.icon className={cn("size-4", active && "text-positive")} />
                      <span className="flex-1">{item.label}</span>
                      {item.href === "/goals" && alertCount > 0 ? (
                        <span className="rounded-full bg-negative px-1.5 text-[10px] font-semibold text-white" aria-label={`${alertCount} alerts`}>
                          {alertCount}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <p className="truncate px-2 text-xs text-fg-subtle" title={email}>
          {email}
        </p>
        <form action={signOut}>
          <button type="submit" className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg">
            <LogOut className="size-4" /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
