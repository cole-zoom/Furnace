-- ============================================================================
-- Furnace :: signup allowlist
--
-- Google OAuth means anyone with a Google account can complete the flow. The
-- app should be usable by exactly one person. Enforcing that in application
-- code alone is not enough — it has to fail at the database, before a user row
-- exists, or a stranger ends up with a valid session and we're relying on our
-- own redirects to keep them out.
--
-- A BEFORE INSERT trigger on auth.users aborts the transaction for any email
-- not on the list, so the account is never created in the first place.
-- ============================================================================

create table public.allowed_emails (
  email      extensions.citext primary key,
  note       text,
  created_at timestamptz not null default now()
);

-- The list itself is secret-ish and never needs to reach the browser.
alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon, authenticated;

create or replace function public.enforce_email_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.allowed_emails a
    where a.email = new.email
  ) then
    raise exception 'furnace: % is not on the signup allowlist', new.email
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_email_allowlist() from public, anon, authenticated;

-- INSERT *and* UPDATE OF email. Covering only INSERT would let an existing
-- account move its address off the list; the app would still refuse it on the
-- next request, but the trigger should hold the invariant it claims to.
create trigger enforce_email_allowlist_before_write
  before insert or update of email on auth.users
  for each row execute function public.enforce_email_allowlist();

-- Seed: the one human who is supposed to be in here.
insert into public.allowed_emails (email, note)
values ('cole.dumanski@lancedb.com', 'owner')
on conflict (email) do nothing;
