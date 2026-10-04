\set ON_ERROR_STOP on

begin;

do $data_warehouse_schema$
declare
  facts_policies integer;
  checkpoint_policies integer;
  sync_oid oid;
  read_oid oid;
  view_options text[];
begin
  if to_regclass('public.analytics_warehouse_facts') is null then
    raise exception 'DATA-WAREHOUSE facts table missing';
  end if;
  if to_regclass('public.analytics_warehouse_checkpoints') is null then
    raise exception 'DATA-WAREHOUSE checkpoint table missing';
  end if;
  if to_regclass('public.analytics_warehouse_health_v1') is null then
    raise exception 'DATA-WAREHOUSE health view missing';
  end if;

  if not (select relrowsecurity from pg_class where oid='public.analytics_warehouse_facts'::regclass) then
    raise exception 'analytics_warehouse_facts RLS must be enabled';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.analytics_warehouse_checkpoints'::regclass) then
    raise exception 'analytics_warehouse_checkpoints RLS must be enabled';
  end if;

  select count(*) into facts_policies
  from pg_policy where polrelid='public.analytics_warehouse_facts'::regclass;
  select count(*) into checkpoint_policies
  from pg_policy where polrelid='public.analytics_warehouse_checkpoints'::regclass;
  if facts_policies<1 or checkpoint_policies<1 then
    raise exception 'warehouse service policies missing';
  end if;

  if has_table_privilege('anon','public.analytics_warehouse_facts','SELECT')
     or has_table_privilege('authenticated','public.analytics_warehouse_facts','SELECT') then
    raise exception 'browser roles must not read warehouse facts directly';
  end if;
  if not has_table_privilege('service_role','public.analytics_warehouse_facts','SELECT')
     or not has_table_privilege('service_role','public.analytics_warehouse_facts','INSERT') then
    raise exception 'service_role warehouse facts privileges missing';
  end if;

  if has_table_privilege('anon','public.analytics_warehouse_checkpoints','SELECT')
     or has_table_privilege('authenticated','public.analytics_warehouse_checkpoints','SELECT') then
    raise exception 'browser roles must not read warehouse checkpoints';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='analytics_warehouse_facts'
      and column_name in (
        'payload','raw_evidence','normalized_evidence',
        'before_data','after_data','request_hash','evidence'
      )
  ) then
    raise exception 'warehouse facts expose raw evidence columns';
  end if;

  select p.oid into sync_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='sync_analytics_warehouse_v1'
  limit 1;
  select p.oid into read_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='read_analytics_warehouse_v1'
  limit 1;

  if sync_oid is null or read_oid is null then
    raise exception 'warehouse sync/read functions missing';
  end if;
  if (select prosecdef from pg_proc where oid=sync_oid)
     or (select prosecdef from pg_proc where oid=read_oid) then
    raise exception 'warehouse functions must be SECURITY INVOKER';
  end if;
  if has_function_privilege('anon',sync_oid,'EXECUTE')
     or has_function_privilege('authenticated',sync_oid,'EXECUTE')
     or has_function_privilege('anon',read_oid,'EXECUTE')
     or has_function_privilege('authenticated',read_oid,'EXECUTE') then
    raise exception 'browser roles must not execute warehouse functions';
  end if;
  if not has_function_privilege('service_role',sync_oid,'EXECUTE')
     or not has_function_privilege('service_role',read_oid,'EXECUTE') then
    raise exception 'service_role warehouse function execute missing';
  end if;

  select reloptions into view_options
  from pg_class where oid='public.analytics_warehouse_health_v1'::regclass;
  if view_options is null or not ('security_invoker=true'=any(view_options)) then
    raise exception 'analytics_warehouse_health_v1 must be security_invoker';
  end if;
  if has_table_privilege('anon','public.analytics_warehouse_health_v1','SELECT')
     or has_table_privilege('authenticated','public.analytics_warehouse_health_v1','SELECT') then
    raise exception 'browser roles must not read warehouse health directly';
  end if;
end;
$data_warehouse_schema$;

insert into public.organizations(id,name)
values('da7a0000-0000-4000-8000-000000000001','DATA-WAREHOUSE smoke');

insert into public.audit_logs(
  id,organization_id,actor_type,actor_id,action,entity_type,entity_id,created_at
)
values(
  'da7a0000-0000-4000-8000-000000000101',
  'da7a0000-0000-4000-8000-000000000001',
  'SYSTEM','warehouse-smoke','WAREHOUSE_SMOKE_INITIAL','smoke','initial',
  now()-interval '2 hours'
);

set role service_role;
select public.sync_analytics_warehouse_v1(
  'da7a0000-0000-4000-8000-000000000001'::uuid,
  now(),
  null,
  5000
);
reset role;

