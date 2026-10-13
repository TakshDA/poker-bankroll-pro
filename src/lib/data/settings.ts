/**
 * Preferences, exchange rates and the user's own lists (venues, sites, games,
 * stakes, expense categories). Every function runs inside withUser(), so RLS
 * limits reads and writes to the signed-in user.
 */
import type { Tx } from "../server/db";
import { minorUnits } from "../finance/currency";
import { minorToDecimal } from "../finance/money";
import { FieldError, toMinor, toMinorOrNull } from "../validation/common";
import { BusinessRuleError, NotFoundError, requireAccount } from "./common";

export interface PreferencesInput {
  displayName?: string;
  baseCurrency: string;
  timezone: string;
  weekStartsOn: number;
  enabledCurrencies: string[];
  defaultAccountId?: string;
}

export async function savePreferences(tx: Tx, input: PreferencesInput): Promise<void> {
  const known = await tx<{ code: string }[]>`select code from currencies`;
  const codes = new Set(known.map((c) => c.code.trim()));
  if (!codes.has(input.baseCurrency)) throw new FieldError("baseCurrency", "Unknown currency");
  const unknown = input.enabledCurrencies.find((c) => !codes.has(c));
  if (unknown) throw new FieldError("enabledCurrencies", `Unknown currency ${unknown}`);
  // The base currency is always available in pickers.
  const enabled = Array.from(new Set([input.baseCurrency, ...input.enabledCurrencies]));
  if (input.defaultAccountId) await requireAccount(tx, input.defaultAccountId, "defaultAccountId");
  await tx`
    update user_settings set
      display_name = ${input.displayName ?? null},
      base_currency = ${input.baseCurrency},
      timezone = ${input.timezone},
      week_starts_on = ${input.weekStartsOn},
      enabled_currencies = ${enabled}::char(3)[],
      default_account_id = ${input.defaultAccountId ?? null},
      updated_at = now()
    where user_id = (select auth.uid())`;
}

export interface RateInput {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
  effectiveDate: string;
  source?: string;
}

/** Add a rate, or replace the one already recorded for that pair and date. */
export async function saveRate(tx: Tx, input: RateInput): Promise<string> {
  const rows = await tx<{ id: string }[]>`
    insert into exchange_rates (base_currency, quote_currency, rate, effective_date, source)
    values (${input.baseCurrency}, ${input.quoteCurrency}, ${input.rate}, ${input.effectiveDate}, ${input.source ?? null})
    on conflict (user_id, base_currency, quote_currency, effective_date)
    do update set rate = excluded.rate, source = excluded.source
    returning id`;
  return rows[0].id;
}

export async function deleteRate(tx: Tx, id: string): Promise<void> {
  const rows = await tx`delete from exchange_rates where id = ${id} returning id`;
  if (rows.length === 0) throw new NotFoundError("Rate not found");
}

export const LISTS = ["venues", "platforms", "game_types", "stake_levels", "expense_categories"] as const;
export type ListKind = (typeof LISTS)[number];

export function isListKind(v: string): v is ListKind {
  return (LISTS as readonly string[]).includes(v);
}

/** How many records (including ones in the trash) point at each list item. */
export async function listUsage(tx: Tx): Promise<Record<string, number>> {
  const rows = await tx<{ id: string; n: number }[]>`
    select id, count(*)::int as n from (
      select venue_id as id from sessions where venue_id is not null
      union all select platform_id from sessions where platform_id is not null
      union all select game_type_id from sessions where game_type_id is not null
      union all select venue_id from tournaments where venue_id is not null
      union all select platform_id from tournaments where platform_id is not null
      union all select game_type_id from tournaments where game_type_id is not null
      union all select stake_level_id from cash_game_details where stake_level_id is not null
      union all select venue_id from expenses where venue_id is not null
      union all select category_id from expenses where category_id is not null
      union all select venue_id from planned_sessions where venue_id is not null
      union all select platform_id from planned_sessions where platform_id is not null
      union all select game_type_id from planned_sessions where game_type_id is not null
      union all select stake_level_id from planned_sessions where stake_level_id is not null
    ) u group by id`;
  return Object.fromEntries(rows.map((r) => [r.id, r.n]));
}

