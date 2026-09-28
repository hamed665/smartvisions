\set ON_ERROR_STOP on

do $hunter_customer_structure$
declare
  v_summary_definer boolean;
  v_prospect_definer boolean;
begin
  select p.prosecdef into v_summary_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='get_hunter_customer_summary'
    and pg_get_function_identity_arguments(p.oid)='p_organization_id uuid';

  select p.prosecdef into v_prospect_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='get_hunter_customer_prospects'
    and pg_get_function_identity_arguments(p.oid)='p_organization_id uuid, p_limit integer';

  if v_summary_definer is null or v_prospect_definer is null then
    raise exception 'HUNTER-CUSTOMER-MODULE read functions are missing';
  end if;
  if v_summary_definer or v_prospect_definer then
    raise exception 'HUNTER-CUSTOMER-MODULE unexpectedly uses SECURITY DEFINER';
  end if;
  if not has_function_privilege('authenticated','public.get_hunter_customer_summary(uuid)','EXECUTE') then
    raise exception 'authenticated Hunter summary read grant is missing';
  end if;
  if not has_function_privilege('authenticated','public.get_hunter_customer_prospects(uuid,integer)','EXECUTE') then
    raise exception 'authenticated Hunter prospect read grant is missing';
  end if;
  if has_function_privilege('anon','public.get_hunter_customer_summary(uuid)','EXECUTE')
     or has_function_privilege('anon','public.get_hunter_customer_prospects(uuid,integer)','EXECUTE')
  then
    raise exception 'anonymous Hunter read access must stay closed';
  end if;
end;
$hunter_customer_structure$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000c001',false);

do $hunter_customer_runtime$
declare
  v_summary_count integer;
  v_prospect_count integer;
  v_outreach_before bigint;
  v_messages_before bigint;
  v_leads_before bigint;
  v_usage_before bigint;
begin
  select count(*) into v_outreach_before from public.outreach_messages;
  select count(*) into v_messages_before from public.conversation_messages;
  select count(*) into v_leads_before from public.leads;
  select count(*) into v_usage_before from public.usage_events;

  select count(*) into v_summary_count
  from public.get_hunter_customer_summary('00000000-0000-0000-0000-000000000c01');

  if v_summary_count<>1 then
    raise exception 'Hunter customer summary must return exactly one bounded summary row';
  end if;

  select count(*) into v_prospect_count
  from public.get_hunter_customer_prospects('00000000-0000-0000-0000-000000000c01',200);

  if v_prospect_count<0 or v_prospect_count>200 then
    raise exception 'Hunter customer prospect read is not bounded';
  end if;

  if exists (
    select 1
    from public.get_hunter_customer_prospects('00000000-0000-0000-0000-000000000c01',200)
    where contactability_is_permission
  ) then
    raise exception 'Hunter customer module converted contactability into permission';
  end if;

  if exists (
    select 1
    from public.get_hunter_customer_prospects('99999999-9999-4999-8999-999999999999',200)
  ) then
    raise exception 'Hunter customer module leaked prospect rows across tenant scope';
  end if;

  begin
    perform 1
    from public.get_hunter_customer_prospects(
      '00000000-0000-0000-0000-000000000c01',501
    );
    raise exception 'Unbounded Hunter prospect limit was accepted';
  exception when others then
    if sqlerrm not like 'Hunter prospect limit must be between 1 and 500%' then
      raise;
    end if;
  end;

  perform 1 from public.get_hunter_customer_summary('00000000-0000-0000-0000-000000000c01');
  perform 1 from public.get_hunter_customer_prospects('00000000-0000-0000-0000-000000000c01',200);

  if (select count(*) from public.outreach_messages)<>v_outreach_before
     or (select count(*) from public.conversation_messages)<>v_messages_before
     or (select count(*) from public.leads)<>v_leads_before
     or (select count(*) from public.usage_events)<>v_usage_before
  then
    raise exception 'HUNTER-CUSTOMER-MODULE read model caused a mutation/send/credit side effect';
  end if;
end;
$hunter_customer_runtime$;

reset role;
select set_config('request.jwt.claim.sub','',false);
