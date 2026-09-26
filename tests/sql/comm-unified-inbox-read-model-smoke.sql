\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000009601'),
  ('00000000-0000-4000-8000-000000009602');

insert into public.organizations(id,name) values
  ('00000000-0000-4000-8000-000000009610','Unified Inbox read model org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-4000-8000-000000009610','00000000-0000-4000-8000-000000009601','OWNER'),
  ('00000000-0000-4000-8000-000000009610','00000000-0000-4000-8000-000000009602','VIEWER');

insert into public.businesses(
  id,organization_id,name,country_code,email
) values
  ('70000000-0000-4000-8000-000000009611','00000000-0000-4000-8000-000000009610','Acme One','OM','one@example.test'),
  ('70000000-0000-4000-8000-000000009612','00000000-0000-4000-8000-000000009610','Acme Two','OM','two@example.test');

insert into public.leads(
  id,organization_id,business_id,status
) values
  ('71000000-0000-4000-8000-000000009611','00000000-0000-4000-8000-000000009610','70000000-0000-4000-8000-000000009611','NEW'),
  ('71000000-0000-4000-8000-000000009612','00000000-0000-4000-8000-000000009610','70000000-0000-4000-8000-000000009612','NEW');

insert into public.sales_conversations(
  id,organization_id,lead_id,channel,stage,priority,requires_human,last_message_at,persian_summary
) values
  (
    '72000000-0000-4000-8000-000000009611',
    '00000000-0000-4000-8000-000000009610',
    '71000000-0000-4000-8000-000000009611',
    'WHATSAPP','ACTIVE',90,true,
    statement_timestamp() - interval '1 minute',
    'گفتگوی اول'
  ),
  (
    '72000000-0000-4000-8000-000000009612',
    '00000000-0000-4000-8000-000000009610',
    '71000000-0000-4000-8000-000000009612',
    'EMAIL','UNANSWERED',40,false,
    statement_timestamp() - interval '2 minutes',
    'گفتگوی دوم'
  );

insert into public.conversation_messages(
  id,organization_id,conversation_id,lead_id,channel,direction,original_text,status,created_at
) values
  (
    '72100000-0000-4000-8000-000000009611',
    '00000000-0000-4000-8000-000000009610',
    '72000000-0000-4000-8000-000000009611',
    '71000000-0000-4000-8000-000000009611',
    'WHATSAPP','INBOUND','hello one','RECEIVED',
    statement_timestamp() - interval '50 seconds'
  ),
  (
    '72100000-0000-4000-8000-000000009612',
    '00000000-0000-4000-8000-000000009610',
    '72000000-0000-4000-8000-000000009612',
    '71000000-0000-4000-8000-000000009612',
    'EMAIL','INBOUND','hello two','RECEIVED',
    statement_timestamp() - interval '110 seconds'
  );

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009601',false);

do $owner_list$
declare
  v_count integer;
  v_first record;
  v_page2_count integer;
  v_search_count integer;
begin
  select count(*) into v_count
  from public.list_unified_inbox_conversations(
    '00000000-0000-4000-8000-000000009610',
    1
  );

  if v_count <> 2 then
    raise exception 'Unified Inbox list must return limit+1 rows for cursor detection';
  end if;

  select *
    into v_first
    from public.list_unified_inbox_conversations(
      '00000000-0000-4000-8000-000000009610',
      1
    )
   order by activity_at desc, conversation_id desc
   limit 1;

  if v_first.conversation_id <> '72000000-0000-4000-8000-000000009611'::uuid
     or v_first.unread_count <> 1
     or v_first.customer_name <> 'Acme One'
  then
    raise exception 'Unified Inbox first page ordering/read model mismatch';
  end if;

  select count(*) into v_page2_count
  from public.list_unified_inbox_conversations(
    '00000000-0000-4000-8000-000000009610',
    1,
    v_first.activity_at,
    v_first.conversation_id
  );

  if v_page2_count <> 1 then
    raise exception 'Unified Inbox cursor did not advance deterministically';
  end if;

  select count(*) into v_search_count
  from public.list_unified_inbox_conversations(
    p_organization_id => '00000000-0000-4000-8000-000000009610',
    p_limit => 10,
    p_query => 'Acme One'
  );

  if v_search_count <> 1 then
    raise exception 'Unified Inbox bounded search did not match customer name';
  end if;
end;
$owner_list$;

select (public.mark_unified_inbox_conversation_read(
  '00000000-0000-4000-8000-000000009610',
  '72000000-0000-4000-8000-000000009611'
)).conversation_id;

do $owner_read_state$
declare
  v_unread bigint;
begin
  select unread_count
    into v_unread
    from public.list_unified_inbox_conversations(
      p_organization_id => '00000000-0000-4000-8000-000000009610',
      p_limit => 10,
      p_query => 'Acme One'
    )
   limit 1;

  if v_unread <> 0 then
    raise exception 'OWNER read state did not clear only OWNER unread count';
  end if;
end;
$owner_read_state$;

do $direct_mutation_denied$
begin
  begin
    insert into public.unified_inbox_user_states(
      organization_id,user_id,conversation_id,last_read_at
    ) values (
      '00000000-0000-4000-8000-000000009610',
      '00000000-0000-4000-8000-000000009601',
      '72000000-0000-4000-8000-000000009612',
      statement_timestamp()
    );
    raise exception 'direct user-state mutation unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'direct user-state mutation unexpectedly succeeded' then
        raise;
      end if;
  end;
end;
$direct_mutation_denied$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009602',false);

do $viewer_independent_state$
declare
  v_unread bigint;
  v_counters jsonb;
begin
  select unread_count
    into v_unread
    from public.list_unified_inbox_conversations(
      p_organization_id => '00000000-0000-4000-8000-000000009610',
      p_limit => 10,
      p_query => 'Acme One'
    )
   limit 1;

  if v_unread <> 1 then
    raise exception 'per-user read state leaked between operators';
  end if;

  v_counters := public.get_unified_inbox_counters(
    '00000000-0000-4000-8000-000000009610'
  );

  if (v_counters->>'total')::integer <> 2
     or (v_counters->>'unread')::integer <> 2
     or (v_counters->>'human')::integer <> 1
     or (v_counters->'stages'->>'ACTIVE')::integer <> 1
     or (v_counters->'stages'->>'UNANSWERED')::integer <> 1
  then
    raise exception 'Unified Inbox counters are not operator-scoped/correct';
  end if;
end;
$viewer_independent_state$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $read_model_security_contract$
begin
  if not has_function_privilege(
       'authenticated',
       'public.list_unified_inbox_conversations(uuid,integer,timestamptz,uuid,text,text,boolean,boolean,text,uuid,uuid,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.list_unified_inbox_conversations(uuid,integer,timestamptz,uuid,text,text,boolean,boolean,text,uuid,uuid,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.list_unified_inbox_conversations(uuid,integer,timestamptz,uuid,text,text,boolean,boolean,text,uuid,uuid,text,text)',
       'EXECUTE'
     )
  then
    raise exception 'Unified Inbox list RPC privilege boundary is incorrect';
  end if;

  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'list_unified_inbox_conversations',
         'get_unified_inbox_counters',
         'mark_unified_inbox_conversation_read'
       )
       and p.prosecdef
  ) then
    raise exception 'Unified Inbox read model RPC unexpectedly uses SECURITY DEFINER';
  end if;
end;
$read_model_security_contract$;

rollback;
