/**
 * Aggregate metrics shared by the dashboard, reports and analytics pages.
 * Formulas are documented in docs/FINANCIAL_RULES.md.
 */
import { inRange, localDate, monthKey, todayIn, type DateRange } from "./dates";
import { RateTable } from "./fx";
import { balanceHistory, buildLedger, combinedBalance, accountBalances, drawdown, type CombinedTotal, type DrawdownStats, type BalancePoint, type LedgerEntry } from "./ledger";
import { averageMinor, divRoundMinor, percent, perHourMinor, sumMinor, type Minor } from "./money";
import { expenseNet } from "./records";
import { buildResults, type PokerResult } from "./results";
import { streaks, type StreakSummary } from "./stats";
import type { Account, Dataset } from "./types";

export interface TournamentSummary {
  count: number; // completed tournaments
  cashes: number;
  itmPct: number | null;
  investmentMinor: Minor; // completed only
  returnMinor: Minor; // payouts + bounties, completed only
  payoutMinor: Minor;
  bountiesMinor: Minor;
  netMinor: Minor; // completed only
  roiPct: number | null;
  avgBuyInMinor: Minor | null; // average face buy-in (first bullet buy-in + fee)
  avgInvestmentMinor: Minor | null;
  avgCashMinor: Minor | null; // average prize payout among cashes
  entries: number;
}

/**
 * ROI% = Σ net ÷ Σ investment × 100 over completed tournaments.
 * ITM% = cashes ÷ completed tournaments × 100.
 */
export function summarizeTournaments(results: PokerResult[]): TournamentSummary {
  const done = results.filter((r) => r.kind === "tournament" && r.countsInStats);
  const cashes = done.filter((r) => r.cashed);
  const investment = sumMinor(done.map((r) => r.investedMinor));
  const ret = sumMinor(done.map((r) => r.payoutMinor + r.bountiesMinor));
  const net = sumMinor(done.map((r) => r.netMinor));
  return {
    count: done.length,
    cashes: cashes.length,
    itmPct: percent(cashes.length, done.length),
    investmentMinor: investment,
    returnMinor: ret,
    payoutMinor: sumMinor(done.map((r) => r.payoutMinor)),
    bountiesMinor: sumMinor(done.map((r) => r.bountiesMinor)),
    netMinor: net,
    roiPct: investment > 0 ? percent(net, investment) : null,
    avgBuyInMinor: averageMinor(done.map((r) => r.faceBuyInMinor)),
    avgInvestmentMinor: averageMinor(done.map((r) => r.investedMinor)),
    avgCashMinor: averageMinor(cashes.map((r) => r.payoutMinor)),
    entries: done.reduce((a, r) => a + r.entriesCount, 0),
  };
}

/** Buy-in levels in major units of the base currency (lower bounds). */
export const BUY_IN_LEVELS = [0, 10, 30, 100, 300, 1000, 3000] as const;

/** Index into BUY_IN_LEVELS for a face buy-in (buy-in + fee of the first entry). */
export function buyInLevel(faceBuyInMinor: Minor, digits: number): number {
  let level = 0;
  BUY_IN_LEVELS.forEach((lower, i) => {
    if (faceBuyInMinor >= lower * 10 ** digits) level = i;
  });
  return level;
}

export interface TournamentGroupRow extends TournamentSummary {
  key: string;
  label: string;
}

/** Tournament summary (ROI, ITM, ...) per group. Only completed events count. */
export function groupTournaments(results: PokerResult[], keyOf: (r: PokerResult) => string | null, labelOf: (key: string) => string = (k) => k): TournamentGroupRow[] {
  const groups = new Map<string, PokerResult[]>();
  for (const r of results) {
    if (r.kind !== "tournament" || !r.countsInStats) continue;
    const k = keyOf(r) ?? "__none__";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups].map(([key, list]) => ({ key, label: key === "__none__" ? "Unspecified" : labelOf(key), ...summarizeTournaments(list) }));
}

export interface GroupRow {
  key: string;
  label: string;
  netMinor: Minor;
  count: number;
  minutes: number;
  hourlyMinor: Minor | null;
  wins: number;
  winRatePct: number | null;
  avgMinor: Minor | null;
  /** bb/100 over results with known hands and big blind (cash only). */
  bbPer100: number | null;
  handsCovered: number;
  investedMinor: Minor;
  roiPct: number | null;
}

