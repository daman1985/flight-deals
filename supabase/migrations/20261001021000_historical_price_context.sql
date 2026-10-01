alter table public.search_runs
  add column acquisition_batch_id uuid,
  add column request_passengers integer,
  add column request_max_stops integer,
  add column request_max_duration_minutes integer,
  add constraint search_runs_request_passengers_check
    check (request_passengers is null or request_passengers between 1 and 9),
  add constraint search_runs_request_max_stops_check
    check (request_max_stops is null or request_max_stops between 0 and 2),
  add constraint search_runs_request_max_duration_check
    check (request_max_duration_minutes is null or request_max_duration_minutes > 0);

create unique index search_runs_acquisition_candidate_unique
  on public.search_runs(acquisition_batch_id, candidate_id)
  where acquisition_batch_id is not null and reconfirmation_anomaly_id is null;

create index search_runs_historical_batch_idx
  on public.search_runs(watch_id, acquisition_batch_id, finished_at)
  where acquisition_batch_id is not null
    and reconfirmation_anomaly_id is null
    and status = 'VALID_RESULT'
    and completeness_score = 1;

create index fare_observations_historical_scope_idx
  on public.fare_observations(
    watch_id, origin, destination, departure_date, return_date, cabin,
    currency, stops_outbound, stops_return, observed_at
  )
  include(search_run_id, total_price, duration_outbound_minutes, duration_return_minutes)
  where quality_eligible and stops_outbound is not null;

create function public.fare_stop_bucket(p_stops integer)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_stops is null then null
    when p_stops = 0 then 'NONSTOP'
    when p_stops = 1 then 'ONE_STOP'
    else 'TWO_PLUS_STOPS'
  end
$$;

