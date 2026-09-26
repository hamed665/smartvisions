\set ON_ERROR_STOP on

do $unified_inbox_fk_index_hardening$
declare
  v_names text[] := array[
    'public.unified_inbox_projection_conversation_fk_idx',
    'public.unified_inbox_projection_source_event_fk_idx',
    'public.unified_inbox_projection_org_brand_fk_idx',
    'public.unified_inbox_projection_org_branch_fk_idx',
    'public.unified_inbox_projection_org_department_fk_idx',
    'public.unified_inbox_projection_org_team_fk_idx',
    'public.unified_inbox_projection_org_binding_fk_idx',
    'public.unified_inbox_projection_org_team_mapping_fk_idx',
    'public.unified_inbox_reconciliation_projection_fk_idx',
    'public.unified_inbox_reconciliation_conversation_fk_idx'
  ];
  v_name text;
begin
  foreach v_name in array v_names loop
    if to_regclass(v_name) is null then
      raise exception 'required Unified Inbox FK index missing: %', v_name;
    end if;
  end loop;

  if exists (
    select 1
      from pg_class c
      join pg_index i on i.indexrelid = c.oid
     where c.oid = any (
       array(
         select to_regclass(name)
           from unnest(v_names) name
       )
     )
       and (not i.indisvalid or not i.indisready)
  ) then
    raise exception 'Unified Inbox FK hardening contains an invalid/unready index';
  end if;
end;
$unified_inbox_fk_index_hardening$;
