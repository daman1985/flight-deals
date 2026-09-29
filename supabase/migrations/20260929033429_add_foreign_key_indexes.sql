create index watches_user_id_idx on public.watches (user_id);

create index search_runs_candidate_id_idx
  on public.search_runs (candidate_id);

create index fare_observations_search_run_id_idx
  on public.fare_observations (search_run_id);
