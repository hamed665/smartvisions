\set ON_ERROR_STOP on

do $support_fk_index_hardening$
declare
  v_required text[] := array[
    'crm_support_cases_business_fk_idx',
    'crm_support_cases_conversation_fk_idx',
    'crm_support_cases_org_closed_by_fk_idx',
    'crm_support_cases_org_created_by_fk_idx',
    'crm_support_cases_org_resolved_by_fk_idx',
    'crm_support_cases_org_sla_policy_fk_idx',
    'crm_support_cases_org_updated_by_fk_idx',
    'crm_support_sla_org_created_by_fk_idx',
    'crm_support_sla_org_updated_by_fk_idx'
  ];
  v_name text;
begin
  foreach v_name in array v_required loop
    if not exists (
      select 1
      from pg_indexes
      where schemaname='public' and indexname=v_name
    ) then
      raise exception 'Missing Support FK covering index: %', v_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_indexes
    where schemaname='public'
      and indexname in (
        'crm_support_cases_created_by_fk_idx',
        'crm_support_cases_updated_by_fk_idx',
        'crm_support_cases_resolved_by_fk_idx',
        'crm_support_cases_closed_by_fk_idx',
        'crm_support_sla_created_by_fk_idx',
        'crm_support_sla_updated_by_fk_idx'
      )
  ) then
    raise exception 'Superseded Support actor-only FK index still exists';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class idx on idx.oid=i.indexrelid
    join pg_class tbl on tbl.oid=i.indrelid
    join pg_namespace n on n.oid=tbl.relnamespace
    where n.nspname='public'
      and tbl.relname='crm_support_cases'
      and idx.relname='crm_support_cases_business_fk_idx'
      and pg_get_indexdef(i.indexrelid) like '%(business_id)%'
  ) then
    raise exception 'Support Business FK index does not lead with business_id';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class idx on idx.oid=i.indexrelid
    join pg_class tbl on tbl.oid=i.indrelid
    join pg_namespace n on n.oid=tbl.relnamespace
    where n.nspname='public'
      and tbl.relname='crm_support_cases'
      and idx.relname='crm_support_cases_conversation_fk_idx'
      and pg_get_indexdef(i.indexrelid) like '%(conversation_id)%'
  ) then
    raise exception 'Support Conversation FK index does not lead with conversation_id';
  end if;
end;
$support_fk_index_hardening$;
