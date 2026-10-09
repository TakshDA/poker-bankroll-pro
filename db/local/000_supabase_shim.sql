-- Local-development shim for the parts of Supabase that the migrations rely on.
--
-- Supabase projects already provide: the `anon`, `authenticated` and
-- `service_role` roles, the `auth` schema with `auth.users`, and `auth.uid()`.
-- This file recreates a compatible subset on plain PostgreSQL so the exact
-- same migrations (and the exact same Row Level Security policies) can be
-- tested locally. NEVER run this file against a Supabase project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  -- scrypt hash produced by the local auth provider (never plaintext)
  encrypted_password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Server-side sessions for the local auth provider (revocable).
create table if not exists auth.local_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists local_sessions_user_idx on auth.local_sessions (user_id);

-- Same definition Supabase uses: the `sub` claim of the request JWT.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
-- auth.users / local_sessions are only touched by the server-side owner role.
revoke all on auth.users from anon, authenticated;
revoke all on auth.local_sessions from anon, authenticated;
