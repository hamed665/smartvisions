-- FOUNDER-CAPITAL-DILIGENCE-V1 PostgreSQL 17 contract smoke.
do $smoke$
declare
  v_table text;
  v_policy_count integer;
begin
  foreach v_table in array array[
    'founder_cap_table_entries',
    'founder_dilution_scenarios',
    'founder_term_sheets',
    'founder_due_diligence_items'
  ]
  loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'missing Founder capital/diligence table: %', v_table;
    end if;

    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=v_table and c.relrowsecurity
    ) then
      raise exception 'RLS not enabled: %', v_table;
    end if;

    select count(*) into v_policy_count
    from pg_policies
    where schemaname='public' and tablename=v_table
      and cmd in ('SELECT','INSERT','UPDATE');
    if v_policy_count <> 3 then
      raise exception 'expected 3 OWNER policies on %, got %', v_table, v_policy_count;
    end if;

    if exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name=v_table and grantee='anon'
    ) then
      raise exception 'anon grant leaked on %', v_table;
    end if;

    if not exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name=v_table
        and grantee='authenticated' and privilege_type='SELECT'
    ) or not exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name=v_table
        and grantee='authenticated' and privilege_type='INSERT'
    ) or not exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name=v_table
        and grantee='authenticated' and privilege_type='UPDATE'
    ) then
      raise exception 'authenticated grant contract missing on %', v_table;
    end if;

    if exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name=v_table
        and grantee='service_role' and privilege_type<>'SELECT'
    ) then
      raise exception 'service_role mutation grant leaked on %', v_table;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.founder_term_sheets'::regclass
      and conname='founder_term_sheet_deal_fk'
  ) then
    raise exception 'term sheet CRM Deal FK missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.founder_due_diligence_items'::regclass
      and conname='founder_due_diligence_evidence_check'
  ) then
    raise exception 'due diligence evidence check missing';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'guard_founder_term_sheet_linkage',
        'guard_founder_capital_diligence_update',
        'audit_founder_capital_diligence_mutation'
      )
      and p.prosecdef
  ) then
    raise exception 'Founder capital/diligence function must remain SECURITY INVOKER';
  end if;
end;
$smoke$;
