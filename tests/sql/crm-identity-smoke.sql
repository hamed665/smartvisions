\set ON_ERROR_STOP on

do $crm_backfill$
begin
  if not exists (
    select 1
    from public.crm_identities
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and identity_type = 'EMAIL'
      and normalized_value = 'sales@example.test'
      and status = 'ACTIVE'
  ) then
    raise exception 'CRM Email backfill normalization failed';
  end if;

  if not exists (
    select 1
    from public.crm_identities
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and identity_type = 'PHONE'
      and normalized_value = '96812345678'
  ) then
    raise exception 'CRM Phone backfill normalization failed';
  end if;

  if not exists (
    select 1
    from public.crm_identities
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and identity_type = 'WHATSAPP'
      and normalized_value = '96898765432'
  ) then
    raise exception 'CRM WhatsApp backfill normalization failed';
  end if;

  if not exists (
    select 1
    from public.crm_identities
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and identity_type = 'INSTAGRAM'
      and normalized_value = 'example.handle'
  ) then
    raise exception 'CRM Instagram backfill normalization failed';
  end if;

  if (
    select count(distinct organization_id)
    from public.crm_identities
    where identity_type = 'EMAIL'
      and normalized_value = 'sales@example.test'
  ) <> 2 then
    raise exception 'CRM identities are not tenant-scoped';
  end if;
end;
$crm_backfill$;

do $crm_links$
declare
  v_identity uuid;
  v_business_count integer;
  v_source_count integer;
begin
  select id into v_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_type = 'PHONE'
    and normalized_value = '96812345678';

  select count(distinct business_id), count(*)
    into v_business_count, v_source_count
  from public.crm_identity_links
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_id = v_identity
    and status <> 'RETIRED';

  if v_business_count <> 1 or v_source_count <> 2 then
    raise exception 'Phone/international-phone evidence did not dedupe identity correctly';
  end if;

  if exists (
    select 1
    from public.crm_identity_links
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and status = 'CONFLICTED'
  ) then
    raise exception 'Backfill created an unexpected CRM identity conflict';
  end if;
end;
$crm_links$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c001', false);

do $crm_rls_read$
begin
  if not exists (
    select 1 from public.crm_identities
    where organization_id = '00000000-0000-0000-0000-000000000c01'
  ) then
    raise exception 'Authenticated Organization member cannot read CRM identities';
  end if;

  if exists (
    select 1 from public.crm_identities
    where organization_id = '00000000-0000-0000-0000-000000000d01'
  ) then
    raise exception 'CRM identity RLS leaked another tenant';
  end if;
end;
$crm_rls_read$;

do $crm_no_direct_write$
begin
  begin
    insert into public.crm_identities(
      organization_id, identity_type, normalized_value
    ) values (
      '00000000-0000-0000-0000-000000000c01',
      'EMAIL',
      'forbidden@example.test'
    );
    raise exception 'Authenticated role unexpectedly inserted CRM identity';
  exception
    when insufficient_privilege then null;
  end;
end;
$crm_no_direct_write$;

reset role;
select set_config('request.jwt.claim.sub', '', false);

set role service_role;

select *
from public.record_crm_business_identity(
  '00000000-0000-0000-0000-000000000c01',
  '10000000-0000-0000-0000-000000000c01',
  'EMAIL',
  'shared@example.test',
  'Shared@Example.test',
  'EMAIL_INBOUND',
  'email-inbound',
  'VERIFIED',
  '{"provider_message_id":"fixture-1"}'::jsonb
);

select *
from public.record_crm_business_identity(
  '00000000-0000-0000-0000-000000000c01',
  '10000000-0000-0000-0000-000000000c01',
  'EMAIL',
  'shared@example.test',
  'Shared@Example.test',
  'EMAIL_INBOUND',
  'email-inbound',
  'VERIFIED',
  '{"provider_message_id":"fixture-2"}'::jsonb
);

do $crm_idempotent$
declare
  v_identity uuid;
