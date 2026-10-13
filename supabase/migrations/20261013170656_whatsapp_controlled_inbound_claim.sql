-- A bounded exception on the existing Approval Rule + audit ledger, not a new outbox.
-- Lock first; each post-lock SELECT sees committed predecessors under READ COMMITTED.
create or replace function public.verify_or_claim_whatsapp_controlled_inbound(
  p_organization_id uuid, p_inbound_id uuid, p_recipient text, p_claim boolean default false, p_conversation_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_rule public.approval_rules%rowtype;
  v_inbound public.outreach_messages%rowtype;
  v_message public.conversation_messages%rowtype;
  v_controls public.system_controls%rowtype;
  v_cfg jsonb;
  v_consent jsonb;
  v_receipt jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_now timestamptz;
  v_cap integer;
  v_count integer;
  v_tenant uuid;
  v_binding uuid;
  v_conversation uuid;
  v_recipient text := regexp_replace(coalesce(p_recipient,''),'[^0-9]','','g');
begin
  if p_organization_id is null or p_inbound_id is null or v_recipient !~ '^968[0-9]{8}$' then
    return jsonb_build_object('allowed',false,'reason','LIVE_TEST_INPUT_INVALID');
  end if;
  -- No table UPDATE privileges or persisted parallel counter are needed.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'whatsapp-controlled-inbound:' || p_organization_id::text, 0));
  v_now := clock_timestamp();
  select * into v_rule from public.approval_rules
   where organization_id=p_organization_id and action_key='WHATSAPP_OUTBOUND';
  v_cfg := v_rule.config->'internalTestLiveReply';
  if v_rule.requires_approval is distinct from true or v_cfg->'enabled' is distinct from 'true'::jsonb then
    return jsonb_build_object('allowed',false,'reason','LIVE_TEST_DISABLED');
  end if;
  if v_cfg->'allowVerifiedOmanInbound' is distinct from 'true'::jsonb
     or v_cfg->'inboundOnly' is distinct from 'true'::jsonb
     or coalesce(v_cfg->>'deliveryMode','TEXT') <> 'TEXT'
     or jsonb_typeof(v_cfg->'recipients') is distinct from 'array'
     or jsonb_array_length(v_cfg->'recipients') not between 1 and 7 then
    return jsonb_build_object('allowed',false,'reason','LIVE_TEST_SCOPE_INVALID');
  end if;
  begin
    v_start := (v_cfg->>'startsAt')::timestamptz;
    v_end := (v_cfg->>'endsAt')::timestamptz;
    v_cap := (v_cfg->>'maxRepliesTotal')::integer;
    v_tenant := (v_cfg->>'tenantBusinessId')::uuid;
    v_binding := (v_cfg->>'bindingId')::uuid;
    select after_data into v_consent from public.audit_logs
     where organization_id=p_organization_id and id=(v_cfg->>'consentAuditId')::uuid
       and action='SAHRA_CONTROLLED_TEST_CONSENT_RECORDED';
  exception when invalid_text_representation or datetime_field_overflow then
    return jsonb_build_object('allowed',false,'reason','LIVE_TEST_CONFIGURATION_INVALID');
  end;
  if v_start is null or v_end is null or v_end <= v_start or v_end-v_start > interval '90 minutes'
     or v_now < v_start or v_now >= v_end or v_cap is null or v_cap not between 1 and 20
     or v_tenant is null or v_binding is null then
    return jsonb_build_object('allowed',false,'reason','LIVE_TEST_WINDOW_OR_CAP_INVALID');
  end if;
  if v_consent is null or v_consent->'ownerReportedConsent' is distinct from 'true'::jsonb
     or v_consent->'inboundOnly' is distinct from 'true'::jsonb
     or v_consent->>'channelBindingId' is distinct from v_binding::text
     or jsonb_typeof(v_consent->'recipients') is distinct from 'array' then
    return jsonb_build_object('allowed',false,'reason','LIVE_TEST_CONSENT_UNAVAILABLE');
  end if;
  -- Every configured participant must be present in the immutable private consent.
  if not exists(select 1 from jsonb_array_elements_text(v_cfg->'recipients') r
     where regexp_replace(r,'[^0-9]','','g')=v_recipient)
     or exists(select 1 from jsonb_array_elements_text(v_cfg->'recipients') r
       where regexp_replace(r,'[^0-9]','','g') !~ '^968[0-9]{8}$'
          or not exists(select 1 from jsonb_array_elements_text(v_consent->'recipients') c
            where regexp_replace(c,'[^0-9]','','g')=regexp_replace(r,'[^0-9]','','g'))) then
    return jsonb_build_object('allowed',false,'reason','RECIPIENT_NOT_CONSENTED');
  end if;
  select * into v_controls from public.system_controls where organization_id=p_organization_id;
  if v_controls.shadow_mode is distinct from true
     or v_controls.global_kill_switch is distinct from false
     or v_controls.agents_paused is distinct from false
     or v_controls.whatsapp_ai_paused is distinct from false then
    return jsonb_build_object('allowed',false,'reason','LIVE_TEST_RUNTIME_BLOCKED');
  end if;
  select * into v_inbound from public.outreach_messages
   where organization_id=p_organization_id and id=p_inbound_id
     and channel='WHATSAPP' and direction='INBOUND';
  v_conversation := (v_inbound.metadata->>'conversation_id')::uuid;
  if (p_conversation_id is not null and v_conversation is distinct from p_conversation_id)
     or v_inbound.id is null or v_inbound.received_at is null
     or v_inbound.received_at < v_start or v_inbound.received_at > v_now
     or v_now-v_inbound.received_at > interval '5 minutes'
     or v_inbound.metadata->>'tenant_business_id' is distinct from v_tenant::text
     or v_inbound.metadata->>'communication_channel_binding_id' is distinct from v_binding::text then
    return jsonb_build_object('allowed',false,'reason','FRESH_SCOPED_INBOUND_REQUIRED');
  end if;
  select * into v_message from public.conversation_messages
   where organization_id=p_organization_id and provider_message_id=v_inbound.provider_message_id
     and conversation_id=v_conversation and lead_id=v_inbound.lead_id
     and direction='INBOUND' and channel='WHATSAPP'
     and provenance='CUSTOMER' and source_plane='META_WHATSAPP'
     and source_message_id=v_inbound.provider_message_id;
  if v_message.id is null or v_message.media_type not in ('TEXT','VOICE','AUDIO')
     or regexp_replace(coalesce(v_message.metadata->>'from',''),'[^0-9]','','g')<>v_recipient
     or v_message.metadata->>'tenant_business_id' is distinct from v_tenant::text
     or v_message.metadata->>'communication_channel_binding_id' is distinct from v_binding::text
     or (not p_claim and v_message.media_type in ('VOICE','AUDIO') and (
       nullif(btrim(v_message.transcript),'') is null
       or v_message.metadata->'media_analysis'->>'status' is distinct from 'SUCCEEDED'
       or v_message.metadata->'media_analysis'->>'kind' is distinct from 'VOICE_TRANSCRIPTION'
       or nullif(v_message.metadata->'media_analysis'->>'sourceId','') is null))
     or exists(select 1 from public.conversation_messages m where m.organization_id=p_organization_id
       and m.conversation_id=v_conversation and m.direction='INBOUND'
       and (m.created_at,m.id)>(v_message.created_at,v_message.id)) then
    return jsonb_build_object('allowed',false,'reason','CANONICAL_INBOUND_NOT_CURRENT');
  end if;
  if not exists(select 1 from public.whatsapp_events e
     where e.organization_id=p_organization_id and e.provider_message_id=v_inbound.provider_message_id
       and e.direction='INBOUND' and e.conversation_id=v_conversation and e.lead_id=v_inbound.lead_id
       and e.payload->'routing'->>'tenantBusinessId'=v_tenant::text
       and e.payload->'routing'->>'bindingId'=v_binding::text
       and e.payload->'canonical'->>'messageId'=v_message.id::text
       and regexp_replace(coalesce(e.payload->>'from',''),'[^0-9]','','g')=v_recipient)
     or not exists(select 1 from public.communication_channel_bindings b
       join public.unified_inbox_conversation_projections p on p.communication_channel_binding_id=b.id
       join public.chatwoot_inbox_mappings i on i.communication_channel_binding_id=b.id
       join public.chatwoot_account_mappings a on a.id=i.chatwoot_account_mapping_id
       where b.organization_id=p_organization_id and b.id=v_binding and b.tenant_business_id=v_tenant
         and b.channel='WHATSAPP' and b.provider='META' and b.status='ACTIVE'
         and b.last_error_code is null and b.provider_secret_ref is not null and p.organization_id=p_organization_id
         and p.conversation_id=v_conversation and p.tenant_business_id=v_tenant
         and p.lifecycle_status='ACTIVE' and i.organization_id=p_organization_id
         and i.tenant_business_id=v_tenant and i.status='ACTIVE' and i.chatwoot_inbox_id is not null
         and a.organization_id=p_organization_id and a.tenant_business_id=v_tenant
         and a.status='ACTIVE' and a.chatwoot_account_id is not null) then
    return jsonb_build_object('allowed',false,'reason','LIVE_TEST_COMMUNICATION_NOT_READY');
  end if;
  if not exists(select 1 from public.sales_conversations c join public.leads l on l.id=c.lead_id
     join public.businesses b on b.id=l.business_id
     where c.organization_id=p_organization_id and l.organization_id=p_organization_id
       and b.organization_id=p_organization_id and c.id=v_conversation and c.lead_id=v_inbound.lead_id
       and c.channel='WHATSAPP' and c.requires_human=false and c.agent_mode='AUTO' and l.agent_mode='AUTO'
       and c.stage not in ('PAUSED','DO_NOT_CONTACT','SPAM') and l.status not in ('DO_NOT_CONTACT','WON','LOST')
       and regexp_replace(coalesce(nullif(b.whatsapp,''),b.phone,b.international_phone,''),'[^0-9]','','g')=v_recipient) then
    return jsonb_build_object('allowed',false,'reason','LIVE_TEST_HUMAN_OR_IDENTITY_BLOCKED');
  end if;
  if exists(select 1 from public.suppression_list s where s.organization_id=p_organization_id
    and regexp_replace(coalesce(s.phone,''),'[^0-9]','','g')=v_recipient) then
    return jsonb_build_object('allowed',false,'reason','SUPPRESSED_RECIPIENT');
  end if;
  select after_data into v_receipt from public.audit_logs where organization_id=p_organization_id
    and action='INTERNAL_TEST_LIVE_REPLY_CLAIMED' and entity_type='outreach_message'
    and entity_id=p_inbound_id::text order by created_at limit 1;
  if p_claim and v_receipt is not null then
    return jsonb_build_object('allowed',false,'reason','LIVE_TEST_INBOUND_ALREADY_CLAIMED');
  end if;
  select count(*) into v_count from public.audit_logs where organization_id=p_organization_id
    and action='INTERNAL_TEST_LIVE_REPLY_CLAIMED' and created_at>=v_start and created_at<v_end;
  if p_claim then
    if v_count >= v_cap then
      return jsonb_build_object('allowed',false,'reason','LIVE_TEST_REPLY_CAP_REACHED');
    end if;
    insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data)
    values(p_organization_id,'SYSTEM','whatsapp_controlled_inbound',
      'INTERNAL_TEST_LIVE_REPLY_CLAIMED','outreach_message',p_inbound_id::text,
      jsonb_build_object('windowStartsAt',v_start,'windowEndsAt',v_end,'maxRepliesTotal',v_cap,
        'tenantBusinessId',v_tenant,'bindingId',v_binding,'consentAuditId',v_cfg->>'consentAuditId',
        'slot',v_count+1,'shadowModeRemainsOn',true,'automaticRetry',false));
  elsif v_receipt is null or v_count>v_cap
     or (v_receipt->>'windowStartsAt')::timestamptz is distinct from v_start
     or (v_receipt->>'windowEndsAt')::timestamptz is distinct from v_end
     or v_receipt->>'tenantBusinessId' is distinct from v_tenant::text
     or v_receipt->>'bindingId' is distinct from v_binding::text
     or v_receipt->>'consentAuditId' is distinct from v_cfg->>'consentAuditId' then
    return jsonb_build_object('allowed',false,'reason','LIVE_TEST_CLAIM_RECEIPT_INVALID');
  end if;
  return jsonb_build_object('allowed',true,'reason',case when p_claim then 'CLAIMED' else 'VERIFIED' end);
exception when invalid_text_representation or datetime_field_overflow then
  return jsonb_build_object('allowed',false,'reason','LIVE_TEST_CANONICAL_EVIDENCE_INVALID');
end $$;
revoke all on function public.verify_or_claim_whatsapp_controlled_inbound(uuid,uuid,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.verify_or_claim_whatsapp_controlled_inbound(uuid,uuid,text,boolean,uuid) to service_role;
