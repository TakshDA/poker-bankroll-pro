/**
 * CSV import (preview, commit, duplicates, undo) and the settings services,
 * against the real database with RLS.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, closeDb, makeAccount, newUser } from "./helpers";
import { runImport, undoImport, listImports, type ImportPayload } from "@/lib/data/imports";
import { deleteListItem, listUsage, saveListItem, savePreferences, saveRate, setListArchived } from "@/lib/data/settings";
import { saveCashSession } from "@/lib/data/sessions";
import { getSettings, loadWorkspace } from "@/lib/data/workspace";
import { computeDashboard, createContext } from "@/lib/finance/metrics";
import { resolveRange } from "@/lib/finance/dates";
import type { ImportOptions } from "@/lib/import/spec";

let user: string;
let other: string;
let acc: string;
const all = resolveRange("all", "America/Toronto");
const options = (over: Partial<ImportOptions> = {}): ImportOptions => ({ dateOrder: "mdy", decimalMark: ".", defaultAccountId: acc, defaultSetting: "live_casino", defaultCategoryId: "", includeDuplicates: false, ...over });

const sessionsFile = (): ImportPayload => ({
  entity: "sessions",
  fileName: "history.csv",
  headers: ["Date", "Start", "End", "Venue", "Stakes", "Buy-in", "Cash-out"],
  rows: [
    ["03/01/2026", "8:00 PM", "11:30 PM", "Import Casino", "1/2", "$300", "$450"],
    ["03/02/2026", "21:00", "02:00", "Import Casino", "1/2", "200", "0"],
    ["03/02/2026", "21:00", "02:00", "Import Casino", "1/2", "200", "0"], // same as the line above
    ["03/03/2026", "nope", "23:00", "", "", "100", "50"],
    ["03/04/2026", "20:00", "22:00", "", "2/1", "100", "50"], // small blind > big blind (save-function rule)
  ],
  mapping: { date: 0, startTime: 1, endTime: 2, location: 3, stakes: 4, buyIn: 5, cashOut: 6 },
  options: options(),
});

const profit = async () => as(user, async (tx) => computeDashboard(createContext((await loadWorkspace(tx)).dataset), all).netPokerProfitMinor);

beforeAll(async () => {
  user = await newUser();
  other = await newUser();
  acc = await makeAccount(user, { name: "Import roll", openingBalanceMinor: 100000 });
});
afterAll(closeDb);

describe("CSV import", () => {
  it("a preview rolled back leaves nothing behind", async () => {
    const before = await profit();
    const sentinel = new Error("rollback");
    let outcome: Awaited<ReturnType<typeof runImport>> | undefined;
    await expect(
      as(user, async (tx) => {
        outcome = await runImport(tx, sessionsFile());
        throw sentinel;
      }),
    ).rejects.toBe(sentinel);
    expect(outcome!.counts).toEqual({ total: 5, imported: 2, duplicates: 1, errors: 2 });
    expect(outcome!.results.map((r) => r.status)).toEqual(["ok", "ok", "duplicate", "error", "error"]);
    expect(outcome!.results[3].message).toMatch(/"nope" is not a time/);
    expect(outcome!.results[4].message).toMatch(/Small blind/);
    expect(await profit()).toBe(before);
    expect(await as(user, listImports)).toHaveLength(0);
    // Venue created during the preview was rolled back too.
    expect((await as(user, loadWorkspace)).venues.map((v) => v.name)).not.toContain("Import Casino");
  });

  it("commits valid rows, skips duplicates of existing records, and can be undone", async () => {
    const before = await profit();
    const first = await as(user, (tx) => runImport(tx, sessionsFile()));
    expect(first.counts.imported).toBe(2);
    expect(await profit()).toBe(before + 15000 - 20000);
    const ws = await as(user, loadWorkspace);
    const crossed = ws.dataset.cashSessions.find((s) => s.buyInMinor === 20000)!;
    expect(new Date(crossed.endedAt!).getTime() - new Date(crossed.startedAt).getTime()).toBe(5 * 3600_000);

    // Importing the same file again: everything already exists.
    const again = await as(user, (tx) => runImport(tx, sessionsFile()));
    expect(again.counts).toMatchObject({ imported: 0, duplicates: 3, errors: 2 });

    const history = await as(user, listImports);
    expect(history).toHaveLength(1); // batches with nothing imported are hidden
    // Another user cannot undo it.
    await expect(as(other, (tx) => undoImport(tx, history[0].id))).rejects.toThrow(/not found/i);
    const res = await as(user, (tx) => undoImport(tx, history[0].id));
    expect(res.removed).toBe(2);
    expect(await profit()).toBe(before);
    await expect(as(user, (tx) => undoImport(tx, history[0].id))).rejects.toThrow(/already undone/);
  });

  it("imports transactions, expenses and tournaments through their own rules", async () => {
    const tx1 = await as(user, (tx) =>
      runImport(tx, { entity: "transactions", fileName: "bank.csv", headers: ["Date", "Amount"], rows: [["2026-04-01", "500"], ["2026-04-02", "-200"], ["2026-04-03", "0"]], mapping: { date: 0, amount: 1 }, options: options({ dateOrder: "ymd" }) }),
    );
    expect(tx1.results.map((r) => r.status)).toEqual(["ok", "ok", "error"]);
    const cat = (await as(user, loadWorkspace)).expenseCategories[0].id;
    const ex = await as(user, (tx) =>
      runImport(tx, { entity: "expenses", fileName: "costs.csv", headers: ["Date", "Amount", "What"], rows: [["2026-04-05", "40", "Gas"], ["2026-04-05", "40", "Gas"]], mapping: { date: 0, amount: 1, description: 2 }, options: options({ dateOrder: "ymd", defaultCategoryId: cat }) }),
    );
    expect(ex.results.map((r) => r.status)).toEqual(["ok", "duplicate"]);
    const t = await as(user, (tx) =>
      runImport(tx, { entity: "tournaments", fileName: "mtt.csv", headers: ["Date", "Name", "Buy-in", "Fee", "Entries", "Prize"], rows: [["2026-04-06", "Daily 100", "90", "10", "2", "450"]], mapping: { date: 0, name: 1, buyIn: 2, fee: 3, entries: 4, payout: 5 }, options: options({ dateOrder: "ymd" }) }),
    );
    expect(t.counts.imported).toBe(1);
    const ws = await as(user, loadWorkspace);
    const tour = ws.dataset.tournaments.find((x) => x.name === "Daily 100")!;
    expect(tour.entries).toHaveLength(2);
    expect(tour.payoutMinor).toBe(45000);
  });

  it("refuses an import missing a required column", async () => {
    await expect(as(user, (tx) => runImport(tx, { ...sessionsFile(), mapping: { date: 0 } }))).rejects.toThrow(/Choose a column/);
  });
});

describe("settings services", () => {
  it("saves preferences and always keeps the base currency enabled", async () => {
    await as(user, (tx) => savePreferences(tx, { displayName: "Tester", baseCurrency: "USD", timezone: "Europe/London", weekStartsOn: 0, enabledCurrencies: ["EUR"] }));
    const s = await as(user, getSettings);
    expect(s).toMatchObject({ displayName: "Tester", baseCurrency: "USD", timezone: "Europe/London", weekStartsOn: 0 });
    expect(s.enabledCurrencies.map((c) => c.trim()).sort()).toEqual(["EUR", "USD"]);
    await expect(as(user, (tx) => savePreferences(tx, { baseCurrency: "XXX", timezone: "UTC", weekStartsOn: 1, enabledCurrencies: [] }))).rejects.toThrow(/Unknown currency/);
    await as(user, (tx) => savePreferences(tx, { baseCurrency: "CAD", timezone: "America/Toronto", weekStartsOn: 1, enabledCurrencies: ["USD"] }));
  });

  it("replaces a rate for the same pair and date instead of duplicating it", async () => {
    await as(user, (tx) => saveRate(tx, { baseCurrency: "USD", quoteCurrency: "CAD", rate: "1.35", effectiveDate: "2026-01-01" }));
    await as(user, (tx) => saveRate(tx, { baseCurrency: "USD", quoteCurrency: "CAD", rate: "1.37", effectiveDate: "2026-01-01" }));
    const rates = (await as(user, loadWorkspace)).rateRows.filter((r) => r.effectiveDate === "2026-01-01");
    expect(rates).toHaveLength(1);
    expect(Number(rates[0].rate)).toBe(1.37);
  });

  it("archives used list items but only deletes unused ones", async () => {
    const venue = await as(user, (tx) => saveListItem(tx, "venues", { name: "Used Room", kind: "casino" }));
    await as(user, (tx) => saveCashSession(tx, { status: "completed", date: "2026-05-01", startTime: "20:00", endTime: "22:00", setting: "live_casino", accountId: acc, venueId: venue, tableFormat: "full_ring", buyIn: "100", cashOut: "100" }));
    expect((await as(user, listUsage))[venue]).toBe(1);
    await expect(as(user, (tx) => deleteListItem(tx, "venues", venue))).rejects.toThrow(/Archive it instead/);
    await as(user, (tx) => setListArchived(tx, "venues", venue, true));
    expect((await as(user, loadWorkspace)).venues.find((v) => v.id === venue)?.archivedAt).toBeTruthy();
    await expect(as(user, (tx) => saveListItem(tx, "venues", { name: "used room" }))).rejects.toThrow(/already have one/);
    const stake = await as(user, (tx) => saveListItem(tx, "stake_levels", { currency: "JPY", smallBlind: "100", bigBlind: "200" }));
    expect((await as(user, loadWorkspace)).stakeLevels.find((s) => s.id === stake)?.label).toBe("100/200 JPY");
    await as(user, (tx) => deleteListItem(tx, "stake_levels", stake));
    // Another user's ids are invisible.
    await expect(as(other, (tx) => setListArchived(tx, "venues", venue, false))).rejects.toThrow(/Not found/);
  });
});
