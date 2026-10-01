-- 0167: WhatsApp message/status/media bridge provenance + dedupe.
-- Extends existing canonical journals/message/projection authorities only.
-- No second message store, Chatwoot plane, provider queue or webhook journal.

alter table public.conversation_messages
  add column if not exists provenance text not null default 'SYSTEM',
  add column if not exists source_plane text,
  add column if not exists source_message_id text;

update public.conversation_messages
   set provenance = case
     when direction='INBOUND' then 'CUSTOMER'
     when coalesce(metadata->>'source','') in ('SHADOW_MODE','APPROVED_SHADOW_DRAFT') then 'AI'
     when coalesce(metadata->>'source','') in ('OWNER_MANUAL_REPLY','CHATWOOT_SIGNED_WEBHOOK') then 'HUMAN_SMARTVISIONS'
     else 'SYSTEM'
   end;

alter table public.conversation_messages
  drop constraint if exists conversation_messages_provenance_check;
alter table public.conversation_messages
  add constraint conversation_messages_provenance_check
  check (provenance in ('CUSTOMER','HUMAN_SMARTVISIONS','HUMAN_NATIVE_WHATSAPP','AI','SYSTEM'));

alter table public.conversation_messages
  drop constraint if exists conversation_messages_source_plane_check;
alter table public.conversation_messages
  add constraint conversation_messages_source_plane_check
  check (
    source_plane is null
    or source_plane in ('META_WHATSAPP','CHATWOOT','SMART_CORE')
  );

alter table public.conversation_messages
  drop constraint if exists conversation_messages_source_message_id_check;
alter table public.conversation_messages
  add constraint conversation_messages_source_message_id_check
  check (
    source_message_id is null
    or length(trim(source_message_id)) between 1 and 200
  );

create unique index if not exists conversation_messages_source_identity_uidx
  on public.conversation_messages(
    organization_id,channel,source_plane,source_message_id
  )
  where source_plane is not null and source_message_id is not null;

alter table public.whatsapp_events
  add column if not exists chatwoot_sync_status text,
  add column if not exists chatwoot_message_id bigint,
  add column if not exists chatwoot_synced_at timestamptz;

update public.whatsapp_events
   set chatwoot_sync_status='PENDING'
 where direction='INBOUND'
   and conversation_id is not null
   and chatwoot_sync_status is null;

alter table public.whatsapp_events
  drop constraint if exists whatsapp_events_chatwoot_sync_status_check;
alter table public.whatsapp_events
  add constraint whatsapp_events_chatwoot_sync_status_check
  check (
    chatwoot_sync_status is null
    or chatwoot_sync_status in ('PENDING','PROCESSING','ACCEPTED','RECONCILIATION_REQUIRED')
  );

alter table public.whatsapp_events
  drop constraint if exists whatsapp_events_chatwoot_message_id_check;
alter table public.whatsapp_events
  add constraint whatsapp_events_chatwoot_message_id_check
  check (chatwoot_message_id is null or chatwoot_message_id > 0);

create unique index if not exists whatsapp_events_chatwoot_message_uidx
  on public.whatsapp_events(organization_id,chatwoot_message_id)
  where chatwoot_message_id is not null;

create index if not exists whatsapp_events_chatwoot_pending_idx
  on public.whatsapp_events(organization_id,created_at,id)
  where direction='INBOUND' and chatwoot_sync_status='PENDING';

create or replace function public.claim_whatsapp_chatwoot_sync(
  p_organization_id uuid,
  p_provider_message_id text
)
returns table(
  event_id uuid,
  claimed boolean,
  sync_status text,
  chatwoot_message_id bigint,
  lead_id uuid,
  conversation_id uuid
)
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  e public.whatsapp_events%rowtype;
  v_provider text:=trim(coalesce(p_provider_message_id,''));
begin
  if p_organization_id is null or length(v_provider) not between 1 and 512 then
    raise exception 'invalid WhatsApp Chatwoot sync identity';
  end if;

  select * into e
    from public.whatsapp_events
   where organization_id=p_organization_id
     and provider_message_id=v_provider
     and direction='INBOUND'
   order by created_at,id
   limit 1
   for update;

  if not found or e.conversation_id is null or e.lead_id is null then
    raise exception 'linked WhatsApp inbound journal event required';
  end if;

  if e.chatwoot_sync_status='ACCEPTED' then
    return query select e.id,false,'ACCEPTED'::text,e.chatwoot_message_id,e.lead_id,e.conversation_id;
    return;
  end if;

  if e.chatwoot_sync_status in ('PROCESSING','RECONCILIATION_REQUIRED') then
    return query select e.id,false,e.chatwoot_sync_status,e.chatwoot_message_id,e.lead_id,e.conversation_id;
    return;
  end if;

  if coalesce(e.chatwoot_sync_status,'PENDING')<>'PENDING' then
    raise exception 'invalid WhatsApp Chatwoot sync state';
  end if;

  update public.whatsapp_events
     set chatwoot_sync_status='PROCESSING'
   where id=e.id;

  return query select e.id,true,'PROCESSING'::text,null::bigint,e.lead_id,e.conversation_id;
