/** Bankroll accounts, transactions, transfers and expenses. */
import type { Tx } from "../server/db";
import { minorUnits } from "../finance/currency";
import { localDate } from "../finance/dates";
import { labelForKind, type LedgerKind } from "../finance/ledger";
import { cashSessionNet, expenseNet, tournamentAffectsBankroll, tournamentNet } from "../finance/records";
import type { CashSession, Tournament, TournamentEntry } from "../finance/types";
import { FieldError, toMinor, toMinorOrNull } from "../validation/common";
import type { AccountInput, ExpenseInput, TransactionInput, TransferInput } from "../validation/schemas";
import { assertOwned, BusinessRuleError, NotFoundError, requireAccount } from "./common";

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
export async function saveAccount(tx: Tx, input: AccountInput, existingId?: string): Promise<string> {
  minorUnits(input.currency); // throws for unsupported currency
  if (input.categoryId) {
    const c = await tx`select 1 from bankroll_categories where id = ${input.categoryId}`;
    if (c.length === 0) throw new FieldError("categoryId", "Category not found");
  }
  const row = {
    name: input.name,
    currency: input.currency,
    categoryId: input.categoryId ?? null,
    openingBalanceMinor: toMinor(input.openingBalance, input.currency, "openingBalance", { allowNegative: true }),
    openingDate: input.openingDate,
    minBalanceMinor: toMinorOrNull(input.minBalance, input.currency, "minBalance"),
    goalBalanceMinor: toMinorOrNull(input.goalBalance, input.currency, "goalBalance"),
    notes: input.notes ?? null,
  };
  const dup = await tx`select 1 from bankroll_accounts where lower(name) = lower(${input.name}) and deleted_at is null and id is distinct from ${existingId ?? null}`;
  if (dup.length) throw new FieldError("name", "You already have an account with this name");
  if (existingId) {
    const r = await tx<{ id: string }[]>`update bankroll_accounts set ${tx(row)} where id = ${existingId} and deleted_at is null returning id`;
    if (!r[0]) throw new NotFoundError("Account not found");
    return existingId;
  }
  return (await tx<{ id: string }[]>`insert into bankroll_accounts ${tx(row)} returning id`)[0].id;
}

export async function setAccountArchived(tx: Tx, id: string, archived: boolean) {
  const r = await tx`update bankroll_accounts set archived_at = ${archived ? new Date().toISOString() : null} where id = ${id} and deleted_at is null returning id`;
  if (!r.length) throw new NotFoundError("Account not found");
}

