import { describe, expect, it } from "vitest";
import { account, cash, dataset, expense, tournament, transfer, txn } from "./__fixtures__";
import { accountBalances, buildLedger, combinedBalance, drawdown, LEDGER_CLASS } from "./ledger";
import { computeDashboard, createContext } from "./metrics";
import { resolveRange } from "./dates";

const all = resolveRange("all", "America/Toronto");

describe("bankroll ledger", () => {
  it("balance = opening + deposits − withdrawals + results − expenses, and reconciles with the ledger", () => {
    const a = account({ openingBalanceMinor: 100000 });
    const ds = dataset({
      accounts: [a],
      transactions: [
        txn({ accountId: a.id, type: "deposit", amountMinor: 50000 }),
        txn({ accountId: a.id, type: "withdrawal", amountMinor: 20000 }),
        txn({ accountId: a.id, type: "rakeback", amountMinor: 1500 }),
      ],
      cashSessions: [cash({ accountId: a.id, buyInMinor: 30000, cashOutMinor: 45000 })],
      tournaments: [tournament({ accountId: a.id, payoutMinor: 0 })],
      expenses: [expense({ accountId: a.id, amountMinor: 2500 })],
    });
    const ledger = buildLedger(ds);
    const bal = accountBalances(ds, ledger).get(a.id);
    expect(bal).toBe(100000 + 50000 - 20000 + 1500 + 15000 - 11000 - 2500);
    expect(bal).toBe(ledger.reduce((s, e) => s + e.amountMinor, 0));
  });

  it("deposits and withdrawals never count as poker profit", () => {
    const a = account({ openingBalanceMinor: 0 });
    const ds = dataset({
      accounts: [a],
      transactions: [
        txn({ accountId: a.id, type: "deposit", amountMinor: 500000 }),
        txn({ accountId: a.id, type: "withdrawal", amountMinor: 100000 }),
      ],
    });
    const m = computeDashboard(createContext(ds), all);
    expect(m.netPokerProfitMinor).toBe(0);
    expect(m.currentBankroll.amountMinor).toBe(400000);
    expect(buildLedger(ds).every((e) => LEDGER_CLASS[e.kind] === "capital")).toBe(true);
  });

  it("internal transfers do not change the combined bankroll or profit", () => {
    const a = account({ openingBalanceMinor: 100000 });
    const b = account({ name: "Online", openingBalanceMinor: 20000 });
    const before = dataset({ accounts: [a, b] });
    const after = dataset({
      accounts: [a, b],
      transfers: [transfer({ fromAccountId: a.id, toAccountId: b.id, fromAmountMinor: 30000, toAmountMinor: 30000 })],
    });
    const asOf = "2026-12-31";
    expect(combinedBalance(after, asOf).amountMinor).toBe(combinedBalance(before, asOf).amountMinor);
    const bal = accountBalances(after);
    expect(bal.get(a.id)).toBe(70000);
    expect(bal.get(b.id)).toBe(50000);
    expect(computeDashboard(createContext(after), all).netPokerProfitMinor).toBe(0);
  });

  it("aggregates multiple currencies only after applying a documented rate", () => {
    const cad = account({ currency: "CAD", openingBalanceMinor: 100000 });
    const usd = account({ name: "USD", currency: "USD", openingBalanceMinor: 100000 });
    const noRate = dataset({ accounts: [cad, usd] });
    const r = combinedBalance(noRate, "2026-06-01");
    expect(r.amountMinor).toBe(100000);
    expect(r.missingCurrencies).toEqual(["USD"]);

    const withRate = dataset({
      accounts: [cad, usd],
      rates: [{ baseCurrency: "USD", quoteCurrency: "CAD", rate: "1.35", effectiveDate: "2026-01-01" }],
    });
    const r2 = combinedBalance(withRate, "2026-06-01");
    expect(r2.amountMinor).toBe(100000 + 135000);
    expect(r2.missingCurrencies).toEqual([]);
    // original amounts are untouched
    expect(accountBalances(withRate).get(usd.id)).toBe(100000);
  });

  it("cross-currency transfers move the recorded amount on each side", () => {
    const cad = account({ currency: "CAD", openingBalanceMinor: 200000 });
    const usd = account({ name: "USD", currency: "USD" });
    const ds = dataset({
      accounts: [cad, usd],
      transfers: [transfer({ fromAccountId: cad.id, toAccountId: usd.id, fromAmountMinor: 135000, toAmountMinor: 100000 })],
      rates: [{ baseCurrency: "USD", quoteCurrency: "CAD", rate: "1.35", effectiveDate: "2026-01-01" }],
    });
    expect(accountBalances(ds).get(cad.id)).toBe(65000);
    expect(accountBalances(ds).get(usd.id)).toBe(100000);
    expect(combinedBalance(ds, "2026-06-01").amountMinor).toBe(200000);
  });

  it("expense refunds reduce the expense; fully refunded expenses vanish from the ledger", () => {
    const a = account();
    const ds = dataset({
      accounts: [a],
      expenses: [
        expense({ accountId: a.id, amountMinor: 10000, refundedMinor: 4000 }),
        expense({ accountId: a.id, amountMinor: 5000, refundedMinor: 5000 }),
      ],
    });
    const ledger = buildLedger(ds);
    expect(ledger).toHaveLength(1);
    expect(accountBalances(ds, ledger).get(a.id)).toBe(-6000);
    expect(computeDashboard(createContext(ds), all).expensesMinor).toBe(6000);
  });

  it("drafts are excluded; in-progress tournaments affect the bankroll but not ROI", () => {
    const a = account({ openingBalanceMinor: 100000 });
    const ds = dataset({
      accounts: [a],
      cashSessions: [cash({ accountId: a.id, status: "draft", cashOutMinor: null, endedAt: null })],
      tournaments: [
        tournament({ accountId: a.id, status: "in_progress" }),
        tournament({ accountId: a.id, status: "draft" }),
      ],
    });
    const m = computeDashboard(createContext(ds), all);
    expect(m.currentBankroll.amountMinor).toBe(100000 - 11000);
    expect(m.tournaments.count).toBe(0);
    expect(m.tournaments.roiPct).toBeNull();
    expect(m.completedCount).toBe(0);
  });

  it("computes peak and maximum drawdown", () => {
    const dd = drawdown([
      { date: "d1", value: 100 },
      { date: "d2", value: 300 },
      { date: "d3", value: 50 },
      { date: "d4", value: 400 },
      { date: "d5", value: 350 },
    ]);
    expect(dd.peakMinor).toBe(400);
    expect(dd.maxDrawdownMinor).toBe(250);
    expect(dd.maxDrawdownFrom).toBe("d2");
    expect(dd.maxDrawdownTo).toBe("d3");
    expect(dd.currentDrawdownMinor).toBe(50);
  });
});
