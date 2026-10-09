/**
 * End-to-end persistence tests for the service layer + finance engine:
 * create, edit, delete, restore records and check that every dependent
 * statistic and balance follows.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, closeDb, makeAccount, newUser } from "./helpers";
import { loadWorkspace } from "@/lib/data/workspace";
import { duplicateCashSession, getCashSession, saveCashSession } from "@/lib/data/sessions";
import { saveTournament } from "@/lib/data/tournaments";
import { DuplicateExpenseError, listTrash, purge, restore, saveExpense, saveTransaction, saveTransfer, softDelete, deleteAccount, saveAccount } from "@/lib/data/money-records";
import { computeDashboard, createContext } from "@/lib/finance/metrics";
import { accountBalances } from "@/lib/finance/ledger";
import { resolveRange } from "@/lib/finance/dates";
import type { CashSessionInput } from "@/lib/validation/schemas";
import type { Tx } from "@/lib/server/db";

const all = resolveRange("all", "America/Toronto");
let user: string;
let cad: string;
let usd: string;

const metrics = (tx: Tx) => loadWorkspace(tx).then((ws) => ({ ws, m: computeDashboard(createContext(ws.dataset), all) }));

const baseSession = (accountId: string, over: Partial<CashSessionInput> = {}): CashSessionInput => ({
  status: "completed",
  date: "2026-03-01",
  startTime: "20:00",
  endTime: "23:00",
  setting: "live_casino",
  accountId,
  tableFormat: "full_ring",
  buyIn: "300",
  cashOut: "450",
  ...over,
});

beforeAll(async () => {
  user = await newUser();
  cad = await makeAccount(user, { name: "Casino roll", currency: "CAD", openingBalanceMinor: 200000 });
  usd = await makeAccount(user, { name: "Online USD", currency: "USD", openingBalanceMinor: 50000 });
});
afterAll(closeDb);

describe("cash sessions", () => {
  it("persists a session crossing midnight and computes the result", async () => {
    const id = await as(user, (tx) => saveCashSession(tx, baseSession(cad, { startTime: "22:00", endTime: "02:30", rake: "40", tips: "15", tags: "deep, Bellagio" })));
    const s = await as(user, (tx) => getCashSession(tx, id));
    expect(s?.endedAt && Date.parse(s.endedAt) - Date.parse(s.startedAt)).toBe(270 * 60000);
    expect(s?.tags.sort()).toEqual(["Bellagio", "deep"]);
    const { m } = await as(user, metrics);
    expect(m.cashProfitMinor).toBe(45000 - 30000 - 1500);
    expect(m.cashMinutes).toBe(270);
    // rake is informational and not deducted
    expect(m.rakePaidMinor).toBe(4000);
  });

  it("editing a session updates every dependent statistic", async () => {
    const id = await as(user, (tx) => saveCashSession(tx, baseSession(cad, { date: "2026-03-05", cashOut: "100" })));
    let { m } = await as(user, metrics);
    const before = m.cashProfitMinor;
    await as(user, (tx) => saveCashSession(tx, baseSession(cad, { date: "2026-03-05", cashOut: "600" }), id));
    ({ m } = await as(user, metrics));
    expect(m.cashProfitMinor - before).toBe(50000);
  });

  it("deleting moves to trash and removes it from stats; restore brings it back", async () => {
    const id = await as(user, (tx) => saveCashSession(tx, baseSession(cad, { date: "2026-03-07", cashOut: "1300" })));
    const { m: withIt } = await as(user, metrics);
    await as(user, (tx) => softDelete(tx, "sessions", id));
    const { m: without } = await as(user, metrics);
    expect(withIt.cashProfitMinor - without.cashProfitMinor).toBe(100000);
    expect(withIt.currentBankroll.amountMinor - without.currentBankroll.amountMinor).toBe(100000);
    await as(user, (tx) => restore(tx, "sessions", id));
    const { m: restored } = await as(user, metrics);
    expect(restored.cashProfitMinor).toBe(withIt.cashProfitMinor);
    await as(user, (tx) => softDelete(tx, "sessions", id));
    await as(user, (tx) => purge(tx, "sessions", id));
    await expect(as(user, (tx) => restore(tx, "sessions", id))).rejects.toThrow(/not found/);
  });

  it("drafts are saved without a result and excluded until completed", async () => {
    const { m: before } = await as(user, metrics);
    const id = await as(user, (tx) => saveCashSession(tx, baseSession(cad, { status: "draft", endTime: undefined, cashOut: undefined })));
    const { m: after } = await as(user, metrics);
    expect(after.cashProfitMinor).toBe(before.cashProfitMinor);
    expect(after.completedCount).toBe(before.completedCount);
    const s = await as(user, (tx) => getCashSession(tx, id));
    expect(s?.status).toBe("draft");
    expect(s?.cashOutMinor).toBeNull();
  });

  it("the database refuses a completed cash session without a cash-out", async () => {
    await expect(
      as(user, async (tx) => {
        const [{ id }] = await tx<{ id: string }[]>`insert into sessions (kind, status, setting, started_at, ended_at) values ('cash', 'completed', 'online', now() - interval '2 hours', now()) returning id`;
        await tx`insert into cash_game_details (session_id, account_id, buy_in_minor) values (${id}, ${cad}, 100)`;
      }),
    ).rejects.toThrow(/cash-out/);
  });

  it("rejects negative and malformed money on the server", async () => {
    await expect(as(user, (tx) => saveCashSession(tx, baseSession(cad, { buyIn: "-5" })))).rejects.toThrow(/negative/);
    await expect(as(user, (tx) => saveCashSession(tx, baseSession(cad, { buyIn: "1.234" })))).rejects.toThrow(/decimal places/);
    await expect(as(user, (tx) => tx`insert into transactions (account_id, type, amount_minor, occurred_on) values (${cad}, 'deposit', -5, '2026-01-01')`)).rejects.toThrow();
  });

  it("duplicates a session as a draft for quick logging", async () => {
    const id = await as(user, (tx) => saveCashSession(tx, baseSession(cad, { smallBlind: "2", bigBlind: "5" })));
    const copyId = await as(user, (tx) => duplicateCashSession(tx, id));
    const copy = await as(user, (tx) => getCashSession(tx, copyId));
    expect(copy?.status).toBe("draft");
    expect(copy?.bigBlindMinor).toBe(500);
    expect(copy?.buyInMinor).toBe(30000);
    expect(copy?.cashOutMinor).toBeNull();
  });

  it("handles two sessions on the same day independently", async () => {
    const u = await newUser();
    const acc = await makeAccount(u);
    await as(u, (tx) => saveCashSession(tx, baseSession(acc, { date: "2026-04-01", startTime: "12:00", endTime: "14:00", cashOut: "400" })));
    await as(u, (tx) => saveCashSession(tx, baseSession(acc, { date: "2026-04-01", startTime: "18:00", endTime: "21:00", cashOut: "200" })));
    const { m } = await as(u, metrics);
    expect(m.completedCount).toBe(2);
    expect(m.cashProfitMinor).toBe(10000 - 10000);
    expect(m.monthly).toHaveLength(1);
    expect(m.cumulative).toHaveLength(1);
  });
});

describe("tournaments", () => {
  it("records multi-entry, multi-day tournaments without double counting", async () => {
    const u = await newUser();
    const acc = await makeAccount(u, { currency: "USD" });
    // Without a USD->CAD rate the result could not be aggregated, so report in USD.
    await as(u, (tx) => tx`update user_settings set base_currency = 'USD'`);
    const id = await as(u, (tx) =>
      saveTournament(tx, {
        name: "Main Event",
        status: "completed",
        setting: "live_casino",
        format: "mtt",
        speed: "regular",
        isBounty: true,
        accountId: acc,
        startDate: "2026-05-01",
        endDate: "2026-05-02",
        fieldSize: 500,
        finishPosition: 12,
        payout: "4,250",
        bounties: "300",
        entries: [
          { buyIn: "500", fee: "60" },
          { buyIn: "500", fee: "60", rebuys: "100", addons: "50" },
        ],
        periods: [
          { date: "2026-05-01", startTime: "11:00", endTime: "23:00", breakMinutes: 90 },
          { date: "2026-05-02", startTime: "12:00", endTime: "18:00" },
        ],
      }),
    );
    const { ws, m } = await as(u, metrics);
    const t = ws.dataset.tournaments.find((x) => x.id === id)!;
    expect(t.entries).toHaveLength(2);
    expect(t.periods).toHaveLength(2);
    expect(m.tournaments.count).toBe(1);
    expect(m.tournaments.entries).toBe(2);
    expect(m.tournaments.investmentMinor).toBe(127000);
    expect(m.tournaments.netMinor).toBe(425000 + 30000 - 127000);
    expect(m.tournaments.cashes).toBe(1);
    expect(m.tournamentMinutes).toBe(12 * 60 - 90 + 6 * 60);
    expect(accountBalances(ws.dataset).get(acc)).toBe(425000 + 30000 - 127000);
  });

  it("rejects a refund on a non-cancelled tournament at the database level", async () => {
    const u = await newUser();
    const acc = await makeAccount(u);
    await expect(
      as(u, (tx) => tx`insert into tournaments (account_id, name, setting, start_date, status, refund_minor) values (${acc}, 'x', 'online', '2026-01-01', 'completed', 100)`),
    ).rejects.toThrow();
  });
});

describe("bankroll accounts, transfers and expenses", () => {
  it("deposits/withdrawals change the balance but never poker profit", async () => {
    const u = await newUser();
    const acc = await makeAccount(u, { openingBalanceMinor: 100000 });
    await as(u, (tx) => saveTransaction(tx, { accountId: acc, type: "deposit", amount: "250", occurredOn: "2026-02-01" }));
    await as(u, (tx) => saveTransaction(tx, { accountId: acc, type: "withdrawal", amount: "100", occurredOn: "2026-02-02" }));
    const { m } = await as(u, metrics);
    expect(m.currentBankroll.amountMinor).toBe(115000);
    expect(m.netPokerProfitMinor).toBe(0);
  });

  it("same-currency transfers keep the combined bankroll unchanged (enforced by the database)", async () => {
    const u = await newUser();
    const a = await makeAccount(u, { openingBalanceMinor: 100000 });
    const b = await makeAccount(u, { openingBalanceMinor: 0 });
    const { m: before } = await as(u, metrics);
    await as(u, (tx) => saveTransfer(tx, { fromAccountId: a, toAccountId: b, fromAmount: "400", toAmount: "999", occurredOn: "2026-02-01" }));
    const { ws, m: after } = await as(u, metrics);
    expect(after.currentBankroll.amountMinor).toBe(before.currentBankroll.amountMinor);
    expect(accountBalances(ws.dataset).get(b)).toBe(40000);
    await expect(
      as(u, (tx) => tx`insert into transfers (from_account_id, to_account_id, from_amount_minor, to_amount_minor, occurred_on) values (${a}, ${b}, 100, 90, '2026-02-01')`),
    ).rejects.toThrow(/must match/);
  });

  it("cross-currency transfers require the received amount", async () => {
    await expect(as(user, (tx) => saveTransfer(tx, { fromAccountId: cad, toAccountId: usd, fromAmount: "135", occurredOn: "2026-02-01" }))).rejects.toThrow(/amount received/);
    await as(user, (tx) => saveTransfer(tx, { fromAccountId: cad, toAccountId: usd, fromAmount: "135", toAmount: "100", occurredOn: "2026-02-01" }));
  });

  it("detects duplicate expenses unless confirmed, and supports refunds", async () => {
    const u = await newUser();
    const acc = await makeAccount(u);
    const ws = await as(u, loadWorkspace);
    const travel = ws.expenseCategories.find((c) => c.kind === "travel")!.id;
    const input = { accountId: acc, categoryId: travel, amount: "45.50", occurredOn: "2026-03-01", confirmDuplicate: false };
    await as(u, (tx) => saveExpense(tx, input));
    await expect(as(u, (tx) => saveExpense(tx, input))).rejects.toBeInstanceOf(DuplicateExpenseError);
    await as(u, (tx) => saveExpense(tx, { ...input, confirmDuplicate: true }));
    await as(u, (tx) => saveExpense(tx, { ...input, amount: "100", refunded: "100", confirmDuplicate: false }));
    await expect(as(u, (tx) => saveExpense(tx, { ...input, amount: "10", refunded: "20" }))).rejects.toThrow(/Refund cannot exceed/);
    const { m } = await as(u, metrics);
    expect(m.expensesMinor).toBe(9100);
    expect(m.netPokerProfitMinor).toBe(-9100);
  });

  it("lists every kind of trashed record with its signed effect, and purges attachments rows", async () => {
    const u = await newUser();
    const a = await makeAccount(u, { openingBalanceMinor: 100000 });
    const b = await makeAccount(u);
    const ws = await as(u, loadWorkspace);
    const food = ws.expenseCategories.find((c) => c.kind === "food")!.id;
    const sid = await as(u, (tx) => saveCashSession(tx, baseSession(a, { date: "2026-04-01", startTime: "23:30", endTime: "01:00", buyIn: "200", cashOut: "150", tips: "5" })));
    const eid = await as(u, (tx) => saveExpense(tx, { accountId: a, categoryId: food, amount: "30", refunded: "10", occurredOn: "2026-04-01", confirmDuplicate: false }));
    const wid = await as(u, (tx) => saveTransaction(tx, { accountId: a, type: "withdrawal", amount: "40", occurredOn: "2026-04-02" }));
    const tid = await as(u, (tx) => saveTransfer(tx, { fromAccountId: a, toAccountId: b, fromAmount: "25", occurredOn: "2026-04-03" }));
    await as(u, (tx) => tx`insert into attachments (expense_id, storage_path, file_name, content_type, size_bytes) values (${eid}, ${`${u}/x`}, 'r.png', 'image/png', 10)`);
    for (const [t, id] of [["sessions", sid], ["expenses", eid], ["transactions", wid], ["transfers", tid]] as const) await as(u, (tx) => softDelete(tx, t, id));
    const items = await as(u, (tx) => listTrash(tx, "America/Toronto"));
    const effect = Object.fromEntries(items.map((i) => [i.table, i.amountMinor]));
    expect(effect).toEqual({ sessions: -5500, expenses: -2000, transactions: -4000, transfers: 2500 });
    expect(items.find((i) => i.table === "sessions")!.date).toBe("2026-04-01"); // local date, not UTC
    const paths = await as(u, (tx) => purge(tx, "expenses", eid));
    expect(paths).toEqual([`${u}/x`]);
    expect(await as(u, (tx) => tx`select 1 from attachments`)).toHaveLength(0);
    expect(await as(u, (tx) => listTrash(tx, "America/Toronto"))).toHaveLength(3);
  });

  it("account currency is locked once records reference it, and in-use accounts cannot be deleted", async () => {
    const u = await newUser();
    const acc = await as(u, (tx) => saveAccount(tx, { name: "Lock test", currency: "CAD", openingBalance: "10", openingDate: "2026-01-01" }));
    await as(u, (tx) => saveTransaction(tx, { accountId: acc, type: "deposit", amount: "5", occurredOn: "2026-01-02" }));
    await expect(as(u, (tx) => tx`update bankroll_accounts set currency = 'USD' where id = ${acc}`)).rejects.toThrow(/currency/);
    await expect(as(u, (tx) => deleteAccount(tx, acc))).rejects.toThrow(/Archive it instead/);
  });

  it("writes an audit trail for edits and soft deletes", async () => {
    const u = await newUser();
    const acc = await makeAccount(u);
    const id = await as(u, (tx) => saveTransaction(tx, { accountId: acc, type: "deposit", amount: "10", occurredOn: "2026-01-02" }));
    await as(u, (tx) => saveTransaction(tx, { accountId: acc, type: "deposit", amount: "12", occurredOn: "2026-01-02" }, id));
    await as(u, (tx) => softDelete(tx, "transactions", id));
    const log = await as(u, (tx) => tx<{ action: string; newData: Record<string, unknown> | null }[]>`select action, new_data from audit_log where record_id = ${id} order by id`);
    expect(log.map((l) => l.action)).toEqual(["insert", "update", "soft_delete"]);
    expect(log[1].newData).toMatchObject({ amountMinor: 1200 });
  });
});
