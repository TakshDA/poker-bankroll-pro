import { requireUser } from "@/lib/auth";
import { MobileNav, MobileTopBar } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { getAlerts } from "@/lib/server/alerts";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const alerts = await getAlerts();
  const alertCount = alerts.filter((a) => a.severity !== "info").length;
  return (
    <div className="min-h-dvh">
      <Sidebar email={user.email} signOut={signOut} alertCount={alertCount} />
      <MobileTopBar />
      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>
      <MobileNav email={user.email} signOut={signOut} alertCount={alertCount} />
    </div>
  );
}
