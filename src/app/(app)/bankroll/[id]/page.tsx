import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ConfirmAction } from "@/components/forms";
import { CumulativeChart } from "@/components/charts";
import { LedgerTable, type LedgerRow } from "@/components/records/ledger-table";
import { Stat } from "@/components/stat";
import { drawdown, LEDGER_CLASS } from "@/lib/finance/ledger";
import { todayIn } from "@/lib/finance/dates";
import { addMinor } from "@/lib/finance/money";
import { dateLabel, money, moneyInput } from "@/lib/format";
import { isUuid } from "@/lib/server/db";
import { getFinance } from "@/lib/server/workspace";
import { archiveAccountAction, deleteAccountAction, unarchiveAccountAction } from "../actions";
import { EditAccountDialog, NewTransactionDialog, NewTransferDialog } from "../dialogs";

export const metadata = { title: "Account" };

export default async function AccountPage({ params }: PageProps<"/bankroll/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { ws, ctx } = await getFinance();
  const account = ws.dataset.accounts.find((a) => a.id === id);
  if (!account) notFound();
  const cur = account.currency;
  const today = todayIn(ws.settings.timezone);

  const entries: LedgerRow[] = [];
  for (const e of ctx.ledger) {
    if (e.accountId !== id) continue;
    const prev = entries.at(-1)?.balanceMinor ?? 0;
    entries.push({ ...e, accountName: account.name, balanceMinor: addMinor(prev, e.amountMinor) });
  }
  const balance = entries.at(-1)?.balanceMinor ?? 0;
  const daily = new Map<string, number>();
  for (const e of entries) daily.set(e.date, e.balanceMinor!);
  const series = [...daily.entries()].map(([date, value]) => ({ date, balance: value }));
  const dd = drawdown(series.map((p) => ({ date: p.date, value: p.balance })), series[0]?.balance ?? 0);
  const pokerNet = entries.filter((e) => ["poker", "poker_income", "expense"].includes(LEDGER_CLASS[e.kind])).reduce((s, e) => s + e.amountMinor, 0);
  const capital = entries.filter((e) => LEDGER_CLASS[e.kind] === "capital").reduce((s, e) => s + e.amountMinor, 0);
  const transfers = entries.filter((e) => LEDGER_CLASS[e.kind] === "transfer").reduce((s, e) => s + e.amountMinor, 0);
  const adjustments = entries.filter((e) => LEDGER_CLASS[e.kind] === "adjustment").reduce((s, e) => s + e.amountMinor, 0);
  const options = ws.dataset.accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name, currency: a.currency }));
  const hasRecords = entries.some((e) => e.kind !== "opening");

  return (
    <>
      <PageHeader
        title={account.name}
        description={`${cur} account${account.archived ? " · archived" : ""}`}
        actions={
          <>
            <NewTransactionDialog accounts={options} today={today} accountId={id} />
            <NewTransferDialog accounts={options} today={today} fromId={id} />
            <EditAccountDialog
              currencies={ws.settings.enabledCurrencies.includes(cur) ? ws.settings.enabledCurrencies : [...ws.settings.enabledCurrencies, cur]}
              categories={ws.bankrollCategories}
              locked={hasRecords}
              values={{
                id,
                name: account.name,
                currency: cur,
                categoryId: account.categoryId ?? "",
                openingBalance: moneyInput(account.openingBalanceMinor, cur),
                openingDate: account.openingDate,
                minBalance: moneyInput(account.minBalanceMinor, cur),
                goalBalance: moneyInput(account.goalBalanceMinor, cur),
                notes: account.notes ?? "",
              }}
            />
            {account.archived ? (
              <ConfirmAction action={unarchiveAccountAction} id={id} title="Restore this account?" confirmLabel="Restore" variant="primary" triggerVariant="secondary">
                <ArchiveRestore /> Unarchive
              </ConfirmAction>
            ) : (
              <ConfirmAction action={archiveAccountAction} id={id} title="Archive this account?" description="Archived accounts are hidden from forms but their balance still counts in your bankroll and history." confirmLabel="Archive" variant="secondary" triggerVariant="secondary">
                <Archive /> Archive
              </ConfirmAction>
            )}
            <ConfirmAction action={deleteAccountAction} id={id} title="Delete this account?" description="Only possible when no records (including trashed ones) use it. Otherwise archive it." confirmLabel="Delete account">
              <Trash2 /> Delete
            </ConfirmAction>
          </>
        }
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat large className="col-span-2 lg:col-span-1" label="Balance" tone="gold" value={money(balance, cur)} sub={account.minBalanceMinor !== null ? `Minimum ${money(account.minBalanceMinor, cur)}` : undefined} />
        <Stat label="Poker results" value={money(pokerNet, cur, { signed: true })} tone={pokerNet > 0 ? "positive" : pokerNet < 0 ? "negative" : "neutral"} sub="Results + bonuses − expenses" />
        <Stat label="Capital in / out" value={money(capital, cur, { signed: true })} sub={`Opening + deposits − withdrawals · transfers ${money(transfers, cur, { signed: true })}${adjustments ? ` · adj. ${money(adjustments, cur, { signed: true })}` : ""}`} />
        <Stat label="Peak / max drawdown" value={money(dd.peakMinor, cur)} sub={`Largest drop ${money(dd.maxDrawdownMinor, cur)}${dd.peakDate ? ` · peak ${dateLabel(dd.peakDate)}` : ""}`} />
      </section>
      <Card className="mt-5">
        <CardHeader>
          <div>
            <CardTitle>Balance history</CardTitle>
            <CardDescription>Reconciles exactly with the ledger below</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {series.length > 1 ? <CumulativeChart data={series} currency={cur} valueKey="balance" label="Balance" color="var(--gold)" /> : <p className="py-10 text-center text-sm text-fg-subtle">Not enough history yet.</p>}
        </CardContent>
      </Card>
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Ledger ({entries.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {entries.length ? <LedgerTable rows={[...entries].reverse()} showBalance showAccount={false} /> : <p className="px-5 pb-4 text-sm text-fg-subtle">No entries.</p>}
        </CardContent>
      </Card>
    </>
  );
}
