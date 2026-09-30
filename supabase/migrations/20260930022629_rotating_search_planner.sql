alter table public.search_candidates
  add column lease_token uuid,
  add column lease_expires_at timestamptz;

drop index if exists public.search_candidates_due_idx;

create index search_candidates_due_claim_idx
  on public.search_candidates (priority desc, next_scan_at, id)
  where active;

create table public.watch_planning_state (
  watch_id uuid primary key references public.watches (id) on delete cascade,
  next_departure_date date not null,
  next_trip_nights integer not null check (next_trip_nights between 1 and 365),
  completed_cycles bigint not null default 0 check (completed_cycles >= 0),
  last_planned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.watch_planning_state enable row level security;

revoke all on table public.watch_planning_state from public, anon, authenticated;
grant select, insert, update, delete on table public.watch_planning_state to service_role;

create or replace function public.claim_due_search_candidates(
  p_limit integer,
  p_lease_token uuid,
  p_lease_seconds integer default 900
)
returns setof public.search_candidates
language sql
security invoker
set search_path = ''
as $$
  with due as (
    select candidate.id
    from public.search_candidates as candidate
    join public.watches as watch on watch.id = candidate.watch_id
    where candidate.active
      and watch.active
      and (candidate.next_scan_at is null or candidate.next_scan_at <= now())
      and (
        candidate.lease_expires_at is null
        or candidate.lease_expires_at <= now()
      )
    order by
      candidate.priority desc,
      candidate.next_scan_at asc nulls first,
      candidate.id
    for update of candidate skip locked
    limit least(greatest(p_limit, 1), 100)
  ), claimed as (
    update public.search_candidates as candidate
    set
      lease_token = p_lease_token,
      lease_expires_at = now() + make_interval(
        secs => least(greatest(p_lease_seconds, 60), 3600)
      )
    from due
    where candidate.id = due.id
    returning candidate.*
  )
  select * from claimed;
$$;

create or replace function public.complete_search_candidate(
  p_candidate_id uuid,
  p_lease_token uuid,
  p_next_scan_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.search_candidates
  set
    last_scanned_at = now(),
    next_scan_at = p_next_scan_at,
    scan_count = scan_count + 1,
    lease_token = null,
    lease_expires_at = null
  where id = p_candidate_id
    and lease_token = p_lease_token;

  return found;
end;
$$;

revoke execute on function public.claim_due_search_candidates(integer, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_search_candidates(integer, uuid, integer)
  to service_role;

revoke execute on function public.complete_search_candidate(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_search_candidate(uuid, uuid, timestamptz)
  to service_role;
