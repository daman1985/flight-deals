create table public.comparison_history_snapshots (
  id uuid primary key,
  watch_id uuid not null references public.watches(id) on delete cascade,
  origin text not null check (origin ~ '^[A-Z]{3}$'),
  destination text not null check (destination ~ '^[A-Z]{3}$'),
  departure_date date not null,
  return_date date,
  lower_cabin text not null check (
    lower_cabin in ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST')
  ),
  higher_cabin text not null check (
    higher_cabin in ('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST')
  ),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  outbound_stop_bucket text not null check (
    outbound_stop_bucket in ('NONSTOP', 'ONE_STOP', 'TWO_PLUS_STOPS')
  ),
  return_stop_bucket text not null check (
    return_stop_bucket in ('NONSTOP', 'ONE_STOP', 'TWO_PLUS_STOPS', 'ONE_WAY')
  ),
  passengers integer not null check (passengers between 1 and 9),
  lower_cabin_price numeric(12, 2) not null check (lower_cabin_price > 0),
  higher_cabin_price numeric(12, 2) not null check (higher_cabin_price > 0),
  spread_amount numeric(12, 2) not null,
  spread_pct numeric(9, 4) not null,
  acquisition_batch_id uuid not null,
  lower_observation_id uuid not null references public.fare_observations(id) on delete cascade,
  higher_observation_id uuid not null references public.fare_observations(id) on delete cascade,
  historical_context jsonb not null,
  updated_at timestamptz not null default now(),
  constraint comparison_history_return_after_departure check (
    return_date is null or return_date > departure_date
  ),
  constraint comparison_history_distinct_cabins check (lower_cabin <> higher_cabin)
);

create index comparison_history_watch_scope_idx
  on public.comparison_history_snapshots(
    watch_id, origin, destination, departure_date, return_date, updated_at desc
  );

alter table public.comparison_history_snapshots enable row level security;

create policy "Owners can read comparison history"
  on public.comparison_history_snapshots
  for select
  to authenticated
  using (
    exists (
      select 1 from public.watches
      where watches.id = comparison_history_snapshots.watch_id
        and watches.user_id = (select auth.uid())
    )
  );

revoke all on table public.comparison_history_snapshots from anon;
revoke insert, update, delete on table public.comparison_history_snapshots
  from authenticated;
grant select on table public.comparison_history_snapshots to authenticated;
grant select, insert, update, delete on table public.comparison_history_snapshots
  to service_role;
