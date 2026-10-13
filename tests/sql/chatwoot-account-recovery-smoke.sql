\set ON_ERROR_STOP on
begin;
do $$ begin
 if has_function_privilege('authenticated','public.record_chatwoot_account_absence_review(uuid,uuid,integer,uuid,text,integer,jsonb,timestamptz,text)','EXECUTE')
 or has_function_privilege('anon','public.claim_chatwoot_account_receipt_recovery(uuid,uuid,integer,uuid,text,text)','EXECUTE')
 or has_table_privilege('authenticated','public.chatwoot_account_reconciliation_receipts','INSERT') then
  raise exception 'Account receipt privilege boundary failed';
 end if;
end $$;
set role service_role;
do $$ declare r public.chatwoot_account_reconciliation_receipts%rowtype; begin
 select * into r from public.chatwoot_account_reconciliation_receipts where request_key='ci-full-review';
 begin
  perform public.record_chatwoot_account_absence_review(r.organization_id,r.mapping_id,1,r.authorized_owner_id,
  r.origin,r.platform_app_id,r.inventory_account_ids,clock_timestamp()-interval '3 minutes','ci-stale-review');
  raise exception 'stale complete inventory accepted';
 exception when others then if sqlerrm='stale complete inventory accepted' then raise; end if; end;
end $$;
reset role;
do $$ begin
 begin
  update public.chatwoot_account_reconciliation_receipts set expires_at=clock_timestamp()+interval '1 hour' where request_key='ci-full-review';
  raise exception 'receipt extension allowed';
 exception when others then if sqlerrm='receipt extension allowed' then raise; end if; end;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000d901',false);
do $$ declare r public.chatwoot_account_reconciliation_receipts%rowtype; first boolean; replay boolean; begin
 select * into r from public.chatwoot_account_reconciliation_receipts where request_key='ci-full-review';
 begin
  perform public.claim_chatwoot_account_receipt_recovery(r.organization_id,r.mapping_id,2,r.id,r.origin,r.original_request_key);
  raise exception 'bad version accepted';
 exception when others then if sqlerrm='bad version accepted' then raise; end if; end;
 begin
  perform public.claim_chatwoot_account_receipt_recovery(r.organization_id,r.mapping_id,1,r.id,'https://wrong.example.com',r.original_request_key);
  raise exception 'wrong origin accepted';
 exception when others then if sqlerrm='wrong origin accepted' then raise; end if; end;
 begin
  perform public.claim_chatwoot_account_receipt_recovery(r.organization_id,r.mapping_id,1,r.id,r.origin,'different-original-key');
  raise exception 'different original claim accepted';
 exception when others then if sqlerrm='different original claim accepted' then raise; end if; end;
 first:=public.claim_chatwoot_account_receipt_recovery(r.organization_id,r.mapping_id,1,r.id,r.origin,r.original_request_key);
 replay:=public.claim_chatwoot_account_receipt_recovery(r.organization_id,r.mapping_id,1,r.id,r.origin,r.original_request_key);
 if first is distinct from true or replay is distinct from false then raise exception 'Account recovery replay unsafe'; end if;
 if (select count(*) from public.chatwoot_bridge_command_claims where organization_id=r.organization_id and command_type='CLAIM_ACCOUNT_EXTERNAL_CREATE')<>1 then
  raise exception 'Original Account claim changed';
 end if;
 if coalesce(current_setting('smartvisions.chatwoot_bridge_command',true),'')='1' then raise exception 'Governed context leaked'; end if;
end $$;
reset role;
update public.organization_members set role='ADMIN' where organization_id='00000000-0000-0000-0000-00000000d901';
set role authenticated;
do $$ begin
 if exists(select 1 from public.chatwoot_account_reconciliation_receipts where request_key='ci-full-review') then raise exception 'Revoked OWNER still sees review'; end if;
 begin
  perform public.claim_chatwoot_account_receipt_recovery('00000000-0000-0000-0000-00000000d901',gen_random_uuid(),1,gen_random_uuid(),'https://inbox.example.com','ci-original-attempt');
  raise exception 'Revoked OWNER reserved recovery';
 exception when others then if sqlerrm='Revoked OWNER reserved recovery' then raise; end if; end;
end $$;
reset role;
rollback;
