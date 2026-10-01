begin;

do $$
begin
  assert (
    select relrowsecurity
    from pg_class
    where oid = 'public.comparison_history_snapshots'::regclass
  ), 'Comparison history must enforce RLS';
  assert (
    select count(*) = 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'comparison_history_snapshots'
      and roles @> array['authenticated']::name[]
      and cmd = 'SELECT'
  ), 'Authenticated reads require the owner-scoped policy';
  assert has_table_privilege(
    'authenticated', 'public.comparison_history_snapshots', 'SELECT'
  );
  assert not has_table_privilege(
    'authenticated', 'public.comparison_history_snapshots', 'INSERT'
  );
  assert not has_table_privilege(
    'anon', 'public.comparison_history_snapshots', 'SELECT'
  );
  assert has_table_privilege(
    'service_role', 'public.comparison_history_snapshots', 'INSERT'
  );
end;
$$;

select 'comparison_history_snapshots: all assertions passed' as result;
rollback;