type ListInput = Record<string, string | undefined>;

function rowFor(kind: ListKind, input: ListInput): Record<string, unknown> {
  switch (kind) {
    case "venues":
      return { name: input.name, kind: input.kind ?? "casino", city: input.city ?? null, region: input.region ?? null, country: input.country ?? null, notes: input.notes ?? null };
    case "platforms":
      return { name: input.name, website: input.website ?? null, notes: input.notes ?? null };
    case "game_types":
      return { name: input.name, short_name: input.shortName ?? null, betting_structure: input.bettingStructure ?? "no_limit" };
    case "expense_categories":
      return { name: input.name, kind: input.kind ?? "other" };
    case "stake_levels": {
      const currency = input.currency!;
      const sb = toMinor(input.smallBlind, currency, "smallBlind", { required: true });
      const bb = toMinor(input.bigBlind, currency, "bigBlind", { required: true });
      if (bb <= 0) throw new FieldError("bigBlind", "Big blind must be more than zero");
      if (sb > bb) throw new FieldError("smallBlind", "Small blind cannot be more than the big blind");
      return {
        label: input.label ?? null,
        currency,
        small_blind_minor: sb,
        big_blind_minor: bb,
        straddle_minor: toMinorOrNull(input.straddle, currency, "straddle"),
        ante_minor: toMinorOrNull(input.ante, currency, "ante"),
      };
    }
  }
}

const NAME_COLUMN: Record<ListKind, string> = { venues: "name", platforms: "name", game_types: "name", stake_levels: "label", expense_categories: "name" };

export async function saveListItem(tx: Tx, kind: ListKind, input: ListInput, id?: string): Promise<string> {
  const row = rowFor(kind, input);
  if (kind === "stake_levels" && !row.label) row.label = stakeLabel(row);
  const nameCol = NAME_COLUMN[kind];
  const clash = await tx<{ id: string }[]>`
    select id from ${tx(kind)} where lower(${tx(nameCol)}) = lower(${row[nameCol] as string}) and id is distinct from ${id ?? null}::uuid`;
  if (clash[0]) throw new FieldError(kind === "stake_levels" ? "label" : "name", "You already have one with this name");
  if (id) {
    const rows = await tx<{ id: string }[]>`update ${tx(kind)} set ${tx(row)} where id = ${id} returning id`;
    if (!rows[0]) throw new NotFoundError("Not found");
    return rows[0].id;
  }
  return (await tx<{ id: string }[]>`insert into ${tx(kind)} ${tx(row)} returning id`)[0].id;
}

function stakeLabel(row: Record<string, unknown>): string {
  const digits = minorUnits(row.currency as string);
  // "1.00" -> "1", "0.50" -> "0.5"
  const fmt = (m: unknown) => minorToDecimal(Number(m), digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return `${fmt(row.small_blind_minor)}/${fmt(row.big_blind_minor)} ${row.currency}`;
}

export async function setListArchived(tx: Tx, kind: ListKind, id: string, archived: boolean): Promise<void> {
  const rows = await tx`update ${tx(kind)} set archived_at = ${archived ? new Date() : null} where id = ${id} returning id`;
  if (rows.length === 0) throw new NotFoundError("Not found");
}

/** Delete only items nothing refers to; used items are archived instead so history keeps its labels. */
export async function deleteListItem(tx: Tx, kind: ListKind, id: string): Promise<void> {
  const used = (await listUsage(tx))[id] ?? 0;
  if (used > 0) throw new BusinessRuleError(`Used by ${used} record${used === 1 ? "" : "s"}. Archive it instead so past records keep their label.`);
  const rows = await tx`delete from ${tx(kind)} where id = ${id} returning id`;
  if (rows.length === 0) throw new NotFoundError("Not found");
}

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
}

export async function listCurrencies(tx: Tx): Promise<CurrencyInfo[]> {
  const rows = await tx<CurrencyInfo[]>`select code, name, symbol from currencies order by code`;
  return rows.map((r) => ({ ...r, code: r.code.trim() }));
}
