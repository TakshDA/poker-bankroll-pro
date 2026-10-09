import { Landmark } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar, Pagination } from "@/components/filter-bar";
import { LedgerTable, type LedgerRow } from "@/components/records/ledger-table";
import { ExportMenu } from "@/components/export-menu";
import { localDate } from "@/lib/finance/dates";
import { LEDGER_CLASS } from "@/lib/finance/ledger";
import { dateLabel } from "@/lib/format";
import { pageOf, sp, validDate } from "@/lib/server/search-params";
import { getFinance } from "@/lib/server/workspace";

export const metadata = { title: "Ledger" };
const PAGE_SIZE = 100;

const CLASS_OPTIONS = [
  { value: "capital", label: "Opening / deposits / withdrawals" },
  { value: "transfer", label: "Transfers" },
  { value: "poker", label: "Poker results" },
  { value: "poker_income", label: "Bonuses & rakeback" },
  { value: "expense", label: "Expenses" },
  { value: "adjustment", label: "Adjustments" },
  { value: "charges", label: "Session charges (info)" },
];

export default async function LedgerPage({ searchParams }: PageProps<"/ledger">) {
  const params = sp(await searchParams);
  const { ws, ctx } = await getFinance();
  const accounts = new Map(ws.dataset.accounts.map((a) => [a.id, a]));
  const from = validDate(params.from);
  const to = validDate(params.to);
  const q = params.q?.toLowerCase().trim();
  const inDates = (d: string) => (!from || d >= from) && (!to || d <= to);
  const okAccount = (id: string) => !params.account || params.account === id;

  if (params.class === "charges") {
    // Rake, tips and fees recorded on sessions/tournaments. They are already
    // inside the session results, so they are shown for reference only.
    const charges: { key: string; date: string; label: string; what: string; href: string; amount: number; currency: string; included: boolean; account: string }[] = [];
    for (const s of ws.dataset.cashSessions) {
      if (s.status !== "completed" || !okAccount(s.accountId)) continue;
      const date = localDate(s.startedAt, ws.settings.timezone);
      const a = accounts.get(s.accountId)!;
      const push = (k: string, label: string, amount: number, included: boolean) => amount && charges.push({ key: `${s.id}-${k}`, date, label, what: "Cash session", href: `/sessions/${s.id}`, amount, currency: a.currency, included, account: a.name });
      push("rake", "Rake (reflected in cash-out)", s.rakeMinor, true);
      push("tips", "Dealer tips (deducted in result)", s.tipsMinor, true);
      push("fees", "Session fees (deducted in result)", s.feesMinor, true);
    }
    for (const t of ws.dataset.tournaments) {
      if (t.status === "draft" || !okAccount(t.accountId)) continue;
      const fees = t.entries.reduce((x, e) => x + e.feeMinor, 0);
      const a = accounts.get(t.accountId)!;
      if (fees) charges.push({ key: `${t.id}-fee`, date: t.startDate, label: "Tournament fees (in investment)", what: t.name, href: `/tournaments/${t.id}`, amount: fees, currency: a.currency, included: true, account: a.name });
    }
    const rows = charges.filter((c) => inDates(c.date) && (!q || `${c.label} ${c.what} ${c.account}`.toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date));
    return (
      <>
        <Header />
        <Filters ws={ws} />
        <Card>
          <CardContent className="px-0 pb-2 pt-3">
            <p className="px-5 pb-3 text-xs text-fg-muted">These charges are already accounted for inside each session or tournament result, so they never change a balance a second time.</p>
            <Table>
              <THead>
                <tr>
                  <TH className="pl-5">Date</TH>
                  <TH>Charge</TH>
                  <TH>Record</TH>
                  <TH>Account</TH>
                  <TH className="pr-5 text-right">Amount</TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((c) => (
                  <TR key={c.key}>
                    <TD className="pl-5 text-fg-muted">{dateLabel(c.date)}</TD>
                    <TD>
                      {c.label} <Badge tone="outline">included</Badge>
                    </TD>
                    <TD>
                      <Link className="hover:underline" href={c.href}>
                        {c.what}
                      </Link>
                    </TD>
                    <TD className="text-fg-muted">{c.account}</TD>
                    <TD className="pr-5 text-right">
                      <Money amount={c.amount} currency={c.currency} colored={false} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </>
    );
  }

  const all: LedgerRow[] = ctx.ledger.map((e) => ({ ...e, accountName: accounts.get(e.accountId)?.name ?? "" }));
  const rows = all
    .filter(
      (e) =>
        okAccount(e.accountId) &&
        (!params.class || LEDGER_CLASS[e.kind] === params.class) &&
        inDates(e.date) &&
        (!q || `${e.description} ${e.accountName} ${e.kind}`.toLowerCase().includes(q) || e.sourceId === q),
    )
    .reverse();

  // Totals per currency (no cross-currency mixing).
  const totals = new Map<string, { in: number; out: number }>();
  for (const e of rows) {
    const t = totals.get(e.currency) ?? { in: 0, out: 0 };
    if (e.amountMinor >= 0) t.in += e.amountMinor;
    else t.out += e.amountMinor;
    totals.set(e.currency, t);
  }
  const page = pageOf(params.page);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  return (
    <>
      <Header />
      <Filters ws={ws} />
      {rows.length === 0 ? (
        <EmptyState icon={<Landmark />} title="No ledger entries" description="Entries appear when you add accounts, sessions, tournaments, transactions or expenses." />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3 text-sm">
            {[...totals.entries()].map(([cur, t]) => (
              <div key={cur} className="rounded-lg border border-border bg-surface px-4 py-2">
                <span className="text-xs text-fg-muted">{cur} · {rows.filter((r) => r.currency === cur).length} entries</span>
                <div className="flex gap-4">
                  <span>In <Money amount={t.in} currency={cur} /></span>
                  <span>Out <Money amount={t.out} currency={cur} /></span>
                  <span className="font-semibold">Net <Money amount={t.in + t.out} currency={cur} signed /></span>
                </div>
              </div>
            ))}
          </div>
          <Card>
            <CardContent className="px-0 pb-2 pt-2">
              <LedgerTable rows={rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} />
            </CardContent>
          </Card>
          <Pagination page={page} pages={pages} basePath="/ledger" params={params} />
        </>
      )}
    </>
  );
}

function Header() {
  return (
    <PageHeader
      title="Ledger"
      description="Every money movement, derived from your records. Corrections are made by editing the source record; every change is kept in its history."
      actions={
        <ExportMenu entity="ledger" />
      }
    />
  );
}

function Filters({ ws }: { ws: Awaited<ReturnType<typeof getFinance>>["ws"] }) {
  return (
    <FilterBar
      searchPlaceholder="Search description, account…"
      fields={[
        { name: "class", label: "Type", options: CLASS_OPTIONS },
        { name: "account", label: "Account", options: ws.dataset.accounts.map((a) => ({ value: a.id, label: a.name })) },
      ]}
    />
  );
}