/** Accounts can only be deleted while nothing (not even trashed records) references them; archive otherwise. */
export async function deleteAccount(tx: Tx, id: string) {
  const [{ refs }] = await tx<{ refs: number }[]>`
    select (
      (select count(*) from transactions where account_id = ${id} ) +
      (select count(*) from transfers where (from_account_id = ${id} or to_account_id = ${id}) ) +
      (select count(*) from cash_game_details d where d.account_id = ${id} ) +
      (select count(*) from tournaments where account_id = ${id} ) +
      (select count(*) from expenses where account_id = ${id} )
    )::int as refs`;
  if (refs > 0) throw new BusinessRuleError(`This account has ${refs} record(s), including any in the Trash. Archive it instead, or delete those records permanently first.`);
  const r = await tx`update bankroll_accounts set deleted_at = now() where id = ${id} and deleted_at is null returning id`;
  if (!r.length) throw new NotFoundError("Account not found");
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
export async function saveTransaction(tx: Tx, input: TransactionInput, existingId?: string): Promise<string> {
  const account = await requireAccount(tx, input.accountId);
  const amount = toMinor(input.amount, account.currency, "amount", { allowNegative: input.type === "adjustment" });
  if (amount === 0) throw new FieldError("amount", "Amount cannot be zero");
  const row = {
    accountId: account.id,
    type: input.type,
    amountMinor: amount,
    occurredOn: input.occurredOn,
    description: input.description ?? null,
    reference: input.reference ?? null,
  };
  if (existingId) {
    const r = await tx<{ id: string }[]>`update transactions set ${tx(row)} where id = ${existingId} and deleted_at is null returning id`;
    if (!r[0]) throw new NotFoundError("Transaction not found");
    return existingId;
  }
  return (await tx<{ id: string }[]>`insert into transactions ${tx(row)} returning id`)[0].id;
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------
export async function saveTransfer(tx: Tx, input: TransferInput, existingId?: string): Promise<string> {
  const from = await requireAccount(tx, input.fromAccountId, "fromAccountId");
  const to = await requireAccount(tx, input.toAccountId, "toAccountId");
  const fromAmount = toMinor(input.fromAmount, from.currency, "fromAmount", { required: true });
  if (fromAmount <= 0) throw new FieldError("fromAmount", "Amount must be greater than zero");
  let toAmount: number;
  if (from.currency === to.currency) {
    toAmount = fromAmount; // same currency: always identical (also enforced by the database)
  } else {
    if (!input.toAmount) throw new FieldError("toAmount", `Enter the amount received in ${to.currency}`);
    toAmount = toMinor(input.toAmount, to.currency, "toAmount", { required: true });
    if (toAmount <= 0) throw new FieldError("toAmount", "Amount must be greater than zero");
  }
  const row = {
    fromAccountId: from.id,
    toAccountId: to.id,
    fromAmountMinor: fromAmount,
    toAmountMinor: toAmount,
    occurredOn: input.occurredOn,
    description: input.description ?? null,
  };
  if (existingId) {
    const r = await tx<{ id: string }[]>`update transfers set ${tx(row)} where id = ${existingId} and deleted_at is null returning id`;
    if (!r[0]) throw new NotFoundError("Transfer not found");
    return existingId;
  }
  return (await tx<{ id: string }[]>`insert into transfers ${tx(row)} returning id`)[0].id;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------
export class DuplicateExpenseError extends Error {}

/**
 * Expenses are costs OUTSIDE session/tournament results (travel, food,
 * coaching...). Rake, tips and table fees belong on the session itself, so
 * there is no expense category for them. A likely duplicate (same date,
 * amount, category and linked record) is rejected unless confirmed.
 */
export async function saveExpense(tx: Tx, input: ExpenseInput, existingId?: string): Promise<string> {
  const account = await requireAccount(tx, input.accountId);
  await assertOwned(tx, "expense_categories", input.categoryId, "categoryId");
  await assertOwned(tx, "sessions", input.sessionId, "sessionId");
  await assertOwned(tx, "tournaments", input.tournamentId, "tournamentId");
  await assertOwned(tx, "venues", input.venueId, "venueId");
  if (input.sessionId && input.tournamentId) throw new FieldError("tournamentId", "Link the expense to a session or a tournament, not both");
  const amount = toMinor(input.amount, account.currency, "amount", { required: true });
  if (amount <= 0) throw new FieldError("amount", "Amount must be greater than zero");
  const refunded = toMinor(input.refunded, account.currency, "refunded");
  if (refunded > amount) throw new FieldError("refunded", "Refund cannot exceed the expense amount");

  if (!input.confirmDuplicate) {
    const dup = await tx`
      select 1 from expenses
      where deleted_at is null and occurred_on = ${input.occurredOn} and amount_minor = ${amount}
        and category_id = ${input.categoryId}
        and session_id is not distinct from ${input.sessionId ?? null}
        and tournament_id is not distinct from ${input.tournamentId ?? null}
        and id is distinct from ${existingId ?? null}
      limit 1`;
    if (dup.length) throw new DuplicateExpenseError("An identical expense already exists for this date. Tick “This is not a duplicate” to save it anyway.");
  }

  const row = {
    accountId: account.id,
    categoryId: input.categoryId,
    amountMinor: amount,
    refundedMinor: refunded,
    occurredOn: input.occurredOn,
    description: input.description ?? null,
    vendor: input.vendor ?? null,
    sessionId: input.sessionId ?? null,
    tournamentId: input.tournamentId ?? null,
    venueId: input.venueId ?? null,
  };
  if (existingId) {
    const r = await tx<{ id: string }[]>`update expenses set ${tx(row)} where id = ${existingId} and deleted_at is null returning id`;
    if (!r[0]) throw new NotFoundError("Expense not found");
    return existingId;
  }
  return (await tx<{ id: string }[]>`insert into expenses ${tx(row)} returning id`)[0].id;
}

// ---------------------------------------------------------------------------
// Soft delete / restore / purge (Trash)
// ---------------------------------------------------------------------------
export const TRASHABLE = ["sessions", "tournaments", "transactions", "transfers", "expenses"] as const;
export type Trashable = (typeof TRASHABLE)[number];

export async function softDelete(tx: Tx, table: Trashable, id: string) {
  const r = await tx`update ${tx(table)} set deleted_at = now() where id = ${id} and deleted_at is null returning id`;
  if (!r.length) throw new NotFoundError("Record not found");
}

export async function restore(tx: Tx, table: Trashable, id: string) {
  const r = await tx`update ${tx(table)} set deleted_at = null where id = ${id} and deleted_at is not null returning id`;
  if (!r.length) throw new NotFoundError("Record not found in trash");
}

/**
 * Permanently delete a trashed record. Returns the storage paths of its
 * attachments (their rows cascade) so the caller can remove the files once the
 * transaction has committed.
 */
export async function purge(tx: Tx, table: Trashable, id: string): Promise<string[]> {
  const col = table === "sessions" ? "session_id" : table === "tournaments" ? "tournament_id" : table === "expenses" ? "expense_id" : null;
  let paths: string[] = [];
  if (col) {
    const rows = await tx<{ storagePath: string }[]>`
      select storage_path from attachments where ${tx(col)} = ${id}
      ${table === "tournaments" ? tx`or session_id in (select s.id from sessions s where s.tournament_id = ${id})` : tx``}`;
    paths = rows.map((r) => r.storagePath);
  }
  const r = await tx`delete from ${tx(table)} where id = ${id} and deleted_at is not null returning id`;
  if (!r.length) throw new NotFoundError("Record not found in trash");
  return paths;
}

export interface TrashItem {
  table: Trashable;
  id: string;
  deletedAt: string;
  date: string;
  label: string;
  detail: string | null;
  amountMinor: number | null;
  currency: string | null;
}

/**
 * Everything in Trash, newest deletion first. Tournament play periods are part
 * of their tournament. Amounts use the shared record formulas, never SQL math.
 */
export async function listTrash(tx: Tx, timezone: string): Promise<TrashItem[]> {
  const [sessions, tournaments, entries, transactions, transfers, expenses] = await Promise.all([
    tx<(Omit<CashSession, "tagIds" | "notes"> & { deletedAt: string; label: string; detail: string | null })[]>`
      select s.id, s.deleted_at, s.status, s.setting, s.started_at, s.ended_at, s.break_minutes, s.game_type_id, s.variant, s.venue_id, s.platform_id,
             d.account_id, a.currency, d.stake_level_id, d.small_blind_minor, d.big_blind_minor, d.straddle_minor, d.ante_minor, d.table_format,
             d.buy_in_minor, d.rebuys_minor, d.additional_minor, d.cash_out_minor, d.rake_minor, d.tips_minor, d.fees_minor, d.bonus_minor,
             d.rakeback_minor, d.hands_played,
             coalesce(g.short_name, g.name, 'Cash game') as label, coalesce(v.name, p.name) as detail
      from sessions s join cash_game_details d on d.session_id = s.id join bankroll_accounts a on a.id = d.account_id
      left join game_types g on g.id = s.game_type_id left join venues v on v.id = s.venue_id left join platforms p on p.id = s.platform_id
      where s.kind = 'cash' and s.deleted_at is not null`,
    tx<(Omit<Tournament, "entries" | "periods" | "tagIds"> & { deletedAt: string })[]>`
      select t.id, t.deleted_at, t.name, t.status, t.setting, t.format, t.speed, t.is_bounty, t.account_id, a.currency, t.venue_id, t.platform_id,
             t.game_type_id, t.start_date, t.end_date, t.field_size, t.finish_position, t.payout_minor, t.bounties_minor, t.refund_minor
      from tournaments t join bankroll_accounts a on a.id = t.account_id where t.deleted_at is not null`,
    tx<(TournamentEntry & { tournamentId: string })[]>`
      select e.tournament_id, e.entry_number, e.buy_in_minor, e.fee_minor, e.rebuy_count, e.rebuys_minor, e.addons_minor
      from tournament_entries e join tournaments t on t.id = e.tournament_id where t.deleted_at is not null`,
    tx<{ id: string; deletedAt: string; occurredOn: string; type: string; amountMinor: number; description: string | null; currency: string }[]>`
      select t.id, t.deleted_at, t.occurred_on, t.type, t.amount_minor, t.description, a.currency
      from transactions t join bankroll_accounts a on a.id = t.account_id where t.deleted_at is not null`,
    tx<{ id: string; deletedAt: string; occurredOn: string; fromAmountMinor: number; fromName: string; toName: string; currency: string }[]>`
      select t.id, t.deleted_at, t.occurred_on, t.from_amount_minor, fa.name as from_name, ta.name as to_name, fa.currency
      from transfers t join bankroll_accounts fa on fa.id = t.from_account_id join bankroll_accounts ta on ta.id = t.to_account_id where t.deleted_at is not null`,
    tx<{ id: string; deletedAt: string; occurredOn: string; amountMinor: number; refundedMinor: number; category: string; detail: string | null; currency: string }[]>`
      select e.id, e.deleted_at, e.occurred_on, e.amount_minor, e.refunded_minor, c.name as category, coalesce(e.description, e.vendor) as detail, a.currency
      from expenses e join expense_categories c on c.id = e.category_id join bankroll_accounts a on a.id = e.account_id where e.deleted_at is not null`,
  ]);
  const items: TrashItem[] = [];
  for (const s of sessions)
    items.push({ table: "sessions", id: s.id, deletedAt: s.deletedAt, date: localDate(s.startedAt, timezone), label: `${s.label} cash game`, detail: s.detail, amountMinor: s.status === "completed" ? cashSessionNet(s) : null, currency: s.currency });
  for (const t of tournaments) {
    const full: Tournament = { ...t, entries: entries.filter((e) => e.tournamentId === t.id), periods: [], tagIds: [] };
    items.push({ table: "tournaments", id: t.id, deletedAt: t.deletedAt, date: t.startDate, label: t.name, detail: "Tournament", amountMinor: tournamentAffectsBankroll(full) ? tournamentNet(full) : null, currency: t.currency });
  }
  for (const t of transactions)
    items.push({ table: "transactions", id: t.id, deletedAt: t.deletedAt, date: t.occurredOn, label: labelForKind(t.type as LedgerKind), detail: t.description, amountMinor: t.type === "withdrawal" ? -t.amountMinor : t.amountMinor, currency: t.currency });
  for (const t of transfers)
    items.push({ table: "transfers", id: t.id, deletedAt: t.deletedAt, date: t.occurredOn, label: "Transfer", detail: `${t.fromName} → ${t.toName}`, amountMinor: t.fromAmountMinor, currency: t.currency });
  for (const e of expenses)
    items.push({ table: "expenses", id: e.id, deletedAt: e.deletedAt, date: e.occurredOn, label: `Expense: ${e.category}`, detail: e.detail, amountMinor: -expenseNet(e), currency: e.currency });
  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}
