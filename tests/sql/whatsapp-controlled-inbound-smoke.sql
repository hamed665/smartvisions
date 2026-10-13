\set ON_ERROR_STOP on
begin;
do $$ declare r jsonb; i uuid; begin
 if has_function_privilege('anon','public.verify_or_claim_whatsapp_controlled_inbound(uuid,uuid,text,boolean,uuid)','EXECUTE')
 or has_function_privilege('authenticated','public.verify_or_claim_whatsapp_controlled_inbound(uuid,uuid,text,boolean,uuid)','EXECUTE') then
  raise exception 'controlled inbound RPC browser ACL drift'; end if;
 select id into i from public.outreach_messages where idempotency_key='ci:controlled-inbound:1';
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000002',true);
 if r->>'reason'<>'RECIPIENT_NOT_CONSENTED' then raise exception 'unconsented admission: %',r; end if;
 update public.sales_conversations set requires_human=true where id=(select (metadata->>'conversation_id')::uuid from public.outreach_messages where id=i);
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000001',true);
 if r->>'reason'<>'LIVE_TEST_HUMAN_OR_IDENTITY_BLOCKED' then raise exception 'human admission: %',r; end if;
 update public.sales_conversations set requires_human=false where id=(select (metadata->>'conversation_id')::uuid from public.outreach_messages where id=i);
end $$;
set local role service_role;
do $$ declare r jsonb; i uuid; begin
 select id into i from public.outreach_messages where idempotency_key='ci:controlled-inbound:1';
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000001',true);
 if r->>'allowed'<>'true' then raise exception 'real scoped fixture not admitted: %',r; end if;
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000001',true);
 if r->>'reason'<>'LIVE_TEST_INBOUND_ALREADY_CLAIMED' then raise exception 'duplicate admitted: %',r; end if;
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000001',false);
 if r->>'allowed'<>'true' then raise exception 'receipt verification failed: %',r; end if;
end $$;
commit;
