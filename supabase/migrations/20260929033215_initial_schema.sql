create table public.watches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  origin_airports text[] not null check (cardinality(origin_airports) > 0),
  destination_airports text[] not null check (cardinality(destination_airports) > 0),
  date_mode text not null check (date_mode in ('EXACT', 'FLEXIBLE_WINDOW', 'ANYTIME')),
  exact_departure_date date,
  exact_return_date date,
  window_departure_start date,
  window_departure_end date,
  min_trip_nights integer check (min_trip_nights is null or min_trip_nights > 0),
  max_trip_nights integer check (max_trip_nights is null or max_trip_nights > 0),
  rolling_horizon_days integer check (
    rolling_horizon_days is null or rolling_horizon_days between 1 and 365
  ),
  cabins text[] not null check (
    cardinality(cabins) > 0
    and cabins <@ array['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST']::text[]
  ),
  passengers integer not null default 1 check (passengers between 1 and 9),
  max_stops integer check (max_stops is null or max_stops between 0 and 2),
  max_duration_minutes integer check (
    max_duration_minutes is null or max_duration_minutes > 0
  ),
  active boolean not null default true,
  pe_near_inversion_pct numeric(6, 3) not null default 15 check (
    pe_near_inversion_pct between 0 and 100
  ),
  business_vs_pe_pct numeric(6, 3) not null default 30 check (
    business_vs_pe_pct between 0 and 500
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint watches_airports_are_iata check (
    array_to_string(origin_airports, ',') ~ '^[A-Z]{3}(,[A-Z]{3})*$'
    and array_to_string(destination_airports, ',') ~ '^[A-Z]{3}(,[A-Z]{3})*$'
  ),
  constraint watches_trip_range_is_ordered check (
    min_trip_nights is null
    or max_trip_nights is null
    or min_trip_nights <= max_trip_nights
  ),
  constraint watches_date_mode_fields_are_valid check (
    (
      date_mode = 'EXACT'
      and exact_departure_date is not null
      and exact_return_date is not null
      and exact_return_date > exact_departure_date
    )
    or (
      date_mode = 'FLEXIBLE_WINDOW'
      and window_departure_start is not null
      and window_departure_end is not null
      and window_departure_end >= window_departure_start
      and min_trip_nights is not null
      and max_trip_nights is not null
    )
    or (
      date_mode = 'ANYTIME'
      and rolling_horizon_days is not null
      and min_trip_nights is not null
      and max_trip_nights is not null
    )
  )
);