begin
  select id into v_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_type = 'EMAIL'
    and normalized_value = 'shared@example.test';

  if (
    select count(*)
    from public.crm_identity_links
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and identity_id = v_identity
      and business_id = '10000000-0000-0000-0000-000000000c01'
      and source_type = 'EMAIL_INBOUND'
      and source_ref = 'email-inbound'
  ) <> 1 then
    raise exception 'CRM identity evidence command is not idempotent';
  end if;

  if (
    select evidence ->> 'provider_message_id'
    from public.crm_identity_links
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and identity_id = v_identity
      and business_id = '10000000-0000-0000-0000-000000000c01'
      and source_type = 'EMAIL_INBOUND'
      and source_ref = 'email-inbound'
  ) <> 'fixture-2' then
    raise exception 'CRM identity evidence did not refresh latest evidence';
  end if;
end;
$crm_idempotent$;

select *
from public.record_crm_business_identity(
  '00000000-0000-0000-0000-000000000c01',
  '10000000-0000-0000-0000-000000000c02',
  'EMAIL',
  'shared@example.test',
  'shared@example.test',
  'EMAIL_INBOUND',
  'email-inbound',
  'VERIFIED',
  '{"provider_message_id":"fixture-3"}'::jsonb
);

do $crm_conflict$
declare
  v_identity uuid;
  v_business_count integer;
  v_conflicted_count integer;
begin
  select id into v_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_type = 'EMAIL'
    and normalized_value = 'shared@example.test';

  select count(distinct business_id),
         count(*) filter (where status = 'CONFLICTED')
    into v_business_count, v_conflicted_count
  from public.crm_identity_links
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_id = v_identity
    and status <> 'RETIRED';

  if v_business_count <> 2 or v_conflicted_count <> 2 then
    raise exception 'CRM identity ambiguity was not preserved as conflict';
  end if;
end;
$crm_conflict$;

do $crm_audit_pii$
begin
  if exists (
    select 1
    from public.audit_logs
    where entity_type in ('crm_identities','crm_identity_links')
      and (
        coalesce(before_data::text, '') ilike '%shared@example.test%'
        or coalesce(after_data::text, '') ilike '%shared@example.test%'
      )
  ) then
    raise exception 'CRM identity audit leaked raw normalized identity PII';
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where entity_type = 'crm_identities'
      and after_data ? 'identity_fingerprint'
      and correlation_id like 'dbtx:%'
  ) then
    raise exception 'CRM identity audit fingerprint/correlation evidence missing';
  end if;
end;
$crm_audit_pii$;

do $crm_tenant_immutable$
declare
  v_identity uuid;
begin
  select id into v_identity
  from public.crm_identities
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and identity_type = 'EMAIL'
    and normalized_value = 'shared@example.test';

  begin
    update public.crm_identities
       set organization_id = '00000000-0000-0000-0000-000000000d01'
     where id = v_identity;
    raise exception 'CRM identity tenant ownership unexpectedly changed';
  exception
    when others then
      if sqlerrm not like 'organization_id is immutable%' then
        raise;
      end if;
  end;
end;
$crm_tenant_immutable$;

reset role;

do $crm_security_contract$
begin
  if (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'record_crm_business_identity'
  ) then
    raise exception 'CRM identity evidence command unexpectedly uses SECURITY DEFINER';
  end if;

  if has_table_privilege('authenticated', 'public.crm_identities', 'INSERT')
     or has_table_privilege('authenticated', 'public.crm_identity_links', 'UPDATE')
  then
    raise exception 'Authenticated CRM identity mutation grants are too broad';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.record_crm_business_identity(uuid,uuid,text,text,text,text,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service_role cannot execute CRM identity evidence command';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.record_crm_business_identity(uuid,uuid,text,text,text,text,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role can execute trusted CRM identity evidence command';
  end if;

  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.crm_identities'::regclass
  ) or not (
    select relrowsecurity
    from pg_class
    where oid = 'public.crm_identity_links'::regclass
  ) then
    raise exception 'CRM identity RLS is not enabled';
  end if;
end;
$crm_security_contract$;
