\set ON_ERROR_STOP on

do $saas_billing_fk_indexes$
declare
  v_missing text[];
begin
  select array_agg(required.name order by required.name)
    into v_missing
  from (
    values
      ('saas_billing_profiles_created_by_user_fk_idx'),
      ('saas_billing_statements_pricing_version_fk_idx')
  ) as required(name)
  where not exists (
    select 1
    from pg_indexes i
    where i.schemaname='public'
      and i.indexname=required.name
  );

  if v_missing is not null then
    raise exception 'Missing SAAS-BILLING FK indexes: %',v_missing;
  end if;
end;
$saas_billing_fk_indexes$;
