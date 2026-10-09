-- Poker Bankroll Pro: core schema
--
-- Conventions
--   * Every user-owned table has `user_id uuid not null default auth.uid()`.
--   * Money is stored as BIGINT minor units (cents) in the currency named on the
--     same row (or its account). No floating point money columns exist.
--   * Child rows reference parents through composite (id, user_id) foreign
--     keys, so a row can never point at another user's record even if an
--     attacker guesses its id.
--   * Financial records are soft-deleted (`deleted_at`) so they can be
--     restored from the Trash; permanent deletion is an explicit action.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.play_setting as enum ('live_casino', 'online', 'private_game', 'home_game');
create type public.session_kind as enum ('cash', 'tournament');
create type public.record_status as enum ('draft', 'completed', 'cancelled');
create type public.tournament_status as enum ('draft', 'in_progress', 'completed', 'cancelled');
create type public.table_format as enum ('heads_up', 'short_handed', 'six_max', 'full_ring', 'other');
create type public.betting_structure as enum ('no_limit', 'pot_limit', 'fixed_limit', 'spread_limit', 'mixed', 'other');
create type public.venue_kind as enum ('casino', 'card_room', 'private_club', 'home', 'other');
create type public.tournament_format as enum ('mtt', 'sit_and_go', 'satellite', 'spin', 'other');
create type public.tournament_speed as enum ('regular', 'turbo', 'hyper', 'deep', 'other');
create type public.transaction_type as enum ('deposit', 'withdrawal', 'bonus', 'rakeback', 'adjustment');
create type public.expense_kind as enum (
  'travel', 'accommodation', 'food', 'parking', 'coaching', 'training',
  'software', 'equipment', 'membership', 'other'
);
create type public.goal_kind as enum (
  'profit', 'hours', 'expense_budget', 'max_session_loss', 'daily_loss_limit',
  'min_bankroll', 'session_count'
);
create type public.goal_period as enum ('per_session', 'daily', 'weekly', 'monthly', 'yearly', 'custom');
create type public.plan_status as enum ('planned', 'done', 'skipped');
create type public.import_entity as enum ('sessions', 'tournaments', 'transactions', 'expenses');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table public.currencies (
  code char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name text not null,
  symbol text not null,
  minor_units smallint not null check (minor_units between 0 and 4)
);

insert into public.currencies (code, name, symbol, minor_units) values
  ('CAD', 'Canadian Dollar', '$', 2),
  ('USD', 'US Dollar', '$', 2),
  ('EUR', 'Euro', '€', 2),
  ('GBP', 'British Pound', '£', 2),
  ('AUD', 'Australian Dollar', '$', 2),
  ('NZD', 'New Zealand Dollar', '$', 2),
  ('JPY', 'Japanese Yen', '¥', 0),
  ('CHF', 'Swiss Franc', 'CHF', 2),
  ('MXN', 'Mexican Peso', '$', 2),
  ('SEK', 'Swedish Krona', 'kr', 2),
  ('NOK', 'Norwegian Krone', 'kr', 2),
  ('DKK', 'Danish Krone', 'kr', 2),
  ('HKD', 'Hong Kong Dollar', '$', 2),
  ('SGD', 'Singapore Dollar', '$', 2),
  ('INR', 'Indian Rupee', '₹', 2),
  ('BRL', 'Brazilian Real', 'R$', 2),
  ('ZAR', 'South African Rand', 'R', 2),
  ('MOP', 'Macanese Pataca', 'MOP$', 2),
  ('PHP', 'Philippine Peso', '₱', 2),
  ('KRW', 'South Korean Won', '₩', 0);

