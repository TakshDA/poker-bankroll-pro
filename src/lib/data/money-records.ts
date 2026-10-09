/** Bankroll accounts, transactions, transfers and expenses. */
import type { Tx } from "../server/db";
import { minorUnits } from "../finance/currency";
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

export async function purge(tx: Tx, table: Trashable, id: string) {
  const r = await tx`delete from ${tx(table)} where id = ${id} and deleted_at is not null returning id`;
  if (!r.length) throw new NotFoundError("Record not found in trash");
}
