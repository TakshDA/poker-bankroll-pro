import type { Tx } from "../server/db";
import { FieldError } from "../validation/common";

export class NotFoundError extends Error {}
export class BusinessRuleError extends Error {}

export interface AccountRef {
  id: string;
  name: string;
  currency: string;
  archivedAt: string | null;
}

/** Load an account visible to the current user (RLS) or fail on the field. */
export async function requireAccount(tx: Tx, accountId: string, field = "accountId"): Promise<AccountRef> {
  const rows = await tx<AccountRef[]>`
    select id, name, currency, archived_at from bankroll_accounts where id = ${accountId} and deleted_at is null`;
  if (!rows[0]) throw new FieldError(field, "Account not found");
  return { ...rows[0], currency: rows[0].currency.trim() };
}

/** Ensure an optional reference exists for this user (RLS-scoped). */
export async function assertOwned(tx: Tx, table: "venues" | "platforms" | "game_types" | "stake_levels" | "expense_categories" | "sessions" | "tournaments", id: string | undefined | null, field: string) {
  if (!id) return;
  const rows = await tx`select 1 from ${tx(table)} where id = ${id}`;
  if (rows.length === 0) throw new FieldError(field, "Selection not found");
}

/** Ensure each tag exists (creating missing ones) and return their ids. */
export async function upsertTags(tx: Tx, names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    const existing = await tx<{ id: string }[]>`select id from tags where lower(name) = lower(${name})`;
    if (existing[0]) ids.push(existing[0].id);
    else ids.push((await tx<{ id: string }[]>`insert into tags (name) values (${name}) returning id`)[0].id);
  }
  return ids;
}

/** Translate Postgres errors into user-facing messages without leaking internals. */
export function friendlyDbError(e: unknown): string | null {
  const err = e as { code?: string; constraint_name?: string; message?: string };
  if (!err || typeof err !== "object" || !err.code) return null;
  switch (err.code) {
    case "23505":
      return "A record with the same details already exists.";
    case "23503":
      return "This record is referenced by other records or references something that no longer exists.";
    case "23514":
      return err.message && !err.message.includes("violates check constraint") ? err.message : "Some values are outside the allowed range.";
    case "22003":
      return "An amount is too large.";
    case "42501":
      return "You do not have permission to change this record.";
    default:
      return null;
  }
}

/** Return the id of a venue/platform with this name, creating it if needed. */
export async function ensureNamed(tx: Tx, table: "venues" | "platforms", name: string, kind?: string): Promise<string> {
  const existing = await tx<{ id: string }[]>`select id from ${tx(table)} where lower(name) = lower(${name})`;
  if (existing[0]) return existing[0].id;
  const row: Record<string, unknown> = { name };
  if (table === "venues") row.kind = kind ?? "casino";
  return (await tx<{ id: string }[]>`insert into ${tx(table)} ${tx(row)} returning id`)[0].id;
}

/** Resolve venue/platform ids for a record, honouring "add new" names. */
export async function resolvePlace(
  tx: Tx,
  setting: string,
  input: { venueId?: string; platformId?: string; newVenueName?: string; newPlatformName?: string },
): Promise<{ venueId: string | null; platformId: string | null }> {
  if (setting === "online") {
    if (input.newPlatformName) return { venueId: null, platformId: await ensureNamed(tx, "platforms", input.newPlatformName) };
    await assertOwned(tx, "platforms", input.platformId, "platformId");
    return { venueId: null, platformId: input.platformId ?? null };
  }
  if (input.newVenueName) {
    const kind = setting === "home_game" ? "home" : setting === "private_game" ? "private_club" : "casino";
    return { venueId: await ensureNamed(tx, "venues", input.newVenueName, kind), platformId: null };
  }
  await assertOwned(tx, "venues", input.venueId, "venueId");
  return { venueId: input.venueId ?? null, platformId: null };
}