-- ---------------------------------------------------------------------------
-- User settings
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  base_currency char(3) not null default 'CAD' references public.currencies (code),
  enabled_currencies char(3)[] not null default array['CAD', 'USD']::char(3)[],
  timezone text not null default 'America/Toronto' check (char_length(timezone) between 1 and 64),
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  default_account_id uuid,
  -- Bankroll requirement rules (used for "how many buy-ins do I have" checks)
  cash_buy_ins_required smallint not null default 30 check (cash_buy_ins_required between 1 and 1000),
  cash_buy_in_big_blinds smallint not null default 100 check (cash_buy_in_big_blinds between 1 and 1000),
  tournament_buy_ins_required smallint not null default 100 check (tournament_buy_ins_required between 1 and 10000),
  cooldown_minutes smallint not null default 0 check (cooldown_minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger user_settings_updated before update on public.user_settings
  for each row execute function public.set_updated_at();

-- 1 unit of base_currency = rate units of quote_currency, effective from effective_date.
create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  base_currency char(3) not null references public.currencies (code),
  quote_currency char(3) not null references public.currencies (code),
  rate numeric(20, 10) not null check (rate > 0),
  effective_date date not null,
  source text check (char_length(source) <= 120),
  created_at timestamptz not null default now(),
  check (base_currency <> quote_currency),
  unique (user_id, base_currency, quote_currency, effective_date)
);

-- ---------------------------------------------------------------------------
-- Configuration entities (venues, platforms, games, stakes, tags, categories)
-- ---------------------------------------------------------------------------
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind public.venue_kind not null default 'casino',
  city text check (char_length(city) <= 120),
  region text check (char_length(region) <= 120),
  country text check (char_length(country) <= 120),
  notes text check (char_length(notes) <= 4000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index venues_user_name_uq on public.venues (user_id, lower(name));
create trigger venues_updated before update on public.venues for each row execute function public.set_updated_at();

create table public.platforms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  website text check (char_length(website) <= 300),
  notes text check (char_length(notes) <= 4000),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index platforms_user_name_uq on public.platforms (user_id, lower(name));
create trigger platforms_updated before update on public.platforms for each row execute function public.set_updated_at();

create table public.game_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  short_name text check (char_length(short_name) <= 16),
  betting_structure public.betting_structure not null default 'no_limit',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index game_types_user_name_uq on public.game_types (user_id, lower(name));
create trigger game_types_updated before update on public.game_types for each row execute function public.set_updated_at();

create table public.stake_levels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  currency char(3) not null references public.currencies (code),
  small_blind_minor bigint not null check (small_blind_minor >= 0),
  big_blind_minor bigint not null check (big_blind_minor > 0),
  straddle_minor bigint check (straddle_minor >= 0),
  ante_minor bigint check (ante_minor >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (small_blind_minor <= big_blind_minor)
);
create unique index stake_levels_user_label_uq on public.stake_levels (user_id, currency, lower(label));
create trigger stake_levels_updated before update on public.stake_levels for each row execute function public.set_updated_at();

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index tags_user_name_uq on public.tags (user_id, lower(name));

create table public.bankroll_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index bankroll_categories_user_name_uq on public.bankroll_categories (user_id, lower(name));

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind public.expense_kind not null default 'other',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index expense_categories_user_name_uq on public.expense_categories (user_id, lower(name));

-- ---------------------------------------------------------------------------
-- Bankroll accounts and money movements
-- ---------------------------------------------------------------------------
create table public.bankroll_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category_id uuid,
  currency char(3) not null references public.currencies (code),
  opening_balance_minor bigint not null default 0,
  opening_date date not null default current_date,
  min_balance_minor bigint check (min_balance_minor >= 0),
  goal_balance_minor bigint check (goal_balance_minor >= 0),
  notes text check (char_length(notes) <= 4000),
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.bankroll_categories (id, user_id) on delete set null (category_id)
);
create unique index bankroll_accounts_user_name_uq on public.bankroll_accounts (user_id, lower(name)) where deleted_at is null;
create trigger bankroll_accounts_updated before update on public.bankroll_accounts for each row execute function public.set_updated_at();

