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
reset role;
do $$ declare r jsonb; i uuid; c uuid; cfg jsonb; begin
 select id,(metadata->>'conversation_id')::uuid into i,c from public.outreach_messages where idempotency_key='ci:controlled-inbound:1';
 select config into cfg from public.approval_rules where organization_id='00000000-0000-0000-0000-00000000fb01' and action_key='WHATSAPP_OUTBOUND';
 update public.sales_conversations set requires_human=true where id=c;
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000001',false);
 if r->>'reason'<>'LIVE_TEST_HUMAN_OR_IDENTITY_BLOCKED' then raise exception 'post-claim human revocation failed: %',r; end if;
 update public.sales_conversations set requires_human=false where id=c;
 update public.approval_rules set config=jsonb_set(cfg,'{internalTestLiveReply,enabled}','false')
  where organization_id='00000000-0000-0000-0000-00000000fb01' and action_key='WHATSAPP_OUTBOUND';
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000001',false);
 if r->>'reason'<>'LIVE_TEST_DISABLED' then raise exception 'post-claim disable failed: %',r; end if;
 update public.approval_rules set config=jsonb_set(cfg,'{internalTestLiveReply,endsAt}',to_jsonb(clock_timestamp()-interval '1 second'))
  where organization_id='00000000-0000-0000-0000-00000000fb01' and action_key='WHATSAPP_OUTBOUND';
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000001',false);
 if r->>'reason'<>'LIVE_TEST_WINDOW_OR_CAP_INVALID' then raise exception 'post-claim expiry failed: %',r; end if;
 update public.approval_rules set config=cfg where organization_id='00000000-0000-0000-0000-00000000fb01' and action_key='WHATSAPP_OUTBOUND';
 update public.conversation_messages set media_type='VOICE',transcript='fixture transcript',metadata=metadata||jsonb_build_object('media_id','media-fixture') where conversation_id=c;
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000001',false);
 if r->>'reason'<>'CANONICAL_INBOUND_NOT_CURRENT' then raise exception 'bare transcript incorrectly admitted: %',r; end if;
 perform public.persist_conversation_voice_transcript('00000000-0000-0000-0000-00000000fb01','wamid.ci-controlled-1',c,
  '40000000-0000-4000-8000-00000000ca01','fixture transcript','en','ci-fixture-model');
 r:=public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',i,'96890000001',false);
 if r->>'allowed'<>'true' then raise exception 'successful canonical voice projection not accepted: %',r; end if;
 update public.conversation_messages set media_type='TEXT' where conversation_id=c;
end $$;
commit;
