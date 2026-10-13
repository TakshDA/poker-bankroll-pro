import Link from "next/link";
import { ArrowLeftRight, ChevronRight, ListChecks, Trash2 } from "lucide-react";
import { cookies } from "next/headers";
import { ThemeSwitch } from "@/components/theme-switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/lib/auth";
import { listCurrencies } from "@/lib/data/settings";
import { env } from "@/lib/server/env";
import { getWorkspace, readAsUser } from "@/lib/server/workspace";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { DeleteAccountDialog, PasswordForm, PreferencesForm } from "./settings-forms";

export const metadata = { title: "Settings" };

const LINKS = [
  { href: "/settings/currencies", icon: ArrowLeftRight, title: "Currencies & exchange rates", text: "Rates used to add up amounts in different currencies" },
  { href: "/settings/lists", icon: ListChecks, title: "Venues, sites, games & stakes", text: "Rename, archive or remove the choices in your forms" },
  { href: "/settings/trash", icon: Trash2, title: "Trash", text: "Restore or permanently delete removed records" },
];

export default async function SettingsPage() {
  const [user, ws, currencies, store] = await Promise.all([requireUser(), getWorkspace(), readAsUser(listCurrencies), cookies()]);
  const s = ws.settings;
  const timezones = Intl.supportedValuesOf("timeZone");
  if (!timezones.includes(s.timezone)) timezones.unshift(s.timezone);
  const supabase = env().AUTH_PROVIDER === "supabase";
  return (
    <>
      <PageHeader title="Settings" description={`Signed in as ${user.email}`} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader className="flex-col gap-1">
              <CardTitle>Preferences</CardTitle>
              <CardDescription>Changing the base currency or time zone recalculates every total; your records are not changed.</CardDescription>
            </CardHeader>
            <CardContent>
              <PreferencesForm
                values={{ displayName: s.displayName ?? "", baseCurrency: s.baseCurrency, timezone: s.timezone, weekStartsOn: s.weekStartsOn, enabledCurrencies: s.enabledCurrencies.map((c) => c.trim()), defaultAccountId: s.defaultAccountId ?? "" }}
                currencies={currencies}
                timezones={timezones}
                accounts={ws.dataset.accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-col gap-1">
              <CardTitle>Password</CardTitle>
              <CardDescription>{supabase ? "You stay signed in on this device." : "You will be signed out everywhere and asked to sign in again."}</CardDescription>
            </CardHeader>
            <CardContent>
              <PasswordForm />
            </CardContent>
          </Card>

          <Card className="border-negative/40">
            <CardHeader className="flex-col gap-1">
              <CardTitle>Delete account</CardTitle>
              <CardDescription>Removes your login and all of your data for good.</CardDescription>
            </CardHeader>
            <CardContent>
              <DeleteAccountDialog email={user.email} />
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader className="flex-col gap-1">
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Device follows your phone or computer setting.</CardDescription>
            </CardHeader>
            <CardContent>
              <ThemeSwitch initial={parseTheme(store.get(THEME_COOKIE)?.value)} />
            </CardContent>
          </Card>

          <Card>
            <nav aria-label="More settings" className="divide-y divide-border">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="flex items-center gap-3 px-5 py-3.5 first:rounded-t-xl last:rounded-b-xl hover:bg-surface-2">
                  <l.icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{l.title}</span>
                    <span className="block text-xs text-fg-subtle">{l.text}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                </Link>
              ))}
            </nav>
          </Card>
        </div>
      </div>
    </>
  );
}
