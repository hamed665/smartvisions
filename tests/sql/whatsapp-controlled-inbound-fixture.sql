-- Included inside the existing C4 fixture transaction. No Production execution.
select set_config('smartvisions.chatwoot_bridge_command','1',true);
update public.communication_channel_bindings
 set status='ACTIVE',provider='META',provider_secret_ref=gen_random_uuid(),
     provider_destination_id='ci-phone-fixture',provider_account_id='ci-waba-fixture',
     version=version+1,last_request_key='ci-controlled-binding-ready'
 where id=(select value::uuid from c4_inbox_state where key='binding_id');
select set_config('smartvisions.chatwoot_bridge_command','0',true);
insert into public.system_controls(organization_id,shadow_mode,global_kill_switch,agents_paused,whatsapp_ai_paused)
 values('00000000-0000-0000-0000-00000000fb01',true,false,false,false);
insert into public.businesses(id,organization_id,name,country_code,whatsapp)
 values('10000000-0000-4000-8000-00000000ca01','00000000-0000-0000-0000-00000000fb01','CI inbound fixture','OM','+96890000001');
insert into public.leads(id,organization_id,business_id,status,agent_mode)
 values('20000000-0000-4000-8000-00000000ca01','00000000-0000-0000-0000-00000000fb01','10000000-0000-4000-8000-00000000ca01','NEW','AUTO');
insert into public.audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data)
 values('30000000-0000-4000-8000-00000000ca01','00000000-0000-0000-0000-00000000fb01','USER','00000000-0000-0000-0000-00000000eb01',
 'SAHRA_CONTROLLED_TEST_CONSENT_RECORDED','test','ci-fixture',jsonb_build_object(
 'ownerReportedConsent',true,'inboundOnly',true,'channelBindingId',(select value from c4_inbox_state where key='binding_id'),
 'recipients',jsonb_build_array('+96890000001')));
insert into public.approval_rules(organization_id,action_key,requires_approval,mode,expiry_minutes,escalation_minutes,allow_delegation,reviewer_roles,delegation_roles,config)
 values('00000000-0000-0000-0000-00000000fb01','WHATSAPP_OUTBOUND',true,'STRICT',1440,240,false,array['OWNER']::text[],'{}'::text[],jsonb_build_object('internalTestLiveReply',jsonb_build_object(
 'enabled',true,'allowVerifiedOmanInbound',true,'inboundOnly',true,'deliveryMode','TEXT',
 'senderPhoneNumberId','ci-phone-fixture','senderWabaId','ci-waba-fixture',
 'tenantBusinessId','20000000-0000-0000-0000-00000000fb01','bindingId',(select value from c4_inbox_state where key='binding_id'),
 'consentAuditId','30000000-0000-4000-8000-00000000ca01','recipients',jsonb_build_array('96890000001'),
 'startsAt',clock_timestamp()-interval '1 minute','endsAt',clock_timestamp()+interval '30 minutes','maxRepliesTotal',20)));
select set_config('smartvisions.unified_inbox_projection_command','1',true);
do $$ declare n integer; c uuid; m uuid; o uuid; v_metadata jsonb; begin
 for n in 1..30 loop
  c:=gen_random_uuid(); m:=gen_random_uuid(); o:=gen_random_uuid();
  v_metadata:=jsonb_build_object('conversation_id',c,'from','96890000001','type','text',
    'tenant_business_id','20000000-0000-0000-0000-00000000fb01',
    'communication_channel_binding_id',(select value from c4_inbox_state where key='binding_id'));
  insert into public.sales_conversations(id,organization_id,lead_id,channel,agent_mode,requires_human)
   values(c,'00000000-0000-0000-0000-00000000fb01','20000000-0000-4000-8000-00000000ca01','WHATSAPP','AUTO',false);
  insert into public.outreach_messages(id,organization_id,lead_id,channel,direction,status,provider_message_id,body,idempotency_key,received_at,metadata)
   values(o,'00000000-0000-0000-0000-00000000fb01','20000000-0000-4000-8000-00000000ca01','WHATSAPP','INBOUND','RECEIVED',
     'wamid.ci-controlled-'||n,'fixture','ci:controlled-inbound:'||n,clock_timestamp(),v_metadata);
  insert into public.conversation_messages(id,organization_id,conversation_id,lead_id,provider_message_id,channel,direction,media_type,
    original_text,status,provenance,source_plane,source_message_id,metadata)
   values(m,'00000000-0000-0000-0000-00000000fb01',c,'20000000-0000-4000-8000-00000000ca01','wamid.ci-controlled-'||n,
     'WHATSAPP','INBOUND','TEXT','fixture','RECEIVED','CUSTOMER','META_WHATSAPP','wamid.ci-controlled-'||n,v_metadata);
  insert into public.whatsapp_events(id,organization_id,lead_id,conversation_id,provider_message_id,direction,event_type,payload)
   values(gen_random_uuid(),'00000000-0000-0000-0000-00000000fb01','20000000-0000-4000-8000-00000000ca01',c,'wamid.ci-controlled-'||n,'INBOUND','TEXT',
    jsonb_build_object('from','96890000001','routing',jsonb_build_object('tenantBusinessId','20000000-0000-0000-0000-00000000fb01',
      'bindingId',(select value from c4_inbox_state where key='binding_id'),
      'phoneNumberId','ci-phone-fixture','wabaId','ci-waba-fixture'),'canonical',jsonb_build_object('messageId',m)));
  insert into public.unified_inbox_conversation_projections(organization_id,conversation_id,brand_id,tenant_business_id,branch_id,
    communication_channel_binding_id,chatwoot_inbox_mapping_id,chatwoot_conversation_display_id,last_request_key)
   values('00000000-0000-0000-0000-00000000fb01',c,'10000000-0000-0000-0000-00000000fb01','20000000-0000-0000-0000-00000000fb01',
    '30000000-0000-0000-0000-00000000fb01',(select value::uuid from c4_inbox_state where key='binding_id'),
    (select value::uuid from c4_inbox_state where key='inbox_mapping_id'),n,'ci-controlled-projection-'||n);
 end loop;
end $$;
select set_config('smartvisions.unified_inbox_projection_command','0',true);
