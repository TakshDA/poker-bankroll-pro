/** Builders for finance-engine tests. */
import type { Account, CashSession, Dataset, Expense, Tournament, TournamentEntry, Transaction, Transfer } from "./types";

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

export function account(over: Partial<Account> = {}): Account {
  return {
    id: id("acc"),
    name: "Main",
    currency: "CAD",
    openingBalanceMinor: 0,
    openingDate: "2026-01-01",
    minBalanceMinor: null,
    goalBalanceMinor: null,
    categoryId: null,
    archived: false,
    ...over,
  };
}

export function cash(over: Partial<CashSession> & { accountId: string }): CashSession {
  return {
    id: id("cs"),
    status: "completed",
    setting: "live_casino",
    startedAt: "2026-03-01T23:00:00.000Z",
    endedAt: "2026-03-02T03:00:00.000Z",
    breakMinutes: 0,
    currency: "CAD",
    gameTypeId: "nlhe",
    variant: null,
    venueId: null,
    platformId: null,
    stakeLevelId: null,
    smallBlindMinor: 100,
    bigBlindMinor: 200,
    straddleMinor: null,
    anteMinor: null,
    tableFormat: "full_ring",
    buyInMinor: 30000,
    rebuysMinor: 0,
    additionalMinor: 0,
    cashOutMinor: 30000,
    rakeMinor: 0,
    tipsMinor: 0,
    feesMinor: 0,
    bonusMinor: 0,
    rakebackMinor: 0,
    handsPlayed: null,
    tagIds: [],
    ...over,
  };
}

export function entry(over: Partial<TournamentEntry> = {}): TournamentEntry {
  return { entryNumber: 1, buyInMinor: 10000, feeMinor: 1000, rebuyCount: 0, rebuysMinor: 0, addonsMinor: 0, ...over };
}

export function tournament(over: Partial<Tournament> & { accountId: string }): Tournament {
  return {
    id: id("t"),
    name: "Sunday Major",
    status: "completed",
    setting: "online",
    format: "mtt",
    speed: "regular",
    isBounty: false,
    currency: "CAD",
    venueId: null,
    platformId: null,
    gameTypeId: "nlhe",
    startDate: "2026-03-05",
    endDate: null,
    fieldSize: 100,
    finishPosition: 50,
    payoutMinor: 0,
    bountiesMinor: 0,
    refundMinor: 0,
    entries: [entry()],
    periods: [],
    tagIds: [],
    ...over,
  };
}

export function txn(over: Partial<Transaction> & { accountId: string; type: Transaction["type"]; amountMinor: number }): Transaction {
  return { id: id("tx"), occurredOn: "2026-02-01", description: null, ...over };
}

export function transfer(over: Partial<Transfer> & { fromAccountId: string; toAccountId: string; fromAmountMinor: number; toAmountMinor: number }): Transfer {
  return { id: id("tr"), occurredOn: "2026-02-15", description: null, ...over };
}

export function expense(over: Partial<Expense> & { accountId: string; amountMinor: number }): Expense {
  return {
    id: id("ex"),
    categoryId: "cat-travel",
    categoryName: "Travel",
    categoryKind: "travel",
    refundedMinor: 0,
    occurredOn: "2026-03-01",
    sessionId: null,
    tournamentId: null,
    venueId: null,
    description: null,
    ...over,
  };
}

export function dataset(over: Partial<Dataset> = {}): Dataset {
  return {
    settings: { baseCurrency: "CAD", timezone: "America/Toronto", weekStartsOn: 1 },
    accounts: [],
    cashSessions: [],
    tournaments: [],
    transactions: [],
    transfers: [],
    expenses: [],
    rates: [],
    ...over,
  };
}
