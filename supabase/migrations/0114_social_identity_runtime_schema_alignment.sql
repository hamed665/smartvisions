-- 0114: Runtime repair for social canonical identity schema alignment.
-- Align social projection predicates with the current production CRM identity status columns.

create or replace function public.project_instagram_inbound_message(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_binding_id uuid,
  p_business_id uuid,
  p_identity_id uuid,
  p_provider_message_id text,
  p_message_text text,
  p_media_type text,
  p_chatwoot_conversation_display_id integer,
  p_chatwoot_conversation_uuid uuid,
  p_chatwoot_contact_id bigint,
  p_occurred_at timestamptz,
  p_request_key text
)
returns table (
  lead_id uuid,
  conversation_id uuid,
  message_id uuid,
  projection_id uuid,
  message_inserted boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_lead_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_projection_id uuid;
  v_projected_chatwoot_id integer;
  v_mapping_id uuid;
  v_brand_id uuid;
  v_inserted boolean := false;
  v_now timestamptz := coalesce(p_occurred_at, now());
begin
  if p_provider_message_id is null or length(trim(p_provider_message_id)) not between 1 and 500 then
    raise exception 'provider message id required';
  end if;
  if p_chatwoot_conversation_display_id is null or p_chatwoot_conversation_display_id <= 0 then
    raise exception 'valid Chatwoot conversation required';
  end if;
  if p_request_key is null or length(trim(p_request_key)) not between 8 and 200 then
    raise exception 'valid request key required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_business_id::text, 0));

  select tb.brand_id into v_brand_id
    from public.tenant_businesses tb
   where tb.organization_id = p_organization_id
     and tb.id = p_tenant_business_id
     and tb.status = 'ACTIVE';
  if v_brand_id is null then raise exception 'active tenant business not found'; end if;

  if not exists (
    select 1 from public.branches br
     where br.organization_id=p_organization_id and br.id=p_branch_id
       and br.tenant_business_id=p_tenant_business_id and br.status='ACTIVE'
  ) then raise exception 'active branch scope mismatch'; end if;

  if not exists (
    select 1 from public.communication_channel_bindings cb
     where cb.organization_id=p_organization_id and cb.id=p_binding_id
       and cb.tenant_business_id=p_tenant_business_id and cb.branch_id=p_branch_id
       and cb.channel='INSTAGRAM' and cb.status='ACTIVE'
  ) then raise exception 'active Instagram binding mismatch'; end if;

  if not exists (
    select 1 from public.crm_identity_links l
    join public.crm_identities i on i.id=l.identity_id and i.organization_id=l.organization_id
    where l.organization_id=p_organization_id and l.business_id=p_business_id
      and l.identity_id=p_identity_id and l.status='ACTIVE'
      and i.identity_type='INSTAGRAM_PROVIDER_USER' and i.status='ACTIVE'
  ) then raise exception 'verified Instagram canonical identity link required'; end if;

  select im.id into v_mapping_id
    from public.chatwoot_inbox_mappings im
   where im.organization_id=p_organization_id
     and im.tenant_business_id=p_tenant_business_id
     and im.branch_id=p_branch_id
     and im.communication_channel_binding_id=p_binding_id
     and im.chatwoot_inbox_id is not null
     and im.status='ACTIVE';
  if v_mapping_id is null then raise exception 'active Chatwoot inbox mapping required'; end if;

  insert into public.leads (organization_id,business_id,status,agent_mode)
  values (p_organization_id,p_business_id,'REPLIED','AUTO')
  on conflict (organization_id,business_id) where business_id is not null
  do update set updated_at=excluded.updated_at
  returning id into v_lead_id;

  select p.conversation_id,p.id,p.chatwoot_conversation_display_id into v_conversation_id,v_projection_id,v_projected_chatwoot_id
    from public.unified_inbox_conversation_projections p
    join public.sales_conversations sc
      on sc.organization_id=p.organization_id and sc.id=p.conversation_id
   where p.organization_id=p_organization_id
     and p.tenant_business_id=p_tenant_business_id
     and p.branch_id=p_branch_id
     and p.communication_channel_binding_id=p_binding_id
     and sc.lead_id=v_lead_id and sc.channel='INSTAGRAM'
     and p.lifecycle_status in ('ACTIVE','DEGRADED')
   order by p.updated_at desc limit 1;

  if v_conversation_id is not null and v_projected_chatwoot_id <> p_chatwoot_conversation_display_id then
    raise exception 'Chatwoot conversation does not match canonical Unified Inbox projection';
  end if;

  if v_conversation_id is null then
    insert into public.sales_conversations (
      organization_id,lead_id,channel,stage,agent_mode,last_message_at,
      last_inbound_at,unread_count,awaiting_party,stage_reason
    ) values (
      p_organization_id,v_lead_id,'INSTAGRAM','ACTIVE','AUTO',v_now,
      v_now,0,'US','INSTAGRAM_INBOUND'
    ) returning id into v_conversation_id;

    perform set_config('smartvisions.unified_inbox_projection_command','1',true);
    insert into public.unified_inbox_conversation_projections (
      organization_id,conversation_id,brand_id,tenant_business_id,branch_id,
      communication_channel_binding_id,chatwoot_inbox_mapping_id,
      chatwoot_conversation_display_id,chatwoot_conversation_uuid,
      chatwoot_contact_id,chatwoot_status,last_activity_at,last_request_key,last_reconciled_at
    ) values (
      p_organization_id,v_conversation_id,v_brand_id,p_tenant_business_id,p_branch_id,
      p_binding_id,v_mapping_id,p_chatwoot_conversation_display_id,
      p_chatwoot_conversation_uuid,p_chatwoot_contact_id,'open',v_now,p_request_key,now()
    ) returning id into v_projection_id;
  end if;

  insert into public.conversation_messages (
    organization_id,conversation_id,lead_id,provider_message_id,channel,direction,
    media_type,original_text,status,metadata,created_at
  ) values (
    p_organization_id,v_conversation_id,v_lead_id,trim(p_provider_message_id),
    'INSTAGRAM','INBOUND',coalesce(nullif(upper(p_media_type),''),'TEXT'),
    p_message_text,'RECEIVED',
    jsonb_build_object('source','INSTAGRAM_WEBHOOK','canonical_identity_id',p_identity_id,'binding_id',p_binding_id),
    v_now
  )
  on conflict (organization_id,channel,provider_message_id) where provider_message_id is not null
  do nothing
  returning id into v_message_id;

  v_inserted := v_message_id is not null;
  if not v_inserted then
    select cm.id into v_message_id from public.conversation_messages cm
     where cm.organization_id=p_organization_id and cm.channel='INSTAGRAM'
       and cm.provider_message_id=trim(p_provider_message_id);
  else
    update public.sales_conversations set
      stage=case when stage in ('NEW','WAITING_CUSTOMER','UNANSWERED','FOLLOW_UP_DUE') then 'ACTIVE' else stage end,
      last_message_at=v_now,last_inbound_at=v_now,unread_count=unread_count+1,
      awaiting_party=case when agent_mode='AUTO' and not requires_human then 'US' else awaiting_party end,
      stage_reason='INSTAGRAM_INBOUND',updated_at=now()
    where organization_id=p_organization_id and id=v_conversation_id;

    perform set_config('smartvisions.unified_inbox_projection_command','1',true);
    update public.unified_inbox_conversation_projections set
      last_activity_at=v_now,last_request_key=p_request_key,
      last_reconciled_at=now(),version=version+1
    where organization_id=p_organization_id and id=v_projection_id;
  end if;

  return query select v_lead_id,v_conversation_id,v_message_id,v_projection_id,v_inserted;
end;
$$;

revoke all on function public.project_instagram_inbound_message(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,integer,uuid,bigint,timestamptz,text) from public, anon, authenticated;
grant execute on function public.project_instagram_inbound_message(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,integer,uuid,bigint,timestamptz,text) to service_role;


create or replace function public.project_facebook_messenger_inbound_message(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_binding_id uuid,
  p_business_id uuid,
  p_identity_id uuid,
  p_provider_message_id text,
  p_message_text text,
  p_media_type text,
  p_chatwoot_conversation_display_id integer,
  p_chatwoot_conversation_uuid uuid,
  p_chatwoot_contact_id bigint,
  p_occurred_at timestamptz,
  p_request_key text
)
returns table (
  lead_id uuid,
  conversation_id uuid,
  message_id uuid,
  projection_id uuid,
  message_inserted boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_lead_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_projection_id uuid;
  v_projected_chatwoot_id integer;
  v_mapping_id uuid;
  v_brand_id uuid;
  v_inserted boolean := false;
  v_now timestamptz := coalesce(p_occurred_at, now());
begin
  if p_provider_message_id is null or length(trim(p_provider_message_id)) not between 1 and 500 then
    raise exception 'provider message id required';
  end if;
  if p_chatwoot_conversation_display_id is null or p_chatwoot_conversation_display_id <= 0 then
    raise exception 'valid Chatwoot conversation required';
  end if;
  if p_request_key is null or length(trim(p_request_key)) not between 8 and 200 then
    raise exception 'valid request key required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_business_id::text, 0));

  select tb.brand_id into v_brand_id
    from public.tenant_businesses tb
   where tb.organization_id = p_organization_id
     and tb.id = p_tenant_business_id
     and tb.status = 'ACTIVE';
  if v_brand_id is null then raise exception 'active tenant business not found'; end if;

  if not exists (
    select 1 from public.branches br
     where br.organization_id=p_organization_id and br.id=p_branch_id
       and br.tenant_business_id=p_tenant_business_id and br.status='ACTIVE'
  ) then raise exception 'active branch scope mismatch'; end if;

  if not exists (
    select 1 from public.communication_channel_bindings cb
     where cb.organization_id=p_organization_id and cb.id=p_binding_id
       and cb.tenant_business_id=p_tenant_business_id and cb.branch_id=p_branch_id
       and cb.channel='FACEBOOK_MESSENGER' and cb.status='ACTIVE'
  ) then raise exception 'active Facebook Messenger binding mismatch'; end if;

  if not exists (
    select 1 from public.crm_identity_links l
    join public.crm_identities i on i.id=l.identity_id and i.organization_id=l.organization_id
    where l.organization_id=p_organization_id and l.business_id=p_business_id
      and l.identity_id=p_identity_id and l.status='ACTIVE'
      and i.identity_type='FACEBOOK_MESSENGER_PROVIDER_USER' and i.status='ACTIVE'
  ) then raise exception 'verified Facebook Messenger canonical identity link required'; end if;

  select im.id into v_mapping_id
    from public.chatwoot_inbox_mappings im
   where im.organization_id=p_organization_id
     and im.tenant_business_id=p_tenant_business_id
     and im.branch_id=p_branch_id
     and im.communication_channel_binding_id=p_binding_id
     and im.chatwoot_inbox_id is not null
     and im.status='ACTIVE';
  if v_mapping_id is null then raise exception 'active Chatwoot inbox mapping required'; end if;

  insert into public.leads (organization_id,business_id,status,agent_mode)
  values (p_organization_id,p_business_id,'REPLIED','AUTO')
  on conflict (organization_id,business_id) where business_id is not null
  do update set updated_at=excluded.updated_at
  returning id into v_lead_id;

  select p.conversation_id,p.id,p.chatwoot_conversation_display_id into v_conversation_id,v_projection_id,v_projected_chatwoot_id
    from public.unified_inbox_conversation_projections p
    join public.sales_conversations sc
      on sc.organization_id=p.organization_id and sc.id=p.conversation_id
   where p.organization_id=p_organization_id
     and p.tenant_business_id=p_tenant_business_id
     and p.branch_id=p_branch_id
     and p.communication_channel_binding_id=p_binding_id
     and sc.lead_id=v_lead_id and sc.channel='FACEBOOK_MESSENGER'
     and p.lifecycle_status in ('ACTIVE','DEGRADED')
   order by p.updated_at desc limit 1;

  if v_conversation_id is not null and v_projected_chatwoot_id <> p_chatwoot_conversation_display_id then
    raise exception 'Chatwoot conversation does not match canonical Unified Inbox projection';
  end if;

  if v_conversation_id is null then
    insert into public.sales_conversations (
      organization_id,lead_id,channel,stage,agent_mode,last_message_at,
      last_inbound_at,unread_count,awaiting_party,stage_reason
    ) values (
      p_organization_id,v_lead_id,'FACEBOOK_MESSENGER','ACTIVE','AUTO',v_now,
      v_now,0,'US','FACEBOOK_MESSENGER_INBOUND'
    ) returning id into v_conversation_id;

    perform set_config('smartvisions.unified_inbox_projection_command','1',true);
    insert into public.unified_inbox_conversation_projections (
      organization_id,conversation_id,brand_id,tenant_business_id,branch_id,
      communication_channel_binding_id,chatwoot_inbox_mapping_id,
      chatwoot_conversation_display_id,chatwoot_conversation_uuid,
      chatwoot_contact_id,chatwoot_status,last_activity_at,last_request_key,last_reconciled_at
    ) values (
      p_organization_id,v_conversation_id,v_brand_id,p_tenant_business_id,p_branch_id,
      p_binding_id,v_mapping_id,p_chatwoot_conversation_display_id,
      p_chatwoot_conversation_uuid,p_chatwoot_contact_id,'open',v_now,p_request_key,now()
    ) returning id into v_projection_id;
  end if;

  insert into public.conversation_messages (
    organization_id,conversation_id,lead_id,provider_message_id,channel,direction,
    media_type,original_text,status,metadata,created_at
  ) values (
    p_organization_id,v_conversation_id,v_lead_id,trim(p_provider_message_id),
    'FACEBOOK_MESSENGER','INBOUND',coalesce(nullif(upper(p_media_type),''),'TEXT'),
    p_message_text,'RECEIVED',
    jsonb_build_object('source','FACEBOOK_MESSENGER_WEBHOOK','canonical_identity_id',p_identity_id,'binding_id',p_binding_id),
    v_now
  )
  on conflict (organization_id,channel,provider_message_id) where provider_message_id is not null
  do nothing
  returning id into v_message_id;

  v_inserted := v_message_id is not null;
  if not v_inserted then
    select cm.id into v_message_id from public.conversation_messages cm
     where cm.organization_id=p_organization_id and cm.channel='FACEBOOK_MESSENGER'
       and cm.provider_message_id=trim(p_provider_message_id);
  else
    update public.sales_conversations set
      stage=case when stage in ('NEW','WAITING_CUSTOMER','UNANSWERED','FOLLOW_UP_DUE') then 'ACTIVE' else stage end,
      last_message_at=v_now,last_inbound_at=v_now,unread_count=unread_count+1,
      awaiting_party=case when agent_mode='AUTO' and not requires_human then 'US' else awaiting_party end,
      stage_reason='FACEBOOK_MESSENGER_INBOUND',updated_at=now()
    where organization_id=p_organization_id and id=v_conversation_id;

    perform set_config('smartvisions.unified_inbox_projection_command','1',true);
    update public.unified_inbox_conversation_projections set
      last_activity_at=v_now,last_request_key=p_request_key,
      last_reconciled_at=now(),version=version+1
    where organization_id=p_organization_id and id=v_projection_id;
  end if;

  return query select v_lead_id,v_conversation_id,v_message_id,v_projection_id,v_inserted;
end;
$$;

revoke all on function public.project_facebook_messenger_inbound_message(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,integer,uuid,bigint,timestamptz,text) from public, anon, authenticated;
grant execute on function public.project_facebook_messenger_inbound_message(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,integer,uuid,bigint,timestamptz,text) to service_role;

