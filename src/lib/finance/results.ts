/**
 * Normalises cash sessions and tournaments into one stream of "poker
 * results" converted to the user's base currency. Every dashboard, report
 * and analytics figure is computed from this stream, which is itself built
 * only from the per-record formulas in records.ts.
 */
import { localDate } from "./dates";
import { RateTable, type ConversionQuality } from "./fx";
import type { Minor } from "./money";
import {
  cashInvested,
  cashSessionCounts,
  cashSessionMinutes,
  cashSessionNet,
  tournamentAffectsBankroll,
  tournamentCashed,
  tournamentCountsInStats,
  tournamentFaceBuyIn,
  tournamentInvestment,
  tournamentMinutes,
  tournamentNet,
} from "./records";
import type { Dataset, PlaySetting, TableFormat, TournamentFormat } from "./types";

export interface PokerResult {
  id: string;
  kind: "cash" | "tournament";
  /** Local calendar date the result is booked on. */
  date: string;
  /** Chronological sort key (start instant or start date). */
  sortKey: string;
  accountId: string;
  currency: string;
  originalNetMinor: Minor;
  /** Net result in the base currency. */
  netMinor: Minor;
  minutes: number;
  setting: PlaySetting;
  gameTypeId: string | null;
  venueId: string | null;
  platformId: string | null;
  /**
   * Whether the result counts as a completed session for win-rate style
   * statistics (completed cash sessions and completed tournaments).
   */
  countsInStats: boolean;
  quality: ConversionQuality;
  // Cash-only (original currency)
  stakeLevelId: string | null;
  smallBlindMinor: Minor | null;
  bigBlindMinor: Minor | null;
  tableFormat: TableFormat | null;
  handsPlayed: number | null;
  rakeMinor: Minor; // base currency, informational
  investedMinor: Minor; // base currency (cash: money put in play; tournament: investment)
  // Tournament-only (base currency)
  name: string | null;
  returnMinor: Minor;
  payoutMinor: Minor;
  bountiesMinor: Minor;
  faceBuyInMinor: Minor;
  cashed: boolean;
  format: TournamentFormat | null;
  isBounty: boolean;
  status: string;
  entriesCount: number;
  fieldSize: number | null;
  finishPosition: number | null;
  tagIds: string[];
}

export interface ResultSet {
  results: PokerResult[];
  missingCurrencies: string[];
  usedFallbackRate: boolean;
}

export function buildResults(ds: Dataset, rates = new RateTable(ds.rates)): ResultSet {
  const base = ds.settings.baseCurrency;
  const tz = ds.settings.timezone;
  const accountCurrency = new Map(ds.accounts.map((a) => [a.id, a.currency]));
  const missing = new Set<string>();
  let fallback = false;
  const out: PokerResult[] = [];

  const conv = (amount: Minor, currency: string, date: string) => {
    const c = rates.convert(amount, currency, base, date);
    if (c?.quality === "fallback") fallback = true;
    return c;
  };

  for (const s of ds.cashSessions) {
    if (!cashSessionCounts(s)) continue;
    const net = cashSessionNet(s)!;
    const currency = accountCurrency.get(s.accountId) ?? s.currency;
    const date = localDate(s.startedAt, tz);
    const c = conv(net, currency, date);
    if (!c) {
      missing.add(currency);
      continue;
    }
    const toBase = (v: Minor) => conv(v, currency, date)?.amount ?? 0;
    out.push({
      id: s.id,
      kind: "cash",
      date,
      sortKey: s.startedAt,
      accountId: s.accountId,
      currency,
      originalNetMinor: net,
      netMinor: c.amount,
      minutes: cashSessionMinutes(s) ?? 0,
      setting: s.setting,
      gameTypeId: s.gameTypeId,
      venueId: s.venueId,
      platformId: s.platformId,
      countsInStats: true,
      quality: c.quality,
      stakeLevelId: s.stakeLevelId,
      smallBlindMinor: s.smallBlindMinor,
      bigBlindMinor: s.bigBlindMinor,
      tableFormat: s.tableFormat,
      handsPlayed: s.handsPlayed,
      rakeMinor: toBase(s.rakeMinor),
      investedMinor: toBase(cashInvested(s)),
      name: null,
      returnMinor: toBase(s.cashOutMinor ?? 0),
      payoutMinor: 0,
      bountiesMinor: 0,
      faceBuyInMinor: 0,
      cashed: false,
      format: null,
      isBounty: false,
      status: s.status,
      entriesCount: 0,
      fieldSize: null,
      finishPosition: null,
      tagIds: s.tagIds,
    });
  }

  for (const t of ds.tournaments) {
    if (!tournamentAffectsBankroll(t)) continue;
    const currency = accountCurrency.get(t.accountId) ?? t.currency;
    const net = tournamentNet(t);
    const c = conv(net, currency, t.startDate);
    if (!c) {
      missing.add(currency);
      continue;
    }
    const toBase = (v: Minor) => conv(v, currency, t.startDate)?.amount ?? 0;
    const firstPeriod = [...t.periods].sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0];
    out.push({
      id: t.id,
      kind: "tournament",
      date: t.startDate,
      sortKey: firstPeriod?.startedAt ?? `${t.startDate}T00:00:00.000Z`,
      accountId: t.accountId,
      currency,
      originalNetMinor: net,
      netMinor: c.amount,
      minutes: tournamentMinutes(t),
      setting: t.setting,
      gameTypeId: t.gameTypeId,
      venueId: t.venueId,
      platformId: t.platformId,
      countsInStats: tournamentCountsInStats(t),
      quality: c.quality,
      stakeLevelId: null,
      smallBlindMinor: null,
      bigBlindMinor: null,
      tableFormat: null,
      handsPlayed: null,
      rakeMinor: toBase(t.entries.reduce((sum, e) => sum + e.feeMinor, 0)),
      investedMinor: toBase(tournamentInvestment(t)),
      name: t.name,
      returnMinor: toBase(t.payoutMinor + t.bountiesMinor + t.refundMinor),
      payoutMinor: toBase(t.payoutMinor),
      bountiesMinor: toBase(t.bountiesMinor),
      faceBuyInMinor: toBase(tournamentFaceBuyIn(t)),
      cashed: tournamentCashed(t),
      format: t.format,
      isBounty: t.isBounty,
      status: t.status,
      entriesCount: t.entries.length,
      fieldSize: t.fieldSize,
      finishPosition: t.finishPosition,
      tagIds: t.tagIds,
    });
  }

  out.sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.id.localeCompare(b.id));
  return { results: out, missingCurrencies: [...missing], usedFallbackRate: fallback };
}
