import { describe, expect, it } from "vitest";
import { account, cash, dataset, entry, expense, tournament, txn } from "./__fixtures__";
import { resolveRange } from "./dates";
import { computeDashboard, createContext, groupResults, summarizeTournaments } from "./metrics";
import { histogram, monteCarlo, rollingAverage, streaks, varianceStats } from "./stats";

const all = resolveRange("all", "America/Toronto");

function sampleDataset() {
  const a = account({ openingBalanceMinor: 200000 });
  return {
    a,
    ds: dataset({
      accounts: [a],
      cashSessions: [
        // +200 in 4h
        cash({ accountId: a.id, startedAt: "2026-03-01T18:00:00Z", endedAt: "2026-03-01T22:00:00Z", buyInMinor: 30000, cashOutMinor: 50000, handsPlayed: 120 }),
        // −300 in 2h
        cash({ accountId: a.id, startedAt: "2026-03-03T18:00:00Z", endedAt: "2026-03-03T20:00:00Z", buyInMinor: 30000, cashOutMinor: 0 }),
        // +50 in 2h
        cash({ accountId: a.id, startedAt: "2026-04-03T18:00:00Z", endedAt: "2026-04-03T20:00:00Z", buyInMinor: 30000, cashOutMinor: 35000, handsPlayed: 60 }),
      ],
      tournaments: [
        // invest 110, cash 400 (+290)
        tournament({ accountId: a.id, startDate: "2026-03-10", payoutMinor: 40000, periods: [{ id: "p", status: "completed", startedAt: "2026-03-10T17:00:00Z", endedAt: "2026-03-10T21:00:00Z", breakMinutes: 0, dayLabel: null }] }),
        // invest 110 + 110 re-entry, no cash (−220)
        tournament({ accountId: a.id, startDate: "2026-04-10", entries: [entry(), entry({ entryNumber: 2 })], payoutMinor: 0 }),
      ],
      expenses: [expense({ accountId: a.id, amountMinor: 4000, occurredOn: "2026-03-02" })],
      transactions: [txn({ accountId: a.id, type: "bonus", amountMinor: 1000, occurredOn: "2026-04-01" })],
    }),
  };
}