do $data_warehouse_initial$
declare
  fact_count integer;
  checkpoint_at timestamptz;
begin
  select count(*) into fact_count
  from public.analytics_warehouse_facts
  where organization_id='da7a0000-0000-4000-8000-000000000001'::uuid;
  if fact_count<>1 then
    raise exception 'initial warehouse projection expected 1 fact, got %',fact_count;
  end if;

  select last_complete_through into checkpoint_at
  from public.analytics_warehouse_checkpoints
  where organization_id='da7a0000-0000-4000-8000-000000000001'::uuid;
  if checkpoint_at is null then
    raise exception 'warehouse checkpoint did not advance';
  end if;
end;
$data_warehouse_initial$;

set role service_role;
select public.sync_analytics_warehouse_v1(
  'da7a0000-0000-4000-8000-000000000001'::uuid,
  now(),
  null,
  5000
);
reset role;

do $data_warehouse_idempotent$
begin
  if (
    select count(*)
    from public.analytics_warehouse_facts
    where organization_id='da7a0000-0000-4000-8000-000000000001'::uuid
  )<>1 then
    raise exception 'replay created duplicate warehouse fact';
  end if;
end;
$data_warehouse_idempotent$;

insert into public.audit_logs(
  id,organization_id,actor_type,actor_id,action,entity_type,entity_id,created_at
)
values(
  'da7a0000-0000-4000-8000-000000000102',
  'da7a0000-0000-4000-8000-000000000001',
  'SYSTEM','warehouse-smoke','WAREHOUSE_SMOKE_LATE','smoke','late',
  now()-interval '1 hour'
);

set role service_role;
select public.sync_analytics_warehouse_v1(
  'da7a0000-0000-4000-8000-000000000001'::uuid,
  now(),
  null,
  5000
);
reset role;

do $data_warehouse_late$
begin
  if not exists (
    select 1
    from public.analytics_warehouse_facts
    where organization_id='da7a0000-0000-4000-8000-000000000001'::uuid
      and source_event_id='da7a0000-0000-4000-8000-000000000102'
  ) then
    raise exception 'late event inside lookback was not projected';
  end if;
end;
$data_warehouse_late$;

insert into public.audit_logs(
  id,organization_id,actor_type,actor_id,action,entity_type,entity_id,created_at
)
values(
  'da7a0000-0000-4000-8000-000000000103',
  'da7a0000-0000-4000-8000-000000000001',
  'SYSTEM','warehouse-smoke','WAREHOUSE_SMOKE_BACKFILL','smoke','backfill',
  now()-interval '20 days'
);

set role service_role;
select public.sync_analytics_warehouse_v1(
  'da7a0000-0000-4000-8000-000000000001'::uuid,
  now(),
  null,
  5000
);
reset role;

do $data_warehouse_outside_lookback$
begin
  if exists (
    select 1
    from public.analytics_warehouse_facts
    where organization_id='da7a0000-0000-4000-8000-000000000001'::uuid
      and source_event_id='da7a0000-0000-4000-8000-000000000103'
  ) then
    raise exception 'automatic sync reached outside bounded lookback unexpectedly';
  end if;
end;
$data_warehouse_outside_lookback$;

set role service_role;
select public.sync_analytics_warehouse_v1(
  'da7a0000-0000-4000-8000-000000000001'::uuid,
  now()-interval '19 days',
  now()-interval '21 days',
  5000
);
select count(*) from public.read_analytics_warehouse_v1(
  'da7a0000-0000-4000-8000-000000000001'::uuid,
  now()-interval '30 days',
  now(),
  null,null,null,100
);
select * from public.analytics_warehouse_health_v1
where organization_id='da7a0000-0000-4000-8000-000000000001'::uuid;
reset role;

do $data_warehouse_backfill$
declare
  last_backfill_from timestamptz;
  last_backfill_to timestamptz;
begin
  if not exists (
    select 1
    from public.analytics_warehouse_facts
    where organization_id='da7a0000-0000-4000-8000-000000000001'::uuid
      and source_event_id='da7a0000-0000-4000-8000-000000000103'
  ) then
    raise exception 'explicit warehouse backfill did not project old event';
  end if;

  select c.last_backfill_from,c.last_backfill_to
  into last_backfill_from,last_backfill_to
  from public.analytics_warehouse_checkpoints c
  where c.organization_id='da7a0000-0000-4000-8000-000000000001'::uuid;

  if last_backfill_from is null or last_backfill_to is null then
    raise exception 'warehouse backfill watermark missing';
  end if;
end;
$data_warehouse_backfill$;

rollback;