end
$$;

create or replace function public.finalize_whatsapp_chatwoot_sync(
  p_event_id uuid,
  p_status text,
  p_chatwoot_message_id bigint default null
)
returns table(sync_status text,chatwoot_message_id bigint)
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  e public.whatsapp_events%rowtype;
  v_status text:=upper(trim(coalesce(p_status,'')));
begin
  if v_status not in ('ACCEPTED','RECONCILIATION_REQUIRED') then
    raise exception 'invalid WhatsApp Chatwoot finalization state';
  end if;
  if v_status='ACCEPTED' and (p_chatwoot_message_id is null or p_chatwoot_message_id<=0) then
    raise exception 'accepted Chatwoot message id required';
  end if;
  if v_status='RECONCILIATION_REQUIRED' and p_chatwoot_message_id is not null then
    raise exception 'ambiguous Chatwoot result cannot assert a message id';
  end if;

  select * into e
    from public.whatsapp_events
   where id=p_event_id and direction='INBOUND'
   for update;
  if not found then raise exception 'WhatsApp inbound journal event unavailable'; end if;

  if e.chatwoot_sync_status='ACCEPTED' then
    if v_status='ACCEPTED' and e.chatwoot_message_id=p_chatwoot_message_id then
      return query select e.chatwoot_sync_status,e.chatwoot_message_id;
      return;
    end if;
    raise exception 'accepted WhatsApp Chatwoot sync is terminal';
  end if;

  if e.chatwoot_sync_status='RECONCILIATION_REQUIRED' then
    if v_status='RECONCILIATION_REQUIRED' then
      return query select e.chatwoot_sync_status,e.chatwoot_message_id;
      return;
    end if;
    raise exception 'ambiguous WhatsApp Chatwoot sync requires operator reconciliation';
  end if;

  if e.chatwoot_sync_status<>'PROCESSING' then
    raise exception 'WhatsApp Chatwoot sync was not claimed';
  end if;

  update public.whatsapp_events
     set chatwoot_sync_status=v_status,
         chatwoot_message_id=case when v_status='ACCEPTED' then p_chatwoot_message_id else null end,
         chatwoot_synced_at=statement_timestamp()
   where id=e.id
  returning public.whatsapp_events.chatwoot_sync_status,
            public.whatsapp_events.chatwoot_message_id
       into sync_status,chatwoot_message_id;

  return next;
end
$$;

