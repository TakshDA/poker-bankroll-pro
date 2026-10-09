/**
 * The bankroll ledger is DERIVED from source records rather than stored as a
 * second copy, so account balances always reconcile with the ledger by
 * construction:
 *
 *   balance(account) = Σ ledger entries for the account
 *                    = opening balance + deposits − withdrawals
 *                      ± transfers + poker results + bonuses/rakeback
 *                      − expenses ± adjustments
 */
import { localDate } from "./dates";
import { RateTable } from "./fx";
import { assertMinor, sumMinor, type Minor } from "./money";
import { cashSessionCounts, cashSessionNet, expenseNet, tournamentAffectsBankroll, tournamentNet } from "./records";
import type { Dataset } from "./types";

export type LedgerKind =
  | "opening"
  | "deposit"
  | "withdrawal"
  | "transfer_in"
  | "transfer_out"
  | "cash_result"
  | "tournament_result"
  | "bonus"
  | "rakeback"
  | "expense"
  | "adjustment";

/** How an entry is classified for profit reporting. */
export type LedgerClass = "capital" | "transfer" | "poker" | "poker_income" | "expense" | "adjustment";

export const LEDGER_CLASS: Record<LedgerKind, LedgerClass> = {
  opening: "capital",
  deposit: "capital",
  withdrawal: "capital",
  transfer_in: "transfer",
  transfer_out: "transfer",
  cash_result: "poker",
  tournament_result: "poker",
  bonus: "poker_income",
  rakeback: "poker_income",
  expense: "expense",
  adjustment: "adjustment",
};

export interface LedgerEntry {
  key: string; // stable unique key
  date: string; // YYYY-MM-DD
  accountId: string;
  currency: string;
  amountMinor: Minor; // signed effect on the account
  kind: LedgerKind;
  sourceType: "account" | "transaction" | "transfer" | "session" | "tournament" | "expense";
  sourceId: string;
  description: string;
}

