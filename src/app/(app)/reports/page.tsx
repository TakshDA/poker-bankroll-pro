import Link from "next/link";
import { Archive, Download, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Money, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RangePicker } from "@/components/range-picker";
import { Stat } from "@/components/stat";
import { accountStatements } from "@/lib/finance/ledger";
import { computeDashboard } from "@/lib/finance/metrics";
import { perHourMinor } from "@/lib/finance/money";
import { dateLabel, duration, money, monthLabel } from "@/lib/format";
import { rangeFromParams } from "@/lib/server/range";
import { sp } from "@/lib/server/search-params";
import { getFinance } from "@/lib/server/workspace";

export const metadata = { title: "Reports & data" };

const DOWNLOADS: { entity: string; label: string; description: string; formats: string[]; dated: boolean }[] = [
  { entity: "ledger", label: "Bankroll ledger", description: "Every balance movement, by account", formats: ["csv", "xlsx", "pdf", "json"], dated: true },
  { entity: "sessions", label: "Cash sessions", description: "Buy-ins, cash-outs, hours, net", formats: ["csv", "xlsx", "pdf", "json"], dated: true },
  { entity: "tournaments", label: "Tournaments", description: "Entries, finishes, payouts, net", formats: ["csv", "xlsx", "pdf", "json"], dated: true },
  { entity: "expenses", label: "Expenses", description: "Category, vendor, refunds, net cost", formats: ["csv", "xlsx", "pdf", "json"], dated: true },
  { entity: "transactions", label: "Deposits & withdrawals", description: "Capital movements, bonuses, rakeback", formats: ["csv", "xlsx", "pdf", "json"], dated: true },
  { entity: "transfers", label: "Transfers", description: "Moves between your accounts", formats: ["csv", "xlsx", "pdf", "json"], dated: true },
  { entity: "accounts", label: "Account balances", description: "Current balance of each account", formats: ["csv", "xlsx", "pdf", "json"], dated: false },
];
const FORMAT_LABEL: Record<string, string> = { csv: "CSV", xlsx: "Excel", pdf: "PDF", json: "JSON" };

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const params = sp(await searchParams);
  const { ws, ctx } = await getFinance();
  const range = rangeFromParams(params, ws.settings, "month");
  const base = ws.settings.baseCurrency;
  const m = computeDashboard(ctx, range);
  const statements = accountStatements(ctx.ds, range, ctx.ledger);
  const accountName = new Map(ws.dataset.accounts.map((a) => [a.id, a.name]));
  const periodLabel = range.from || range.to ? `${range.from ? dateLabel(range.from) : "the start"} to ${dateLabel(range.to ?? m.today)}` : "all time";

  const exportHref = (entity: string, format: string, dated = true) => {
    const q = new URLSearchParams({ entity, format });
    if (dated && range.from) q.set("from", range.from);
    if (dated && range.to) q.set("to", range.to);
    return `/api/export?${q}`;
  };

  return (
    <>
      <PageHeader title="Reports & data" description={`Period report for ${periodLabel}. Profit figures in ${base}; account statements in each account's own currency.`} actions={<RangePicker current={range} />} />
      {m.missingCurrencies.length ? (
        <Alert tone="warning" className="mb-4">
          Amounts in {m.missingCurrencies.join(", ")} have no exchange rate into {base} and are left out of the profit summary. <Link href="/settings/currencies" className="underline">Add a rate</Link>.
        </Alert>
      ) : null}

      <section aria-labelledby="profit-heading">
        <h2 id="profit-heading" className="sr-only">
          Profit summary
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat large className="col-span-2 lg:col-span-1" label="Net poker profit" value={money(m.netPokerProfitMinor, base, { signed: true })} tone={m.netPokerProfitMinor > 0 ? "positive" : m.netPokerProfitMinor < 0 ? "negative" : "neutral"} sub={`${m.completedCount} results · ${duration(m.totalMinutes)} played`} info="Cash + tournaments + standalone bonuses and rakeback − expenses. Deposits, withdrawals and transfers are not profit." />
          <Stat label="Cash games" value={money(m.cashProfitMinor, base, { signed: true })} tone={m.cashProfitMinor >= 0 ? "positive" : "negative"} sub={m.cashHourlyMinor !== null ? `${money(m.cashHourlyMinor, base, { signed: true })}/h` : undefined} />
          <Stat label="Tournaments" value={money(m.tournamentProfitMinor, base, { signed: true })} tone={m.tournamentProfitMinor >= 0 ? "positive" : "negative"} sub={m.tournaments.count ? `${m.tournaments.count} played · ROI ${m.tournaments.roiPct !== null ? `${m.tournaments.roiPct.toFixed(1)}%` : "—"}` : "None in period"} />
          <Stat label="Expenses" value={money(-m.expensesMinor, base)} tone={m.expensesMinor > 0 ? "negative" : "neutral"} sub={m.pokerIncomeMinor ? `Bonuses & rakeback ${money(m.pokerIncomeMinor, base, { signed: true })}` : "Net of refunds"} />
        </div>
      </section>

      <Card className="mt-5">
        <CardHeader className="flex-col gap-1">
          <CardTitle>Account statements</CardTitle>
          <CardDescription>Opening balance plus every movement in the period equals the closing balance. Deposits, withdrawals and transfers change the balance but are not profit.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {statements.length === 0 ? (
            <p className="px-5 pb-3 text-sm text-fg-muted">
              No accounts yet. <Link href="/bankroll" className="underline">Create one</Link>.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH className="pl-5">Account</TH>
                    <TH className="text-right">Opening</TH>
                    <TH className="text-right">Deposits</TH>
                    <TH className="text-right">Withdrawals</TH>
                    <TH className="text-right">Transfers</TH>
                    <TH className="text-right">Poker</TH>
                    <TH className="text-right">Bonus/RB</TH>
                    <TH className="text-right">Expenses</TH>
                    <TH className="text-right">Adj.</TH>
                    <TH className="pr-5 text-right">Closing</TH>
                  </tr>
                </THead>
                <TBody>
                  {statements.map((s) => (
                    <TR key={s.accountId}>
                      <TD className="pl-5 whitespace-nowrap">
                        <Link href={`/bankroll/${s.accountId}`} className="hover:underline">
                          {accountName.get(s.accountId)}
                        </Link>{" "}
                        <span className="text-xs text-fg-subtle">{s.currency}</span>
                      </TD>
                      <TD className="num text-right whitespace-nowrap">{money(s.openingMinor, s.currency)}</TD>
                      <TD className="num text-right whitespace-nowrap text-fg-muted">{s.depositsMinor ? money(s.depositsMinor, s.currency, { signed: true }) : "—"}</TD>
                      <TD className="num text-right whitespace-nowrap text-fg-muted">{s.withdrawalsMinor ? money(s.withdrawalsMinor, s.currency, { signed: true }) : "—"}</TD>
                      <TD className="num text-right whitespace-nowrap text-fg-muted">{s.transfersMinor ? money(s.transfersMinor, s.currency, { signed: true }) : "—"}</TD>
                      <TD className="text-right whitespace-nowrap">{s.pokerMinor ? <Money amount={s.pokerMinor} currency={s.currency} signed /> : "—"}</TD>
                      <TD className="text-right whitespace-nowrap">{s.incomeMinor ? <Money amount={s.incomeMinor} currency={s.currency} signed /> : "—"}</TD>
                      <TD className="text-right whitespace-nowrap">{s.expensesMinor ? <Money amount={s.expensesMinor} currency={s.currency} signed /> : "—"}</TD>
                      <TD className="num text-right whitespace-nowrap text-fg-muted">{s.adjustmentsMinor ? money(s.adjustmentsMinor, s.currency, { signed: true }) : "—"}</TD>
                      <TD className="num pr-5 text-right font-semibold whitespace-nowrap">{money(s.closingMinor, s.currency)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader className="flex-col gap-1">
          <CardTitle>By month</CardTitle>
          <CardDescription>Net = cash + tournaments + bonuses/rakeback − expenses, in {base}.</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {m.monthly.length === 0 ? (
            <p className="px-5 pb-3 text-sm text-fg-muted">No results or expenses in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <tr>
                    <TH className="pl-5">Month</TH>
                    <TH className="text-right">Results</TH>
                    <TH className="text-right">Hours</TH>
                    <TH className="text-right">Cash</TH>
                    <TH className="text-right">Tournaments</TH>
                    <TH className="text-right">Bonus/RB</TH>
                    <TH className="text-right">Expenses</TH>
                    <TH className="text-right">Hourly</TH>
                    <TH className="pr-5 text-right">Net</TH>
                  </tr>
                </THead>
                <TBody>
                  {m.monthly.map((r) => (
                    <TR key={r.month}>
                      <TD className="pl-5 whitespace-nowrap">{monthLabel(r.month)}</TD>
                      <TD className="num text-right text-fg-muted">{r.sessions}</TD>
                      <TD className="num text-right text-fg-muted">{(r.minutes / 60).toFixed(1)}</TD>
                      <TD className="text-right whitespace-nowrap">
                        <Money amount={r.cashMinor} currency={base} signed />
                      </TD>
                      <TD className="text-right whitespace-nowrap">
                        <Money amount={r.tournamentMinor} currency={base} signed />
                      </TD>
                      <TD className="num text-right whitespace-nowrap text-fg-muted">{r.incomeMinor ? money(r.incomeMinor, base, { signed: true }) : "—"}</TD>
                      <TD className="num text-right whitespace-nowrap text-fg-muted">{r.expensesMinor ? money(-r.expensesMinor, base) : "—"}</TD>
                      <TD className="num text-right whitespace-nowrap text-fg-muted">{r.minutes ? money(perHourMinor(r.cashMinor + r.tournamentMinor, r.minutes) ?? 0, base, { signed: true }) : "—"}</TD>
                      <TD className="pr-5 text-right font-semibold whitespace-nowrap">
                        <Money amount={r.netMinor} currency={base} signed />
                      </TD>
                    </TR>
                  ))}
                  {m.monthly.length > 1 ? (
                    <TR className="border-t border-border font-semibold">
                      <TD className="pl-5">Total</TD>
                      <TD className="num text-right">{m.monthly.reduce((a, r) => a + r.sessions, 0)}</TD>
                      <TD className="num text-right">{(m.totalMinutes / 60).toFixed(1)}</TD>
                      <TD className="text-right whitespace-nowrap">
                        <Money amount={m.cashProfitMinor} currency={base} signed />
                      </TD>
                      <TD className="text-right whitespace-nowrap">
                        <Money amount={m.tournamentProfitMinor} currency={base} signed />
                      </TD>
                      <TD className="num text-right whitespace-nowrap">{m.pokerIncomeMinor ? money(m.pokerIncomeMinor, base, { signed: true }) : "—"}</TD>
                      <TD className="num text-right whitespace-nowrap">{m.expensesMinor ? money(-m.expensesMinor, base) : "—"}</TD>
                      <TD className="num text-right whitespace-nowrap">{m.hourlyMinor !== null ? money(m.hourlyMinor, base, { signed: true }) : "—"}</TD>
                      <TD className="pr-5 text-right whitespace-nowrap">
                        <Money amount={m.netPokerProfitMinor} currency={base} signed />
                      </TD>
                    </TR>
                  ) : null}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <section className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-col gap-1">
            <CardTitle>Download data for this period</CardTitle>
            <CardDescription>Uses the date range above. Money columns are exact decimals; PDF reports include per-currency totals.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <ul className="divide-y divide-border/60">
              {DOWNLOADS.map((d) => (
                <li key={d.entity} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{d.label}</p>
                    <p className="text-xs text-fg-muted">
                      {d.description}
                      {d.dated ? "" : " (not limited by date)"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {d.formats.map((f) => (
                      <a key={f} href={exportHref(d.entity, f, d.dated)} download className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label={`${d.label} as ${FORMAT_LABEL[f]}`}>
                        <Download className="size-3" aria-hidden /> {FORMAT_LABEL[f]}
                      </a>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-col gap-1">
            <CardTitle>Everything</CardTitle>
            <CardDescription>All tables at once, or a full backup you can keep offline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <a href={exportHref("all", "xlsx")} download className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-surface-2">
              <FileSpreadsheet className="size-5 text-positive" aria-hidden />
              <span>
                <span className="block text-sm font-medium">Excel workbook</span>
                <span className="block text-xs text-fg-muted">One sheet per table, this period</span>
              </span>
            </a>
            <a href={exportHref("all", "json")} download className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-surface-2">
              <Download className="size-5 text-fg-muted" aria-hidden />
              <span>
                <span className="block text-sm font-medium">JSON (all tables)</span>
                <span className="block text-xs text-fg-muted">This period, exact minor units</span>
              </span>
            </a>
            <a href="/api/export?entity=backup&format=json" download className="flex items-center gap-3 rounded-lg border border-gold/40 p-3 hover:bg-surface-2">
              <Archive className="size-5 text-gold" aria-hidden />
              <span>
                <span className="block text-sm font-medium">Full backup (JSON)</span>
                <span className="block text-xs text-fg-muted">Every record, including deleted ones. Ignores the date range.</span>
              </span>
            </a>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