describe("dashboard aggregation", () => {
  it("computes every headline metric from records", () => {
    const { ds } = sampleDataset();
    const m = computeDashboard(createContext(ds), all, new Date("2026-10-09T12:00:00Z"));
    expect(m.cashProfitMinor).toBe(20000 - 30000 + 5000);
    expect(m.tournamentProfitMinor).toBe(29000 - 22000);
    expect(m.pokerIncomeMinor).toBe(1000);
    expect(m.expensesMinor).toBe(4000);
    expect(m.netPokerProfitMinor).toBe(-5000 + 7000 + 1000 - 4000);
    expect(m.totalMinutes).toBe(8 * 60 + 4 * 60);
    // hourly = (cash + tournament results) / hours = 2000 / 12h
    expect(m.hourlyMinor).toBe(167);
    expect(m.cashHourlyMinor).toBe(-625);
    expect(m.completedCount).toBe(5);
    expect(m.winningCount).toBe(3);
    expect(m.winningPct).toBe(60);
    expect(m.avgResultMinor).toBe(400); // 2000 / 5
    expect(m.best?.netMinor).toBe(29000);
    expect(m.worst?.netMinor).toBe(-30000);
    expect(m.currentBankroll.amountMinor).toBe(200000 - 1000);
    expect(m.monthly.map((r) => r.month)).toEqual(["2026-03", "2026-04"]);
    expect(m.monthly[0].netMinor).toBe(20000 - 30000 + 29000 - 4000);
    expect(m.cumulative.at(-1)?.cumulativeMinor).toBe(m.netPokerProfitMinor);
  });

  it("tournament ROI, ITM%, averages count each tournament once", () => {
    const { ds } = sampleDataset();
    const t = summarizeTournaments(createContext(ds).allResults);
    expect(t.count).toBe(2);
    expect(t.entries).toBe(3);
    expect(t.cashes).toBe(1);
    expect(t.itmPct).toBe(50);
    expect(t.investmentMinor).toBe(33000);
    expect(t.netMinor).toBe(7000);
    expect(t.roiPct).toBeCloseTo((7000 / 33000) * 100, 10);
    expect(t.avgBuyInMinor).toBe(11000);
    expect(t.avgCashMinor).toBe(40000);
  });

  it("filters by date range", () => {
    const { ds } = sampleDataset();
    const april = resolveRange("custom", "America/Toronto", 1, { from: "2026-04-01", to: "2026-04-30" });
    const m = computeDashboard(createContext(ds), april);
    expect(m.cashProfitMinor).toBe(5000);
    expect(m.tournamentProfitMinor).toBe(-22000);
    expect(m.expensesMinor).toBe(0);
    expect(m.pokerIncomeMinor).toBe(1000);
  });

  it("handles an empty dataset without dividing by zero", () => {
    const m = computeDashboard(createContext(dataset()), all);
    expect(m.netPokerProfitMinor).toBe(0);
    expect(m.hourlyMinor).toBeNull();
    expect(m.winningPct).toBeNull();
    expect(m.avgResultMinor).toBeNull();
    expect(m.tournaments.roiPct).toBeNull();
    expect(m.tournaments.itmPct).toBeNull();
    expect(m.best).toBeNull();
    expect(m.currentBankroll.amountMinor).toBe(0);
  });

  it("zero-hour sessions count for profit but give no hourly rate", () => {
    const a = account();
    const ds = dataset({
      accounts: [a],
      cashSessions: [cash({ accountId: a.id, startedAt: "2026-03-01T18:00:00Z", endedAt: "2026-03-01T18:30:00Z", breakMinutes: 0, cashOutMinor: 40000 })],
    });
    ds.cashSessions[0].endedAt = "2026-03-01T18:00:30Z"; // < 1 minute
    const m = computeDashboard(createContext(ds), all);
    expect(m.cashProfitMinor).toBe(10000);
    expect(m.totalMinutes).toBe(0);
    expect(m.hourlyMinor).toBeNull();
  });

  it("converts foreign-currency results into the base currency, keeping originals", () => {
    const cad = account({ currency: "CAD" });
    const usd = account({ name: "USD", currency: "USD" });
    const ds = dataset({
      accounts: [cad, usd],
      cashSessions: [cash({ accountId: usd.id, currency: "USD", buyInMinor: 10000, cashOutMinor: 20000 })],
      rates: [{ baseCurrency: "USD", quoteCurrency: "CAD", rate: "1.4", effectiveDate: "2026-01-01" }],
    });
    const ctx = createContext(ds);
    expect(ctx.allResults[0].originalNetMinor).toBe(10000);
    expect(ctx.allResults[0].netMinor).toBe(14000);
    expect(computeDashboard(ctx, all).cashProfitMinor).toBe(14000);

    const noRate = createContext(dataset({ accounts: [cad, usd], cashSessions: ds.cashSessions }));
    expect(noRate.allResults).toHaveLength(0);
    expect(noRate.missingCurrencies).toEqual(["USD"]);
  });

  it("groups results and computes bb/100 only from sessions with hand counts", () => {
    const { ds } = sampleDataset();
    const ctx = createContext(ds);
    const rows = groupResults(ctx.allResults.filter((r) => r.kind === "cash"), () => "all");
    expect(rows).toHaveLength(1);
    // (20000/200 + 5000/200) / (120 + 60) * 100
    expect(rows[0].bbPer100).toBeCloseTo(((100 + 25) / 180) * 100, 10);
    expect(rows[0].handsCovered).toBe(180);
    const noHands = groupResults([ctx.allResults.find((r) => r.kind === "cash" && r.handsPlayed === null)!], () => "x");
    expect(noHands[0].bbPer100).toBeNull();
  });
});

describe("statistics", () => {
  it("computes streaks with break-even resetting", () => {
    expect(streaks([1, 2, -1, -2, -3, 0, 5])).toEqual({ longestWin: 2, longestLoss: 3, current: { type: "win", length: 1 } });
    expect(streaks([])).toEqual({ longestWin: 0, longestLoss: 0, current: { type: "none", length: 0 } });
  });

  it("variance stats", () => {
    const v = varianceStats([
      { netMinor: 100, minutes: 60 },
      { netMinor: -100, minutes: 60 },
    ]);
    expect(v.meanMinor).toBe(0);
    expect(v.stdDevMinor).toBeCloseTo(141.42, 1);
    expect(v.hourlyMinor).toBe(0);
    expect(v.hourlyCi95).not.toBeNull();
    expect(varianceStats([]).hourlyMinor).toBeNull();
  });

  it("histogram covers all values", () => {
    const vals = [-500, -100, 0, 50, 300, 1200];
    const h = histogram(vals);
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(vals.length);
  });

  it("rolling average", () => {
    expect(rollingAverage([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });

  it("Monte Carlo requires enough data and is deterministic with a seed", () => {
    expect(monteCarlo({ sample: [100, -100], startingBankrollMinor: 1000, futureSessions: 10 })).toBeNull();
    const sample = Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? -5000 : 3000));
    const a = monteCarlo({ sample, startingBankrollMinor: 100000, futureSessions: 100, seed: 7 });
    const b = monteCarlo({ sample, startingBankrollMinor: 100000, futureSessions: 100, seed: 7 });
    expect(a).toEqual(b);
    expect(a!.steps.at(-1)!.session).toBe(100);
    expect(a!.steps.every((s) => s.p5 <= s.p50 && s.p50 <= s.p95)).toBe(true);
    expect(Number.isInteger(a!.finalMedianMinor)).toBe(true);
  });
});