create function public.historical_numeric_summary(
  p_values numeric[],
  p_current numeric
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  sample_count integer := coalesce(cardinality(p_values), 0);
  median_value numeric;
  mad_value numeric;
  percentile_value numeric;
  robust_score numeric;
  gate text;
  classification_eligible boolean := false;
  historical_low boolean := false;
begin
  if sample_count < 10 then
    return jsonb_build_object(
      'sample_count', sample_count,
      'minimum_context_samples', 10,
      'minimum_classification_samples', 30,
      'gate', 'BUILDING',
      'median', null,
      'mad', null,
      'percentile', null,
      'robust_score', null,
      'classification_eligible', false,
      'historical_low', false
    );
  end if;

  select percentile_cont(0.5) within group (order by value)
  into median_value
  from unnest(p_values) as sample(value);

  select percentile_cont(0.5) within group (order by abs(value - median_value))
  into mad_value
  from unnest(p_values) as sample(value);

  select round(
    100 * (
      count(*) filter (where value < p_current)
      + 0.5 * count(*) filter (where value = p_current)
    ) / sample_count,
    3
  )
  into percentile_value
  from unnest(p_values) as sample(value);

  if sample_count < 30 then
    gate := 'LIMITED';
  elsif mad_value = 0 then
    gate := 'ZERO_MAD';
  else
    gate := 'ELIGIBLE';
    classification_eligible := true;
    robust_score := round(0.6745 * (p_current - median_value) / mad_value, 4);
    historical_low := percentile_value <= 10 and robust_score <= -2;
  end if;

  return jsonb_build_object(
    'sample_count', sample_count,
    'minimum_context_samples', 10,
    'minimum_classification_samples', 30,
    'gate', gate,
    'median', round(median_value, 2),
    'mad', round(mad_value, 2),
    'percentile', percentile_value,
    'robust_score', robust_score,
    'classification_eligible', classification_eligible,
    'historical_low', historical_low
  );
end;
$$;

create function public.historical_fare_samples(p_watch_id uuid)
returns table (
  observation_id uuid,
  search_run_id uuid,
  acquisition_batch_id uuid,
  watch_id uuid,
  candidate_id uuid,
  origin text,
  destination text,
  departure_date date,
  return_date date,
  cabin text,
  currency text,
  outbound_stop_bucket text,
  return_stop_bucket text,
  passengers integer,
  max_stops integer,
  max_duration_minutes integer,
  total_price numeric,
  observed_at timestamptz,
  run_started_at timestamptz,
  run_finished_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    ranked.observation_id,
    ranked.search_run_id,
    ranked.acquisition_batch_id,
    ranked.watch_id,
    ranked.candidate_id,
    ranked.origin,
    ranked.destination,
    ranked.departure_date,
    ranked.return_date,
    ranked.cabin,
    ranked.currency,
    ranked.outbound_stop_bucket,
    ranked.return_stop_bucket,
    ranked.passengers,
    ranked.max_stops,
    ranked.max_duration_minutes,
    ranked.total_price,
    ranked.observed_at,
    ranked.run_started_at,
    ranked.run_finished_at
  from (
    select
      observation.id as observation_id,
      observation.search_run_id,
      run.acquisition_batch_id,
      observation.watch_id,
      run.candidate_id,
      observation.origin,
      observation.destination,
      observation.departure_date,
      observation.return_date,
      observation.cabin,
      observation.currency,
      public.fare_stop_bucket(observation.stops_outbound) as outbound_stop_bucket,
      case
        when observation.return_date is null then 'ONE_WAY'
        else public.fare_stop_bucket(observation.stops_return)
      end as return_stop_bucket,
      run.request_passengers as passengers,
      run.request_max_stops as max_stops,
      run.request_max_duration_minutes as max_duration_minutes,
      observation.total_price,
      observation.observed_at,
      run.started_at as run_started_at,
      run.finished_at as run_finished_at,
      row_number() over (
        partition by
          observation.search_run_id,
          observation.origin,
          observation.destination,
          observation.departure_date,
          observation.return_date,
          observation.cabin,
          observation.currency,
          public.fare_stop_bucket(observation.stops_outbound),
          case
            when observation.return_date is null then 'ONE_WAY'
            else public.fare_stop_bucket(observation.stops_return)
          end
        order by
          observation.total_price,
          observation.duration_outbound_minutes nulls last,
          observation.duration_return_minutes nulls last,
          observation.id
      ) as sample_rank
    from public.fare_observations as observation
    join public.search_runs as run on run.id = observation.search_run_id
    join public.search_candidates as candidate on candidate.id = run.candidate_id
    where observation.watch_id = p_watch_id
      and run.watch_id = observation.watch_id
      and candidate.watch_id = run.watch_id
      and candidate.origin = observation.origin
      and candidate.destination = observation.destination
      and candidate.departure_date = observation.departure_date
      and candidate.return_date is not distinct from observation.return_date
      and candidate.cabin = observation.cabin
      and run.provider = observation.provider
      and run.status = 'VALID_RESULT'
      and run.completeness_score = 1
      and run.reconfirmation_anomaly_id is null
      and run.acquisition_batch_id is not null
      and run.request_passengers is not null
      and observation.quality_eligible
      and observation.total_price > 0
      and observation.stops_outbound is not null
      and (observation.return_date is null or observation.stops_return is not null)
      and (
        run.request_max_stops is null
        or (
          observation.stops_outbound <= run.request_max_stops
          and (
            observation.return_date is null
            or observation.stops_return <= run.request_max_stops
          )
        )
      )
      and (
        run.request_max_duration_minutes is null
        or (
          observation.duration_outbound_minutes is not null
          and observation.duration_outbound_minutes <= run.request_max_duration_minutes
          and (
            observation.return_date is null
            or (
              observation.duration_return_minutes is not null
              and observation.duration_return_minutes <= run.request_max_duration_minutes
            )
          )
        )
      )
      and (
        select count(*) from public.fare_observations as persisted
        where persisted.search_run_id = run.id
      ) = run.result_count
  ) as ranked
  where ranked.sample_rank = 1
$$;

create function public.get_historical_comparison_context(
  p_watch_id uuid,
  p_lower_observation_id uuid,
  p_higher_observation_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  lower_current record;
  higher_current record;
  cutoff_at timestamptz;
  lower_values numeric[];
  higher_values numeric[];
  spread_values numeric[];
  lower_first timestamptz;
  lower_last timestamptz;
  higher_first timestamptz;
  higher_last timestamptz;
  spread_first timestamptz;
  spread_last timestamptz;
  lower_summary jsonb;
  higher_summary jsonb;
  spread_summary jsonb;
  current_spread numeric;
begin
  select * into lower_current
  from public.historical_fare_samples(p_watch_id)
  where observation_id = p_lower_observation_id;

  select * into higher_current
  from public.historical_fare_samples(p_watch_id)
  where observation_id = p_higher_observation_id;

  if lower_current.observation_id is null or higher_current.observation_id is null then
    raise exception 'Current comparison evidence is not an eligible historical sample'
      using errcode = '22023';
  end if;

  if lower_current.acquisition_batch_id is distinct from higher_current.acquisition_batch_id
    or lower_current.origin is distinct from higher_current.origin
    or lower_current.destination is distinct from higher_current.destination
    or lower_current.departure_date is distinct from higher_current.departure_date
    or lower_current.return_date is distinct from higher_current.return_date
    or lower_current.currency is distinct from higher_current.currency
    or lower_current.outbound_stop_bucket is distinct from higher_current.outbound_stop_bucket
    or lower_current.return_stop_bucket is distinct from higher_current.return_stop_bucket
    or lower_current.passengers is distinct from higher_current.passengers
    or lower_current.max_stops is distinct from higher_current.max_stops
    or lower_current.max_duration_minutes is distinct from higher_current.max_duration_minutes
    or lower_current.cabin = higher_current.cabin then
    raise exception 'Current comparison evidence does not share one exact acquisition scope'
      using errcode = '22023';
  end if;

  select min(started_at) into cutoff_at
  from public.search_runs
  where watch_id = p_watch_id
    and acquisition_batch_id = lower_current.acquisition_batch_id
    and reconfirmation_anomaly_id is null;

  select
    array_agg(sample.total_price order by sample.total_price, sample.observation_id),
    min(sample.observed_at),
    max(sample.observed_at)
  into lower_values, lower_first, lower_last
  from public.historical_fare_samples(p_watch_id) as sample
  where sample.acquisition_batch_id <> lower_current.acquisition_batch_id
    and sample.run_finished_at < cutoff_at
    and sample.origin = lower_current.origin
    and sample.destination = lower_current.destination
    and sample.departure_date = lower_current.departure_date
    and sample.return_date is not distinct from lower_current.return_date
    and sample.cabin = lower_current.cabin
    and sample.currency = lower_current.currency
    and sample.outbound_stop_bucket = lower_current.outbound_stop_bucket
    and sample.return_stop_bucket = lower_current.return_stop_bucket
    and sample.passengers = lower_current.passengers
    and sample.max_stops is not distinct from lower_current.max_stops
    and sample.max_duration_minutes is not distinct from lower_current.max_duration_minutes;

  select
    array_agg(sample.total_price order by sample.total_price, sample.observation_id),
    min(sample.observed_at),
    max(sample.observed_at)
  into higher_values, higher_first, higher_last
  from public.historical_fare_samples(p_watch_id) as sample
  where sample.acquisition_batch_id <> higher_current.acquisition_batch_id
    and sample.run_finished_at < cutoff_at
    and sample.origin = higher_current.origin
    and sample.destination = higher_current.destination
    and sample.departure_date = higher_current.departure_date
    and sample.return_date is not distinct from higher_current.return_date
    and sample.cabin = higher_current.cabin
    and sample.currency = higher_current.currency
    and sample.outbound_stop_bucket = higher_current.outbound_stop_bucket
    and sample.return_stop_bucket = higher_current.return_stop_bucket
    and sample.passengers = higher_current.passengers
    and sample.max_stops is not distinct from higher_current.max_stops
    and sample.max_duration_minutes is not distinct from higher_current.max_duration_minutes;

  with per_batch as (
    select
      sample.acquisition_batch_id,
      sample.cabin,
      min(sample.total_price) as total_price,
      max(sample.observed_at) as observed_at
    from public.historical_fare_samples(p_watch_id) as sample
    where sample.acquisition_batch_id <> lower_current.acquisition_batch_id
      and sample.run_finished_at < cutoff_at
      and sample.origin = lower_current.origin
      and sample.destination = lower_current.destination
      and sample.departure_date = lower_current.departure_date
      and sample.return_date is not distinct from lower_current.return_date
      and sample.currency = lower_current.currency
      and sample.outbound_stop_bucket = lower_current.outbound_stop_bucket
      and sample.return_stop_bucket = lower_current.return_stop_bucket
      and sample.passengers = lower_current.passengers
      and sample.max_stops is not distinct from lower_current.max_stops
      and sample.max_duration_minutes is not distinct from lower_current.max_duration_minutes
      and sample.cabin in (lower_current.cabin, higher_current.cabin)
    group by sample.acquisition_batch_id, sample.cabin
  ), spread_samples as (
    select
      round(100 * (higher.total_price - lower.total_price) / lower.total_price, 4) as spread_pct,
      greatest(lower.observed_at, higher.observed_at) as observed_at
    from per_batch as lower
    join per_batch as higher
      on higher.acquisition_batch_id = lower.acquisition_batch_id
      and higher.cabin = higher_current.cabin
    where lower.cabin = lower_current.cabin
  )
  select
    array_agg(spread_pct order by spread_pct),
    min(observed_at),
    max(observed_at)
  into spread_values, spread_first, spread_last
  from spread_samples;

  current_spread := round(
    100 * (higher_current.total_price - lower_current.total_price)
      / lower_current.total_price,
    4
  );
  lower_summary := public.historical_numeric_summary(
    lower_values,
    lower_current.total_price
  ) || jsonb_build_object('first_sample_at', lower_first, 'last_sample_at', lower_last);
  higher_summary := public.historical_numeric_summary(
    higher_values,
    higher_current.total_price
  ) || jsonb_build_object('first_sample_at', higher_first, 'last_sample_at', higher_last);
  spread_summary := public.historical_numeric_summary(
    spread_values,
    current_spread
  ) || jsonb_build_object('first_sample_at', spread_first, 'last_sample_at', spread_last);

  return jsonb_build_object(
    'method', 'fare-radar-history-v1',
    'cutoff_at', cutoff_at,
    'scope', jsonb_build_object(
      'watch_id', p_watch_id,
      'origin', lower_current.origin,
      'destination', lower_current.destination,
      'departure_date', lower_current.departure_date,
      'return_date', lower_current.return_date,
      'currency', lower_current.currency,
      'passengers', lower_current.passengers,
      'max_stops', lower_current.max_stops,
      'max_duration_minutes', lower_current.max_duration_minutes,
      'outbound_stop_bucket', lower_current.outbound_stop_bucket,
      'return_stop_bucket', lower_current.return_stop_bucket,
      'lower_cabin', lower_current.cabin,
      'higher_cabin', higher_current.cabin,
      'current_batch_id', lower_current.acquisition_batch_id,
      'lower_observation_id', lower_current.observation_id,
      'higher_observation_id', higher_current.observation_id
    ),
    'lower_price', lower_summary,
    'higher_price', higher_summary,
    'spread_pct', spread_summary,
    'assessment', jsonb_build_object(
      'historically_supported_relationship',
        coalesce((spread_summary->>'historical_low')::boolean, false),
      'classification_eligible',
        coalesce((spread_summary->>'classification_eligible')::boolean, false)
    )
  );
end;
$$;

create function public.freeze_confirmation_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.confirmed_at is null
    and new.confirmed_at is not null
    and old.explanation_json ? 'historical_context' then
    new.explanation_json := jsonb_set(
      new.explanation_json,
      '{confirmation,historical_context}',
      old.explanation_json->'historical_context',
      true
    );
  end if;
  return new;
end;
$$;

create trigger zz_freeze_confirmation_history
  before update on public.anomalies
  for each row execute function public.freeze_confirmation_history();

revoke execute on function public.fare_stop_bucket(integer)
  from public, anon, authenticated;
revoke execute on function public.historical_numeric_summary(numeric[], numeric)
  from public, anon, authenticated;
revoke execute on function public.historical_fare_samples(uuid)
  from public, anon, authenticated;
revoke execute on function public.get_historical_comparison_context(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.freeze_confirmation_history()
  from public, anon, authenticated;

grant execute on function public.fare_stop_bucket(integer) to service_role;
grant execute on function public.historical_numeric_summary(numeric[], numeric) to service_role;
grant execute on function public.historical_fare_samples(uuid) to service_role;
grant execute on function public.get_historical_comparison_context(uuid, uuid, uuid)
  to service_role;
grant execute on function public.freeze_confirmation_history() to service_role;
