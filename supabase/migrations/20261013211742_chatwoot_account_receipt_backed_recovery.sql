-- Protected evidence for the existing Account plane; original claims stay immutable.
create table public.chatwoot_account_reconciliation_receipts (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 tenant_business_id uuid not null, mapping_id uuid not null,
 mapping_version integer not null check(mapping_version>0),
 original_request_key text not null, authorized_owner_id uuid not null,
 origin text not null check(origin ~ '^https://[^/?#]+$'),
 platform_app_id integer not null check(platform_app_id>0),
 inventory_account_ids jsonb not null check(jsonb_typeof(inventory_account_ids)='array'),
 observed_at timestamptz not null, expires_at timestamptz not null,
 request_key text not null check(length(request_key) between 1 and 200),
 unique(organization_id,request_key),
 foreign key(organization_id,mapping_id) references public.chatwoot_account_mappings(organization_id,id),
 foreign key(organization_id,tenant_business_id) references public.tenant_businesses(organization_id,id),
 foreign key(organization_id,authorized_owner_id) references public.organization_members(organization_id,user_id),
 foreign key(organization_id,original_request_key) references public.chatwoot_bridge_command_claims(organization_id,request_key),
 check(expires_at>observed_at and expires_at-observed_at<=interval '15 minutes')
);
create index chatwoot_account_receipt_scope on public.chatwoot_account_reconciliation_receipts(organization_id,mapping_id,mapping_version,observed_at desc);
create index chatwoot_account_receipt_tenant on public.chatwoot_account_reconciliation_receipts(organization_id,tenant_business_id);
create index chatwoot_account_receipt_owner on public.chatwoot_account_reconciliation_receipts(organization_id,authorized_owner_id);
create index chatwoot_account_receipt_claim on public.chatwoot_account_reconciliation_receipts(organization_id,original_request_key);
alter table public.chatwoot_account_reconciliation_receipts enable row level security;
create policy chatwoot_account_receipt_owner_read on public.chatwoot_account_reconciliation_receipts
for select to authenticated using(authorized_owner_id=(select auth.uid()) and exists(
 select 1 from public.organization_members m where m.organization_id=chatwoot_account_reconciliation_receipts.organization_id
 and m.user_id=(select auth.uid()) and m.role='OWNER'));
create function public.guard_chatwoot_account_receipt() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' or coalesce(current_setting('smartvisions.chatwoot_account_receipt',true),'')<>'1' then
  raise exception 'Account review requires immutable governed recording';
 end if;
 return new;
end; $$;
create trigger chatwoot_account_receipt_immutable before insert or update or delete on public.chatwoot_account_reconciliation_receipts
for each row execute function public.guard_chatwoot_account_receipt();

-- Trusted operator records COMPLETE Super Admin absence review, not an empty scoped API list.
create function public.record_chatwoot_account_absence_review(
 p_org uuid,p_mapping uuid,p_version integer,p_owner uuid,p_origin text,p_platform_app_id integer,
 p_inventory_account_ids jsonb,p_observed_at timestamptz,p_request_key text
) returns public.chatwoot_account_reconciliation_receipts
language plpgsql security invoker set search_path='' as $$
declare m public.chatwoot_account_mappings%rowtype; k text; r public.chatwoot_account_reconciliation_receipts%rowtype;
begin
 select * into m from public.chatwoot_account_mappings where organization_id=p_org and id=p_mapping;
 if not found or m.version<>p_version or m.status not in ('PROVISIONING','DEGRADED') or m.chatwoot_account_id is not null
 or p_observed_at is null or p_observed_at>clock_timestamp() or p_observed_at<clock_timestamp()-interval '2 minutes'
 or jsonb_typeof(p_inventory_account_ids) is distinct from 'array' or jsonb_array_length(p_inventory_account_ids)>500
 or exists(select 1 from jsonb_array_elements_text(p_inventory_account_ids) x where x !~ '^[1-9][0-9]{0,9}$')
 or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=p_owner and role='OWNER') then
  raise exception 'Invalid fresh complete-inventory Account review';
 end if;
 select request_key into k from public.chatwoot_bridge_command_claims where organization_id=p_org and entity_id=p_mapping
 and entity_type='CHATWOOT_ACCOUNT_MAPPING' and command_type='CLAIM_ACCOUNT_EXTERNAL_CREATE';
 if k is null then raise exception 'Original Account claim required'; end if;
 perform set_config('smartvisions.chatwoot_account_receipt','1',true);
 insert into public.chatwoot_account_reconciliation_receipts(organization_id,tenant_business_id,mapping_id,mapping_version,
 original_request_key,authorized_owner_id,origin,platform_app_id,inventory_account_ids,observed_at,expires_at,request_key)
 values(p_org,m.tenant_business_id,m.id,m.version,k,p_owner,p_origin,p_platform_app_id,p_inventory_account_ids,p_observed_at,
 p_observed_at+interval '15 minutes',p_request_key) returning * into r;
 perform set_config('smartvisions.chatwoot_account_receipt','0',true);
 insert into public.audit_logs(organization_id,actor_type,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id)
 values(p_org,'SYSTEM','CHATWOOT_ACCOUNT_ABSENCE_REVIEW_RECORDED','CHATWOOT_ACCOUNT_MAPPING',m.id::text,
 jsonb_build_object('receiptId',r.id,'source','COMPLETE_SUPER_ADMIN_INVENTORY','observedAt',r.observed_at,
 'inventoryAccountCount',jsonb_array_length(r.inventory_account_ids),'originalClaimPreserved',true),p_request_key,m.tenant_business_id);
 return r;
