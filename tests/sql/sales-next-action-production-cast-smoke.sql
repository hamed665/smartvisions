\set ON_ERROR_STOP on

do $next_action_status_schema_contract$
declare
  v_lead_status_type text;
  v_task_status_type text;
  v_return_type text;
  v_enum_exists boolean;
begin
  select data_type into v_lead_status_type
  from information_schema.columns
  where table_schema='public' and table_name='leads' and column_name='status';

  select data_type into v_task_status_type
  from information_schema.columns
  where table_schema='public' and table_name='crm_tasks' and column_name='status';

  select exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='public'
      and t.typname='lead_status'
      and t.typtype='e'
  ) into v_enum_exists;

  if not v_enum_exists then
    raise exception 'Canonical public.lead_status enum is missing from migration history';
  end if;

  if v_task_status_type<>'text' then
    raise exception 'public.crm_tasks.status must remain text for the canonical Task contract';
  end if;

  if v_lead_status_type not in ('text','USER-DEFINED') then
    raise exception 'Unexpected public.leads.status type %',v_lead_status_type;
  end if;

  -- CI currently normalizes Leads.status to text while the long-lived Production
  -- project still carries public.lead_status. Reproduce the exact enum/text UNION
  -- boundary without mutating the canonical CI table shape.
  perform source_status
  from (
    select 'OPEN'::text as source_status
    union all
    select 'NEW'::public.lead_status::text as source_status
  ) q;

  select pg_get_function_result(p.oid) into v_return_type
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='get_crm_next_actions'
    and pg_get_function_identity_arguments(p.oid)='p_organization_id uuid, p_stale_hours integer, p_assignee_user_id uuid, p_limit integer';

  if v_return_type is null or v_return_type not like '%source_status text%' then
    raise exception 'SALES-NEXT-ACTION return contract no longer exposes source_status as text';
  end if;
end;
$next_action_status_schema_contract$;

do $next_action_status_cast_definition$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='get_crm_next_actions'
    and pg_get_function_identity_arguments(p.oid)='p_organization_id uuid, p_stale_hours integer, p_assignee_user_id uuid, p_limit integer';

  if v_def is null
     or v_def not like '%t.status::text AS source_status%'
     or v_def not like '%la.status::text AS source_status%'
     or v_def not like '%da.state::text AS source_status%'
  then
    raise exception 'SALES-NEXT-ACTION source status normalization is missing';
  end if;
end;
$next_action_status_cast_definition$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $next_action_status_runtime$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.get_crm_next_actions(
    '00000000-0000-0000-0000-000000000c01',
    72,
    null,
    200
  );

  if v_count < 0 then
    raise exception 'Impossible next-action count';
  end if;
end;
$next_action_status_runtime$;

reset role;
select set_config('request.jwt.claim.sub','',false);
