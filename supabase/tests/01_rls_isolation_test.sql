-- ============================================================================
-- Furnace :: adversarial RLS test
--
-- Two real users. Every question is "can B touch A's data?" and every answer
-- must be no. Any failure raises and aborts with a non-zero exit.
-- ============================================================================
\set ON_ERROR_STOP on

\echo ''
\echo '=== seeding two users ==================================================='

insert into public.allowed_emails (email, note) values
  ('alice@example.com', 'test'),
  ('bob@example.com',   'test')
on conflict do nothing;

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.com');

-- ---------------------------------------------------------------------------
\echo '=== ALICE creates data ================================================='
set "request.jwt.claim.sub" = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set role authenticated;

insert into public.meetings (id, title, transcript)
  values ('11111111-1111-4111-8111-111111111111', 'Alice standup', 'secret transcript');
insert into public.tasks (id, title, meeting_id)
  values ('22222222-2222-4222-8222-222222222222', 'Alice secret task',
          '11111111-1111-4111-8111-111111111111');
insert into public.actions (id, meeting_id, description)
  values ('33333333-3333-4333-8333-333333333333',
          '11111111-1111-4111-8111-111111111111', 'Alice action');
insert into public.people (id, full_name, email)
  values ('44444444-4444-4444-8444-444444444444', 'Alice Contact', 'contact@example.com');

do $$
begin
  if (select count(*) from public.tasks) <> 1 then
    raise exception 'FAIL: Alice cannot see her own task';
  end if;
  if (select user_id from public.tasks limit 1) <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then
    raise exception 'FAIL: user_id default did not resolve to auth.uid()';
  end if;
  raise notice 'PASS  Alice sees her own rows, user_id auto-stamped';
end
$$;

-- ---------------------------------------------------------------------------
\echo '=== ALICE cannot forge rows for BOB ====================================='
do $$
begin
  begin
    insert into public.tasks (title, user_id)
      values ('forged', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    raise exception 'FAIL: Alice inserted a task owned by Bob';
  exception when insufficient_privilege then
    raise notice 'PASS  INSERT with a foreign user_id rejected';
  end;

  begin
    update public.tasks set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      where id = '22222222-2222-4222-8222-222222222222';
    raise exception 'FAIL: Alice reassigned her task to Bob (missing WITH CHECK)';
  exception when insufficient_privilege then
    raise notice 'PASS  UPDATE reassigning user_id rejected by WITH CHECK';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '=== BOB attacks ========================================================'
reset role;
set "request.jwt.claim.sub" = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.tasks;
  if n <> 0 then raise exception 'FAIL: Bob read % of Alice''s tasks', n; end if;

  select count(*) into n from public.meetings;
  if n <> 0 then raise exception 'FAIL: Bob read % of Alice''s meetings', n; end if;

  select count(*) into n from public.actions;
  if n <> 0 then raise exception 'FAIL: Bob read % of Alice''s actions', n; end if;

  select count(*) into n from public.people;
  if n <> 0 then raise exception 'FAIL: Bob read % of Alice''s people', n; end if;
  raise notice 'PASS  Bob sees zero rows across every table';

  -- Targeted by primary key, which is the realistic attack: Bob guesses or
  -- scrapes an id and addresses it directly.
  select count(*) into n from public.tasks
    where id = '22222222-2222-4222-8222-222222222222';
  if n <> 0 then raise exception 'FAIL: Bob read Alice''s task by id'; end if;
  raise notice 'PASS  Direct id lookup of Alice''s task returns nothing';

  update public.tasks set title = 'pwned'
    where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Bob updated Alice''s task'; end if;
  raise notice 'PASS  UPDATE against Alice''s task affected 0 rows';

  delete from public.tasks where id = '22222222-2222-4222-8222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: Bob deleted Alice''s task'; end if;
  raise notice 'PASS  DELETE against Alice''s task affected 0 rows';
end
$$;

\echo '=== BOB cannot staple rows onto ALICE''s parents ========================'
do $$
begin
  begin
    insert into public.actions (meeting_id, description)
      values ('11111111-1111-4111-8111-111111111111', 'bob piggyback');
    raise exception 'FAIL: Bob attached an action to Alice''s meeting';
  exception when insufficient_privilege then
    raise notice 'PASS  Action on a foreign meeting rejected';
  end;

  begin
    insert into public.tasks (title, meeting_id)
      values ('bob piggyback', '11111111-1111-4111-8111-111111111111');
    raise exception 'FAIL: Bob attached a task to Alice''s meeting';
  exception when insufficient_privilege then
    raise notice 'PASS  Task on a foreign meeting rejected';
  end;
end
$$;

\echo '=== google_tokens is unreachable from the API roles ====================='
do $$
begin
  begin
    perform 1 from public.google_tokens;
    raise exception 'FAIL: authenticated could read google_tokens';
  exception when insufficient_privilege then
    raise notice 'PASS  authenticated cannot touch google_tokens';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '=== ANON is locked out entirely ========================================'
reset role;
set "request.jwt.claim.sub" = '';
set role anon;

do $$
declare n int;
begin
  begin
    select count(*) into n from public.tasks;
    -- Grants were revoked, so this should not even be reachable. If a future
    -- migration re-grants, RLS must still return zero.
    if n <> 0 then raise exception 'FAIL: anon read % tasks', n; end if;
    raise notice 'PASS  anon reached tasks but RLS returned 0 rows';
  exception when insufficient_privilege then
    raise notice 'PASS  anon has no privilege on tasks at all';
  end;
end
$$;

-- ---------------------------------------------------------------------------
\echo '=== signup allowlist ==================================================='
reset role;

do $$
begin
  begin
    insert into auth.users (id, email)
      values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'rando@internet.example');
    raise exception 'FAIL: a non-allowlisted email created an account';
  exception when insufficient_privilege then
    raise notice 'PASS  non-allowlisted signup blocked at the database';
  end;

  -- An INSERT-only trigger would let an existing account walk its address off
  -- the list after the fact.
  begin
    update auth.users set email = 'rando@internet.example'
      where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'FAIL: an existing account moved its email off the allowlist';
  exception when insufficient_privilege then
    raise notice 'PASS  email cannot be updated off the allowlist';
  end;
end
$$;

\echo ''
\echo '########################################################################'
\echo '#  ALL RLS TESTS PASSED                                                #'
\echo '########################################################################'
\echo ''