end; $$;

alter table public.chatwoot_bridge_command_claims drop constraint chatwoot_bridge_command_claims_command_type_check;
alter table public.chatwoot_bridge_command_claims add constraint chatwoot_bridge_command_claims_command_type_check check(command_type in (
 'CREATE_CHANNEL_BINDING','SET_CHANNEL_BINDING_LIFECYCLE','CREATE_ACCOUNT_MAPPING','SET_ACCOUNT_MAPPING_STATE',
 'CREATE_USER_MAPPING','SET_USER_MAPPING_STATE','CREATE_ACCOUNT_MEMBERSHIP','SET_ACCOUNT_MEMBERSHIP_STATE',
 'CREATE_INBOX_MAPPING','SET_INBOX_MAPPING_STATE','CREATE_TEAM_MAPPING','SET_TEAM_MAPPING_STATE',
 'CLAIM_ACCOUNT_EXTERNAL_CREATE','SET_CONVERSATION_STATUS','SET_CONVERSATION_LABELS','SET_CONVERSATION_ASSIGNEE',
 'SET_CONVERSATION_TEAM','CREATE_INTERNAL_NOTE','RECONCILE_ACCOUNT_EXTERNAL_CREATE'));
create unique index chatwoot_account_one_receipt_recovery on public.chatwoot_bridge_command_claims(organization_id,entity_id)
where command_type='RECONCILE_ACCOUNT_EXTERNAL_CREATE' and entity_type='CHATWOOT_ACCOUNT_MAPPING';
create function public.claim_chatwoot_account_receipt_recovery(p_org uuid,p_mapping uuid,p_version integer,p_receipt uuid,p_origin text,p_original_key text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare m public.chatwoot_account_mappings%rowtype; r public.chatwoot_account_reconciliation_receipts%rowtype; k text;
begin
 if auth.uid() is null or not public.chatwoot_bridge_can_manage(p_org) then raise exception 'Current OWNER required'; end if;
 select * into m from public.chatwoot_account_mappings where organization_id=p_org and id=p_mapping for update;
 if not found or m.version<>p_version or m.status not in ('PROVISIONING','DEGRADED') or m.chatwoot_account_id is not null
 or not exists(select 1 from public.tenant_businesses where organization_id=p_org and id=m.tenant_business_id and status='ACTIVE') then
  raise exception 'Account recovery scope changed';
 end if;
 select * into r from public.chatwoot_account_reconciliation_receipts where id=p_receipt and organization_id=p_org
 and mapping_id=p_mapping and mapping_version=p_version and tenant_business_id=m.tenant_business_id
 and authorized_owner_id=auth.uid() and observed_at<=clock_timestamp() and expires_at>clock_timestamp();
 if not found or r.origin is distinct from p_origin or r.original_request_key is distinct from p_original_key then
  raise exception 'Fresh exact Account absence review required';
 end if;
 select request_key into k from public.chatwoot_bridge_command_claims where organization_id=p_org and entity_id=p_mapping
 and entity_type='CHATWOOT_ACCOUNT_MAPPING' and command_type='CLAIM_ACCOUNT_EXTERNAL_CREATE';
 if k is distinct from p_original_key then raise exception 'Original Account claim mismatch'; end if;
 if exists(select 1 from public.chatwoot_bridge_command_claims where organization_id=p_org and entity_id=p_mapping and command_type='RECONCILE_ACCOUNT_EXTERNAL_CREATE') then return false; end if;
 perform set_config('smartvisions.chatwoot_bridge_command','1',true);
 insert into public.chatwoot_bridge_command_claims(organization_id,request_key,command_type,entity_type,entity_id,applied_version,payload_hash,created_by_user_id)
 values(p_org,'account-recovery:'||p_mapping::text,'RECONCILE_ACCOUNT_EXTERNAL_CREATE','CHATWOOT_ACCOUNT_MAPPING',p_mapping,p_version,
 encode(extensions.digest(jsonb_build_object('originalClaim',k,'receiptId',p_receipt,'mappingId',p_mapping,'version',p_version)::text,'sha256'),'hex'),auth.uid());
 perform set_config('smartvisions.chatwoot_bridge_command','0',true);
 insert into public.audit_logs(organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id,tenant_business_id)
 values(p_org,'USER',auth.uid()::text,'CHATWOOT_ACCOUNT_RECEIPT_RECOVERY_CLAIMED','CHATWOOT_ACCOUNT_MAPPING',p_mapping::text,
 jsonb_build_object('receiptId',p_receipt,'originalClaimPreserved',true,'executionSource','AUTHORIZED_OWNER_RECONCILE'),'account-recovery:'||p_mapping::text,m.tenant_business_id);
 return true;
end; $$;
revoke all on table public.chatwoot_account_reconciliation_receipts from public,anon,authenticated,service_role;
grant select on table public.chatwoot_account_reconciliation_receipts to authenticated;
grant select,insert on table public.chatwoot_account_reconciliation_receipts to service_role;
revoke all on function public.guard_chatwoot_account_receipt() from public,anon,authenticated;
revoke all on function public.record_chatwoot_account_absence_review(uuid,uuid,integer,uuid,text,integer,jsonb,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.record_chatwoot_account_absence_review(uuid,uuid,integer,uuid,text,integer,jsonb,timestamptz,text) to service_role;
revoke all on function public.claim_chatwoot_account_receipt_recovery(uuid,uuid,integer,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.claim_chatwoot_account_receipt_recovery(uuid,uuid,integer,uuid,text,text) to authenticated;
