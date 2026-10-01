\set ON_ERROR_STOP on

begin;

insert into public.organizations(id,name) values
  ('00000000-0000-4000-8000-000000016701','Slice 6 smoke org');

insert into public.businesses(
  id,organization_id,name,country_code,whatsapp
) values (
  '10000000-0000-4000-8000-000000016701',
  '00000000-0000-4000-8000-000000016701',
  'Slice 6 customer','OM','+96890000000'
);

insert into public.leads(
  id,organization_id,business_id,status
) values (
  '20000000-0000-4000-8000-000000016701',
  '00000000-0000-4000-8000-000000016701',
  '10000000-0000-4000-8000-000000016701',
  'NEW'
);

insert into public.sales_conversations(
  id,organization_id,lead_id,channel
) values (
  '30000000-0000-4000-8000-000000016701',
  '00000000-0000-4000-8000-000000016701',
  '20000000-0000-4000-8000-000000016701',
  'WHATSAPP'
);

insert into public.conversation_messages(
  id,organization_id,conversation_id,lead_id,provider_message_id,
  channel,direction,media_type,original_text,status,
  provenance,source_plane,source_message_id
) values (
  '40000000-0000-4000-8000-000000016701',
  '00000000-0000-4000-8000-000000016701',
  '30000000-0000-4000-8000-000000016701',
  '20000000-0000-4000-8000-000000016701',
  'wamid.slice6-status',
  'WHATSAPP','OUTBOUND','TEXT','hello','SENT',
  'AI','SMART_CORE','slice6:ai:one'
);

insert into public.outreach_messages(
  id,organization_id,lead_id,channel,direction,status,
  provider_message_id,body,idempotency_key
) values (
  '50000000-0000-4000-8000-000000016701',
  '00000000-0000-4000-8000-000000016701',
  '20000000-0000-4000-8000-000000016701',
  'WHATSAPP','OUTBOUND','SENT',
  'wamid.slice6-status','hello','slice6-outreach-one'
);

select * from public.reconcile_whatsapp_delivery_status(
  '00000000-0000-4000-8000-000000016701',
  'wamid.slice6-status','read',statement_timestamp(),
  '60000000-0000-4000-8000-000000016701',
  null,
  '70000000-0000-4000-8000-000000016701'
);

select * from public.reconcile_whatsapp_delivery_status(
  '00000000-0000-4000-8000-000000016701',
  'wamid.slice6-status','delivered',statement_timestamp() - interval '1 minute',
  '60000000-0000-4000-8000-000000016701',
  null,
  '70000000-0000-4000-8000-000000016701'
);

select * from public.reconcile_whatsapp_delivery_status(
  '00000000-0000-4000-8000-000000016701',
  'wamid.slice6-status','failed',statement_timestamp() - interval '2 minutes',
  '60000000-0000-4000-8000-000000016701',
  null,
  '70000000-0000-4000-8000-000000016701'
);

do $status_monotonic$
begin
  if not exists (
    select 1
    from public.conversation_messages
    where id='40000000-0000-4000-8000-000000016701'
      and provider_delivery_status='READ'
      and read_at is not null
      and delivered_at is not null
  ) then
    raise exception 'WhatsApp canonical delivery status regressed after READ';
  end if;

  if not exists (
    select 1
    from public.outreach_messages
    where id='50000000-0000-4000-8000-000000016701'
      and upper(status)='READ'
  ) then
    raise exception 'WhatsApp outreach delivery status regressed after READ';
  end if;
end;
$status_monotonic$;

do $source_identity_unique$
begin
  begin
    insert into public.conversation_messages(
      organization_id,conversation_id,lead_id,channel,direction,media_type,
      original_text,status,provenance,source_plane,source_message_id
    ) values (
      '00000000-0000-4000-8000-000000016701',
      '30000000-0000-4000-8000-000000016701',
      '20000000-0000-4000-8000-000000016701',
      'WHATSAPP','OUTBOUND','TEXT','duplicate','SENT',
      'AI','SMART_CORE','slice6:ai:one'
    );
    raise exception 'duplicate canonical source identity unexpectedly succeeded';
  exception
    when unique_violation then null;
  end;
end;
$source_identity_unique$;

insert into public.whatsapp_events(
  id,organization_id,lead_id,conversation_id,provider_message_id,
  direction,event_type,payload,chatwoot_sync_status
) values (
  '80000000-0000-4000-8000-000000016701',
  '00000000-0000-4000-8000-000000016701',
  '20000000-0000-4000-8000-000000016701',
  '30000000-0000-4000-8000-000000016701',
  'wamid.slice6-inbound',
  'INBOUND','TEXT','{}'::jsonb,'PENDING'
);

do $claim_finalize$
declare
  r record;
