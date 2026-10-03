\set ON_ERROR_STOP on

do $smoke$
declare
  t text;
  policy_count integer;
begin
  foreach t in array array['founder_strategic_goals','founder_key_results','founder_market_research_items','founder_board_reports'] loop
    if to_regclass('public.' || t) is null then raise exception 'missing table %', t; end if;
    if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'RLS disabled for %', t; end if;
    select count(*) into policy_count from pg_policies where schemaname='public' and tablename=t;
    if policy_count < 3 then raise exception 'expected owner policies for %, got %', t, policy_count; end if;
  end loop;
end;
$smoke$;

do $grants$
declare
  t text;
begin
  foreach t in array array['founder_strategic_goals','founder_key_results','founder_market_research_items','founder_board_reports'] loop
    if has_table_privilege('anon','public.'||t,'SELECT')
       or has_table_privilege('anon','public.'||t,'INSERT')
       or has_table_privilege('anon','public.'||t,'UPDATE') then
      raise exception 'anon privilege leaked on %', t;
    end if;
    if has_table_privilege('service_role','public.'||t,'INSERT')
       or has_table_privilege('service_role','public.'||t,'UPDATE')
       or has_table_privilege('service_role','public.'||t,'DELETE') then
      raise exception 'service_role mutation privilege leaked on %', t;
    end if;
    if not has_table_privilege('service_role','public.'||t,'SELECT') then raise exception 'service_role SELECT missing on %', t; end if;
  end loop;
end;
$grants$;

do $functions$
declare secdef boolean;
begin
  select prosecdef into secdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='guard_founder_strategy_market_update';
  if coalesce(secdef,true) then raise exception 'strategy update guard must be SECURITY INVOKER'; end if;
  select prosecdef into secdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='audit_founder_strategy_market_mutation';
  if coalesce(secdef,true) then raise exception 'strategy audit function must be SECURITY INVOKER'; end if;
end;
$functions$;

do $fk$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.founder_key_results'::regclass and conname='founder_key_results_goal_fk'
  ) then raise exception 'key result goal FK missing'; end if;
end;
$fk$;
