/**
 * Per-record formulas. These are THE definitions used everywhere (session
 * pages, ledger, dashboard, reports). See docs/FINANCIAL_RULES.md.
 */
import { durationMinutes } from "./dates";
import { addMinor, subMinor, sumMinor, type Minor } from "./money";
import type { CashSession, Expense, Tournament, TournamentEntry } from "./types";

// ---------------------------------------------------------------------------
// Cash games
// ---------------------------------------------------------------------------

/** Total money put into play = buy-in + rebuys + additional money. */
export function cashInvested(s: Pick<CashSession, "buyInMinor" | "rebuysMinor" | "additionalMinor">): Minor {
  return addMinor(s.buyInMinor, s.rebuysMinor, s.additionalMinor);
}

/**
 * Table result = cash-out − total invested. Rake (and tips paid from the
 * stack) are already reflected in the cash-out.
 */
export function cashTableResult(
  s: Pick<CashSession, "buyInMinor" | "rebuysMinor" | "additionalMinor" | "cashOutMinor">,
): Minor | null {
  if (s.cashOutMinor === null) return null;
  return subMinor(s.cashOutMinor, cashInvested(s));
}

/**
 * Net cash-game session result:
 *   cash-out − (buy-in + rebuys + additional)
 *   − tips paid separately − session fees paid separately
 *   + session bonus + session rakeback
 * Returns null while the cash-out is unknown (draft).
 */
export function cashSessionNet(
  s: Pick<
    CashSession,
    | "buyInMinor"
    | "rebuysMinor"
    | "additionalMinor"
    | "cashOutMinor"
    | "tipsMinor"
    | "feesMinor"
    | "bonusMinor"
    | "rakebackMinor"
  >,
): Minor | null {
  const table = cashTableResult(s);
  if (table === null) return null;
  return addMinor(table, -s.tipsMinor, -s.feesMinor, s.bonusMinor, s.rakebackMinor);
}

export function cashSessionMinutes(s: Pick<CashSession, "startedAt" | "endedAt" | "breakMinutes">): number | null {
  return durationMinutes(s.startedAt, s.endedAt, s.breakMinutes);
}

/**
 * A cash session contributes to statistics and to the bankroll only when it
 * is completed (drafts are incomplete, cancelled sessions never happened).
 */
export function cashSessionCounts(s: Pick<CashSession, "status" | "cashOutMinor">): boolean {
  return s.status === "completed" && s.cashOutMinor !== null;
}

/**
 * Big blinds per 100 hands. Only defined when both hands played and the big
 * blind are known and positive; never estimated.
 */
export function bbPer100(netMinor: Minor, bigBlindMinor: Minor | null, hands: number | null): number | null {
  if (!bigBlindMinor || bigBlindMinor <= 0 || !hands || hands <= 0) return null;
  return (netMinor / bigBlindMinor / hands) * 100;
}

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------

/** Cost of one bullet = buy-in + fee + rebuys + add-ons. */
export function entryCost(e: TournamentEntry): Minor {
  return addMinor(e.buyInMinor, e.feeMinor, e.rebuysMinor, e.addonsMinor);
}

/** Total investment = sum over every entry/re-entry of its cost. */
export function tournamentInvestment(t: Pick<Tournament, "entries">): Minor {
  return sumMinor(t.entries.map(entryCost));
}

/** Total returned = prize payout + bounties (+ refund if cancelled). */
export function tournamentReturn(t: Pick<Tournament, "payoutMinor" | "bountiesMinor" | "refundMinor">): Minor {
  return addMinor(t.payoutMinor, t.bountiesMinor, t.refundMinor);
}

/** Net tournament result = total payouts − total investment. */
export function tournamentNet(t: Pick<Tournament, "entries" | "payoutMinor" | "bountiesMinor" | "refundMinor">): Minor {
  return subMinor(tournamentReturn(t), tournamentInvestment(t));
}

/** Money is committed (affects the bankroll) once the event is not a draft. */
export function tournamentAffectsBankroll(t: Pick<Tournament, "status">): boolean {
  return t.status === "in_progress" || t.status === "completed" || t.status === "cancelled";
}

/** Only completed tournaments count for ROI, ITM, counts and averages. */
export function tournamentCountsInStats(t: Pick<Tournament, "status">): boolean {
  return t.status === "completed";
}

/** A qualifying cash is a prize payout > 0 (bounties alone are not a cash). */
export function tournamentCashed(t: Pick<Tournament, "payoutMinor">): boolean {
  return t.payoutMinor > 0;
}

/** Played minutes across all days/periods of the tournament. */
export function tournamentMinutes(t: Pick<Tournament, "periods">): number {
  let total = 0;
  for (const p of t.periods) {
    if (p.status !== "completed") continue;
    total += durationMinutes(p.startedAt, p.endedAt, p.breakMinutes) ?? 0;
  }
  return total;
}

/** Face buy-in of the first bullet (buy-in + fee) — used for buy-in levels. */
export function tournamentFaceBuyIn(t: Pick<Tournament, "entries">): Minor {
  const first = [...t.entries].sort((a, b) => a.entryNumber - b.entryNumber)[0];
  return first ? addMinor(first.buyInMinor, first.feeMinor) : 0;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

/** Net cost of an expense after any refund. */
export function expenseNet(e: Pick<Expense, "amountMinor" | "refundedMinor">): Minor {
  return subMinor(e.amountMinor, e.refundedMinor);
}