begin
  select * into r
  from public.claim_whatsapp_chatwoot_sync(
    '00000000-0000-4000-8000-000000016701',
    'wamid.slice6-inbound'
  );

  if r.claimed is not true or r.sync_status<>'PROCESSING' then
    raise exception 'WhatsApp Chatwoot sync claim did not become PROCESSING';
  end if;

  select * into r
  from public.finalize_whatsapp_chatwoot_sync(
    '80000000-0000-4000-8000-000000016701',
    'ACCEPTED',
    701
  );

  if r.sync_status<>'ACCEPTED' or r.chatwoot_message_id<>701 then
    raise exception 'WhatsApp Chatwoot sync finalization did not persist ACCEPTED identity';
  end if;

  select * into r
  from public.claim_whatsapp_chatwoot_sync(
    '00000000-0000-4000-8000-000000016701',
    'wamid.slice6-inbound'
  );

  if r.claimed is not false or r.sync_status<>'ACCEPTED' or r.chatwoot_message_id<>701 then
    raise exception 'WhatsApp Chatwoot sync replay was not idempotent';
  end if;
end;
$claim_finalize$;

do $slice6_contract$
declare
  v_count integer;
  v_nullable text;
  v_reconciler text;
  v_complete text;
begin
  select count(*) into v_count
  from information_schema.columns
  where table_schema='public'
    and table_name='conversation_messages'
    and column_name in ('provenance','source_plane','source_message_id');
  if v_count<>3 then raise exception 'Slice 6 provenance columns are incomplete'; end if;

  select count(*) into v_count
  from information_schema.columns
  where table_schema='public'
    and table_name='whatsapp_events'
    and column_name in ('chatwoot_sync_status','chatwoot_message_id','chatwoot_synced_at');
  if v_count<>3 then raise exception 'Slice 6 WhatsApp journal sync columns are incomplete'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public'
      and indexname='conversation_messages_source_identity_uidx'
  ) then raise exception 'Slice 6 canonical source identity index is missing'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public'
      and indexname='whatsapp_events_chatwoot_pending_idx'
  ) then raise exception 'Slice 6 pending Chatwoot sync index is missing'; end if;

  select is_nullable into v_nullable
  from information_schema.columns
  where table_schema='public'
    and table_name='unified_inbox_conversation_projections'
    and column_name='branch_id';
  if v_nullable<>'YES' then
    raise exception 'Business-wide Unified Inbox projection branch must be nullable';
  end if;

  if has_function_privilege(
       'anon','public.claim_whatsapp_chatwoot_sync(uuid,text)','EXECUTE'
     )
     or has_function_privilege(
       'authenticated','public.claim_whatsapp_chatwoot_sync(uuid,text)','EXECUTE'
     )
     or not has_function_privilege(
       'service_role','public.claim_whatsapp_chatwoot_sync(uuid,text)','EXECUTE'
     )
  then raise exception 'WhatsApp Chatwoot claim ACL drifted'; end if;

  if has_function_privilege(
       'anon','public.finalize_whatsapp_chatwoot_sync(uuid,text,bigint)','EXECUTE'
     )
     or has_function_privilege(
       'authenticated','public.finalize_whatsapp_chatwoot_sync(uuid,text,bigint)','EXECUTE'
     )
     or not has_function_privilege(
       'service_role','public.finalize_whatsapp_chatwoot_sync(uuid,text,bigint)','EXECUTE'
     )
  then raise exception 'WhatsApp Chatwoot finalize ACL drifted'; end if;

  if has_function_privilege(
       'anon','public.complete_whatsapp_chatwoot_outbound_event(uuid,uuid)','EXECUTE'
     )
     or has_function_privilege(
       'authenticated','public.complete_whatsapp_chatwoot_outbound_event(uuid,uuid)','EXECUTE'
     )
     or not has_function_privilege(
       'service_role','public.complete_whatsapp_chatwoot_outbound_event(uuid,uuid)','EXECUTE'
     )
  then raise exception 'WhatsApp Chatwoot outbound completion ACL drifted'; end if;

  if has_function_privilege(
       'anon',
       'public.reconcile_whatsapp_delivery_status(uuid,text,text,timestamptz,uuid,uuid,uuid,text,text,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.reconcile_whatsapp_delivery_status(uuid,text,text,timestamptz,uuid,uuid,uuid,text,text,text,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.reconcile_whatsapp_delivery_status(uuid,text,text,timestamptz,uuid,uuid,uuid,text,text,text,text)',
       'EXECUTE'
     )
  then raise exception 'WhatsApp delivery reconciliation ACL drifted'; end if;

  select pg_get_functiondef(p.oid) into v_complete
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='complete_whatsapp_chatwoot_outbound_event';
  if v_complete is null
     or v_complete not like '%provenance = ''HUMAN_SMARTVISIONS''%'
     or v_complete not like '%source_plane = ''CHATWOOT''%'
     or v_complete not like '%provider_message_id IS NOT NULL%'
  then raise exception 'WhatsApp human outbound completion boundary drifted'; end if;

  select pg_get_functiondef(p.oid) into v_reconciler
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='reconcile_unified_inbox_projection_event';
  if v_reconciler is null
     or v_reconciler not like '%branch_id IS NOT DISTINCT FROM v_mapping.branch_id%'
     or v_reconciler like '%v_mapping.branch_id IS NULL%live Branch-scoped%'
  then raise exception 'Business-wide Unified Inbox reconciliation drifted'; end if;
end;
$slice6_contract$;

rollback;
