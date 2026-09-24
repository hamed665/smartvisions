-- 0090 smoke: every Chatwoot/communication FK must have a valid covering index.
do $$
declare
  v_missing integer;
  v_names text;
begin
  with target_fk as (
    select c.oid, c.conname, c.conrelid, c.conkey, cl.relname as table_name
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and (cl.relname like 'chatwoot_%' or cl.relname = 'communication_channel_bindings')
  ),
  coverage as (
    select f.*,
      exists (
        select 1
        from pg_index i
        where i.indrelid = f.conrelid
          and i.indisvalid
          and i.indisready
          and (
            select array_agg(u.attnum order by u.ord)
            from unnest(i.indkey::smallint[]) with ordinality u(attnum, ord)
            where u.ord <= cardinality(f.conkey)
          ) = f.conkey
      ) as covered
    from target_fk f
  )
  select count(*) filter (where not covered),
         string_agg(format('%s.%s', table_name, conname), ', ' order by table_name, conname)
           filter (where not covered)
    into v_missing, v_names
    from coverage;

  if v_missing <> 0 then
    raise exception 'Chatwoot FK index coverage incomplete: % missing: %', v_missing, coalesce(v_names, '');
  end if;
end
$$;
