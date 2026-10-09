/**
 * Database authorization: Row Level Security must confine every query to the
 * signed-in user, including attempts to read, change, or reference another
 * user's records by guessing their ids.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, closeDb, db, makeAccount, newUser } from "./helpers";
import { loadWorkspace } from "@/lib/data/workspace";
import { saveCashSession } from "@/lib/data/sessions";
import { exportBackup } from "@/lib/data/backup";

let alice: string;
let bob: string;
let aliceAccount: string;
let aliceSession: string;

beforeAll(async () => {
  alice = await newUser();
  bob = await newUser();
  aliceAccount = await makeAccount(alice, { name: "Alice main", openingBalanceMinor: 100000 });
  aliceSession = await as(alice, (tx) =>
    saveCashSession(tx, {
      status: "completed",
      date: "2026-03-01",
      startTime: "19:00",
      endTime: "23:00",
      setting: "live_casino",
      accountId: aliceAccount,
      tableFormat: "full_ring",
      buyIn: "300",
      cashOut: "500",
    }),
  );
});

afterAll(closeDb);

describe("row level security", () => {
  it("new users are bootstrapped with private settings and defaults", async () => {
    const ws = await as(bob, loadWorkspace);
    expect(ws.settings.userId).toBe(bob);
    expect(ws.expenseCategories.length).toBeGreaterThan(5);
    expect(ws.gameTypes.length).toBeGreaterThan(0);
    expect(ws.dataset.accounts).toHaveLength(0);
  });

  it("a user cannot see another user's records", async () => {
    const ws = await as(bob, loadWorkspace);
    expect(ws.dataset.cashSessions).toHaveLength(0);
    const direct = await as(bob, (tx) => tx`select id from sessions where id = ${aliceSession}`);
    expect(direct).toHaveLength(0);
    const accounts = await as(bob, (tx) => tx`select id from bankroll_accounts where id = ${aliceAccount}`);
    expect(accounts).toHaveLength(0);
    const audit = await as(bob, (tx) => tx`select id from audit_log where record_id = ${aliceSession}`);
    expect(audit).toHaveLength(0);
  });

  it("a user cannot update or delete another user's records by id", async () => {
    const upd = await as(bob, (tx) => tx`update cash_game_details set cash_out_minor = 0 where session_id = ${aliceSession} returning session_id`);
    expect(upd).toHaveLength(0);
    const del = await as(bob, (tx) => tx`delete from sessions where id = ${aliceSession} returning id`);
    expect(del).toHaveLength(0);
    const still = await as(alice, (tx) => tx<{ cashOutMinor: number }[]>`select cash_out_minor from cash_game_details where session_id = ${aliceSession}`);
    expect(still[0].cashOutMinor).toBe(50000);
  });

  it("a user cannot insert rows owned by someone else", async () => {
    await expect(
      as(bob, (tx) => tx`insert into bankroll_accounts (user_id, name, currency) values (${alice}, 'sneaky', 'CAD')`),
    ).rejects.toThrow(/row-level security/);
  });

  it("a user cannot reference another user's account from their own records", async () => {
    // Composite (id, user_id) foreign keys reject cross-user references even
    // when the attacker knows the id.
    await expect(
      as(bob, (tx) => tx`insert into transactions (account_id, type, amount_minor, occurred_on) values (${aliceAccount}, 'deposit', 100, '2026-01-01')`),
    ).rejects.toThrow();
    // The service layer reports it as a missing account.
    await expect(
      as(bob, (tx) =>
        saveCashSession(tx, {
          status: "completed", date: "2026-03-01", startTime: "19:00", endTime: "23:00", setting: "live_casino",
          accountId: aliceAccount, tableFormat: "full_ring", buyIn: "100", cashOut: "0",
        }),
      ),
    ).rejects.toThrow(/Account not found/);
  });

  it("queries without a user context see nothing", async () => {
    const rows = await db().begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`;
      return tx`select id from sessions`;
    });
    expect(rows).toHaveLength(0);
  });

  it("the app login role has no direct table access (only through RLS)", async () => {
    await expect(db()`select id from public.sessions`).rejects.toThrow(/permission denied/);
  });

  it("anonymous role is denied", async () => {
    await expect(
      db().begin(async (tx) => {
        await tx`select set_config('role', 'anon', true)`;
        return tx`select id from sessions`;
      }),
    ).rejects.toThrow();
  });

  it("users cannot forge or erase audit records", async () => {
    await expect(
      as(alice, (tx) => tx`insert into audit_log (user_id, table_name, record_id, action) values (${alice}, 'x', ${aliceSession}, 'insert')`),
    ).rejects.toThrow(/permission denied/);
    await expect(as(alice, (tx) => tx`delete from audit_log`)).rejects.toThrow(/permission denied/);
    const mine = await as(alice, (tx) => tx`select id from audit_log where record_id = ${aliceSession}`);
    expect(mine.length).toBeGreaterThan(0);
  });

  it("a JSON backup contains only the signed-in user's rows", async () => {
    const mine = await as(alice, exportBackup);
    const theirs = await as(bob, exportBackup);
    expect(mine.tables.bankroll_accounts.map((r) => r.id)).toContain(aliceAccount);
    expect(mine.tables.sessions.map((r) => r.id)).toContain(aliceSession);
    expect(mine.tables.cash_game_details[0]).toHaveProperty("buy_in_minor", 30000);
    expect(theirs.tables.bankroll_accounts).toHaveLength(0);
    expect(theirs.tables.sessions).toHaveLength(0);
    for (const rows of Object.values(theirs.tables)) for (const r of rows) if ("user_id" in r) expect(r.user_id).toBe(bob);
  });
});
