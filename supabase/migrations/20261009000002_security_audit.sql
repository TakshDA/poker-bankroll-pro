-- Poker Bankroll Pro: Row Level Security, grants, audit trail, integrity
-- triggers and new-user bootstrap.

-- ---------------------------------------------------------------------------
-- Grants. The application queries as the `authenticated` role with the
-- user's id in request.jwt.claims (exactly how Supabase/PostgREST works), so
-- RLS is always in force. `anon` gets nothing. (FORCE RLS is deliberately not
-- used: SECURITY DEFINER triggers below run as the table owner.)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
grant usage on schema public to authenticated;

grant select on public.currencies to authenticated;

do $$
declare
  t text;
  owned_tables text[] := array[
    'user_settings', 'exchange_rates', 'venues', 'platforms', 'game_types',
    'stake_levels', 'tags', 'bankroll_categories', 'expense_categories',
    'bankroll_accounts', 'import_batches', 'transactions', 'transfers',
    'tournaments', 'tournament_entries', 'sessions', 'cash_game_details',
    'session_tags', 'tournament_tags', 'expenses', 'goals',
    'planned_sessions', 'notes', 'attachments'
  ];
begin
  foreach t in array owned_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end
$$;

alter table public.currencies enable row level security;
create policy currencies_read on public.currencies for select to authenticated using (true);

-- The audit log is append-only from triggers; users may only read their own.
alter table public.audit_log enable row level security;
grant select on public.audit_log to authenticated;
create policy audit_log_select_own on public.audit_log for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Audit trail. Runs as SECURITY DEFINER so users cannot forge or delete
-- entries. For updates only the changed columns are stored.
-- ---------------------------------------------------------------------------
create or replace function public.audit_row() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_j jsonb;
  new_j jsonb;
  diff_old jsonb := '{}'::jsonb;
  diff_new jsonb := '{}'::jsonb;
  k text;
  act text;
  rid uuid;
  uid uuid;
begin
  if tg_op = 'INSERT' then
    new_j := to_jsonb(new);
    insert into public.audit_log (user_id, table_name, record_id, action, new_data)
    values ((new_j ->> 'user_id')::uuid, tg_table_name,
            coalesce((new_j ->> 'id')::uuid, (new_j ->> 'session_id')::uuid), 'insert', new_j);
    return new;
  elsif tg_op = 'DELETE' then
    old_j := to_jsonb(old);
    insert into public.audit_log (user_id, table_name, record_id, action, old_data)
    values ((old_j ->> 'user_id')::uuid, tg_table_name,
            coalesce((old_j ->> 'id')::uuid, (old_j ->> 'session_id')::uuid), 'delete', old_j);
    return old;
  end if;

  old_j := to_jsonb(old);
  new_j := to_jsonb(new);
  for k in select jsonb_object_keys(new_j) loop
    if k <> 'updated_at' and (old_j -> k) is distinct from (new_j -> k) then
      diff_old := diff_old || jsonb_build_object(k, old_j -> k);
      diff_new := diff_new || jsonb_build_object(k, new_j -> k);
    end if;
  end loop;
  if diff_new = '{}'::jsonb then
    return new;
  end if;
  act := 'update';
  if new_j ? 'deleted_at' then
    if (old_j ->> 'deleted_at') is null and (new_j ->> 'deleted_at') is not null then
      act := 'soft_delete';
    elsif (old_j ->> 'deleted_at') is not null and (new_j ->> 'deleted_at') is null then
      act := 'restore';
    end if;
  end if;
  rid := coalesce((new_j ->> 'id')::uuid, (new_j ->> 'session_id')::uuid);
  uid := (new_j ->> 'user_id')::uuid;
  insert into public.audit_log (user_id, table_name, record_id, action, old_data, new_data)
  values (uid, tg_table_name, rid, act, diff_old, diff_new);
  return new;
end
$$;
revoke all on function public.audit_row() from public, anon, authenticated;

do $$
declare
  t text;
  audited text[] := array[
    'bankroll_accounts', 'transactions', 'transfers', 'tournaments',
    'tournament_entries', 'sessions', 'cash_game_details', 'expenses',
    'exchange_rates', 'goals'
  ];
begin
  foreach t in array audited loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()',
      t || '_audit', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Integrity: an account's currency cannot change once money references it,
-- because all amounts on child records are denominated in that currency.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_account_currency_change() returns trigger
language plpgsql
as $$
begin
  if new.currency is distinct from old.currency and (
    exists (select 1 from public.transactions where account_id = old.id)
    or exists (select 1 from public.transfers where from_account_id = old.id or to_account_id = old.id)
    or exists (select 1 from public.cash_game_details where account_id = old.id)
    or exists (select 1 from public.tournaments where account_id = old.id)
    or exists (select 1 from public.expenses where account_id = old.id)
  ) then
    raise exception 'Cannot change the currency of an account that already has records'
      using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger bankroll_accounts_currency_lock before update of currency on public.bankroll_accounts
  for each row execute function public.prevent_account_currency_change();

-- Sessions linked to a tournament must be tournament-kind and vice versa is
-- covered by a CHECK; cash details may only hang off cash sessions.
create or replace function public.check_cash_details_kind() returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.sessions where id = new.session_id and kind = 'cash') then
    raise exception 'Cash-game details can only be attached to a cash session' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger cash_game_details_kind before insert or update on public.cash_game_details
  for each row execute function public.check_cash_details_kind();

-- ---------------------------------------------------------------------------
-- New-user bootstrap: settings and sensible default configuration.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;

  insert into public.bankroll_categories (user_id, name) values
    (new.id, 'Live'), (new.id, 'Online'), (new.id, 'Savings')
  on conflict do nothing;

  insert into public.expense_categories (user_id, name, kind) values
    (new.id, 'Travel', 'travel'),
    (new.id, 'Accommodation', 'accommodation'),
    (new.id, 'Food & drink', 'food'),
    (new.id, 'Parking', 'parking'),
    (new.id, 'Coaching', 'coaching'),
    (new.id, 'Training & courses', 'training'),
    (new.id, 'Software', 'software'),
    (new.id, 'Equipment', 'equipment'),
    (new.id, 'Memberships', 'membership'),
    (new.id, 'Other', 'other')
  on conflict do nothing;

  insert into public.game_types (user_id, name, short_name, betting_structure) values
    (new.id, 'No-Limit Hold''em', 'NLHE', 'no_limit'),
    (new.id, 'Pot-Limit Omaha', 'PLO', 'pot_limit'),
    (new.id, 'Pot-Limit Omaha 5-Card', 'PLO5', 'pot_limit'),
    (new.id, 'Limit Hold''em', 'LHE', 'fixed_limit'),
    (new.id, 'Mixed Games', 'MIX', 'mixed')
  on conflict do nothing;

  return new;
end
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
