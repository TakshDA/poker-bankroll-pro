/**
 * Backup restore: a backup restored into the same or a different account
 * reproduces every balance and statistic, and nobody else's data is touched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, closeDb, makeAccount, newUser } from "./helpers";
import { exportBackup, parseBackup, restoreBackup } from "@/lib/data/backup";
import { saveCashSession } from "@/lib/data/sessions";
import { saveTournament } from "@/lib/data/tournaments";
import { saveExpense, saveTransaction, saveTransfer, softDelete } from "@/lib/data/money-records";
import { saveRate, savePreferences } from "@/lib/data/settings";
import { loadWorkspace } from "@/lib/data/workspace";
import { accountBalances } from "@/lib/finance/ledger";
import { computeDashboard, createContext } from "@/lib/finance/metrics";
import { resolveRange } from "@/lib/finance/dates";
import type { Tx } from "@/lib/server/db";

const all = resolveRange("all", "America/Toronto");
let alice: string;
let bob: string;
let carol: string;

async function snapshot(tx: Tx) {
  const ws = await loadWorkspace(tx);
  const ctx = createContext(ws.dataset);
  const d = computeDashboard(ctx, all);
  return {
    profit: d.netPokerProfitMinor,
    sessions: ws.dataset.cashSessions.length,
    tournaments: ws.dataset.tournaments.length,
    balances: [...accountBalances(ws.dataset)].map(([id, m]) => `${ws.dataset.accounts.find((a) => a.id === id)?.name}=${m}`).sort(),
    settings: { base: ws.settings.baseCurrency, tz: ws.settings.timezone, name: ws.settings.displayName, defaultAccount: ws.dataset.accounts.find((a) => a.id === ws.settings.defaultAccountId)?.name ?? null },
    venues: ws.venues.map((v) => v.name).sort(),
    tags: ws.tags.map((t) => t.name).sort(),
    rates: ws.rateRows.length,
  };
}

beforeAll(async () => {
  alice = await newUser();
  bob = await newUser();
  carol = await newUser();
  const cad = await makeAccount(alice, { name: "Live", currency: "CAD", openingBalanceMinor: 500000 });
  const usd = await makeAccount(alice, { name: "Online", currency: "USD", openingBalanceMinor: 100000 });
  await as(alice, async (tx) => {
    await savePreferences(tx, { displayName: "Alice", baseCurrency: "CAD", timezone: "America/Vancouver", weekStartsOn: 0, enabledCurrencies: ["USD"], defaultAccountId: usd });
    await saveRate(tx, { baseCurrency: "USD", quoteCurrency: "CAD", rate: "1.36", effectiveDate: "2026-01-01" });
    await saveCashSession(tx, { status: "completed", date: "2026-02-01", startTime: "21:00", endTime: "02:00", setting: "live_casino", accountId: cad, newVenueName: "Restore Room", tableFormat: "full_ring", buyIn: "300", cashOut: "640", tags: "deep, fun" });
    const del = await saveCashSession(tx, { status: "completed", date: "2026-02-03", startTime: "20:00", endTime: "22:00", setting: "online", accountId: usd, tableFormat: "six_max", buyIn: "100", cashOut: "20" });
    await softDelete(tx, "sessions", del);
    const t = await saveTournament(tx, { name: "Daily", status: "completed", setting: "online", format: "mtt", speed: "regular", isBounty: false, accountId: usd, startDate: "2026-02-04", entries: [{ buyIn: "20", fee: "2" }, { buyIn: "20", fee: "2" }], periods: [], payout: "150" });
    const cat = (await tx<{ id: string }[]>`select id from expense_categories limit 1`)[0].id;
    await saveExpense(tx, { accountId: cad, categoryId: cat, amount: "45", occurredOn: "2026-02-01", tournamentId: t, confirmDuplicate: false });
    await saveTransaction(tx, { accountId: cad, type: "withdrawal", amount: "200", occurredOn: "2026-02-05" });
    await saveTransfer(tx, { fromAccountId: cad, toAccountId: usd, fromAmount: "136", toAmount: "100", occurredOn: "2026-02-06" });
  });
  await makeAccount(bob, { name: "Bob roll", openingBalanceMinor: 1234 });
});
afterAll(closeDb);

describe("backup restore", () => {
  it("restores into a different account with identical numbers, leaving the source untouched", async () => {
    const before = await as(alice, snapshot);
    const backup = parseBackup(JSON.parse(JSON.stringify(await as(alice, exportBackup))));
    const res = await as(carol, (tx) => restoreBackup(tx, backup));
    expect(res.perTable.sessions).toBe(2); // including the trashed one
    expect(await as(carol, snapshot)).toEqual(before);
    expect(await as(alice, snapshot)).toEqual(before);
    // Fresh ids: no record id is shared between the two accounts.
    const a = await as(alice, (tx) => tx<{ id: string }[]>`select id from sessions`);
    const c = await as(carol, (tx) => tx<{ id: string }[]>`select id from sessions`);
    expect(a.map((r) => r.id).filter((id) => c.some((x) => x.id === id))).toEqual([]);
  });

  it("replaces existing data when restoring into the same account", async () => {
    const before = await as(alice, snapshot);
    const backup = parseBackup(await as(alice, exportBackup));
    const acc = (await as(alice, loadWorkspace)).dataset.accounts[0].id;
    await as(alice, (tx) => saveTransaction(tx, { accountId: acc, type: "deposit", amount: "999", occurredOn: "2026-03-01" }));
    expect((await as(alice, snapshot)).balances).not.toEqual(before.balances);
    await as(alice, (tx) => restoreBackup(tx, backup));
    expect(await as(alice, snapshot)).toEqual(before);
    // Bob's data is untouched.
    expect((await as(bob, loadWorkspace)).dataset.accounts.map((x) => x.name)).toEqual(["Bob roll"]);
  });

  it("rejects files that are not backups, and rolls back a failed restore completely", async () => {
    expect(() => parseBackup({ hello: 1 })).toThrow(/not a Poker Bankroll Pro backup/);
    expect(() => parseBackup({ format: "poker-bankroll-pro/backup", version: 99, tables: {} })).toThrow(/newer version/);
    expect(() => parseBackup({ format: "poker-bankroll-pro/backup", version: 1, tables: { sessions: [1, 2] } })).toThrow(/damaged/);
    const before = await as(alice, snapshot);
    const backup = parseBackup(await as(alice, exportBackup));
    backup.tables.cash_game_details[0].buy_in_minor = -5; // violates a check constraint
    await expect(as(alice, (tx) => restoreBackup(tx, backup))).rejects.toThrow();
    expect(await as(alice, snapshot)).toEqual(before);
  });
});
