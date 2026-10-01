-- A comparison needs every cabin for one route/date pair in the same rotation.
-- p_limit is a soft candidate budget: the first complete scope may exceed it.
create or replace function public.claim_due_search_candidates(
  p_limit integer,
  p_lease_token uuid,
  p_lease_seconds integer default 900
)
returns setof public.search_candidates
language plpgsql
security invoker
set search_path = ''
as $$
declare
  scope record;
  claimed_ids uuid[];
  scope_is_due boolean;
  scope_is_available boolean;
  claimed_count integer := 0;
  candidate_budget integer := least(greatest(p_limit, 1), 100);
begin
  if p_lease_token is null then
    raise exception 'p_lease_token must not be null' using errcode = '22004';
  end if;

  for scope in
    select
      candidate.watch_id,
      candidate.origin,
      candidate.destination,
      candidate.departure_date,
      candidate.return_date,
      count(*) as candidate_count
    from public.search_candidates as candidate
    join public.watches as watch on watch.id = candidate.watch_id
    where candidate.active and watch.active
    group by
      candidate.watch_id, candidate.origin, candidate.destination,
      candidate.departure_date, candidate.return_date
    having bool_or(candidate.next_scan_at is null or candidate.next_scan_at <= now())
      and bool_and(candidate.lease_expires_at is null or candidate.lease_expires_at <= now())
    order by
      max(candidate.priority) desc,
      min(coalesce(candidate.next_scan_at, '-infinity'::timestamptz)),
      candidate.watch_id, candidate.origin, candidate.destination,
      candidate.departure_date, candidate.return_date nulls first
  loop
    -- Serialize competing claimers for this exact scope without waiting. Hash
    -- collisions only defer an unrelated scope; they cannot split a claim.
    if not pg_try_advisory_xact_lock(hashtextextended(
      concat_ws('|', 'fare-search-scope', scope.watch_id, scope.origin,
        scope.destination, scope.departure_date,
        coalesce(scope.return_date::text, 'one-way')),
      0
    )) then
      continue;
    end if;

    -- Re-read after acquiring the advisory lock: a previous caller may have
    -- committed leases after the scope list was read. SKIP LOCKED also avoids
    -- waiting on unrelated writers. Never claim a partially locked group.
    select
      array_agg(locked.id order by locked.id),
      bool_or(locked.next_scan_at is null or locked.next_scan_at <= now()),
      bool_and(locked.lease_expires_at is null or locked.lease_expires_at <= now())
    into claimed_ids, scope_is_due, scope_is_available
    from (
      select candidate.id, candidate.next_scan_at, candidate.lease_expires_at
      from public.search_candidates as candidate
      join public.watches as watch on watch.id = candidate.watch_id
      where candidate.active and watch.active
        and candidate.watch_id = scope.watch_id
        and candidate.origin = scope.origin
        and candidate.destination = scope.destination
        and candidate.departure_date = scope.departure_date
        and candidate.return_date is not distinct from scope.return_date
      order by candidate.id
      for update of candidate skip locked
    ) as locked;

    if coalesce(cardinality(claimed_ids), 0) <> scope.candidate_count
      or not coalesce(scope_is_due and scope_is_available, false) then
      continue;
    end if;

    if claimed_count > 0
      and claimed_count + cardinality(claimed_ids) > candidate_budget then
      exit;
    end if;

    -- Claim all active cabins when any is due, including future-due siblings.
    -- This repairs old partial cycles and keeps subsequent comparisons aligned.
    return query
      with claimed as (
        update public.search_candidates as candidate
        set
          lease_token = p_lease_token,
          lease_expires_at = now() + make_interval(
            secs => least(greatest(p_lease_seconds, 60), 3600)
          )
        where candidate.id = any(claimed_ids)
        returning candidate.*
      )
      select claimed.* from claimed
      order by case claimed.cabin
        when 'ECONOMY' then 1
        when 'PREMIUM_ECONOMY' then 2
        when 'BUSINESS' then 3
        when 'FIRST' then 4
      end, claimed.id;

    claimed_count := claimed_count + cardinality(claimed_ids);
    exit when claimed_count >= candidate_budget;
  end loop;
end;
$$;

revoke execute on function public.claim_due_search_candidates(integer, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_search_candidates(integer, uuid, integer)
  to service_role;
