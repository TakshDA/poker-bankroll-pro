/**
 * Plain records consumed by the finance engine. The data layer maps database
 * rows into these shapes; the engine never talks to the database, so every
 * formula is a pure, unit-testable function.
 *
 * Every amount is integer minor units in the currency of the record's
 * bankroll account (`currency` is copied from the account for convenience).
 */
import type { Minor } from "./money";

export type PlaySetting = "live_casino" | "online" | "private_game" | "home_game";
export type RecordStatus = "draft" | "completed" | "cancelled";
export type TournamentStatus = "draft" | "in_progress" | "completed" | "cancelled";
export type TableFormat = "heads_up" | "short_handed" | "six_max" | "full_ring" | "other";
export type TournamentFormat = "mtt" | "sit_and_go" | "satellite" | "spin" | "other";
export type TournamentSpeed = "regular" | "turbo" | "hyper" | "deep" | "other";
export type TransactionType = "deposit" | "withdrawal" | "bonus" | "rakeback" | "adjustment";

export interface Account {
  id: string;
  name: string;
  currency: string;
  openingBalanceMinor: Minor;
  openingDate: string; // YYYY-MM-DD
  minBalanceMinor: Minor | null;
  goalBalanceMinor: Minor | null;
  categoryId: string | null;
  archived: boolean;
}

export interface CashSession {
  id: string;
  status: RecordStatus;
  setting: PlaySetting;
  startedAt: string; // ISO instant
  endedAt: string | null;
  breakMinutes: number;
  accountId: string;
  currency: string;
  gameTypeId: string | null;
  variant: string | null;
  venueId: string | null;
  platformId: string | null;
  stakeLevelId: string | null;
  smallBlindMinor: Minor | null;
  bigBlindMinor: Minor | null;
  straddleMinor: Minor | null;
  anteMinor: Minor | null;
  tableFormat: TableFormat;
  buyInMinor: Minor;
  rebuysMinor: Minor;
  additionalMinor: Minor;
  cashOutMinor: Minor | null;
  rakeMinor: Minor;
  tipsMinor: Minor;
  feesMinor: Minor;
  bonusMinor: Minor;
  rakebackMinor: Minor;
  handsPlayed: number | null;
  tagIds: string[];
  notes?: string | null;
}

export interface TournamentEntry {
  entryNumber: number;
  buyInMinor: Minor;
  feeMinor: Minor;
  rebuyCount: number;
  rebuysMinor: Minor;
  addonsMinor: Minor;
}

export interface PlayPeriod {
  id: string;
  status: RecordStatus;
  startedAt: string;
  endedAt: string | null;
  breakMinutes: number;
  dayLabel: string | null;
}

export interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  setting: PlaySetting;
  format: TournamentFormat;
  speed: TournamentSpeed;
  isBounty: boolean;
  accountId: string;
  currency: string;
  venueId: string | null;
  platformId: string | null;
  gameTypeId: string | null;
  startDate: string;
  endDate: string | null;
  fieldSize: number | null;
  finishPosition: number | null;
  payoutMinor: Minor;
  bountiesMinor: Minor;
  refundMinor: Minor;
  entries: TournamentEntry[];
  periods: PlayPeriod[];
  tagIds: string[];
  notes?: string | null;
}

export interface Transaction {
  id: string;
  accountId: string;
  type: TransactionType;
  amountMinor: Minor; // positive, except signed adjustments
  occurredOn: string;
  description: string | null;
}

export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  fromAmountMinor: Minor;
  toAmountMinor: Minor;
  occurredOn: string;
  description: string | null;
}

export interface Expense {
  id: string;
  accountId: string;
  categoryId: string;
  categoryName: string;
  categoryKind: string;
  amountMinor: Minor;
  refundedMinor: Minor;
  occurredOn: string;
  sessionId: string | null;
  tournamentId: string | null;
  venueId: string | null;
  description: string | null;
}

export interface FinanceSettings {
  baseCurrency: string;
  timezone: string;
  weekStartsOn: number;
}

export interface Dataset {
  settings: FinanceSettings;
  accounts: Account[];
  cashSessions: CashSession[];
  tournaments: Tournament[];
  transactions: Transaction[];
  transfers: Transfer[];
  expenses: Expense[];
  rates: import("./fx").ExchangeRate[];
}
