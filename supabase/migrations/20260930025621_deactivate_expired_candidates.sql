create or replace function public.deactivate_search_candidates_outside_window(
  p_watch_id uuid,
  p_first_departure date,
  p_last_departure date
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.search_candidates
  set
    active = false,
    lease_token = null,
    lease_expires_at = null
  where watch_id = p_watch_id
    and active
    and (
      departure_date < p_first_departure
      or departure_date > p_last_departure
    );

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke execute on function public.deactivate_search_candidates_outside_window(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.deactivate_search_candidates_outside_window(uuid, date, date)
  to service_role;
