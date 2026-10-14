\set ON_ERROR_STOP on
-- Ephemeral PostgreSQL CI fixtures only; never run in Production.
begin;
do $$ declare r jsonb; cfg jsonb; i uuid; j uuid; a uuid:=gen_random_uuid(); begin
 select config->'internalTestLiveReply' into cfg from public.approval_rules
  where organization_id='00000000-0000-0000-0000-00000000fb01' and action_key='WHATSAPP_OUTBOUND';
 cfg:=cfg||jsonb_build_object('enabled',true,'allowAllCustomerInitiated',true,'noUnsolicited',true,
   'dailyCap',200,'consentAuditId',a);
 insert into public.audit_logs(id,organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data)
 select a,organization_id,actor_type,actor_id,'SAHRA_INBOUND_SERVICE_OWNER_APPROVED',
   entity_type,entity_id,after_data||jsonb_build_object('allowAllCustomerInitiated',true,'noUnsolicited',true,
   'tenantBusinessId',cfg->>'tenantBusinessId','senderPhoneNumberId',cfg->>'senderPhoneNumberId',
   'senderWabaId',cfg->>'senderWabaId','dailyCap',60)
 from public.audit_logs where id='30000000-0000-4000-8000-00000000ca01';
 update public.approval_rules set config=config||jsonb_build_object('permanentInboundReply',cfg)
  where organization_id='00000000-0000-0000-0000-00000000fb01' and action_key='WHATSAPP_OUTBOUND';
 select id into i from public.outreach_messages where idempotency_key='ci:controlled-inbound:30';
 select id into j from public.outreach_messages where idempotency_key='ci:controlled-inbound:29';
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000001',true);
 if r->>'reason' is distinct from 'LIVE_TEST_CONSENT_UNAVAILABLE' then
  raise exception 'old 60/day consent admitted a 200/day claim: %',r; end if;
 update public.audit_logs set after_data=jsonb_set(after_data,'{dailyCap}','200') where id=a;
 insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data)
 select '00000000-0000-0000-0000-00000000fb01','SYSTEM','ci_fixture','WHATSAPP_INBOUND_SERVICE_CLAIMED',
   'outreach_message','ci:200:slot:'||n,'{}'::jsonb from generate_series(1,199) n;
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000001',true);
 if r->>'allowed' is distinct from 'true' then raise exception '200th reply blocked: %',r; end if;
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000001',false);
 if r->>'allowed' is distinct from 'true' then raise exception '200th receipt invalid: %',r; end if;
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000001',true);
 if r->>'reason' is distinct from 'LIVE_TEST_INBOUND_ALREADY_CLAIMED' then
  raise exception 'duplicate daily slot admitted: %',r; end if;
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',j,'96890000001',true);
 if r->>'reason' is distinct from 'LIVE_TEST_REPLY_CAP_REACHED' then
  raise exception '201st reply admitted: %',r; end if;
 update public.approval_rules set config=jsonb_set(config,'{permanentInboundReply,dailyCap}','201')
  where organization_id='00000000-0000-0000-0000-00000000fb01' and action_key='WHATSAPP_OUTBOUND';
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',j,'96890000001',true);
 if r->>'reason' is distinct from 'LIVE_TEST_WINDOW_OR_CAP_INVALID' then
  raise exception 'over-ceiling configuration admitted: %',r; end if;
 if has_function_privilege('anon','public.verify_or_claim_whatsapp_controlled_inbound(uuid,uuid,text,boolean,uuid)','EXECUTE')
 or has_function_privilege('authenticated','public.verify_or_claim_whatsapp_controlled_inbound(uuid,uuid,text,boolean,uuid)','EXECUTE')
 or not has_function_privilege('service_role','public.verify_or_claim_whatsapp_controlled_inbound(uuid,uuid,text,boolean,uuid)','EXECUTE') then
  raise exception 'daily-cap migration changed canonical RPC ACL'; end if;
end $$;
rollback;
