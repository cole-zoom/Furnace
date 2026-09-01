-- ============================================================================
-- Local-only shim. Recreates just enough of Supabase's managed surface (the
-- auth schema, the three PostgREST roles, auth.uid()) so the real migrations
-- can be applied to a bare Postgres and the RLS policies exercised for real.
-- This file is NEVER applied to the hosted project — it lives outside
-- supabase/migrations/ so the CLI ignores it.
-- ============================================================================

create schema if not exists extensions;
create schema if not exists auth;

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

create table if not exists auth.users (
  id    uuid primary key,
  email text unique not null
);

-- Mirrors Supabase: reads the `sub` claim PostgREST puts on the connection.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema public     to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth       to anon, authenticated, service_role;

-- Supabase grants table privileges to the API roles by default; RLS is what
-- actually gates access. Reproduce that so the test is honest.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
