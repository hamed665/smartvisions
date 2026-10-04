\set ON_ERROR_STOP on

begin;

do $data_event_metrics$
declare
  active_count integer;
  bad_count integer;
  view_options text[];
  fn_oid oid;
begin
  if to_regclass('public.metric_definitions') is null then
    raise exception 'DATA-EVENT-METRICS metric_definitions missing';
  end if;
  if to_regclass('public.analytics_event_feed_v1') is null then
    raise exception 'DATA-EVENT-METRICS event feed view missing';
  end if;
  if to_regclass('public.metric_registry_current_v1') is null then
    raise exception 'DATA-EVENT-METRICS current registry view missing';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid='public.metric_definitions'::regclass
      and relrowsecurity
  ) then
    raise exception 'metric_definitions RLS must be enabled';
  end if;

  select count(*) into active_count
  from public.metric_definitions
  where status='ACTIVE';
  if active_count<>18 then
    raise exception 'metric registry seed mismatch: expected 18, got %',active_count;
  end if;

  select count(*) into bad_count
  from public.metric_definitions
  where status='ACTIVE'
    and (
      version<1
      or source_mode<>'EVENT_FEED'
      or definition->>'feed'<>'analytics_event_feed_v1'
      or coalesce((definition->>'causal')::boolean,true)
      or cardinality(supported_scopes)<1
      or not (supported_scopes <@ array['ORGANIZATION','BUSINESS','BRANCH']::text[])
    );
  if bad_count<>0 then
    raise exception 'metric registry contains % malformed active definition(s)',bad_count;
  end if;

  select count(*) into bad_count
  from public.metric_definitions
  where status='ACTIVE'
    and unit='MONEY'
    and (
      not (supported_dimensions @> array['currency']::text[])
      or definition->'requiredDimensions' is null
      or not (definition->'requiredDimensions' ? 'currency')
      or coalesce((definition->>'crossCurrencyAggregation')::boolean,true)
    );
  if bad_count<>0 then
    raise exception 'money metric permits unsafe cross-currency aggregation';
  end if;

  if has_table_privilege('anon','public.metric_definitions','SELECT') then
    raise exception 'anon must not read metric registry';
  end if;
  if not has_table_privilege('authenticated','public.metric_definitions','SELECT') then
    raise exception 'authenticated must read metric metadata';
  end if;
  if has_table_privilege('authenticated','public.metric_definitions','INSERT')
     or has_table_privilege('authenticated','public.metric_definitions','UPDATE')
     or has_table_privilege('authenticated','public.metric_definitions','DELETE') then
    raise exception 'authenticated metric registry mutation must be denied';
  end if;
  if not has_table_privilege('service_role','public.metric_definitions','SELECT') then
    raise exception 'service_role metric registry read missing';
  end if;

  select reloptions into view_options
  from pg_class
  where oid='public.analytics_event_feed_v1'::regclass;
  if view_options is null or not ('security_invoker=true'=any(view_options)) then
    raise exception 'analytics_event_feed_v1 must be security_invoker';
  end if;

  select reloptions into view_options
  from pg_class
  where oid='public.metric_registry_current_v1'::regclass;
  if view_options is null or not ('security_invoker=true'=any(view_options)) then
    raise exception 'metric_registry_current_v1 must be security_invoker';
  end if;

  if has_table_privilege('anon','public.analytics_event_feed_v1','SELECT')
     or has_table_privilege('authenticated','public.analytics_event_feed_v1','SELECT') then
    raise exception 'tenant event feed must not be directly exposed to browser roles';
  end if;
  if not has_table_privilege('service_role','public.analytics_event_feed_v1','SELECT') then
    raise exception 'service_role event feed read missing';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='analytics_event_feed_v1'
      and column_name in (
        'payload','raw_evidence','normalized_evidence',
        'before_data','after_data','request_hash','evidence'
      )
  ) then
    raise exception 'analytics event feed leaks raw evidence columns';
  end if;

  select p.oid into fn_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='read_analytics_event_feed_v1'
  limit 1;
  if fn_oid is null then
    raise exception 'bounded analytics reader missing';
  end if;
  if (select p.prosecdef from pg_proc p where p.oid=fn_oid) then
    raise exception 'bounded analytics reader must be SECURITY INVOKER';
  end if;
  if not has_function_privilege('service_role',fn_oid,'EXECUTE') then
    raise exception 'service_role bounded analytics reader execute missing';
  end if;
  if has_function_privilege('authenticated',fn_oid,'EXECUTE')
     or has_function_privilege('anon',fn_oid,'EXECUTE') then
    raise exception 'browser roles must not execute bounded analytics reader';
  end if;

  perform 1 from public.analytics_event_feed_v1 limit 1;
  perform 1 from public.metric_registry_current_v1 limit 1;
end;
$data_event_metrics$;

rollback;