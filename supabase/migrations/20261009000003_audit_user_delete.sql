-- Deleting an account cascades through every owned table. The audit trigger
-- must not try to log those deletes against a user that no longer exists
-- (the audit rows themselves cascade away with the user).
create or replace function public.audit_row_guard() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from auth.users where id = (to_jsonb(old) ->> 'user_id')::uuid) then
    return old;
  end if;
  insert into public.audit_log (user_id, table_name, record_id, action, old_data)
  values ((to_jsonb(old) ->> 'user_id')::uuid, tg_table_name,
          coalesce((to_jsonb(old) ->> 'id')::uuid, (to_jsonb(old) ->> 'session_id')::uuid), 'delete', to_jsonb(old));
  return old;
end;
$$;
revoke all on function public.audit_row_guard() from public;

-- Route DELETE auditing through the guard; INSERT/UPDATE keep audit_row().
do $$
declare
  t text;
begin
  for t in select distinct event_object_table from information_schema.triggers
           where trigger_schema = 'public' and action_statement like '%audit_row()%' loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update on public.%I for each row execute function public.audit_row()', t || '_audit', t);
    execute format('create trigger %I after delete on public.%I for each row execute function public.audit_row_guard()', t || '_audit_delete', t);
  end loop;
end $$;