create table public.search_candidates (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.watches (id) on delete cascade,
  origin text not null check (origin ~ '^[A-Z]{3}$'),
  destination text not null check (destination ~ '^[A-Z]{3}$'),
  departure_date date not null,
  return_date date,
  cabin text not null check (
    cabin in ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST')
  ),
  priority integer not null default 0,
  last_scanned_at timestamptz,
  next_scan_at timestamptz,
  scan_count integer not null default 0 check (scan_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint search_candidates_return_after_departure check (
    return_date is null or return_date > departure_date
  ),
  constraint search_candidates_unique_scope unique (
    watch_id,
    origin,
    destination,
    departure_date,
    return_date,
    cabin
  )
);

create table public.search_runs (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.watches (id) on delete cascade,
  candidate_id uuid not null references public.search_candidates (id) on delete cascade,
  provider text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  status text not null check (
    status in (
      'VALID_RESULT',
      'NO_RESULT',
      'INCOMPLETE_RESULT',
      'PROVIDER_FAILURE',
      'THROTTLED'
    )
  ),
  result_count integer not null default 0 check (result_count >= 0),
  completeness_score numeric(5, 4) not null check (
    completeness_score between 0 and 1
  ),
  retry_count integer not null default 0 check (retry_count >= 0),
  error_code text,
  error_message text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  constraint search_runs_finish_after_start check (finished_at >= started_at)
);

create table public.fare_observations (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.watches (id) on delete cascade,
  search_run_id uuid not null references public.search_runs (id) on delete cascade,
  provider text not null,
  origin text not null check (origin ~ '^[A-Z]{3}$'),
  destination text not null check (destination ~ '^[A-Z]{3}$'),
  departure_date date not null,
  return_date date,
  cabin text not null check (
    cabin in ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST')
  ),
  airline text,
  flight_numbers text[] not null default '{}',
  stops_outbound integer check (stops_outbound is null or stops_outbound >= 0),
  stops_return integer check (stops_return is null or stops_return >= 0),
  duration_outbound_minutes integer check (
    duration_outbound_minutes is null or duration_outbound_minutes >= 0
  ),
  duration_return_minutes integer check (
    duration_return_minutes is null or duration_return_minutes >= 0
  ),
  total_price numeric(12, 2) not null check (total_price > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  booking_url text,
  observed_at timestamptz not null,
  confirmed boolean not null default false,
  quality_eligible boolean not null default false,
  raw_payload_json jsonb not null default '{}'::jsonb,
  constraint fare_observations_return_after_departure check (
    return_date is null or return_date > departure_date
  )
);

create table public.anomalies (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references public.watches (id) on delete cascade,
  type text not null,
  severity text not null,
  origin text not null check (origin ~ '^[A-Z]{3}$'),
  destination text not null check (destination ~ '^[A-Z]{3}$'),
  departure_date date not null,
  return_date date,
  lower_cabin text,
  higher_cabin text,
  lower_cabin_price numeric(12, 2),
  higher_cabin_price numeric(12, 2),
  spread_amount numeric(12, 2),
  spread_pct numeric(9, 4),
  historical_percentile numeric(6, 3),
  historical_median numeric(12, 2),
  historical_mad numeric(12, 2),
  confidence text,
  first_detected_at timestamptz not null default now(),
  confirmed_at timestamptz,
  resolved_at timestamptz,
  explanation_json jsonb not null default '{}'::jsonb,
  constraint anomalies_return_after_departure check (
    return_date is null or return_date > departure_date
  ),
  constraint anomalies_percentile_range check (
    historical_percentile is null or historical_percentile between 0 and 100
  )
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  anomaly_id uuid not null references public.anomalies (id) on delete cascade,
  channel text not null,
  sent_at timestamptz,
  delivery_status text not null,
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);

create index search_candidates_due_idx
  on public.search_candidates (active, next_scan_at, priority desc);
create index search_runs_watch_started_idx
  on public.search_runs (watch_id, started_at desc);
create index fare_observations_comparison_idx
  on public.fare_observations (
    watch_id,
    origin,
    destination,
    departure_date,
    return_date,
    cabin,
    observed_at desc
  );
create index fare_observations_clean_history_idx
  on public.fare_observations (watch_id, cabin, observed_at desc)
  where quality_eligible;
create index anomalies_watch_state_idx
  on public.anomalies (watch_id, resolved_at, first_detected_at desc);
create index alerts_anomaly_idx on public.alerts (anomaly_id);

alter table public.watches enable row level security;
alter table public.search_candidates enable row level security;
alter table public.search_runs enable row level security;
alter table public.fare_observations enable row level security;
alter table public.anomalies enable row level security;
alter table public.alerts enable row level security;

create policy "Owners can read watches"
  on public.watches for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners can create watches"
  on public.watches for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owners can update watches"
  on public.watches for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Owners can delete watches"
  on public.watches for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners can read search candidates"
  on public.search_candidates for select
  to authenticated
  using (
    exists (
      select 1 from public.watches
      where watches.id = search_candidates.watch_id
        and watches.user_id = (select auth.uid())
    )
  );

create policy "Owners can read search runs"
  on public.search_runs for select
  to authenticated
  using (
    exists (
      select 1 from public.watches
      where watches.id = search_runs.watch_id
        and watches.user_id = (select auth.uid())
    )
  );

create policy "Owners can read fare observations"
  on public.fare_observations for select
  to authenticated
  using (
    exists (
      select 1 from public.watches
      where watches.id = fare_observations.watch_id
        and watches.user_id = (select auth.uid())
    )
  );

create policy "Owners can read anomalies"
  on public.anomalies for select
  to authenticated
  using (
    exists (
      select 1 from public.watches
      where watches.id = anomalies.watch_id
        and watches.user_id = (select auth.uid())
    )
  );

create policy "Owners can read alerts"
  on public.alerts for select
  to authenticated
  using (
    exists (
      select 1
      from public.anomalies
      join public.watches on watches.id = anomalies.watch_id
      where anomalies.id = alerts.anomaly_id
        and watches.user_id = (select auth.uid())
    )
  );

revoke all on table public.watches from anon;
revoke all on table public.search_candidates from anon;
revoke all on table public.search_runs from anon;
revoke all on table public.fare_observations from anon;
revoke all on table public.anomalies from anon;
revoke all on table public.alerts from anon;

grant select, insert, update, delete on table public.watches to authenticated;
grant select on table public.search_candidates to authenticated;
grant select on table public.search_runs to authenticated;
grant select on table public.fare_observations to authenticated;
grant select on table public.anomalies to authenticated;
grant select on table public.alerts to authenticated;
