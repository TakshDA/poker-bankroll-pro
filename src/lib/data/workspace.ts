/**
 * Loads everything the finance engine and the UI pickers need for one user.
 * Always called inside withUser(), so RLS limits every query to that user.
 * Soft-deleted records are excluded here, which is what removes them from
 * every metric.
 */
import type { Tx } from "../server/db";
import type {
  Account,
  CashSession,
  Dataset,
  Expense,
  PlayPeriod,
  Tournament,
  TournamentEntry,
  Transaction,
  Transfer,
} from "../finance/types";
import type { ExchangeRate } from "../finance/fx";

export interface UserSettings {
  userId: string;
  displayName: string | null;
  baseCurrency: string;
  enabledCurrencies: string[];
  timezone: string;
  weekStartsOn: number;
  defaultAccountId: string | null;
  cashBuyInsRequired: number;
  cashBuyInBigBlinds: number;
  tournamentBuyInsRequired: number;
  cooldownMinutes: number;
}

export interface Venue { id: string; name: string; kind: string; city: string | null; region: string | null; country: string | null; notes: string | null; archivedAt: string | null }
export interface Platform { id: string; name: string; website: string | null; notes: string | null; archivedAt: string | null }
export interface GameType { id: string; name: string; shortName: string | null; bettingStructure: string; archivedAt: string | null }
export interface StakeLevel { id: string; label: string; currency: string; smallBlindMinor: number; bigBlindMinor: number; straddleMinor: number | null; anteMinor: number | null; archivedAt: string | null }
export interface Tag { id: string; name: string }
export interface Category { id: string; name: string }
export interface ExpenseCategory { id: string; name: string; kind: string; archivedAt: string | null }
export interface RateRow extends ExchangeRate { id: string; source: string | null }

export interface Reference {
  venues: Venue[];
  platforms: Platform[];
  gameTypes: GameType[];
  stakeLevels: StakeLevel[];
  tags: Tag[];
  bankrollCategories: Category[];
  expenseCategories: ExpenseCategory[];
}

export interface Workspace extends Reference {
  settings: UserSettings;
  dataset: Dataset;
  rateRows: RateRow[];
}

export async function getSettings(tx: Tx): Promise<UserSettings> {
  const rows = await tx<UserSettings[]>`
    select user_id, display_name, base_currency, enabled_currencies::text[] as enabled_currencies, timezone,
           week_starts_on, default_account_id, cash_buy_ins_required, cash_buy_in_big_blinds,
           tournament_buy_ins_required, cooldown_minutes
    from user_settings limit 1`;
  if (rows[0]) return { ...rows[0], baseCurrency: rows[0].baseCurrency.trim() };
  // Self-heal if the bootstrap row is missing.
  const inserted = await tx<UserSettings[]>`
    insert into user_settings default values
    returning user_id, display_name, base_currency, enabled_currencies::text[] as enabled_currencies, timezone,
              week_starts_on, default_account_id, cash_buy_ins_required, cash_buy_in_big_blinds,
              tournament_buy_ins_required, cooldown_minutes`;
  return inserted[0];
}

export async function getReference(tx: Tx): Promise<Reference> {
  const [venues, platforms, gameTypes, stakeLevels, tags, bankrollCategories, expenseCategories] = await Promise.all([
    tx<Venue[]>`select id, name, kind, city, region, country, notes, archived_at from venues order by lower(name)`,
    tx<Platform[]>`select id, name, website, notes, archived_at from platforms order by lower(name)`,
    tx<GameType[]>`select id, name, short_name, betting_structure, archived_at from game_types order by lower(name)`,
    tx<StakeLevel[]>`select id, label, currency, small_blind_minor, big_blind_minor, straddle_minor, ante_minor, archived_at
                     from stake_levels order by currency, big_blind_minor, small_blind_minor`,
    tx<Tag[]>`select id, name from tags order by lower(name)`,
    tx<Category[]>`select id, name from bankroll_categories order by lower(name)`,
    tx<ExpenseCategory[]>`select id, name, kind, archived_at from expense_categories order by lower(name)`,
  ]);
  return { venues, platforms, gameTypes, stakeLevels, tags, bankrollCategories, expenseCategories };
}