alter table public.user_settings
  add constraint user_settings_default_account_fk
  foreign key (default_account_id, user_id) references public.bankroll_accounts (id, user_id) on delete set null (default_account_id);

-- Import batches are declared early because imported records reference them.
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entity public.import_entity not null,
  file_name text not null check (char_length(file_name) <= 255),
  total_rows integer not null default 0 check (total_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  duplicate_rows integer not null default 0 check (duplicate_rows >= 0),
  error_rows integer not null default 0 check (error_rows >= 0),
  mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  unique (id, user_id)
);

-- Deposits, withdrawals, standalone bonuses/rakeback and manual adjustments.
-- Sign convention: amount_minor is always positive for deposit/withdrawal/
-- bonus/rakeback (the type defines the direction); adjustments are signed.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null,
  type public.transaction_type not null,
  amount_minor bigint not null,
  occurred_on date not null,
  description text check (char_length(description) <= 500),
  reference text check (char_length(reference) <= 120),
  import_batch_id uuid,
  dedupe_key text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.bankroll_accounts (id, user_id) on delete restrict,
  foreign key (import_batch_id, user_id) references public.import_batches (id, user_id) on delete set null (import_batch_id),
  check ((type = 'adjustment' and amount_minor <> 0) or (type <> 'adjustment' and amount_minor > 0))
);
create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);
create index transactions_account_idx on public.transactions (account_id);
create unique index transactions_dedupe_uq on public.transactions (user_id, dedupe_key) where dedupe_key is not null and deleted_at is null;
create trigger transactions_updated before update on public.transactions for each row execute function public.set_updated_at();

-- Internal transfers. Both legs live on one row so they can never be split.
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_account_id uuid not null,
  to_account_id uuid not null,
  from_amount_minor bigint not null check (from_amount_minor > 0),
  to_amount_minor bigint not null check (to_amount_minor > 0),
  occurred_on date not null,
  description text check (char_length(description) <= 500),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (from_account_id, user_id) references public.bankroll_accounts (id, user_id) on delete restrict,
  foreign key (to_account_id, user_id) references public.bankroll_accounts (id, user_id) on delete restrict,
  check (from_account_id <> to_account_id)
);
create index transfers_user_date_idx on public.transfers (user_id, occurred_on desc);
create trigger transfers_updated before update on public.transfers for each row execute function public.set_updated_at();

-- Same-currency transfers must move the same amount out and in.
create or replace function public.check_transfer_amounts() returns trigger
language plpgsql
as $$
declare
  from_cur char(3);
  to_cur char(3);
begin
  select currency into from_cur from public.bankroll_accounts where id = new.from_account_id and user_id = new.user_id;
  select currency into to_cur from public.bankroll_accounts where id = new.to_account_id and user_id = new.user_id;
  if from_cur = to_cur and new.from_amount_minor <> new.to_amount_minor then
    raise exception 'Same-currency transfer amounts must match (% vs %)', new.from_amount_minor, new.to_amount_minor
      using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger transfers_check_amounts before insert or update on public.transfers
  for each row execute function public.check_transfer_amounts();

