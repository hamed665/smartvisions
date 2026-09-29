\set ON_ERROR_STOP on

do $runtime_fk_indexes$
declare
  v_missing text;
begin
  select string_agg(expected.index_name,', ' order by expected.index_name)
  into v_missing
  from (
    values
      ('automation_run_actions_action_key_fk_idx','automation_run_actions'),
      ('automation_run_actions_run_fk_idx','automation_run_actions'),
      ('automation_runs_automation_rule_id_fk_idx','automation_runs'),
      ('automation_runs_automation_rule_version_id_fk_idx','automation_runs'),
      ('automation_runs_owner_fk_idx','automation_runs'),
      ('automation_runs_rule_version_fk_idx','automation_runs'),
      ('automation_runs_trigger_key_fk_idx','automation_runs')
  ) as expected(index_name,table_name)
  where not exists (
    select 1
    from pg_class idx
    join pg_namespace n on n.oid=idx.relnamespace
    join pg_index i on i.indexrelid=idx.oid
    join pg_class tbl on tbl.oid=i.indrelid
    where n.nspname='public'
      and idx.relname=expected.index_name
      and tbl.relname=expected.table_name
      and i.indisvalid
      and i.indisready
  );

  if v_missing is not null then
    raise exception 'AUTO-RUNTIME FK covering index missing or invalid: %',v_missing;
  end if;

  if (
    select count(*)
    from pg_indexes
    where schemaname='public'
      and indexname in (
        'automation_run_actions_action_key_fk_idx',
        'automation_run_actions_run_fk_idx',
        'automation_runs_automation_rule_id_fk_idx',
        'automation_runs_automation_rule_version_id_fk_idx',
        'automation_runs_owner_fk_idx',
        'automation_runs_rule_version_fk_idx',
        'automation_runs_trigger_key_fk_idx'
      )
  ) <> 7 then
    raise exception 'AUTO-RUNTIME FK hardening did not create exactly seven expected indexes';
  end if;
end;
$runtime_fk_indexes$;
