import { requireUser } from "@/lib/auth";
import { MobileNav, MobileTopBar } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { getAlerts } from "@/lib/server/alerts";
import { getWorkspace } from "@/lib/server/workspace";
import { dueReminders } from "@/lib/finance/reminders";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [alerts, ws] = await Promise.all([getAlerts(), getWorkspace()]);
  const reminders = dueReminders(ws.planned, ws.settings.timezone);
  const alertCount = alerts.filter((a) => a.severity !== "info").length;
  return (
    <div className="min-h-dvh">
      <Sidebar email={user.email} signOut={signOut} alertCount={alertCount} />
      <MobileTopBar />
      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          {reminders.length ? (
            <div role="status" className="mb-5 space-y-2">
              {reminders.map((r) => (
                <Link key={r.id} href={`/calendar?view=day&date=${r.date}`} className="flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm hover:bg-gold/15">
                  <BellRing className="size-4 shrink-0 text-gold" />
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{r.title}</span>{" "}
                    <span className="text-fg-muted">{r.minutesUntil > 0 ? `starts in ${r.minutesUntil >= 60 ? `${Math.floor(r.minutesUntil / 60)}h ${r.minutesUntil % 60}m` : `${r.minutesUntil}m`}` : "has started. Log it when you finish."}</span>
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
          {children}
        </main>
      </div>
      <MobileNav email={user.email} signOut={signOut} alertCount={alertCount} />
    </div>
  );
}
