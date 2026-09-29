\set ON_ERROR_STOP on

do $notification_fk_indexes$
declare
  v_missing text;
begin
  select string_agg(expected.index_name,', ' order by expected.index_name)
  into v_missing
  from (
    values
      ('notification_inbox_source_audit_log_fk_idx','notification_inbox'),
      ('notification_delivery_notification_fk_idx','notification_delivery_receipts')
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
    raise exception 'AUTO-NOTIFICATIONS FK covering index missing or invalid: %',v_missing;
  end if;

  if (
    select count(*)
    from pg_indexes
    where schemaname='public'
      and indexname in (
        'notification_inbox_source_audit_log_fk_idx',
        'notification_delivery_notification_fk_idx'
      )
  ) <> 2 then
    raise exception 'AUTO-NOTIFICATIONS FK hardening did not create exactly two expected indexes';
  end if;
end;
$notification_fk_indexes$;
