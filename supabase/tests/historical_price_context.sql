begin;

do $$
declare
  fixture_user uuid;
  fixture_watch uuid;
  lower_candidate uuid;
  higher_candidate uuid;
  fixture_anomaly uuid := gen_random_uuid();
  batch_id uuid;
  lower_run uuid;
  higher_run uuid;
  lower_observation uuid;
  higher_observation uuid;
  current_batch uuid := gen_random_uuid();
  context jsonb;
  summary jsonb;
  sample_time timestamptz;
  i integer;
begin
  select id into fixture_user from auth.users order by id limit 1;
  if fixture_user is null then
    raise exception 'Historical regression fixture requires an auth user';
  end if;

  insert into public.watches (
    user_id, name, origin_airports, destination_airports, date_mode,
    exact_departure_date, exact_return_date, cabins, passengers,
    max_stops, max_duration_minutes
  ) values (
    fixture_user, 'Historical context regression', array['AAA'], array['BBB'],
    'EXACT', date '2099-04-01', date '2099-04-08',
    array['ECONOMY', 'PREMIUM_ECONOMY'], 1, 1, 600
  ) returning id into fixture_watch;

  insert into public.search_candidates (
    watch_id, origin, destination, departure_date, return_date, cabin
  ) values (
    fixture_watch, 'AAA', 'BBB', date '2099-04-01', date '2099-04-08',
    'ECONOMY'
  ) returning id into lower_candidate;

  insert into public.search_candidates (
    watch_id, origin, destination, departure_date, return_date, cabin
  ) values (
    fixture_watch, 'AAA', 'BBB', date '2099-04-01', date '2099-04-08',
    'PREMIUM_ECONOMY'
  ) returning id into higher_candidate;

  -- Thirty-one complete, paired batches establish full historical eligibility.
  for i in 1..31 loop
    batch_id := gen_random_uuid();
    sample_time := timestamptz '2099-01-01 00:00:00+00' + i * interval '1 day';
    lower_run := gen_random_uuid();
    higher_run := gen_random_uuid();

    insert into public.search_runs (
      id, watch_id, candidate_id, provider, started_at, finished_at, status,
      result_count, completeness_score, retry_count, acquisition_batch_id,
      request_passengers, request_max_stops, request_max_duration_minutes
    ) values
      (lower_run, fixture_watch, lower_candidate, 'fixture', sample_time,
       sample_time + interval '1 minute', 'VALID_RESULT',
       case when i = 1 then 2 else 1 end, 1, 0, batch_id, 1, 1, 600),
      (higher_run, fixture_watch, higher_candidate, 'fixture',
       sample_time + interval '2 minutes', sample_time + interval '3 minutes',
       'VALID_RESULT', 1, 1, 0, batch_id, 1, 1, 600);

    insert into public.fare_observations (
      watch_id, search_run_id, provider, origin, destination, departure_date,
      return_date, cabin, stops_outbound, stops_return,
      duration_outbound_minutes, duration_return_minutes, total_price,
      currency, observed_at, quality_eligible
    ) values (
      fixture_watch, lower_run, 'fixture', 'AAA', 'BBB', date '2099-04-01',
      date '2099-04-08', 'ECONOMY', 0, 0, 180, 180,
      900 + i * 10, 'CAD', sample_time, true
    );

    if i = 1 then
      -- A second offer in one run must not become a second historical sample.
      insert into public.fare_observations (
        watch_id, search_run_id, provider, origin, destination, departure_date,
        return_date, cabin, stops_outbound, stops_return,
        duration_outbound_minutes, duration_return_minutes, total_price,
        currency, observed_at, quality_eligible
      ) values (
        fixture_watch, lower_run, 'fixture', 'AAA', 'BBB', date '2099-04-01',
        date '2099-04-08', 'ECONOMY', 0, 0, 200, 200,
        1900, 'CAD', sample_time, true
      );
    end if;

    insert into public.fare_observations (
      watch_id, search_run_id, provider, origin, destination, departure_date,
      return_date, cabin, stops_outbound, stops_return,
      duration_outbound_minutes, duration_return_minutes, total_price,
      currency, observed_at, quality_eligible
    ) values (
      fixture_watch, higher_run, 'fixture', 'AAA', 'BBB', date '2099-04-01',
      date '2099-04-08', 'PREMIUM_ECONOMY', 0, 0, 180, 180,
      1300 + i * 7, 'CAD', sample_time + interval '2 minutes', true
    );
  end loop;

  -- Exact-scope contaminants must not alter CAD nonstop passenger-one history.
  foreach i in array array[1, 2, 3, 4, 5] loop
    batch_id := gen_random_uuid();
    sample_time := timestamptz '2099-02-15 00:00:00+00' + i * interval '1 hour';
    lower_run := gen_random_uuid();
    higher_run := gen_random_uuid();
    insert into public.search_runs (
      id, watch_id, candidate_id, provider, started_at, finished_at, status,
      result_count, completeness_score, acquisition_batch_id,
      request_passengers, request_max_stops, request_max_duration_minutes
    ) values
      (lower_run, fixture_watch, lower_candidate, 'fixture', sample_time,
       sample_time + interval '1 minute', 'VALID_RESULT', 1, 1, batch_id,
       case when i = 3 then 2 else 1 end,
       case when i = 5 then 2 else 1 end,
       case when i = 4 then 480 else 600 end),
      (higher_run, fixture_watch, higher_candidate, 'fixture',
       sample_time + interval '2 minutes', sample_time + interval '3 minutes',
       'VALID_RESULT', 1, 1, batch_id,
       case when i = 3 then 2 else 1 end,
       case when i = 5 then 2 else 1 end,
       case when i = 4 then 480 else 600 end);
    insert into public.fare_observations (
      watch_id, search_run_id, provider, origin, destination, departure_date,
      return_date, cabin, stops_outbound, stops_return,
      duration_outbound_minutes, duration_return_minutes, total_price,
      currency, observed_at, quality_eligible
    ) values
      (fixture_watch, lower_run, 'fixture', 'AAA', 'BBB', date '2099-04-01',
       date '2099-04-08', 'ECONOMY', case when i = 2 then 1 else 0 end,
       case when i = 2 then 1 else 0 end, 180, 180, 1,
       case when i = 1 then 'USD' else 'CAD' end, sample_time, true),
      (fixture_watch, higher_run, 'fixture', 'AAA', 'BBB', date '2099-04-01',
       date '2099-04-08', 'PREMIUM_ECONOMY',
       case when i = 2 then 1 else 0 end, case when i = 2 then 1 else 0 end,
       180, 180, 2, case when i = 1 then 'USD' else 'CAD' end,
       sample_time + interval '2 minutes', true);
  end loop;

  -- Lower-only evidence may inform its own price history but cannot invent a spread.
  batch_id := gen_random_uuid();
  lower_run := gen_random_uuid();
  sample_time := timestamptz '2099-02-20 00:00:00+00';
  insert into public.search_runs (
    id, watch_id, candidate_id, provider, started_at, finished_at, status,
    result_count, completeness_score, acquisition_batch_id,
    request_passengers, request_max_stops, request_max_duration_minutes
  ) values (
    lower_run, fixture_watch, lower_candidate, 'fixture', sample_time,
    sample_time + interval '1 minute', 'VALID_RESULT', 1, 1, batch_id, 1, 1, 600
  );
  insert into public.fare_observations (
    watch_id, search_run_id, provider, origin, destination, departure_date,
    return_date, cabin, stops_outbound, stops_return,
    duration_outbound_minutes, duration_return_minutes, total_price,
    currency, observed_at, quality_eligible
  ) values (
    fixture_watch, lower_run, 'fixture', 'AAA', 'BBB', date '2099-04-01',
    date '2099-04-08', 'ECONOMY', 0, 0, 180, 180, 1001, 'CAD', sample_time, true
  );

  -- Unhealthy, incomplete, low-quality, and result-count-mismatched rows are excluded.
  for i in 1..3 loop
    batch_id := gen_random_uuid();
    lower_run := gen_random_uuid();
    sample_time := timestamptz '2099-02-21 00:00:00+00' + i * interval '1 hour';
    insert into public.search_runs (
      id, watch_id, candidate_id, provider, started_at, finished_at, status,
      result_count, completeness_score, acquisition_batch_id,
      request_passengers, request_max_stops, request_max_duration_minutes
    ) values (
      lower_run, fixture_watch, lower_candidate, 'fixture', sample_time,
      sample_time + interval '1 minute',
      case when i = 1 then 'INCOMPLETE_RESULT' else 'VALID_RESULT' end,
      case when i = 3 then 2 else 1 end,
      case when i = 1 then 0.5 else 1 end,
      batch_id, 1, 1, 600
    );
    insert into public.fare_observations (
      watch_id, search_run_id, provider, origin, destination, departure_date,
      return_date, cabin, stops_outbound, stops_return,
      duration_outbound_minutes, duration_return_minutes, total_price,
      currency, observed_at, quality_eligible
    ) values (
      fixture_watch, lower_run, 'fixture', 'AAA', 'BBB', date '2099-04-01',
      date '2099-04-08', 'ECONOMY', 0, 0, 180, 180, 1, 'CAD', sample_time,
      i <> 2
    );
  end loop;

  insert into public.anomalies (
    id, watch_id, type, severity, origin, destination, departure_date,
    return_date, lower_cabin, higher_cabin, lower_cabin_price,
    higher_cabin_price, spread_amount, spread_pct, explanation_json
  ) values (
    fixture_anomaly, fixture_watch, 'NEAR_INVERSION', 'MEDIUM', 'AAA', 'BBB',
    date '2099-04-01', date '2099-04-08', 'ECONOMY', 'PREMIUM_ECONOMY',
    1000, 1100, 100, 10,
    jsonb_build_object('historical_context', jsonb_build_object('method', 'fixture'))
  );

  -- Reconfirmation evidence has different sampling intent and must never train.
  batch_id := gen_random_uuid();
  lower_run := gen_random_uuid();
  insert into public.search_runs (
    id, watch_id, candidate_id, provider, started_at, finished_at, status,
    result_count, completeness_score, acquisition_batch_id,
    request_passengers, request_max_stops, request_max_duration_minutes,
    reconfirmation_anomaly_id, reconfirmation_lease_token
  ) values (
    lower_run, fixture_watch, lower_candidate, 'fixture',
    timestamptz '2099-02-25 00:00:00+00', timestamptz '2099-02-25 00:01:00+00',
    'VALID_RESULT', 1, 1, batch_id, 1, 1, 600, fixture_anomaly, gen_random_uuid()
  );
  insert into public.fare_observations (
    watch_id, search_run_id, provider, origin, destination, departure_date,
    return_date, cabin, stops_outbound, stops_return,
    duration_outbound_minutes, duration_return_minutes, total_price,
    currency, observed_at, quality_eligible
  ) values (
    fixture_watch, lower_run, 'fixture', 'AAA', 'BBB', date '2099-04-01',
    date '2099-04-08', 'ECONOMY', 0, 0, 180, 180, 1, 'CAD',
    timestamptz '2099-02-25 00:00:00+00', true
  );

  -- Current comparison is explicitly excluded from its own historical baseline.
  lower_run := gen_random_uuid();
  higher_run := gen_random_uuid();
  sample_time := timestamptz '2099-03-01 00:00:00+00';
  insert into public.search_runs (
    id, watch_id, candidate_id, provider, started_at, finished_at, status,
    result_count, completeness_score, acquisition_batch_id,
    request_passengers, request_max_stops, request_max_duration_minutes
  ) values
    (lower_run, fixture_watch, lower_candidate, 'fixture', sample_time,
     sample_time + interval '1 minute', 'VALID_RESULT', 1, 1,
     current_batch, 1, 1, 600),
    (higher_run, fixture_watch, higher_candidate, 'fixture',
     sample_time + interval '2 minutes', sample_time + interval '3 minutes',
     'VALID_RESULT', 1, 1, current_batch, 1, 1, 600);

  insert into public.fare_observations (
    watch_id, search_run_id, provider, origin, destination, departure_date,
    return_date, cabin, stops_outbound, stops_return,
    duration_outbound_minutes, duration_return_minutes, total_price,
    currency, observed_at, quality_eligible
  ) values (
    fixture_watch, lower_run, 'fixture', 'AAA', 'BBB', date '2099-04-01',
    date '2099-04-08', 'ECONOMY', 0, 0, 180, 180, 1000, 'CAD', sample_time, true
  ) returning id into lower_observation;
  insert into public.fare_observations (
    watch_id, search_run_id, provider, origin, destination, departure_date,
    return_date, cabin, stops_outbound, stops_return,
    duration_outbound_minutes, duration_return_minutes, total_price,
    currency, observed_at, quality_eligible
  ) values (
    fixture_watch, higher_run, 'fixture', 'AAA', 'BBB', date '2099-04-01',
    date '2099-04-08', 'PREMIUM_ECONOMY', 0, 0, 180, 180, 1100, 'CAD',
    sample_time + interval '2 minutes', true
  ) returning id into higher_observation;

  context := public.get_historical_comparison_context(
    fixture_watch, lower_observation, higher_observation
  );
  assert (context #>> '{lower_price,sample_count}')::integer = 32,
    'A lower-only complete batch should affect only the lower price baseline';
  assert (context #>> '{higher_price,sample_count}')::integer = 31,
    'Scope contaminants and invalid evidence must not affect higher history';
  assert (context #>> '{spread_pct,sample_count}')::integer = 31,
    'Only same-batch cabin pairs may become spread samples';
  assert context #>> '{spread_pct,gate}' = 'ELIGIBLE',
    'Thirty clean spread samples must enable historical classification';
  assert context #>> '{method}' = 'fare-radar-history-v1';
  assert context #>> '{scope,outbound_stop_bucket}' = 'NONSTOP';
  assert context #>> '{scope,return_stop_bucket}' = 'NONSTOP';
  assert (context #>> '{scope,passengers}')::integer = 1;

  summary := public.historical_numeric_summary(array[]::numeric[], 1);
  assert summary->>'gate' = 'BUILDING' and (summary->>'sample_count')::integer = 0;
  summary := public.historical_numeric_summary(
    array[1,2,3,4,5,6,7,8,9]::numeric[], 1
  );
  assert summary->>'gate' = 'BUILDING' and summary->'median' = 'null'::jsonb;
  summary := public.historical_numeric_summary(
    array[1,2,3,4,5,6,7,8,9,10]::numeric[], 5
  );
  assert summary->>'gate' = 'LIMITED' and (summary->>'median')::numeric = 5.5;
  summary := public.historical_numeric_summary(
    array_fill(100::numeric, array[30]), 100
  );
  assert summary->>'gate' = 'ZERO_MAD'
    and summary->'robust_score' = 'null'::jsonb
    and not (summary->>'classification_eligible')::boolean;
  summary := public.historical_numeric_summary(
    array[100,100,200,300,400,500,600,700,800,900]::numeric[], 100
  );
  assert (summary->>'percentile')::numeric = 10,
    'Empirical percentile must use midpoint tie ranking';

  -- The confirmation snapshot freezes historical evidence at alert time.
  update public.anomalies
  set confirmed_at = now(),
      explanation_json = explanation_json || jsonb_build_object(
        'confirmation', jsonb_build_object('confirmed_at', now())
      )
  where id = fixture_anomaly;
  assert (
    select explanation_json #>> '{confirmation,historical_context,method}' = 'fixture'
    from public.anomalies where id = fixture_anomaly
  ), 'Confirmation must freeze its historical evidence snapshot';

  assert not has_function_privilege(
    'authenticated', 'public.get_historical_comparison_context(uuid,uuid,uuid)',
    'EXECUTE'
  );
  assert has_function_privilege(
    'service_role', 'public.get_historical_comparison_context(uuid,uuid,uuid)',
    'EXECUTE'
  );
end;
$$;

select 'historical_price_context: all assertions passed' as result;
rollback;
