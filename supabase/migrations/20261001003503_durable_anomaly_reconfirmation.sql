create table public.anomaly_reconfirmations (
  anomaly_id uuid primary key references public.anomalies(id) on delete cascade,
  anomaly_snapshot jsonb not null,
  watch_snapshot jsonb not null,
  state text not null default 'PENDING'
    check (state in ('PENDING', 'LEASED', 'CONFIRMED', 'EXHAUSTED', 'CANCELLED')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  generation integer not null default 1 check (generation >= 1),
  lifetime_attempts integer not null default 0 check (lifetime_attempts >= 0),
  next_attempt_at timestamptz not null default (now() + interval '2 minutes'),
  lease_token uuid,
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index anomaly_reconfirmations_due_idx
  on public.anomaly_reconfirmations(next_attempt_at, anomaly_id)
  where state in ('PENDING', 'LEASED');
alter table public.anomaly_reconfirmations enable row level security;
revoke all on public.anomaly_reconfirmations from public, anon, authenticated;
grant select, insert, update, delete on public.anomaly_reconfirmations to service_role;

alter table public.search_runs
  add column reconfirmation_anomaly_id uuid references public.anomalies(id) on delete set null,
  add column reconfirmation_lease_token uuid;
create index search_runs_reconfirmation_idx
  on public.search_runs(reconfirmation_anomaly_id)
  where reconfirmation_anomaly_id is not null;

create function public.queue_anomaly_reconfirmation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.confirmed_at is null and new.resolved_at is null then
    insert into public.anomaly_reconfirmations(anomaly_id, anomaly_snapshot, watch_snapshot)
    select new.id, to_jsonb(new),
      to_jsonb(w) - array['id', 'user_id', 'name', 'created_at', 'updated_at']
    from public.watches w where w.id = new.watch_id and w.active
    on conflict (anomaly_id) do nothing;

    -- A terminal job may represent an older signal generation. Re-arm it only
    -- when the detector has materially new evidence or the watch constraints
    -- changed. Never reset an active lease or its bounded retry count.
    update public.anomaly_reconfirmations q
    set anomaly_snapshot = to_jsonb(new),
      watch_snapshot = snapshot.current_watch,
      state = 'PENDING', attempts = 0, generation = q.generation + 1,
      next_attempt_at = now() + interval '2 minutes',
      lease_token = null, lease_expires_at = null, claimed_at = null,
      last_error_code = null, completed_at = null
    from (
      select to_jsonb(w) - array['id', 'user_id', 'name', 'created_at', 'updated_at']
        as current_watch
      from public.watches w where w.id = new.watch_id and w.active
    ) snapshot
    where q.anomaly_id = new.id and q.state in ('CANCELLED', 'EXHAUSTED')
      and (
        q.anomaly_snapshot->>'type' is distinct from new.type
        or q.watch_snapshot is distinct from snapshot.current_watch
        or q.anomaly_snapshot #>> '{explanation_json,lower_observation,observed_at}'
          is distinct from new.explanation_json #>> '{lower_observation,observed_at}'
        or q.anomaly_snapshot #>> '{explanation_json,higher_observation,observed_at}'
          is distinct from new.explanation_json #>> '{higher_observation,observed_at}'
      );
  end if;
  return new;
end;
$$;
create trigger queue_anomaly_reconfirmation
  after insert or update on public.anomalies
  for each row execute function public.queue_anomaly_reconfirmation();

-- Confirmation is durable even when a normal detector upsert refreshes prices.
create function public.preserve_anomaly_confirmation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.confirmed_at := coalesce(old.confirmed_at, new.confirmed_at);
  if new.confirmed_at is not null then
    new.confidence := 'RECONFIRMED';
    if old.explanation_json ? 'confirmation' then
      new.explanation_json := new.explanation_json ||
        jsonb_build_object('confirmation', old.explanation_json->'confirmation');
    end if;
  end if;
  return new;
end;
$$;
create trigger preserve_anomaly_confirmation before update on public.anomalies
  for each row execute function public.preserve_anomaly_confirmation();

create function public.claim_anomaly_reconfirmations(p_limit integer, p_lease_token uuid)
returns setof public.anomaly_reconfirmations
language plpgsql security invoker set search_path = '' as $$
begin
  if p_lease_token is null then
    raise exception 'p_lease_token must not be null' using errcode = '22004';
  end if;
  -- A crashed final attempt becomes terminal after its lease expires.
  update public.anomaly_reconfirmations set state = 'EXHAUSTED', completed_at = now(),
    lease_token = null, lease_expires_at = null, last_error_code = 'LEASE_EXPIRED'
  where state = 'LEASED' and attempts >= 5 and lease_expires_at <= now();
  update public.anomaly_reconfirmations q
  set state = 'CANCELLED', completed_at = now(), last_error_code = 'CONTEXT_CHANGED',
    lease_token = null, lease_expires_at = null
  from public.anomalies a join public.watches w on w.id = a.watch_id
  where a.id = q.anomaly_id and q.state in ('PENDING', 'LEASED')
    and (q.lease_expires_at is null or q.lease_expires_at <= now())
    and (a.resolved_at is not null or a.confirmed_at is not null or not w.active
      or a.departure_date < current_date
      or a.type is distinct from q.anomaly_snapshot->>'type'
      or (to_jsonb(w) - array['id', 'user_id', 'name', 'created_at', 'updated_at'])
        is distinct from q.watch_snapshot);
  return query
    with due as (
      select q.anomaly_id from public.anomaly_reconfirmations q
      join public.anomalies a on a.id = q.anomaly_id
      join public.watches w on w.id = a.watch_id
      where q.state in ('PENDING', 'LEASED') and q.attempts < 5
        and q.next_attempt_at <= now()
        and (q.lease_expires_at is null or q.lease_expires_at <= now())
        and a.confirmed_at is null and a.resolved_at is null and w.active
        and a.departure_date >= current_date
      order by q.next_attempt_at, q.anomaly_id
      for update of q skip locked
      limit least(greatest(p_limit, 1), 10)
    )
    update public.anomaly_reconfirmations q
    set state = 'LEASED', attempts = q.attempts + 1,
      lifetime_attempts = q.lifetime_attempts + 1, lease_token = p_lease_token,
      claimed_at = clock_timestamp(), lease_expires_at = clock_timestamp() + interval '15 minutes'
    from due where q.anomaly_id = due.anomaly_id returning q.*;
end;
$$;

create function public.finish_anomaly_reconfirmation(
  p_anomaly_id uuid, p_lease_token uuid,
  p_lower_run_id uuid default null, p_higher_run_id uuid default null,
  p_error_code text default null
)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  q public.anomaly_reconfirmations;
  a public.anomalies;
  w public.watches;
  lo public.fare_observations;
  hi public.fare_observations;
  evidence_scope jsonb;
  threshold numeric;
  spread numeric;
  matches_rule boolean := false;
begin
  -- Lock anomaly before job consistently with the anomaly's queue trigger.
  select * into a from public.anomalies where id = p_anomaly_id for update;
  if not found then return 'STALE'; end if;
  select * into q from public.anomaly_reconfirmations where anomaly_id = p_anomaly_id for update;
  if q.state = 'CONFIRMED' then return 'CONFIRMED'; end if;
  if q.state is distinct from 'LEASED' or q.lease_token is distinct from p_lease_token
    or q.lease_expires_at <= clock_timestamp() then return 'STALE'; end if;
  select * into w from public.watches where id = a.watch_id for share;
  if not w.active or a.resolved_at is not null or a.departure_date < current_date
    or a.type is distinct from q.anomaly_snapshot->>'type'
    or (to_jsonb(w) - array['id', 'user_id', 'name', 'created_at', 'updated_at'])
      is distinct from q.watch_snapshot then
    update public.anomaly_reconfirmations set state = 'CANCELLED', completed_at = now(),
      last_error_code = 'CONTEXT_CHANGED', lease_token = null, lease_expires_at = null
    where anomaly_id = p_anomaly_id;
    return 'CANCELLED';
  end if;

  evidence_scope := q.anomaly_snapshot #> '{explanation_json,comparison_scope}';
  -- Only attempts written by this lease may establish confirmation. Prices are
  -- selected from persisted observations, never accepted as caller assertions.
  select o.* into lo
  from public.fare_observations o join public.search_runs r on r.id = o.search_run_id
  where r.id = p_lower_run_id and r.reconfirmation_anomaly_id = a.id
    and r.reconfirmation_lease_token = p_lease_token and r.started_at >= q.claimed_at
    and r.status = 'VALID_RESULT' and r.completeness_score = 1 and o.quality_eligible
    and o.observed_at >= q.claimed_at
    and o.watch_id = a.watch_id and o.origin = a.origin and o.destination = a.destination
    and o.departure_date = a.departure_date and o.return_date is not distinct from a.return_date
    and o.cabin = a.lower_cabin and o.currency = evidence_scope->>'currency'
    and case o.stops_outbound when 0 then 'NONSTOP' when 1 then 'ONE_STOP'
      else case when o.stops_outbound >= 2 then 'TWO_PLUS_STOPS' end end
      = evidence_scope->>'outbound_stop_bucket'
    and case when o.return_date is null then 'ONE_WAY' else
      case o.stops_return when 0 then 'NONSTOP' when 1 then 'ONE_STOP'
        else case when o.stops_return >= 2 then 'TWO_PLUS_STOPS' end end end
      = evidence_scope->>'return_stop_bucket'
    and (w.max_stops is null or (o.stops_outbound <= w.max_stops
      and (o.return_date is null or o.stops_return <= w.max_stops)))
    and (w.max_duration_minutes is null or (o.duration_outbound_minutes <= w.max_duration_minutes
      and (o.return_date is null or o.duration_return_minutes <= w.max_duration_minutes)))
  order by o.total_price, o.id limit 1;
  select o.* into hi
  from public.fare_observations o join public.search_runs r on r.id = o.search_run_id
  where r.id = p_higher_run_id and r.reconfirmation_anomaly_id = a.id
    and r.reconfirmation_lease_token = p_lease_token and r.started_at >= q.claimed_at
    and r.status = 'VALID_RESULT' and r.completeness_score = 1 and o.quality_eligible
    and o.observed_at >= q.claimed_at
    and o.watch_id = a.watch_id and o.origin = a.origin and o.destination = a.destination
    and o.departure_date = a.departure_date and o.return_date is not distinct from a.return_date
    and o.cabin = a.higher_cabin and o.currency = evidence_scope->>'currency'
    and case o.stops_outbound when 0 then 'NONSTOP' when 1 then 'ONE_STOP'
      else case when o.stops_outbound >= 2 then 'TWO_PLUS_STOPS' end end
      = evidence_scope->>'outbound_stop_bucket'
    and case when o.return_date is null then 'ONE_WAY' else
      case o.stops_return when 0 then 'NONSTOP' when 1 then 'ONE_STOP'
        else case when o.stops_return >= 2 then 'TWO_PLUS_STOPS' end end end
      = evidence_scope->>'return_stop_bucket'
    and (w.max_stops is null or (o.stops_outbound <= w.max_stops
      and (o.return_date is null or o.stops_return <= w.max_stops)))
    and (w.max_duration_minutes is null or (o.duration_outbound_minutes <= w.max_duration_minutes
      and (o.return_date is null or o.duration_return_minutes <= w.max_duration_minutes)))
  order by o.total_price, o.id limit 1;

  if lo.id is not null and hi.id is not null then
    spread := round(100 * (hi.total_price - lo.total_price) / lo.total_price, 4);
    threshold := (q.anomaly_snapshot #>> '{explanation_json,threshold_pct}')::numeric;
    matches_rule := case a.type
      when 'CABIN_INVERSION' then hi.total_price < lo.total_price
      when 'NEAR_INVERSION' then spread >= 0 and spread <= threshold
      when 'BUSINESS_VALUE_SPREAD' then spread >= 0 and spread <= threshold
      else false end;
  end if;
  if coalesce(matches_rule, false) then
    update public.fare_observations set confirmed = true where id in (lo.id, hi.id);
    update public.anomalies set confirmed_at = coalesce(confirmed_at, now()),
      confidence = 'RECONFIRMED', lower_cabin_price = lo.total_price,
      higher_cabin_price = hi.total_price, spread_amount = hi.total_price - lo.total_price,
      spread_pct = spread,
      explanation_json = explanation_json || jsonb_build_object('confirmation',
        jsonb_build_object('lower_observation_id', lo.id, 'higher_observation_id', hi.id,
          'lower_run_id', p_lower_run_id, 'higher_run_id', p_higher_run_id,
          'origin', a.origin, 'destination', a.destination,
          'departure_date', a.departure_date, 'return_date', a.return_date,
          'lower_cabin', a.lower_cabin, 'higher_cabin', a.higher_cabin,
          'lower_cabin_price', lo.total_price, 'higher_cabin_price', hi.total_price,
          'spread_amount', hi.total_price - lo.total_price, 'spread_pct', spread,
          'currency', lo.currency, 'type', a.type, 'severity', a.severity,
          'confirmed_at', coalesce(a.confirmed_at, now()),
          'outbound_stop_bucket', evidence_scope->>'outbound_stop_bucket',
          'return_stop_bucket', evidence_scope->>'return_stop_bucket'))
    where id = a.id;
    insert into public.alerts(anomaly_id, channel, sent_at, delivery_status, dedupe_key)
    values(a.id, 'in_app', now(), 'DELIVERED', 'in_app:reconfirmed:' || a.id::text)
    on conflict (dedupe_key) do nothing;
    update public.anomaly_reconfirmations set state = 'CONFIRMED', completed_at = now(),
      lease_token = null, lease_expires_at = null, last_error_code = null
    where anomaly_id = a.id;
    return 'CONFIRMED';
  end if;

  update public.anomaly_reconfirmations set
    state = case when attempts >= 5 then 'EXHAUSTED' else 'PENDING' end,
    completed_at = case when attempts >= 5 then now() else null end,
    next_attempt_at = now() + make_interval(secs => least(7200, 300 * (2 ^ attempts)::integer)),
    last_error_code = left(coalesce(p_error_code, 'NOT_RECONFIRMED'), 120),
    lease_token = null, lease_expires_at = null
  where anomaly_id = a.id;
  return case when q.attempts >= 5 then 'EXHAUSTED' else 'RETRY' end;
end;
$$;

revoke execute on function public.queue_anomaly_reconfirmation() from public, anon, authenticated;
revoke execute on function public.preserve_anomaly_confirmation() from public, anon, authenticated;
revoke execute on function public.claim_anomaly_reconfirmations(integer, uuid) from public, anon, authenticated;
revoke execute on function public.finish_anomaly_reconfirmation(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.queue_anomaly_reconfirmation() to service_role;
grant execute on function public.preserve_anomaly_confirmation() to service_role;
grant execute on function public.claim_anomaly_reconfirmations(integer, uuid) to service_role;
grant execute on function public.finish_anomaly_reconfirmation(uuid, uuid, uuid, uuid, text) to service_role;

-- Existing observed anomalies enter the same delayed queue; none alert here.
insert into public.anomaly_reconfirmations(anomaly_id, anomaly_snapshot, watch_snapshot)
select a.id, to_jsonb(a), to_jsonb(w) - array['id', 'user_id', 'name', 'created_at', 'updated_at']
from public.anomalies a join public.watches w on w.id = a.watch_id
where a.confirmed_at is null and a.resolved_at is null and w.active
  and a.departure_date >= current_date
on conflict (anomaly_id) do nothing;