-- ---------------------------------------------------------------------------
-- Tournaments
-- ---------------------------------------------------------------------------
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null,
  name text not null check (char_length(name) between 1 and 160),
  status public.tournament_status not null default 'completed',
  setting public.play_setting not null,
  format public.tournament_format not null default 'mtt',
  speed public.tournament_speed not null default 'regular',
  is_bounty boolean not null default false,
  venue_id uuid,
  platform_id uuid,
  game_type_id uuid,
  start_date date not null,
  end_date date,
  field_size integer check (field_size > 0),
  finish_position integer check (finish_position > 0),
  payout_minor bigint not null default 0 check (payout_minor >= 0),
  bounties_minor bigint not null default 0 check (bounties_minor >= 0),
  refund_minor bigint not null default 0 check (refund_minor >= 0),
  guarantee_minor bigint check (guarantee_minor >= 0),
  notes text check (char_length(notes) <= 8000),
  import_batch_id uuid,
  dedupe_key text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.bankroll_accounts (id, user_id) on delete restrict,
  foreign key (venue_id, user_id) references public.venues (id, user_id) on delete set null (venue_id),
  foreign key (platform_id, user_id) references public.platforms (id, user_id) on delete set null (platform_id),
  foreign key (game_type_id, user_id) references public.game_types (id, user_id) on delete set null (game_type_id),
  foreign key (import_batch_id, user_id) references public.import_batches (id, user_id) on delete set null (import_batch_id),
  check (end_date is null or end_date >= start_date),
  check (finish_position is null or field_size is null or finish_position <= field_size),
  -- A refund only makes sense for a cancelled tournament.
  check (refund_minor = 0 or status = 'cancelled')
);
create index tournaments_user_date_idx on public.tournaments (user_id, start_date desc);
create unique index tournaments_dedupe_uq on public.tournaments (user_id, dedupe_key) where dedupe_key is not null and deleted_at is null;
create trigger tournaments_updated before update on public.tournaments for each row execute function public.set_updated_at();

-- One row per bullet. The tournament is counted once; costs are summed.
create table public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tournament_id uuid not null,
  entry_number smallint not null check (entry_number between 1 and 500),
  buy_in_minor bigint not null default 0 check (buy_in_minor >= 0),
  fee_minor bigint not null default 0 check (fee_minor >= 0),
  rebuy_count smallint not null default 0 check (rebuy_count >= 0),
  rebuys_minor bigint not null default 0 check (rebuys_minor >= 0),
  addons_minor bigint not null default 0 check (addons_minor >= 0),
  created_at timestamptz not null default now(),
  unique (tournament_id, entry_number),
  foreign key (tournament_id, user_id) references public.tournaments (id, user_id) on delete cascade
);
create index tournament_entries_tournament_idx on public.tournament_entries (tournament_id);

-- ---------------------------------------------------------------------------
-- Sessions (periods of play). Cash sessions carry money in
-- cash_game_details; tournament sessions are the days/periods played in a
-- tournament and carry no money of their own (the result lives on the
-- tournament, so multi-day events are never double-counted).
-- ---------------------------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind public.session_kind not null,
  status public.record_status not null default 'completed',
  setting public.play_setting not null,
  game_type_id uuid,
  variant text check (char_length(variant) <= 80),
  venue_id uuid,
  platform_id uuid,
  tournament_id uuid,
  day_label text check (char_length(day_label) <= 40),
  started_at timestamptz not null,
  ended_at timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  notes text check (char_length(notes) <= 8000),
  import_batch_id uuid,
  dedupe_key text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (game_type_id, user_id) references public.game_types (id, user_id) on delete set null (game_type_id),
  foreign key (venue_id, user_id) references public.venues (id, user_id) on delete set null (venue_id),
  foreign key (platform_id, user_id) references public.platforms (id, user_id) on delete set null (platform_id),
  foreign key (tournament_id, user_id) references public.tournaments (id, user_id) on delete cascade,
  foreign key (import_batch_id, user_id) references public.import_batches (id, user_id) on delete set null (import_batch_id),
  check ((kind = 'tournament') = (tournament_id is not null)),
  check (ended_at is null or ended_at > started_at),
  check (ended_at is null or ended_at - started_at <= interval '96 hours'),
  check (ended_at is null or break_minutes * interval '1 minute' < ended_at - started_at),
  check (status <> 'completed' or ended_at is not null)
);
create index sessions_user_started_idx on public.sessions (user_id, started_at desc);
create index sessions_tournament_idx on public.sessions (tournament_id) where tournament_id is not null;
create unique index sessions_dedupe_uq on public.sessions (user_id, dedupe_key) where dedupe_key is not null and deleted_at is null;
create trigger sessions_updated before update on public.sessions for each row execute function public.set_updated_at();

