-- Run after migrations, as postgres, against a database with at least one user.
-- All fixtures and leases are rolled back; no provider requests are made.
begin;

do $$
declare
  fixture_watch uuid;
  token_a uuid := gen_random_uuid();
  token_b uuid := gen_random_uuid();
  claimed uuid[];
  claimed_count integer;
begin
  insert into public.watches (
    user_id, name, origin_airports, destination_airports, date_mode,
    rolling_horizon_days, min_trip_nights, max_trip_nights, cabins
  )
  select id, 'Scope claim regression fixture', array['AAA'], array['BBB'],
    'ANYTIME', 365, 7, 7,
    array['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']
  from auth.users order by id limit 1
  returning id into fixture_watch;
  if fixture_watch is null then
    raise exception 'Regression fixture requires an existing auth user';
  end if;

  insert into public.search_candidates (
    watch_id, origin, destination, departure_date, return_date, cabin,
    priority, next_scan_at
  )
  select fixture_watch, 'AAA', 'BBB', date '2099-01-01', date '2099-01-08',
    cabin, 2147483647,
    case when cabin = 'ECONOMY' then null else now() + interval '1 day' end
  from unnest(array['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']) as cabin;

  select array_agg(id) into claimed
  from public.claim_due_search_candidates(1, token_a, 1);
  assert cardinality(claimed) = 4, 'Soft limit must not split a four-cabin scope';
  assert (select bool_and(watch_id = fixture_watch and lease_token = token_a
      and lease_expires_at = now() + interval '60 seconds')
    from public.search_candidates where id = any(claimed)),
    'Every sibling, including future-due siblings, must share the bounded lease';

  select count(*) into claimed_count
  from public.claim_due_search_candidates(1, token_b)
  where watch_id = fixture_watch;
  assert claimed_count = 0, 'A live scope lease must exclude a second claim';

  -- One cabin completed while the others are still leased: no partial claim.
  update public.search_candidates set lease_token = null, lease_expires_at = null
  where watch_id = fixture_watch and cabin = 'ECONOMY';
  select count(*) into claimed_count
  from public.claim_due_search_candidates(1, token_b)
  where watch_id = fixture_watch;
  assert claimed_count = 0, 'One busy sibling must exclude the whole scope';

  update public.search_candidates set lease_expires_at = now() - interval '1 second'
  where watch_id = fixture_watch;
  select count(*) into claimed_count
  from public.claim_due_search_candidates(1, token_b, 99999)
  where watch_id = fixture_watch;
  assert claimed_count = 4, 'Expired leases must recover the complete scope';
  assert (select bool_and(lease_expires_at = now() + interval '3600 seconds')
    from public.search_candidates where watch_id = fixture_watch),
    'Lease duration must retain its upper bound';

  -- A one-way scope exercises null-safe grouping; an inactive sibling is ignored.
  insert into public.search_candidates (
    watch_id, origin, destination, departure_date, return_date, cabin, priority, active
  )
  select fixture_watch, 'AAA', 'BBB', date '2099-01-02', null,
    cabin, 2147483647, cabin <> 'FIRST'
  from unnest(array['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']) as cabin;
  select array_agg(id) into claimed
  from public.claim_due_search_candidates(2, token_a);
  assert cardinality(claimed) = 3, 'Null-return scope must claim all active cabins';
  assert (select bool_and(return_date is null and departure_date = date '2099-01-02')
    from public.search_candidates where id = any(claimed)),
    'Route/date scopes must never be mixed to satisfy the budget';

  assert not has_function_privilege('anon',
    'public.claim_due_search_candidates(integer,uuid,integer)', 'EXECUTE');
  assert not has_function_privilege('authenticated',
    'public.claim_due_search_candidates(integer,uuid,integer)', 'EXECUTE');
  assert has_function_privilege('service_role',
    'public.claim_due_search_candidates(integer,uuid,integer)', 'EXECUTE');
end;
$$;

select 'claim_complete_search_scopes: all assertions passed' as result;
rollback;