export async function loadWorkspace(tx: Tx): Promise<Workspace> {
  const settings = await getSettings(tx);
  const [ref, accounts, cashRows, tournamentRows, entryRows, periodRows, transactions, transfers, expenses, rateRows, sessionTags, tournamentTags] =
    await Promise.all([
      getReference(tx),
      tx<(Account & { archivedAt: string | null })[]>`
        select id, name, currency, opening_balance_minor, opening_date, min_balance_minor, goal_balance_minor, category_id, archived_at
        from bankroll_accounts where deleted_at is null order by created_at`,
      tx<Omit<CashSession, "tagIds" | "currency">[]>`
        select s.id, s.status, s.setting, s.started_at, s.ended_at, s.break_minutes, s.game_type_id, s.variant,
               s.venue_id, s.platform_id, s.notes,
               d.account_id, d.stake_level_id, d.small_blind_minor, d.big_blind_minor, d.straddle_minor, d.ante_minor,
               d.table_format, d.buy_in_minor, d.rebuys_minor, d.additional_minor, d.cash_out_minor, d.rake_minor,
               d.tips_minor, d.fees_minor, d.bonus_minor, d.rakeback_minor, d.hands_played
        from sessions s join cash_game_details d on d.session_id = s.id
        where s.kind = 'cash' and s.deleted_at is null
        order by s.started_at`,
      tx<Omit<Tournament, "entries" | "periods" | "tagIds" | "currency">[]>`
        select id, name, status, setting, format, speed, is_bounty, account_id, venue_id, platform_id, game_type_id,
               start_date, end_date, field_size, finish_position, payout_minor, bounties_minor, refund_minor, notes
        from tournaments where deleted_at is null order by start_date`,
      tx<(TournamentEntry & { tournamentId: string })[]>`
        select e.tournament_id, e.entry_number, e.buy_in_minor, e.fee_minor, e.rebuy_count, e.rebuys_minor, e.addons_minor
        from tournament_entries e order by e.tournament_id, e.entry_number`,
      tx<(PlayPeriod & { tournamentId: string })[]>`
        select id, tournament_id, status, started_at, ended_at, break_minutes, day_label
        from sessions where kind = 'tournament' and deleted_at is null order by started_at`,
      tx<Transaction[]>`
        select id, account_id, type, amount_minor, occurred_on, description
        from transactions where deleted_at is null order by occurred_on, created_at`,
      tx<Transfer[]>`
        select id, from_account_id, to_account_id, from_amount_minor, to_amount_minor, occurred_on, description
        from transfers where deleted_at is null order by occurred_on, created_at`,
      tx<Expense[]>`
        select e.id, e.account_id, e.category_id, c.name as category_name, c.kind as category_kind, e.amount_minor,
               e.refunded_minor, e.occurred_on, e.session_id, e.tournament_id, e.venue_id, e.description
        from expenses e join expense_categories c on c.id = e.category_id
        where e.deleted_at is null order by e.occurred_on, e.created_at`,
      tx<RateRow[]>`
        select id, base_currency, quote_currency, rate::text as rate, effective_date, source
        from exchange_rates order by effective_date desc, base_currency, quote_currency`,
      tx<{ sessionId: string; tagId: string }[]>`select session_id, tag_id from session_tags`,
      tx<{ tournamentId: string; tagId: string }[]>`select tournament_id, tag_id from tournament_tags`,
    ]);

  const accountCurrency = new Map(accounts.map((a) => [a.id, a.currency.trim()]));
  const tagsBySession = groupBy(sessionTags, (r) => r.sessionId, (r) => r.tagId);
  const tagsByTournament = groupBy(tournamentTags, (r) => r.tournamentId, (r) => r.tagId);
  const entriesBy = groupBy(entryRows, (r) => r.tournamentId, ({ tournamentId: _t, ...e }) => e);
  const periodsBy = groupBy(periodRows, (r) => r.tournamentId, ({ tournamentId: _t, ...p }) => p);

  const dataset: Dataset = {
    settings: { baseCurrency: settings.baseCurrency, timezone: settings.timezone, weekStartsOn: settings.weekStartsOn },
    accounts: accounts.map(({ archivedAt, ...a }) => ({ ...a, currency: a.currency.trim(), archived: archivedAt !== null })),
    cashSessions: cashRows.map((s) => ({ ...s, currency: accountCurrency.get(s.accountId) ?? "CAD", tagIds: tagsBySession.get(s.id) ?? [] })),
    tournaments: tournamentRows.map((t) => ({
      ...t,
      currency: accountCurrency.get(t.accountId) ?? "CAD",
      entries: entriesBy.get(t.id) ?? [],
      periods: periodsBy.get(t.id) ?? [],
      tagIds: tagsByTournament.get(t.id) ?? [],
    })),
    transactions,
    transfers,
    expenses,
    rates: rateRows.map((r) => ({ ...r, baseCurrency: r.baseCurrency.trim(), quoteCurrency: r.quoteCurrency.trim() })),
  };

  return { ...ref, settings, dataset, rateRows: dataset.rates as RateRow[] };
}

function groupBy<T, V>(rows: T[], key: (r: T) => string, value: (r: T) => V): Map<string, V[]> {
  const m = new Map<string, V[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k) ?? [];
    list.push(value(r));
    m.set(k, list);
  }
  return m;
}
