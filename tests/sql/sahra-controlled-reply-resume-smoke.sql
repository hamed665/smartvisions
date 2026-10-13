\set ON_ERROR_STOP on
begin;
-- Only the existing disposable controlled-inbound CI fixture is touched.
update public.leads set status='HUMAN',agent_mode='HUMAN'
where id=(select lead_id from public.outreach_messages where idempotency_key='ci:controlled-inbound:1');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000eb01',true);
do $$ declare c uuid; l uuid; result jsonb; before_count integer; begin
 select lead_id,(metadata->>'conversation_id')::uuid into l,c from public.outreach_messages
 where idempotency_key='ci:controlled-inbound:1';
 select count(*) into before_count from public.conversation_messages where conversation_id=c;
 result:=public.release_human_takeover('00000000-0000-0000-0000-00000000fb01',c);
 if result->'released' is distinct from 'true'::jsonb or not exists(select 1 from public.leads where id=l and agent_mode='AUTO' and status='REPLIED') then
  raise exception 'Legacy HUMAN Lead did not resume: %',result; end if;
 result:=public.release_human_takeover('00000000-0000-0000-0000-00000000fb01',c);
 if result->>'reason' is distinct from 'ALREADY_AUTOMATED' then raise exception 'Automated resume not idempotent: %',result; end if;
 if (select count(*) from public.conversation_messages where conversation_id=c)<>before_count then raise exception 'Resume created a message'; end if;
 update public.leads set status='DO_NOT_CONTACT' where id=l;
 begin
  perform public.release_human_takeover('00000000-0000-0000-0000-00000000fb01',c);
  raise exception 'DNC resume accepted';
 exception when raise_exception then
  if sqlerrm not like 'terminal lead cannot resume automation%' then raise; end if;
 end;
end $$;
reset role;
do $$ begin
 if exists(select 1 from pg_proc where oid='public.release_human_takeover(uuid,uuid)'::regprocedure and prosecdef)
 or has_function_privilege('anon','public.release_human_takeover(uuid,uuid)','EXECUTE') then raise exception 'Resume privilege drift'; end if;
end $$;
rollback;
