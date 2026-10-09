-- Local-only: the login role the Next.js server connects with.
-- It owns nothing and has no direct table privileges; it can only act through
-- the `authenticated` role (SET LOCAL ROLE), so every query is subject to RLS.
-- It additionally manages the local auth tables (password login + sessions).
-- The password is set by scripts/db-setup.ts from LOCAL_APP_DB_PASSWORD.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pbp_app') then
    create role pbp_app login noinherit;
  end if;
end
$$;

grant authenticated to pbp_app;
grant usage on schema auth to pbp_app;
grant select, insert, update, delete on auth.users to pbp_app;
grant select, insert, update, delete on auth.local_sessions to pbp_app;
