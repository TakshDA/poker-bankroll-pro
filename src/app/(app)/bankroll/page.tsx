import Link from "next/link";
import { AlertTriangle, Archive, Trash2, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Money, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ConfirmAction } from "@/components/forms";
import { Stat } from "@/components/stat";
import { todayIn } from "@/lib/finance/dates";
import { drawdown } from "@/lib/finance/ledger";
import { computeDashboard } from "@/lib/finance/metrics";
import { resolveRange } from "@/lib/finance/dates";
import { dateLabel, money, moneyInput, pct, TRANSACTION_LABELS } from "@/lib/format";
import { getFinance } from "@/lib/server/workspace";
import { deleteTransactionAction, deleteTransferAction } from "./actions";
import { EditTransactionDialog, EditTransferDialog, NewAccountDialog, NewTransactionDialog, NewTransferDialog } from "./dialogs";

export const metadata = { title: "Bankroll" };

export default async function BankrollPage() {
  const { ws, ctx } = await getFinance();
  const today = todayIn(ws.settings.timezone);
  const m = computeDashboard(ctx, resolveRange("all", ws.settings.timezone));
  const cur = m.baseCurrency;
  const active = ws.dataset.accounts.filter((a) => !a.archived);
  const accountOptions = active.map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
  const allOptions = ws.dataset.accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
  const accName = new Map(ws.dataset.accounts.map((a) => [a.id, a]));
  const bankrollDd = drawdown(m.balanceHistory.map((p) => ({ date: p.date, value: p.balanceMinor })), m.balanceHistory[0]?.balanceMinor ?? 0);

  const movements = [
    ...ws.dataset.transactions.map((t) => ({ kind: "tx" as const, date: t.occurredOn, t })),
    ...ws.dataset.transfers.map((t) => ({ kind: "tr" as const, date: t.occurredOn, t })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 100);

  return (
    <>
      <PageHeader
        title="Bankroll"
        description="Accounts, deposits, withdrawals and transfers. Balances are derived from every record in the ledger."
        actions={
          <>
            <NewAccountDialog currencies={ws.settings.enabledCurrencies} categories={ws.bankrollCategories} today={today} defaultCurrency={ws.settings.baseCurrency} />
            <NewTransactionDialog accounts={accountOptions} today={today} />
            <NewTransferDialog accounts={accountOptions} today={today} />
          </>
        }
      />
      {ws.dataset.accounts.length === 0 ? (
        <EmptyState icon={<Wallet />} title="No accounts yet" description="Create an account with its opening balance to start tracking your bankroll." />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat large className="col-span-2 lg:col-span-1" label="Combined bankroll" tone="gold" value={money(m.currentBankroll.amountMinor, cur)} sub={m.currentBankroll.missingCurrencies.length ? `Excludes ${m.currentBankroll.missingCurrencies.join(", ")} (no rate)` : `In ${cur}`} />
            <Stat label="Peak bankroll" value={money(bankrollDd.peakMinor, cur)} sub={bankrollDd.peakDate ? dateLabel(bankrollDd.peakDate) : undefined} info="Highest combined balance reached (includes deposits and withdrawals)." />
            <Stat label="Max drawdown (results)" tone="negative" value={m.profitDrawdown.maxDrawdownMinor ? `−${money(m.profitDrawdown.maxDrawdownMinor, cur)}` : money(0, cur)} sub="Peak-to-trough of cumulative poker profit" info="Measured on cumulative net poker profit so that withdrawals are not mistaken for losses." />
            <Stat label="Net deposits" value={money(sumCapital(ctx, "deposit") - sumCapital(ctx, "withdrawal"), cur, { signed: true })} sub="Deposits − withdrawals (never profit)" />
          </section>

          <h2 className="mb-3 mt-8 text-sm font-semibold text-fg-muted">Accounts</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {m.accounts.map((a) => (
              <Link key={a.account.id} href={`/bankroll/${a.account.id}`} className="block">
                <Card className={a.account.archived ? "opacity-60" : "transition-colors hover:border-border-strong"}>
                  <CardHeader>
                    <div>
                      <CardTitle>{a.account.name}</CardTitle>
                      <CardDescription>
                        {a.account.currency}
                        {ws.bankrollCategories.find((c) => c.id === a.account.categoryId) ? ` · ${ws.bankrollCategories.find((c) => c.id === a.account.categoryId)!.name}` : ""}
                      </CardDescription>
                    </div>
                    {a.account.archived ? (
                      <Badge>
                        <Archive className="size-3" /> Archived
                      </Badge>
                    ) : a.belowMinimum ? (
                      <Badge tone="negative">
                        <AlertTriangle className="size-3" /> Below minimum
                      </Badge>
                    ) : null}
                  </CardHeader>
                  <CardContent>
                    <p className="num text-2xl font-semibold">{money(a.balanceMinor, a.account.currency)}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-fg-subtle">
                      {a.account.minBalanceMinor !== null ? <span>Min {money(a.account.minBalanceMinor, a.account.currency)}</span> : null}
                      {a.account.goalBalanceMinor ? <span>Goal {money(a.account.goalBalanceMinor, a.account.currency)} ({pct(a.goalProgressPct, 0)})</span> : null}
                    </div>
                    {a.account.goalBalanceMinor ? (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(a.goalProgressPct ?? 0)} aria-valuemin={0} aria-valuemax={100} aria-label="Goal progress">
                        <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, Math.max(0, a.goalProgressPct ?? 0))}%` }} />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <Card className="mt-8">
            <CardHeader>
              <div>
                <CardTitle>Deposits, withdrawals &amp; transfers</CardTitle>
                <CardDescription>Most recent 100. The full history with poker results and expenses is in the Ledger.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              {movements.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-fg-subtle">No money movements recorded yet.</p>
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <TH className="pl-5">Date</TH>
                      <TH>Type</TH>
                      <TH>Account</TH>
                      <TH>Description</TH>
                      <TH className="text-right">Amount</TH>
                      <TH className="pr-5" />
                    </tr>
                  </THead>
                  <TBody>
                    {movements.map((row) =>
                      row.kind === "tx" ? (
                        <TR key={row.t.id}>
                          <TD className="pl-5 text-fg-muted">{dateLabel(row.date)}</TD>
                          <TD>
                            <Badge tone={row.t.type === "deposit" || row.t.type === "withdrawal" ? "neutral" : row.t.type === "adjustment" ? "warning" : "gold"}>{TRANSACTION_LABELS[row.t.type]}</Badge>
                          </TD>
                          <TD className="text-fg-muted">{accName.get(row.t.accountId)?.name}</TD>
                          <TD className="max-w-60 truncate text-fg-muted">{row.t.description ?? ""}</TD>
                          <TD className="text-right">
                            <Money amount={row.t.type === "withdrawal" ? -row.t.amountMinor : row.t.amountMinor} currency={accName.get(row.t.accountId)?.currency ?? cur} signed />
                          </TD>
                          <TD className="pr-5 text-right">
                            <EditTransactionDialog
                              accounts={allOptions}
                              values={{
                                id: row.t.id,
                                accountId: row.t.accountId,
                                type: row.t.type,
                                amount: moneyInput(row.t.amountMinor, accName.get(row.t.accountId)?.currency ?? cur),
                                occurredOn: row.t.occurredOn,
                                description: row.t.description ?? "",
                                reference: "",
                              }}
                            />
                            <ConfirmAction action={deleteTransactionAction} id={row.t.id} title="Delete this transaction?" description="It moves to the Trash and balances are recalculated." confirmLabel="Move to Trash" triggerSize="icon">
                              <Trash2 />
                            </ConfirmAction>
                          </TD>
                        </TR>
                      ) : (
                        <TR key={row.t.id}>
                          <TD className="pl-5 text-fg-muted">{dateLabel(row.date)}</TD>
                          <TD>
                            <Badge tone="outline">Transfer</Badge>
                          </TD>
                          <TD className="text-fg-muted">
                            {accName.get(row.t.fromAccountId)?.name} → {accName.get(row.t.toAccountId)?.name}
                          </TD>
                          <TD className="max-w-60 truncate text-fg-muted">{row.t.description ?? ""}</TD>
                          <TD className="num text-right text-fg-muted">
                            {money(row.t.fromAmountMinor, accName.get(row.t.fromAccountId)?.currency ?? cur)}
                            {accName.get(row.t.fromAccountId)?.currency !== accName.get(row.t.toAccountId)?.currency ? ` → ${money(row.t.toAmountMinor, accName.get(row.t.toAccountId)?.currency ?? cur)}` : ""}
                          </TD>
                          <TD className="pr-5 text-right">
                            <EditTransferDialog
                              accounts={allOptions}
                              values={{
                                id: row.t.id,
                                fromAccountId: row.t.fromAccountId,
                                toAccountId: row.t.toAccountId,
                                fromAmount: moneyInput(row.t.fromAmountMinor, accName.get(row.t.fromAccountId)?.currency ?? cur),
                                toAmount: moneyInput(row.t.toAmountMinor, accName.get(row.t.toAccountId)?.currency ?? cur),
                                occurredOn: row.t.occurredOn,
                                description: row.t.description ?? "",
                              }}
                            />
                            <ConfirmAction action={deleteTransferAction} id={row.t.id} title="Delete this transfer?" description="Both legs are removed together." confirmLabel="Move to Trash" triggerSize="icon">
                              <Trash2 />
                            </ConfirmAction>
                          </TD>
                        </TR>
                      ),
                    )}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

function sumCapital(ctx: Awaited<ReturnType<typeof getFinance>>["ctx"], type: "deposit" | "withdrawal") {
  const base = ctx.ds.settings.baseCurrency;
  const cur = new Map(ctx.ds.accounts.map((a) => [a.id, a.currency]));
  let total = 0;
  for (const t of ctx.ds.transactions) {
    if (t.type !== type) continue;
    total += ctx.rates.convert(t.amountMinor, cur.get(t.accountId)!, base, t.occurredOn)?.amount ?? 0;
  }
  return total;
}