export function buildLedger(ds: Dataset): LedgerEntry[] {
  const tz = ds.settings.timezone;
  const accounts = new Map(ds.accounts.map((a) => [a.id, a]));
  const entries: LedgerEntry[] = [];
  const cur = (accountId: string) => {
    const a = accounts.get(accountId);
    if (!a) throw new Error(`Record references unknown account ${accountId}`);
    return a.currency;
  };

  for (const a of ds.accounts) {
    if (a.openingBalanceMinor !== 0) {
      entries.push({
        key: `opening:${a.id}`,
        date: a.openingDate,
        accountId: a.id,
        currency: a.currency,
        amountMinor: a.openingBalanceMinor,
        kind: "opening",
        sourceType: "account",
        sourceId: a.id,
        description: `Opening balance – ${a.name}`,
      });
    }
  }

  for (const t of ds.transactions) {
    const sign = t.type === "withdrawal" ? -1 : 1;
    const amount = t.type === "adjustment" ? t.amountMinor : sign * Math.abs(t.amountMinor);
    entries.push({
      key: `transaction:${t.id}`,
      date: t.occurredOn,
      accountId: t.accountId,
      currency: cur(t.accountId),
      amountMinor: amount,
      kind: t.type,
      sourceType: "transaction",
      sourceId: t.id,
      description: t.description ?? labelForKind(t.type),
    });
  }

  for (const tr of ds.transfers) {
    entries.push({
      key: `transfer:${tr.id}:out`,
      date: tr.occurredOn,
      accountId: tr.fromAccountId,
      currency: cur(tr.fromAccountId),
      amountMinor: -tr.fromAmountMinor,
      kind: "transfer_out",
      sourceType: "transfer",
      sourceId: tr.id,
      description: tr.description ?? `Transfer to ${accounts.get(tr.toAccountId)?.name ?? "account"}`,
    });
    entries.push({
      key: `transfer:${tr.id}:in`,
      date: tr.occurredOn,
      accountId: tr.toAccountId,
      currency: cur(tr.toAccountId),
      amountMinor: tr.toAmountMinor,
      kind: "transfer_in",
      sourceType: "transfer",
      sourceId: tr.id,
      description: tr.description ?? `Transfer from ${accounts.get(tr.fromAccountId)?.name ?? "account"}`,
    });
  }

  for (const s of ds.cashSessions) {
    if (!cashSessionCounts(s)) continue;
    const net = cashSessionNet(s);
    if (net === null) continue;
    entries.push({
      key: `session:${s.id}`,
      date: localDate(s.startedAt, tz),
      accountId: s.accountId,
      currency: cur(s.accountId),
      amountMinor: net,
      kind: "cash_result",
      sourceType: "session",
      sourceId: s.id,
      description: "Cash game result",
    });
  }

  for (const t of ds.tournaments) {
    if (!tournamentAffectsBankroll(t)) continue;
    entries.push({
      key: `tournament:${t.id}`,
      date: t.startDate,
      accountId: t.accountId,
      currency: cur(t.accountId),
      amountMinor: tournamentNet(t),
      kind: "tournament_result",
      sourceType: "tournament",
      sourceId: t.id,
      description: `Tournament – ${t.name}${t.status === "in_progress" ? " (in progress)" : t.status === "cancelled" ? " (cancelled)" : ""}`,
    });
  }

  for (const e of ds.expenses) {
    const net = expenseNet(e);
    if (net === 0) continue;
    entries.push({
      key: `expense:${e.id}`,
      date: e.occurredOn,
      accountId: e.accountId,
      currency: cur(e.accountId),
      amountMinor: -net,
      kind: "expense",
      sourceType: "expense",
      sourceId: e.id,
      description: e.description ?? e.categoryName,
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || kindOrder(a.kind) - kindOrder(b.kind) || a.key.localeCompare(b.key));
  return entries;
}

function kindOrder(k: LedgerKind): number {
  return k === "opening" ? 0 : k === "deposit" ? 1 : 2;
}

export function labelForKind(kind: LedgerKind): string {
  return {
    opening: "Opening balance",
    deposit: "Deposit",
    withdrawal: "Withdrawal",
    transfer_in: "Transfer in",
    transfer_out: "Transfer out",
    cash_result: "Cash game",
    tournament_result: "Tournament",
    bonus: "Bonus",
    rakeback: "Rakeback",
    expense: "Expense",
    adjustment: "Adjustment",
  }[kind];
}

/** Balance per account in its own currency (optionally as of a date). */
export function accountBalances(ds: Dataset, ledger = buildLedger(ds), asOf?: string): Map<string, Minor> {
  const balances = new Map<string, Minor>(ds.accounts.map((a) => [a.id, 0]));
  for (const e of ledger) {
    if (asOf && e.date > asOf) continue;
    const next = (balances.get(e.accountId) ?? 0) + e.amountMinor;
    assertMinor(next, "balance");
    balances.set(e.accountId, next);
  }
  return balances;
}

export interface CombinedTotal {
  amountMinor: Minor;
  currency: string;
  /** Account currencies that could not be converted (no rate). */
  missingCurrencies: string[];
  usedFallbackRate: boolean;
}

/** Sum of account balances converted to the base currency as of a date. */
export function combinedBalance(ds: Dataset, asOf: string, ledger = buildLedger(ds), rates = new RateTable(ds.rates)): CombinedTotal {
  const balances = accountBalances(ds, ledger, asOf);
  const base = ds.settings.baseCurrency;
  const missing = new Set<string>();
  let fallback = false;
  const parts: Minor[] = [];
  for (const a of ds.accounts) {
    const bal = balances.get(a.id) ?? 0;
    if (bal === 0) continue;
    const c = rates.convert(bal, a.currency, base, asOf);
    if (!c) {
      missing.add(a.currency);
      continue;
    }
    if (c.quality === "fallback") fallback = true;
    parts.push(c.amount);
  }
  return { amountMinor: sumMinor(parts), currency: base, missingCurrencies: [...missing], usedFallbackRate: fallback };
}

export interface BalancePoint {
  date: string;
  balanceMinor: Minor; // base currency
}

/**
 * Daily combined bankroll balance (base currency) on every date that has a
 * ledger entry. Each account's running balance is converted at the rate in
 * effect on that date.
 */
export function balanceHistory(ds: Dataset, ledger = buildLedger(ds), rates = new RateTable(ds.rates)): BalancePoint[] {
  const base = ds.settings.baseCurrency;
  const accountCurrency = new Map(ds.accounts.map((a) => [a.id, a.currency]));
  const running = new Map<string, Minor>();
  const points: BalancePoint[] = [];
  let i = 0;
  while (i < ledger.length) {
    const date = ledger[i].date;
    while (i < ledger.length && ledger[i].date === date) {
      const e = ledger[i];
      running.set(e.accountId, (running.get(e.accountId) ?? 0) + e.amountMinor);
      i++;
    }
    let total = 0;
    for (const [accountId, bal] of running) {
      const c = rates.convert(bal, accountCurrency.get(accountId)!, base, date);
      if (c) total += c.amount;
    }
    assertMinor(total, "balance");
    points.push({ date, balanceMinor: total });
  }
  return points;
}

export interface DrawdownStats {
  peakMinor: Minor;
  peakDate: string | null;
  maxDrawdownMinor: Minor; // positive number = size of the largest drop
  maxDrawdownFrom: string | null;
  maxDrawdownTo: string | null;
  currentDrawdownMinor: Minor;
}

/** Peak and maximum peak-to-trough decline of a series. */
export function drawdown(series: { date: string; value: Minor }[], startValue: Minor = 0): DrawdownStats {
  let peak = startValue;
  let peakDate: string | null = null;
  let maxDd = 0;
  let ddFrom: string | null = null;
  let ddTo: string | null = null;
  let current = 0;
  let candidatePeakDate: string | null = null;
  for (const p of series) {
    if (p.value > peak) {
      peak = p.value;
      peakDate = p.date;
      candidatePeakDate = p.date;
    }
    current = peak - p.value;
    if (current > maxDd) {
      maxDd = current;
      ddFrom = candidatePeakDate;
      ddTo = p.date;
    }
  }
  return { peakMinor: peak, peakDate, maxDrawdownMinor: maxDd, maxDrawdownFrom: ddFrom, maxDrawdownTo: ddTo, currentDrawdownMinor: current };
}
