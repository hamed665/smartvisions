\set ON_ERROR_STOP on

do $timeline_structure$
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'crm_customer_timeline'
      and c.relkind = 'v'
      and 'security_invoker=true' = any(coalesce(c.reloptions, array[]::text[]))
  ) then
    raise exception 'Customer timeline view is not SECURITY INVOKER';
  end if;

  if (
    select p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_crm_customer_timeline'
  ) then
    raise exception 'Customer timeline query unexpectedly uses SECURITY DEFINER';
  end if;

  if has_table_privilege('anon', 'public.crm_customer_timeline', 'SELECT') then
    raise exception 'anon unexpectedly has Customer timeline SELECT';
  end if;

  if not has_table_privilege('authenticated', 'public.crm_customer_timeline', 'SELECT') then
    raise exception 'authenticated lacks Customer timeline SELECT';
  end if;

  if has_table_privilege('authenticated', 'public.crm_customer_timeline', 'INSERT') then
    raise exception 'Customer timeline view unexpectedly exposes write privileges';
  end if;

  if has_function_privilege(
    'anon',
    'public.get_crm_customer_timeline(uuid,uuid,integer,timestamptz,text,boolean)',
    'EXECUTE'
  ) then
    raise exception 'anon unexpectedly executes Customer timeline query';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_crm_customer_timeline(uuid,uuid,integer,timestamptz,text,boolean)',
    'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute Customer timeline query';
  end if;
end;
$timeline_structure$;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c001', false);

do $timeline_rls$
begin
  if (
    select count(*)
    from public.crm_customer_timeline
    where organization_id = '00000000-0000-0000-0000-000000000c01'
      and business_id = '10000000-0000-0000-0000-000000000c01'
  ) <> 8 then
    raise exception 'Customer timeline item count mismatch for target Business';
  end if;

  if exists (
    select 1
    from public.crm_customer_timeline
    where organization_id = '00000000-0000-0000-0000-000000000d01'
  ) then
    raise exception 'Customer timeline SECURITY INVOKER leaked another tenant';
  end if;

  if exists (
    select 1
    from public.get_crm_customer_timeline(
      '00000000-0000-0000-0000-000000000d01',
      '10000000-0000-0000-0000-000000000d01',
      50,
      null,
      null,
      true
    )
  ) then
    raise exception 'Customer timeline RPC leaked another tenant';
  end if;
end;
$timeline_rls$;

do $timeline_semantics$
declare
  v_count integer;
  v_status text;
  v_source text;
  v_visibility text;
  v_kind text;
begin
  select count(*), max(source)
    into v_count, v_source
  from public.crm_customer_timeline
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and business_id = '10000000-0000-0000-0000-000000000c01'
    and provider_message_id = 'wamid.shared'
    and kind = 'MESSAGE_OUTBOUND';

  if v_count <> 1 or v_source <> 'conversation_messages' then
    raise exception 'Customer timeline failed outbound provider-ID dedupe';
  end if;

  select delivery_status
    into v_status
  from public.crm_customer_timeline
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and provider_message_id = 'wamid.shared'
    and kind = 'MESSAGE_OUTBOUND';

  if v_status <> 'READ' then
    raise exception 'Customer timeline did not enrich latest WhatsApp READ status';
  end if;

  select delivery_status
    into v_status
  from public.crm_customer_timeline
  where organization_id = '00000000-0000-0000-0000-000000000c01'
    and provider_message_id = 'email.fixture.1'
    and kind = 'MESSAGE_OUTBOUND';

  if v_status <> 'DELIVERED' then
    raise exception 'Customer timeline did not enrich latest Email DELIVERED status';
  end if;

  select visibility, kind
    into v_visibility, v_kind
  from public.crm_customer_timeline
  where item_id = 'conversation_message:40000000-0000-0000-0000-000000000c02';

  if v_visibility <> 'INTERNAL' or v_kind <> 'MESSAGE_BLOCKED' then
    raise exception 'Blocked draft was exposed as a customer interaction';
  end if;

  if exists (
    select 1
    from public.crm_customer_timeline
    where source in ('whatsapp_events','email_events')
  ) then
    raise exception 'Provider journals became duplicate standalone timeline items';
  end if;

  if (
    select count(*)
    from public.get_crm_customer_timeline(
      '00000000-0000-0000-0000-000000000c01',
      '10000000-0000-0000-0000-000000000c01',
      50,
      null,
      null,
      false
    )
  ) <> 3 then
    raise exception 'Customer-only timeline should contain exactly three interactions';
  end if;
end;
$timeline_semantics$;

do $timeline_cursor$
declare
  v_cursor_at timestamptz;
  v_cursor_id text;
  v_first_ids text[];
  v_second_ids text[];
begin
  select array_agg(item_id order by occurred_at desc, item_id desc)
    into v_first_ids
  from public.get_crm_customer_timeline(
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    2,
    null,
    null,
    true
  );

  select occurred_at, item_id
    into v_cursor_at, v_cursor_id
  from public.get_crm_customer_timeline(
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    2,
    null,
    null,
    true
  )
  order by occurred_at desc, item_id desc
  offset 1
  limit 1;

  select array_agg(item_id order by occurred_at desc, item_id desc)
    into v_second_ids
  from public.get_crm_customer_timeline(
    '00000000-0000-0000-0000-000000000c01',
    '10000000-0000-0000-0000-000000000c01',
    2,
    v_cursor_at,
    v_cursor_id,
    true
  );

  if cardinality(v_first_ids) <> 2 or cardinality(v_second_ids) <> 2 then
    raise exception 'Customer timeline cursor pages did not preserve requested page size';
  end if;

  if v_first_ids && v_second_ids then
    raise exception 'Customer timeline cursor repeated an item across pages';
  end if;
end;
$timeline_cursor$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