revoke all on function public.claim_whatsapp_chatwoot_sync(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_whatsapp_chatwoot_sync(uuid,text)
  to service_role;

revoke all on function public.finalize_whatsapp_chatwoot_sync(uuid,text,bigint)
  from public,anon,authenticated,service_role;
grant execute on function public.finalize_whatsapp_chatwoot_sync(uuid,text,bigint)
  to service_role;



create or replace function public.complete_whatsapp_chatwoot_outbound_event(
  p_event_id uuid,
  p_message_id uuid
)
returns public.chatwoot_webhook_events
language plpgsql
security definer
set search_path=public,pg_catalog
as $outbound$
declare
  e public.chatwoot_webhook_events%rowtype;
  m public.conversation_messages%rowtype;
begin
  if p_event_id is null or p_message_id is null then
    raise exception 'invalid WhatsApp Chatwoot outbound completion identity';
  end if;

  select * into e
    from public.chatwoot_webhook_events
   where id=p_event_id
   for update;
  if not found or e.event_type<>'message_created' then
    raise exception 'signed Chatwoot message event required';
  end if;

  select * into m
    from public.conversation_messages
   where organization_id=e.organization_id
     and id=p_message_id
     and channel='WHATSAPP'
     and direction='OUTBOUND'
     and provenance='HUMAN_SMARTVISIONS'
     and source_plane='CHATWOOT'
     and status='SENT'
     and provider_message_id is not null;
  if not found then
    raise exception 'provider-accepted canonical WhatsApp human message required';
  end if;

  if coalesce(m.metadata->>'chatwoot_event_id','')<>e.id::text then
    raise exception 'canonical WhatsApp human message does not match Chatwoot event';
  end if;

  if e.status='PROCESSED' then
    return e;
  end if;
  if e.status not in ('RECEIVED','FAILED') then
    raise exception 'Chatwoot event cannot be completed from its current state';
  end if;

  update public.chatwoot_webhook_events
     set status='PROCESSED',
         error_code=null,
         processed_at=coalesce(processed_at,statement_timestamp())
   where id=e.id
  returning * into e;

  return e;
end
$outbound$;

revoke all on function public.complete_whatsapp_chatwoot_outbound_event(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.complete_whatsapp_chatwoot_outbound_event(uuid,uuid)
  to service_role;

create or replace function public.reconcile_whatsapp_delivery_status(
  p_organization_id uuid,
  p_provider_message_id text,
  p_status text,
  p_occurred_at timestamptz,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_binding_id uuid,
  p_conversation_id text default null,
  p_pricing_category text default null,
  p_error_code text default null,
  p_error_title text default null
)
returns table(
  outreach_matched integer,
  conversation_matched integer,
  canonical_status text
)
language plpgsql
security definer
set search_path=public,pg_catalog
as $status$
declare
  v_provider text:=trim(coalesce(p_provider_message_id,''));
  v_raw text:=lower(trim(coalesce(p_status,'')));
  v_status text;
  v_outreach_status text;
  v_outreach_count integer:=0;
  v_conversation_count integer:=0;
  v_at timestamptz:=coalesce(p_occurred_at,statement_timestamp());
begin
  if p_organization_id is null
     or p_tenant_business_id is null
     or p_binding_id is null
     or length(v_provider) not between 1 and 512
  then
    raise exception 'invalid WhatsApp delivery reconciliation scope';
  end if;

  v_status:=case v_raw
    when 'sent' then 'ACCEPTED'
    when 'delivered' then 'DELIVERED'
    when 'read' then 'READ'
    when 'failed' then 'FAILED'
    else null
  end;

  if v_status is null then
    return query select 0,0,null::text;
    return;
  end if;

  v_outreach_status:=case v_status
    when 'ACCEPTED' then 'SENT'
    when 'DELIVERED' then 'DELIVERED'
    when 'READ' then 'READ'
    when 'FAILED' then 'FAILED'
  end;

  update public.outreach_messages m
     set status=case
       when v_status='READ' then 'READ'
       when v_status='DELIVERED' and upper(coalesce(m.status,'')) not in ('READ','FAILED') then 'DELIVERED'
       when v_status='ACCEPTED' and upper(coalesce(m.status,'')) not in ('DELIVERED','READ','FAILED') then 'SENT'
       when v_status='FAILED' and upper(coalesce(m.status,'')) not in ('DELIVERED','READ') then 'FAILED'
       else m.status
     end,
     metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
       'whatsapp_status',v_raw,
       'conversation_id',p_conversation_id,
       'pricing_category',p_pricing_category,
       'error_code',p_error_code,
       'error_title',p_error_title,
       'tenant_business_id',p_tenant_business_id,
       'branch_id',p_branch_id,
       'communication_channel_binding_id',p_binding_id,
       'provider_status_occurred_at',v_at
     )
   where m.organization_id=p_organization_id
     and m.provider_message_id=v_provider
     and m.channel='WHATSAPP';
  get diagnostics v_outreach_count=row_count;

  update public.conversation_messages m
     set provider_delivery_status=case
       when v_status='READ' then 'READ'
       when v_status='DELIVERED' and coalesce(m.provider_delivery_status,'') not in ('READ','FAILED') then 'DELIVERED'
       when v_status='ACCEPTED' and coalesce(m.provider_delivery_status,'') not in ('DELIVERED','READ','FAILED') then 'ACCEPTED'
       when v_status='FAILED' and coalesce(m.provider_delivery_status,'') not in ('DELIVERED','READ') then 'FAILED'
       else m.provider_delivery_status
     end,
     delivered_at=case
       when v_status in ('DELIVERED','READ') and m.delivered_at is null then v_at
       else m.delivered_at
     end,
     read_at=case
       when v_status='READ' and m.read_at is null then v_at
       else m.read_at
     end,
     metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object(
       'last_whatsapp_status',v_raw,
       'provider_status_occurred_at',v_at,
       'pricing_category',p_pricing_category,
       'error_code',p_error_code,
       'error_title',p_error_title
     )
   where m.organization_id=p_organization_id
     and m.provider_message_id=v_provider
     and m.channel='WHATSAPP';
  get diagnostics v_conversation_count=row_count;

  return query select v_outreach_count,v_conversation_count,v_status;
end
$status$;

revoke all on function public.reconcile_whatsapp_delivery_status(
  uuid,text,text,timestamptz,uuid,uuid,uuid,text,text,text,text
) from public,anon,authenticated,service_role;
grant execute on function public.reconcile_whatsapp_delivery_status(
  uuid,text,text,timestamptz,uuid,uuid,uuid,text,text,text,text
) to service_role;

-- Slice 5 permits a Business-wide Channel::Api mapping. Conversation projection
-- must preserve that exact nullable Branch scope rather than inventing a Branch.
alter table public.unified_inbox_conversation_projections
  alter column branch_id drop not null;

create or replace function public.reconcile_unified_inbox_projection_event(
  p_event_id uuid,
  p_conversation_id uuid,
  p_chatwoot_conversation_display_id integer,
  p_chatwoot_contact_id bigint,
  p_chatwoot_assignee_user_id bigint,
  p_chatwoot_team_id bigint,
  p_chatwoot_status text,
  p_labels text[],
  p_last_activity_at timestamptz,
  p_chatwoot_updated_at timestamptz
)
returns table(
  outcome text,
  projection_id uuid,
  projection_version integer,
  event_status text
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_event public.chatwoot_webhook_events%rowtype;
  v_mapping public.chatwoot_inbox_mappings%rowtype;
  v_business public.tenant_businesses%rowtype;
  v_binding public.communication_channel_bindings%rowtype;
  v_conversation public.sales_conversations%rowtype;
  v_current public.unified_inbox_conversation_projections%rowtype;
  v_projection public.unified_inbox_conversation_projections%rowtype;
  v_receipt public.unified_inbox_projection_reconciliation_receipts%rowtype;
  v_team_mapping public.chatwoot_team_mappings%rowtype;
  v_team public.teams%rowtype;
  v_department public.departments%rowtype;
  v_request_key text;
  v_status text := lower(trim(coalesce(p_chatwoot_status, '')));
  v_labels text[];
  v_department_id uuid;
  v_team_id uuid;
  v_team_mapping_id uuid;
  v_outcome text;
  v_event_status text;
begin
  if p_event_id is null
     or p_conversation_id is null
     or p_chatwoot_conversation_display_id is null
     or p_chatwoot_conversation_display_id <= 0
     or (p_chatwoot_contact_id is not null and p_chatwoot_contact_id <= 0)
     or (p_chatwoot_assignee_user_id is not null and p_chatwoot_assignee_user_id <= 0)
     or (p_chatwoot_team_id is not null and p_chatwoot_team_id <= 0)
     or length(v_status) not between 1 and 40
     or v_status !~ '^[a-z0-9_:-]+$'
     or p_last_activity_at is null
     or p_chatwoot_updated_at is null
  then
    raise exception 'invalid Unified Inbox projection event payload';
  end if;

  if cardinality(coalesce(p_labels, '{}'::text[])) > 100
     or exists (
       select 1
         from unnest(coalesce(p_labels, '{}'::text[])) value
        where value is null
           or length(trim(value)) not between 1 and 120
     )
  then
    raise exception 'Unified Inbox labels exceed the bounded contract';
  end if;

  v_labels := array(
    select distinct trim(value)
      from unnest(coalesce(p_labels, '{}'::text[])) value
     order by trim(value)
  );

  select *
    into v_event
    from public.chatwoot_webhook_events e
   where e.id = p_event_id
   for update;

  if not found then
    raise exception 'Chatwoot webhook event not found';
  end if;

  v_request_key := 'unified-inbox:event:' || v_event.id::text;

  select *
    into v_receipt
    from public.unified_inbox_projection_reconciliation_receipts r
   where r.source_event_id = v_event.id;

  if found then
    if v_receipt.organization_id <> v_event.organization_id
       or v_receipt.payload_hash <> v_event.raw_body_sha256
       or v_receipt.conversation_id <> p_conversation_id
    then
      raise exception 'Unified Inbox event replay does not match its reconciliation receipt';
    end if;

    return query
    select v_receipt.outcome, v_receipt.projection_id,
           v_receipt.applied_version, v_event.status;
    return;
  end if;

  if v_event.status not in ('RECEIVED','FAILED') then
    raise exception 'terminal Chatwoot webhook event has no reconciliation receipt';
  end if;

  select *
    into v_mapping
    from public.chatwoot_inbox_mappings m
   where m.id = v_event.chatwoot_inbox_mapping_id
     and m.organization_id = v_event.organization_id
     and m.tenant_business_id = v_event.tenant_business_id
     and m.chatwoot_inbox_id = v_event.chatwoot_inbox_id
     and m.channel_type = 'Channel::Api'
     and m.status in ('ACTIVE','DEGRADED');

  if not found then
    raise exception 'live Chatwoot Inbox mapping required for Unified Inbox reconciliation';
  end if;

  select *
    into v_business
    from public.tenant_businesses b
   where b.organization_id = v_event.organization_id
     and b.id = v_event.tenant_business_id
     and b.status = 'ACTIVE';

  if not found then
    raise exception 'ACTIVE tenant Business required for Unified Inbox reconciliation';
  end if;

  select *
    into v_binding
    from public.communication_channel_bindings cb
   where cb.organization_id = v_event.organization_id
     and cb.id = v_mapping.communication_channel_binding_id
     and cb.tenant_business_id = v_event.tenant_business_id
     and cb.branch_id is not distinct from v_mapping.branch_id
     and cb.status = 'ACTIVE';

  if not found then
    raise exception 'ACTIVE communication binding required for Unified Inbox reconciliation';
  end if;

  select *
    into v_conversation
    from public.sales_conversations sc
   where sc.id = p_conversation_id
     and sc.organization_id = v_event.organization_id;

  if not found or upper(v_conversation.channel) <> v_binding.channel then
    raise exception 'Smart Core conversation does not match the signed Chatwoot event scope';
  end if;

  if p_chatwoot_team_id is not null then
    if v_mapping.branch_id is null then
      raise exception 'Chatwoot Team requires a Branch-scoped Inbox mapping';
    end if;
    select *
      into v_team_mapping
      from public.chatwoot_team_mappings tm
     where tm.organization_id = v_event.organization_id
       and tm.tenant_business_id = v_event.tenant_business_id
       and tm.chatwoot_account_mapping_id = v_mapping.chatwoot_account_mapping_id
       and tm.chatwoot_team_id = p_chatwoot_team_id
       and tm.status in ('ACTIVE','DEGRADED');

    if not found then
      raise exception 'Chatwoot Team is not governed by an active Smart Team mapping';
    end if;

    select *
      into v_team
      from public.teams t
     where t.organization_id = v_event.organization_id
       and t.id = v_team_mapping.smart_team_id
       and t.status = 'ACTIVE';

    if not found then
      raise exception 'ACTIVE Smart Team required for Unified Inbox reconciliation';
    end if;

    select *
      into v_department
      from public.departments d
     where d.organization_id = v_event.organization_id
       and d.id = v_team.department_id
       and d.branch_id = v_mapping.branch_id
       and d.status = 'ACTIVE';

    if not found then
      raise exception 'Chatwoot Team mapping escaped the canonical Branch lineage';
    end if;

    v_team_id := v_team.id;
    v_department_id := v_department.id;
    v_team_mapping_id := v_team_mapping.id;
  end if;

  if exists (
    select 1
      from public.unified_inbox_conversation_projections p
     where p.organization_id = v_event.organization_id
       and p.tenant_business_id = v_event.tenant_business_id
       and p.chatwoot_conversation_display_id = p_chatwoot_conversation_display_id
       and p.conversation_id <> p_conversation_id
  ) then
    raise exception 'Chatwoot Conversation identity already belongs to another Smart Core conversation';
  end if;

  select *
    into v_current
    from public.unified_inbox_conversation_projections p
   where p.organization_id = v_event.organization_id
     and p.conversation_id = p_conversation_id
   for update;

  if found then
    if v_current.lifecycle_status = 'ARCHIVED'
       or v_current.brand_id <> v_business.brand_id
       or v_current.tenant_business_id <> v_event.tenant_business_id
       or v_current.branch_id is distinct from v_mapping.branch_id
       or v_current.communication_channel_binding_id <> v_mapping.communication_channel_binding_id
       or v_current.chatwoot_inbox_mapping_id <> v_mapping.id
       or v_current.chatwoot_conversation_display_id <> p_chatwoot_conversation_display_id
    then
      raise exception 'Unified Inbox projection immutable scope/identity drift detected';
    end if;

    if v_current.chatwoot_updated_at is not null
       and p_chatwoot_updated_at < v_current.chatwoot_updated_at
    then
      v_projection := v_current;
      v_outcome := 'STALE_IGNORED';
      v_event_status := 'IGNORED';
    elsif v_current.chatwoot_updated_at = p_chatwoot_updated_at
       and v_current.department_id is not distinct from v_department_id
       and v_current.team_id is not distinct from v_team_id
       and v_current.chatwoot_team_mapping_id is not distinct from v_team_mapping_id
       and v_current.chatwoot_contact_id is not distinct from p_chatwoot_contact_id
       and v_current.chatwoot_assignee_user_id is not distinct from p_chatwoot_assignee_user_id
       and v_current.chatwoot_status is not distinct from v_status
       and v_current.labels = v_labels
       and v_current.last_activity_at is not distinct from p_last_activity_at
    then
      v_projection := v_current;
      v_outcome := 'NOOP';
      v_event_status := 'PROCESSED';
    else
      perform set_config('smartvisions.unified_inbox_projection_command', '1', true);

      update public.unified_inbox_conversation_projections
         set department_id = v_department_id,
             team_id = v_team_id,
             chatwoot_team_mapping_id = v_team_mapping_id,
             chatwoot_contact_id = p_chatwoot_contact_id,
             chatwoot_assignee_user_id = p_chatwoot_assignee_user_id,
             chatwoot_status = v_status,
             labels = v_labels,
             last_activity_at = p_last_activity_at,
             source_event_id = v_event.id,
             lifecycle_status = 'ACTIVE',
             version = version + 1,
             last_request_key = v_request_key,
             last_reconciled_at = statement_timestamp(),
             chatwoot_updated_at = p_chatwoot_updated_at
       where id = v_current.id
         and version = v_current.version
      returning * into v_projection;

      perform set_config('smartvisions.unified_inbox_projection_command', '0', true);

      if not found then
        raise exception 'Unified Inbox projection changed concurrently';
      end if;

      v_outcome := 'UPDATED';
      v_event_status := 'PROCESSED';
    end if;
  else
    perform set_config('smartvisions.unified_inbox_projection_command', '1', true);

    insert into public.unified_inbox_conversation_projections(
      organization_id, conversation_id, brand_id, tenant_business_id, branch_id,
      department_id, team_id, communication_channel_binding_id,
      chatwoot_inbox_mapping_id, chatwoot_team_mapping_id,
      chatwoot_conversation_display_id, chatwoot_contact_id,
      chatwoot_assignee_user_id, chatwoot_status, labels, last_activity_at,
      source_event_id, lifecycle_status, version, last_request_key,
      last_reconciled_at, chatwoot_updated_at
    ) values (
      v_event.organization_id, p_conversation_id, v_business.brand_id,
      v_event.tenant_business_id, v_mapping.branch_id, v_department_id,
      v_team_id, v_mapping.communication_channel_binding_id, v_mapping.id,
      v_team_mapping_id, p_chatwoot_conversation_display_id,
      p_chatwoot_contact_id, p_chatwoot_assignee_user_id, v_status, v_labels,
      p_last_activity_at, v_event.id, 'ACTIVE', 1, v_request_key,
      statement_timestamp(), p_chatwoot_updated_at
    )
    returning * into v_projection;

    perform set_config('smartvisions.unified_inbox_projection_command', '0', true);

    v_outcome := 'CREATED';
    v_event_status := 'PROCESSED';
  end if;

  insert into public.unified_inbox_projection_reconciliation_receipts(
    organization_id, projection_id, conversation_id, source_event_id,
    request_key, payload_hash, outcome, applied_version
  ) values (
    v_event.organization_id, v_projection.id, p_conversation_id, v_event.id,
    v_request_key, v_event.raw_body_sha256, v_outcome, v_projection.version
  )
  returning * into v_receipt;

  update public.chatwoot_webhook_events
     set status = v_event_status,
         error_code = case when v_event_status = 'IGNORED' then 'STALE_EVENT' else null end,
         processed_at = statement_timestamp()
   where id = v_event.id;

  perform set_config('smartvisions.unified_inbox_projection_command', '0', true);

  return query
  select v_receipt.outcome, v_receipt.projection_id,
         v_receipt.applied_version, v_event_status;
  return;
exception
  when others then
    perform set_config('smartvisions.unified_inbox_projection_command', '0', true);
    raise;
end;
$$;
