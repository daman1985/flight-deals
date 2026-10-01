/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
-- Run after migrations as postgres. Fixtures and all writes roll back.
begin;
do $$
#variable_conflict use_variable
declare
  watch_id uuid;
  anomaly_id uuid;
  token uuid;
  lower_candidate uuid;
  higher_candidate uuid;
  lower_run uuid;
  higher_run uuid;
  lower_observation uuid;
  higher_observation uuid;
  q public.anomaly_reconfirmations;
  scenario text;
  outcome text;
  fixture_day date := date '2099-01-01';
  original_confirmation timestamptz;
  lower_name text;
  higher_name text;
begin
  insert into public.watches(user_id, name, origin_airports, destination_airports,
    date_mode, rolling_horizon_days, min_trip_nights, max_trip_nights, cabins,
    max_stops, max_duration_minutes)
  select id, 'Reconfirmation regression fixture', array['AAA'], array['BBB'],
    'ANYTIME', 365, 7, 7, array['ECONOMY', 'PREMIUM_ECONOMY'], 1, 400
  from auth.users order by id limit 1 returning id into watch_id;
  assert watch_id is not null, 'Fixture requires an existing auth user';

  foreach scenario in array array['VALID', 'VALID_INVERSION', 'VALID_BUSINESS', 'PROVIDER_FAILURE', 'INCOMPLETE', 'INELIGIBLE',
    'WRONG_CABIN', 'WRONG_ROUTE', 'WRONG_DATE', 'WRONG_CURRENCY', 'WRONG_STOPS',
    'TOO_LONG', 'NOT_ANOMALOUS', 'STALE_RUN', 'STALE_OBSERVATION', 'WRONG_TOKEN',
    'EXPIRED_LEASE', 'CONTEXT_CHANGED', 'RESOLVED', 'MISSING_EVIDENCE'] loop
    fixture_day := fixture_day + 1;
    anomaly_id := gen_random_uuid();
    token := gen_random_uuid();
    lower_name := case when scenario = 'VALID_BUSINESS' then 'PREMIUM_ECONOMY' else 'ECONOMY' end;
    higher_name := case when scenario = 'VALID_BUSINESS' then 'BUSINESS' else 'PREMIUM_ECONOMY' end;
    insert into public.anomalies(id, watch_id, type, severity, origin, destination,
      departure_date, return_date, lower_cabin, higher_cabin, explanation_json)
    values(anomaly_id, watch_id, case scenario when 'VALID_INVERSION' then 'CABIN_INVERSION'
      when 'VALID_BUSINESS' then 'BUSINESS_VALUE_SPREAD' else 'NEAR_INVERSION' end,
      'MEDIUM', 'AAA', 'BBB', fixture_day, fixture_day + 7, lower_name, higher_name,
      jsonb_build_object('threshold_pct', case when scenario = 'VALID_BUSINESS' then 30 else 15 end,
        'comparison_scope', '{"currency":"CAD","outbound_stop_bucket":"ONE_STOP","return_stop_bucket":"ONE_STOP"}'::jsonb));

    select * into q from public.anomaly_reconfirmations where anomaly_reconfirmations.anomaly_id = anomaly_id;
    assert q.state = 'PENDING' and q.attempts = 0 and q.next_attempt_at > now(),
      'First detection must queue a delayed job';
    assert not exists(select 1 from public.alerts where alerts.anomaly_id = anomaly_id),
      'First detection must never alert';
    -- Repeated detection must not reset delay or insert another job.
    update public.anomalies set confidence = 'OBSERVED' where id = anomaly_id;
    assert (select count(*) = 1 from public.anomaly_reconfirmations
      where anomaly_reconfirmations.anomaly_id = anomaly_id);
    update public.anomaly_reconfirmations set next_attempt_at = '-infinity'
      where anomaly_reconfirmations.anomaly_id = anomaly_id;
    select * into q from public.claim_anomaly_reconfirmations(1, token);
    assert q.anomaly_id = anomaly_id and q.attempts = 1
      and q.lifetime_attempts = 1 and q.generation = 1 and q.lease_token = token;
    assert not exists(select 1 from public.claim_anomaly_reconfirmations(1, gen_random_uuid()) c
      where c.anomaly_id = anomaly_id), 'Another worker must not claim a live lease';

    insert into public.search_candidates(watch_id, origin, destination, departure_date, return_date, cabin)
      values(watch_id, 'AAA', 'BBB', fixture_day, fixture_day + 7, lower_name) returning id into lower_candidate;
    insert into public.search_candidates(watch_id, origin, destination, departure_date, return_date, cabin)
      values(watch_id, 'AAA', 'BBB', fixture_day, fixture_day + 7, higher_name) returning id into higher_candidate;
    insert into public.search_runs(watch_id, candidate_id, provider, started_at, finished_at,
      status, result_count, completeness_score, reconfirmation_anomaly_id, reconfirmation_lease_token)
      values(watch_id, lower_candidate, 'fixture', q.claimed_at, q.claimed_at,
        'VALID_RESULT', 1, 1, anomaly_id, token) returning id into lower_run;
    insert into public.search_runs(watch_id, candidate_id, provider, started_at, finished_at,
      status, result_count, completeness_score, reconfirmation_anomaly_id, reconfirmation_lease_token)
      values(watch_id, higher_candidate, 'fixture', q.claimed_at, q.claimed_at,
        'VALID_RESULT', 1, 1, anomaly_id, token) returning id into higher_run;
    insert into public.fare_observations(watch_id, search_run_id, provider, origin, destination,
      departure_date, return_date, cabin, stops_outbound, stops_return, duration_outbound_minutes,
      duration_return_minutes, total_price, currency, observed_at, quality_eligible)
      values(watch_id, lower_run, 'fixture', 'AAA', 'BBB', fixture_day, fixture_day + 7,
        lower_name, 1, 1, 300, 300, 1000, 'CAD', q.claimed_at, true) returning id into lower_observation;
    insert into public.fare_observations(watch_id, search_run_id, provider, origin, destination,
      departure_date, return_date, cabin, stops_outbound, stops_return, duration_outbound_minutes,
      duration_return_minutes, total_price, currency, observed_at, quality_eligible)
      values(watch_id, higher_run, 'fixture', 'AAA', 'BBB', fixture_day, fixture_day + 7,
        higher_name, 1, 1, 300, 300,
        case scenario when 'VALID_INVERSION' then 900 when 'VALID_BUSINESS' then 1250 else 1100 end,
        'CAD', q.claimed_at, true) returning id into higher_observation;

    case scenario
      when 'PROVIDER_FAILURE' then update public.search_runs set status = 'PROVIDER_FAILURE' where id = higher_run;
      when 'INCOMPLETE' then update public.search_runs set completeness_score = 0.9 where id = higher_run;
      when 'INELIGIBLE' then update public.fare_observations set quality_eligible = false where id = higher_observation;
      when 'WRONG_CABIN' then update public.fare_observations set cabin = 'BUSINESS' where id = higher_observation;
      when 'WRONG_ROUTE' then update public.fare_observations set destination = 'CCC' where id = higher_observation;
      when 'WRONG_DATE' then update public.fare_observations set departure_date = fixture_day + 1 where id = higher_observation;
      when 'WRONG_CURRENCY' then update public.fare_observations set currency = 'USD' where id = higher_observation;
      when 'WRONG_STOPS' then update public.fare_observations set stops_return = 0 where id = higher_observation;
      when 'TOO_LONG' then update public.fare_observations set duration_return_minutes = 401 where id = higher_observation;
      when 'NOT_ANOMALOUS' then update public.fare_observations set total_price = 1600 where id = higher_observation;
      when 'STALE_RUN' then update public.search_runs set reconfirmation_lease_token = gen_random_uuid() where id = higher_run;
      when 'STALE_OBSERVATION' then update public.fare_observations set observed_at = q.claimed_at - interval '1 hour' where id = higher_observation;
      when 'WRONG_TOKEN' then token := gen_random_uuid();
      when 'EXPIRED_LEASE' then update public.anomaly_reconfirmations set lease_expires_at = now() - interval '1 second' where anomaly_reconfirmations.anomaly_id = anomaly_id;
      when 'CONTEXT_CHANGED' then update public.watches set passengers = 2 where id = watch_id;
      when 'RESOLVED' then update public.anomalies set resolved_at = now() where id = anomaly_id;
      when 'MISSING_EVIDENCE' then higher_run := null;
      else null;
    end case;

    outcome := public.finish_anomaly_reconfirmation(anomaly_id, token, lower_run, higher_run);
    if scenario like 'VALID%' then
      assert outcome = 'CONFIRMED';
      assert (select count(*) = 1 from public.alerts where alerts.anomaly_id = anomaly_id
        and channel = 'in_app' and delivery_status = 'DELIVERED');
      assert (select bool_and(confirmed) from public.fare_observations where id in (lower_observation, higher_observation));
      select confirmed_at into original_confirmation from public.anomalies where id = anomaly_id;
      assert original_confirmation is not null;
      assert public.finish_anomaly_reconfirmation(anomaly_id, token, lower_run, higher_run) = 'CONFIRMED';
      assert (select count(*) = 1 from public.alerts where alerts.anomaly_id = anomaly_id),
        'Repeated delivery must be idempotent';
      update public.anomalies set confirmed_at = null, confidence = 'OBSERVED', explanation_json = '{}'
        where id = anomaly_id;
      assert (select confirmed_at = original_confirmation and confidence = 'RECONFIRMED'
        and explanation_json ? 'confirmation' from public.anomalies where id = anomaly_id),
        'Detector updates must retain durable confirmation and evidence references';
    else
      assert outcome in ('RETRY', 'STALE', 'CANCELLED'), 'Invalid attempt must never confirm';
      assert not exists(select 1 from public.alerts where alerts.anomaly_id = anomaly_id), scenario;
      assert (select confirmed_at is null from public.anomalies where id = anomaly_id), scenario;
      assert not exists(select 1 from public.fare_observations
        where id in (lower_observation, higher_observation) and confirmed), scenario;
    end if;
    -- Keep previous fixtures out of subsequent claims without deleting audit rows.
    update public.anomaly_reconfirmations set state = 'CANCELLED'
      where anomaly_reconfirmations.anomaly_id = anomaly_id and state <> 'CONFIRMED';
    update public.watches set passengers = 1 where id = watch_id;
  end loop;

  -- Recover an expired lease, reject its old owner, then exhaust bounded retries.
  update public.anomalies set resolved_at = null where id = anomaly_id;
  update public.anomaly_reconfirmations set state = 'LEASED', attempts = 4,
    lifetime_attempts = 4, lease_expires_at = now() - interval '1 second',
    next_attempt_at = '-infinity'
    where anomaly_reconfirmations.anomaly_id = anomaly_id;
  token := gen_random_uuid();
  select * into q from public.claim_anomaly_reconfirmations(1, token);
  assert q.anomaly_id = anomaly_id and q.attempts = 5;
  assert public.finish_anomaly_reconfirmation(anomaly_id, token) = 'EXHAUSTED';
  assert (select state = 'EXHAUSTED' and lease_token is null and completed_at is not null
    from public.anomaly_reconfirmations where anomaly_reconfirmations.anomaly_id = anomaly_id);

  -- The same terminal evidence must stay terminal, but newer evidence safely
  -- starts a fresh bounded generation without erasing lifetime audit counts.
  update public.anomalies set confidence = 'OBSERVED' where id = anomaly_id;
  assert (select state = 'EXHAUSTED' and generation = 1 and lifetime_attempts = 5
    from public.anomaly_reconfirmations where anomaly_reconfirmations.anomaly_id = anomaly_id),
    'Repeated writes of the same evidence must not reset a terminal job';
  update public.anomalies
    set explanation_json = explanation_json || jsonb_build_object(
      'lower_observation', jsonb_build_object(
        'observed_at', (clock_timestamp() + interval '1 minute')::text
      )
    )
  where id = anomaly_id;
  assert (select state = 'PENDING' and attempts = 0 and generation = 2
      and lifetime_attempts = 5 and completed_at is null and last_error_code is null
    from public.anomaly_reconfirmations where anomaly_reconfirmations.anomaly_id = anomaly_id),
    'New detector evidence must re-arm a terminal job as a new generation';

  update public.anomaly_reconfirmations set state = 'CANCELLED', completed_at = now(),
    last_error_code = 'CONTEXT_CHANGED' where anomaly_reconfirmations.anomaly_id = anomaly_id;
  update public.watches set passengers = 3 where id = watch_id;
  update public.anomalies set confidence = 'OBSERVED' where id = anomaly_id;
  assert (select state = 'PENDING' and attempts = 0 and generation = 3
      and lifetime_attempts = 5 and (watch_snapshot->>'passengers')::integer = 3
    from public.anomaly_reconfirmations where anomaly_reconfirmations.anomaly_id = anomaly_id),
    'Changed watch constraints must re-arm a cancelled job with a fresh snapshot';

  assert not has_function_privilege('anon', 'public.claim_anomaly_reconfirmations(integer,uuid)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.finish_anomaly_reconfirmation(uuid,uuid,uuid,uuid,text)', 'EXECUTE');
  assert not has_table_privilege('authenticated', 'public.anomaly_reconfirmations', 'SELECT');
  assert has_function_privilege('service_role', 'public.finish_anomaly_reconfirmation(uuid,uuid,uuid,uuid,text)', 'EXECUTE');
end;
$$;
select 'durable_anomaly_reconfirmation: all assertions passed' as result;
rollback;