/** Group results by an arbitrary key and summarise each group. */
export function groupResults(
  results: PokerResult[],
  keyOf: (r: PokerResult) => string | null,
  labelOf: (key: string) => string = (k) => k,
): GroupRow[] {
  const groups = new Map<string, PokerResult[]>();
  for (const r of results) {
    const k = keyOf(r) ?? "__none__";
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  const rows: GroupRow[] = [];
  for (const [key, list] of groups) {
    const net = sumMinor(list.map((r) => r.netMinor));
    const minutes = list.reduce((a, r) => a + r.minutes, 0);
    const stat = list.filter((r) => r.countsInStats);
    const wins = stat.filter((r) => r.netMinor > 0).length;
    const invested = sumMinor(list.map((r) => r.investedMinor));
    rows.push({
      key,
      label: key === "__none__" ? "Unspecified" : labelOf(key),
      netMinor: net,
      count: list.length,
      minutes,
      hourlyMinor: perHourMinor(net, minutes),
      wins,
      winRatePct: percent(wins, stat.length),
      avgMinor: averageMinor(list.map((r) => r.netMinor)),
      ...bbPer100ForGroup(list),
      investedMinor: invested,
      roiPct: list.every((r) => r.kind === "tournament") && invested > 0 ? percent(net, invested) : null,
    });
  }
  return rows.sort((a, b) => b.netMinor - a.netMinor);
}

/**
 * bb/100 = Σ (net_i ÷ bb_i) ÷ Σ hands × 100, using ORIGINAL-currency nets and
 * only sessions where hands played and the big blind are recorded.
 */
export function bbPer100ForGroup(list: PokerResult[]): { bbPer100: number | null; handsCovered: number } {
  let bbWon = 0;
  let hands = 0;
  for (const r of list) {
    if (r.kind !== "cash" || !r.handsPlayed || r.handsPlayed <= 0 || !r.bigBlindMinor || r.bigBlindMinor <= 0) continue;
    bbWon += r.originalNetMinor / r.bigBlindMinor;
    hands += r.handsPlayed;
  }
  return { bbPer100: hands > 0 ? (bbWon / hands) * 100 : null, handsCovered: hands };
}

export interface MonthRow {
  month: string; // YYYY-MM
  cashMinor: Minor;
  tournamentMinor: Minor;
  incomeMinor: Minor; // standalone bonus + rakeback
  expensesMinor: Minor; // positive cost
  netMinor: Minor; // net poker profit
  minutes: number;
  sessions: number;
}

export interface CumulativePoint {
  date: string;
  dailyMinor: Minor;
  cumulativeMinor: Minor;
}

export interface AccountStatus {
  account: Account;
  balanceMinor: Minor;
  belowMinimum: boolean;
  goalProgressPct: number | null;
}

export interface DashboardMetrics {
  baseCurrency: string;
  range: DateRange;
  today: string;
  currentBankroll: CombinedTotal;
  accounts: AccountStatus[];
  netPokerProfitMinor: Minor;
  cashProfitMinor: Minor;
  tournamentProfitMinor: Minor;
  pokerIncomeMinor: Minor;
  sessionBonusMinor: Minor;
  expensesMinor: Minor;
  rakePaidMinor: Minor;
  totalMinutes: number;
  cashMinutes: number;
  tournamentMinutes: number;
  hourlyMinor: Minor | null;
  cashHourlyMinor: Minor | null;
  completedCount: number;
  winningCount: number;
  winningPct: number | null;
  avgResultMinor: Minor | null;
  tournaments: TournamentSummary;
  best: PokerResult | null;
  worst: PokerResult | null;
  streaks: StreakSummary;
  monthly: MonthRow[];
  cumulative: CumulativePoint[];
  profitDrawdown: DrawdownStats;
  balanceHistory: BalancePoint[];
  bankrollDrawdown: DrawdownStats;
  results: PokerResult[]; // in range, chronological
  missingCurrencies: string[];
  usedFallbackRate: boolean;
}

export interface FinanceContext {
  ds: Dataset;
  rates: RateTable;
  ledger: LedgerEntry[];
  allResults: PokerResult[];
  missingCurrencies: string[];
  usedFallbackRate: boolean;
}

export function createContext(ds: Dataset): FinanceContext {
  const rates = new RateTable(ds.rates);
  const ledger = buildLedger(ds);
  const rs = buildResults(ds, rates);
  return { ds, rates, ledger, allResults: rs.results, missingCurrencies: rs.missingCurrencies, usedFallbackRate: rs.usedFallbackRate };
}

export function computeDashboard(ctx: FinanceContext, range: DateRange, now = new Date()): DashboardMetrics {
  const { ds, rates, ledger } = ctx;
  const base = ds.settings.baseCurrency;
  const today = todayIn(ds.settings.timezone, now);
  const missing = new Set(ctx.missingCurrencies);
  let fallback = ctx.usedFallbackRate;
  const accountCurrency = new Map(ds.accounts.map((a) => [a.id, a.currency]));

  const results = ctx.allResults.filter((r) => inRange(r.date, range));
  const cash = results.filter((r) => r.kind === "cash");
  const tourn = results.filter((r) => r.kind === "tournament");

  // Standalone poker income (bonus / rakeback transactions) and expenses.
  const byMonthIncome = new Map<string, Minor>();
  const byMonthExpense = new Map<string, Minor>();
  const income: Minor[] = [];
  for (const t of ds.transactions) {
    if ((t.type !== "bonus" && t.type !== "rakeback") || !inRange(t.occurredOn, range)) continue;
    const c = rates.convert(t.amountMinor, accountCurrency.get(t.accountId)!, base, t.occurredOn);
    if (!c) {
      missing.add(accountCurrency.get(t.accountId)!);
      continue;
    }
    if (c.quality === "fallback") fallback = true;
    income.push(c.amount);
    byMonthIncome.set(monthKey(t.occurredOn), (byMonthIncome.get(monthKey(t.occurredOn)) ?? 0) + c.amount);
  }
  const expenses: Minor[] = [];
  for (const e of ds.expenses) {
    if (!inRange(e.occurredOn, range)) continue;
    const c = rates.convert(expenseNet(e), accountCurrency.get(e.accountId)!, base, e.occurredOn);
    if (!c) {
      missing.add(accountCurrency.get(e.accountId)!);
      continue;
    }
    if (c.quality === "fallback") fallback = true;
    expenses.push(c.amount);
    byMonthExpense.set(monthKey(e.occurredOn), (byMonthExpense.get(monthKey(e.occurredOn)) ?? 0) + c.amount);
  }

  const cashProfit = sumMinor(cash.map((r) => r.netMinor));
  const tournamentProfit = sumMinor(tourn.map((r) => r.netMinor));
  const pokerIncome = sumMinor(income);
  const expenseTotal = sumMinor(expenses);
  const netPokerProfit = cashProfit + tournamentProfit + pokerIncome - expenseTotal;

  const cashMinutes = cash.reduce((a, r) => a + r.minutes, 0);
  const tournamentMinutes = tourn.reduce((a, r) => a + r.minutes, 0);
  const totalMinutes = cashMinutes + tournamentMinutes;

  const statResults = results.filter((r) => r.countsInStats);
  const winning = statResults.filter((r) => r.netMinor > 0);
  const sortedByNet = [...statResults].sort((a, b) => b.netMinor - a.netMinor);

  // Session-level bonus/rakeback already inside cash results (for display).
  const cashIds = new Set(cash.map((r) => r.id));
  const sessionBonusParts: Minor[] = [];
  for (const s of ds.cashSessions) {
    if (!cashIds.has(s.id)) continue;
    const c = rates.convert(s.bonusMinor + s.rakebackMinor, accountCurrency.get(s.accountId) ?? s.currency, base, localDate(s.startedAt, ds.settings.timezone));
    if (c) sessionBonusParts.push(c.amount);
  }

  // Monthly performance
  const months = new Map<string, MonthRow>();
  const month = (m: string) => {
    let row = months.get(m);
    if (!row) {
      row = { month: m, cashMinor: 0, tournamentMinor: 0, incomeMinor: 0, expensesMinor: 0, netMinor: 0, minutes: 0, sessions: 0 };
      months.set(m, row);
    }
    return row;
  };
  for (const r of results) {
    const row = month(monthKey(r.date));
    if (r.kind === "cash") row.cashMinor += r.netMinor;
    else row.tournamentMinor += r.netMinor;
    row.minutes += r.minutes;
    row.sessions += 1;
  }
  for (const [m, v] of byMonthIncome) month(m).incomeMinor += v;
  for (const [m, v] of byMonthExpense) month(m).expensesMinor += v;
  for (const row of months.values()) row.netMinor = row.cashMinor + row.tournamentMinor + row.incomeMinor - row.expensesMinor;
  const monthly = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));

  // Cumulative net poker profit by day (results + income − expenses)
  const daily = new Map<string, Minor>();
  const bump = (d: string, v: Minor) => daily.set(d, (daily.get(d) ?? 0) + v);
  for (const r of results) bump(r.date, r.netMinor);
  for (const t of ds.transactions) {
    if ((t.type === "bonus" || t.type === "rakeback") && inRange(t.occurredOn, range)) {
      const c = rates.convert(t.amountMinor, accountCurrency.get(t.accountId)!, base, t.occurredOn);
      if (c) bump(t.occurredOn, c.amount);
    }
  }
  for (const e of ds.expenses) {
    if (!inRange(e.occurredOn, range)) continue;
    const c = rates.convert(expenseNet(e), accountCurrency.get(e.accountId)!, base, e.occurredOn);
    if (c) bump(e.occurredOn, -c.amount);
  }
  let running = 0;
  const cumulative: CumulativePoint[] = [...daily.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => {
      running += v;
      return { date, dailyMinor: v, cumulativeMinor: running };
    });

  // Bankroll (all-time, not range-filtered: a balance is a point-in-time value)
  const balances = accountBalances(ds, ledger);
  const accounts: AccountStatus[] = ds.accounts.map((a) => {
    const bal = balances.get(a.id) ?? 0;
    return {
      account: a,
      balanceMinor: bal,
      belowMinimum: a.minBalanceMinor !== null && bal < a.minBalanceMinor,
      goalProgressPct: a.goalBalanceMinor ? percent(bal, a.goalBalanceMinor) : null,
    };
  });
  const history = balanceHistory(ds, ledger, rates);
  const historyInRange = history.filter((p) => inRange(p.date, range));

  return {
    baseCurrency: base,
    range,
    today,
    // "Current" includes every recorded entry, even one dated later than today.
    currentBankroll: combinedBalance(ds, maxDate(today, ledger.at(-1)?.date), ledger, rates),
    accounts,
    netPokerProfitMinor: netPokerProfit,
    cashProfitMinor: cashProfit,
    tournamentProfitMinor: tournamentProfit,
    pokerIncomeMinor: pokerIncome,
    sessionBonusMinor: sumMinor(sessionBonusParts),
    expensesMinor: expenseTotal,
    rakePaidMinor: sumMinor(cash.map((r) => r.rakeMinor)),
    totalMinutes,
    cashMinutes,
    tournamentMinutes,
    hourlyMinor: perHourMinor(cashProfit + tournamentProfit, totalMinutes),
    cashHourlyMinor: perHourMinor(cashProfit, cashMinutes),
    completedCount: statResults.length,
    winningCount: winning.length,
    winningPct: percent(winning.length, statResults.length),
    avgResultMinor: statResults.length ? divRoundMinor(sumMinor(statResults.map((r) => r.netMinor)), statResults.length) : null,
    tournaments: summarizeTournaments(results),
    best: sortedByNet[0] ?? null,
    worst: sortedByNet.length ? sortedByNet[sortedByNet.length - 1] : null,
    streaks: streaks(statResults.map((r) => r.netMinor)),
    monthly,
    cumulative,
    profitDrawdown: drawdown(cumulative.map((p) => ({ date: p.date, value: p.cumulativeMinor }))),
    balanceHistory: historyInRange,
    bankrollDrawdown: drawdown(
      historyInRange.map((p) => ({ date: p.date, value: p.balanceMinor })),
      historyInRange[0]?.balanceMinor ?? 0,
    ),
    results,
    missingCurrencies: [...missing],
    usedFallbackRate: fallback,
  };
}

function maxDate(a: string, b: string | undefined): string {
  return b && b > a ? b : a;
}