create table public.cash_game_details (
  session_id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null,
  stake_level_id uuid,
  small_blind_minor bigint check (small_blind_minor >= 0),
  big_blind_minor bigint check (big_blind_minor > 0),
  straddle_minor bigint check (straddle_minor >= 0),
  ante_minor bigint check (ante_minor >= 0),
  table_format public.table_format not null default 'full_ring',
  seats smallint check (seats between 2 and 12),
  -- Money put into play (all from the player's bankroll)
  buy_in_minor bigint not null default 0 check (buy_in_minor >= 0),
  rebuys_minor bigint not null default 0 check (rebuys_minor >= 0),
  additional_minor bigint not null default 0 check (additional_minor >= 0),
  -- Money taken off the table. NULL only while a draft is unfinished.
  cash_out_minor bigint check (cash_out_minor >= 0),
  -- Informational: rake is taken from pots and is already reflected in cash_out.
  rake_minor bigint not null default 0 check (rake_minor >= 0),
  -- Paid separately (out of pocket, not from chips) and deducted from the result.
  tips_minor bigint not null default 0 check (tips_minor >= 0),
  fees_minor bigint not null default 0 check (fees_minor >= 0),
  -- Attributable to this session and added to the result.
  bonus_minor bigint not null default 0 check (bonus_minor >= 0),
  rakeback_minor bigint not null default 0 check (rakeback_minor >= 0),
  hands_played integer check (hands_played >= 0),
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade,
  foreign key (account_id, user_id) references public.bankroll_accounts (id, user_id) on delete restrict,
  foreign key (stake_level_id, user_id) references public.stake_levels (id, user_id) on delete set null (stake_level_id),
  check (small_blind_minor is null or big_blind_minor is null or small_blind_minor <= big_blind_minor)
);
create index cash_game_details_account_idx on public.cash_game_details (account_id);

-- A completed cash session must have a cash-out amount. Checked at commit
-- time because the session row and its details are written separately.
create or replace function public.check_cash_session_complete() returns trigger
language plpgsql
as $$
declare
  sid uuid;
  bad boolean;
begin
  sid := coalesce((to_jsonb(new) ->> 'session_id')::uuid, (to_jsonb(new) ->> 'id')::uuid);
  select exists (
    select 1
    from public.sessions s
    left join public.cash_game_details d on d.session_id = s.id
    where s.id = sid and s.kind = 'cash' and s.status = 'completed' and s.deleted_at is null
      and (d.session_id is null or d.cash_out_minor is null)
  ) into bad;
  if bad then
    raise exception 'A completed cash session requires cash-game details with a cash-out amount'
      using errcode = '23514';
  end if;
  return null;
end
$$;
create constraint trigger sessions_cash_complete
  after insert or update on public.sessions
  deferrable initially deferred
  for each row execute function public.check_cash_session_complete();
create constraint trigger cash_details_complete
  after insert or update on public.cash_game_details
  deferrable initially deferred
  for each row execute function public.check_cash_session_complete();

create table public.session_tags (
  session_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (session_id, tag_id),
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);

create table public.tournament_tags (
  tournament_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (tournament_id, tag_id),
  foreign key (tournament_id, user_id) references public.tournaments (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Expenses (costs NOT already inside a session/tournament result)
-- ---------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null,
  category_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  refunded_minor bigint not null default 0 check (refunded_minor >= 0),
  occurred_on date not null,
  description text check (char_length(description) <= 500),
  vendor text check (char_length(vendor) <= 120),
  session_id uuid,
  tournament_id uuid,
  venue_id uuid,
  import_batch_id uuid,
  dedupe_key text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.bankroll_accounts (id, user_id) on delete restrict,
  foreign key (category_id, user_id) references public.expense_categories (id, user_id) on delete restrict,
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete set null (session_id),
  foreign key (tournament_id, user_id) references public.tournaments (id, user_id) on delete set null (tournament_id),
  foreign key (venue_id, user_id) references public.venues (id, user_id) on delete set null (venue_id),
  foreign key (import_batch_id, user_id) references public.import_batches (id, user_id) on delete set null (import_batch_id),
  check (refunded_minor <= amount_minor),
  check (session_id is null or tournament_id is null)
);
create index expenses_user_date_idx on public.expenses (user_id, occurred_on desc);
create index expenses_session_idx on public.expenses (session_id) where session_id is not null;
create index expenses_tournament_idx on public.expenses (tournament_id) where tournament_id is not null;
create unique index expenses_dedupe_uq on public.expenses (user_id, dedupe_key) where dedupe_key is not null and deleted_at is null;
create trigger expenses_updated before update on public.expenses for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Goals, plans, notes, attachments, audit
-- ---------------------------------------------------------------------------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind public.goal_kind not null,
  period public.goal_period not null,
  target_minor bigint check (target_minor >= 0),
  target_minutes integer check (target_minutes > 0),
  target_count integer check (target_count > 0),
  currency char(3) references public.currencies (code),
  account_id uuid,
  start_date date,
  end_date date,
  active boolean not null default true,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (account_id, user_id) references public.bankroll_accounts (id, user_id) on delete cascade,
  check (period <> 'custom' or (start_date is not null and end_date is not null and end_date >= start_date)),
  check (
    (kind in ('profit', 'expense_budget', 'max_session_loss', 'daily_loss_limit', 'min_bankroll') and target_minor is not null and currency is not null)
    or (kind = 'hours' and target_minutes is not null)
    or (kind = 'session_count' and target_count is not null)
  )
);
create trigger goals_updated before update on public.goals for each row execute function public.set_updated_at();

create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  planned_date date not null,
  start_time time,
  kind public.session_kind not null default 'cash',
  setting public.play_setting not null default 'live_casino',
  title text check (char_length(title) <= 160),
  venue_id uuid,
  platform_id uuid,
  game_type_id uuid,
  stake_level_id uuid,
  notes text check (char_length(notes) <= 4000),
  reminder_minutes_before integer check (reminder_minutes_before between 0 and 10080),
  status public.plan_status not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (venue_id, user_id) references public.venues (id, user_id) on delete set null (venue_id),
  foreign key (platform_id, user_id) references public.platforms (id, user_id) on delete set null (platform_id),
  foreign key (game_type_id, user_id) references public.game_types (id, user_id) on delete set null (game_type_id),
  foreign key (stake_level_id, user_id) references public.stake_levels (id, user_id) on delete set null (stake_level_id)
);
create index planned_sessions_user_date_idx on public.planned_sessions (user_id, planned_date);
create trigger planned_sessions_updated before update on public.planned_sessions for each row execute function public.set_updated_at();

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  note_date date not null,
  title text check (char_length(title) <= 160),
  body text not null check (char_length(body) between 1 and 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index notes_user_date_idx on public.notes (user_id, note_date);
create trigger notes_updated before update on public.notes for each row execute function public.set_updated_at();

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid,
  tournament_id uuid,
  expense_id uuid,
  storage_path text not null unique check (char_length(storage_path) <= 400),
  file_name text not null check (char_length(file_name) between 1 and 255),
  content_type text not null check (char_length(content_type) <= 120),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade,
  foreign key (tournament_id, user_id) references public.tournaments (id, user_id) on delete cascade,
  foreign key (expense_id, user_id) references public.expenses (id, user_id) on delete cascade,
  check (num_nonnulls(session_id, tournament_id, expense_id) = 1)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete', 'soft_delete', 'restore')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_user_created_idx on public.audit_log (user_id, created_at desc);
create index audit_log_record_idx on public.audit_log (record_id);
