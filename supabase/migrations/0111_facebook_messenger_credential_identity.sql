-- 0111: Facebook Messenger tenant credential authority + provider-scoped canonical identity.
-- Reuses communication_channel_bindings, Supabase Vault, and canonical CRM identity tables.

alter table public.crm_identities drop constraint if exists crm_identities_identity_type_check;
alter table public.crm_identities add constraint crm_identities_identity_type_check
check(identity_type in ('EMAIL','PHONE','WHATSAPP','INSTAGRAM','INSTAGRAM_PROVIDER_USER','FACEBOOK_MESSENGER_PROVIDER_USER'));

alter table public.crm_identity_links drop constraint if exists crm_identity_links_source_type_check;
alter table public.crm_identity_links add constraint crm_identity_links_source_type_check
check(source_type in ('BUSINESS_FIELD','EMAIL_INBOUND','WHATSAPP_INBOUND','INSTAGRAM_INBOUND','FACEBOOK_MESSENGER_INBOUND','MANUAL','IMPORT'));

create or replace function public.configure_meta_facebook_messenger_binding(
 p_organization_id uuid,p_binding_id uuid,p_expected_version integer,p_provider_account_id text,
 p_destination_id text,p_destination_label text,p_access_token text,p_request_key text
) returns public.communication_channel_bindings
language plpgsql security invoker set search_path=public,auth,vault,pg_catalog
as $$
declare v_current public.communication_channel_bindings%rowtype;v_updated public.communication_channel_bindings%rowtype;v_actor uuid:=auth.uid();
v_account text:=trim(coalesce(p_provider_account_id,''));v_destination text:=trim(coalesce(p_destination_id,''));v_label text:=nullif(trim(coalesce(p_destination_label,'')),'');
v_token text:=trim(coalesce(p_access_token,''));v_key text:=trim(coalesce(p_request_key,''));v_secret_id uuid;
begin
 if v_actor is null or not public.chatwoot_bridge_can_manage(p_organization_id) then raise exception 'Meta Messenger binding configuration not permitted';end if;
 if p_expected_version is null or p_expected_version<1 or length(v_account) not between 1 and 200 or length(v_destination) not between 1 and 200 or length(v_token)<20 or length(v_key) not between 1 and 200 or (v_label is not null and length(v_label)>200) then raise exception 'invalid Meta Messenger binding configuration';end if;
 select * into v_current from public.communication_channel_bindings where organization_id=p_organization_id and id=p_binding_id for update;
 if not found or v_current.channel<>'FACEBOOK_MESSENGER' or v_current.status<>'ACTIVE' or v_current.version<>p_expected_version then raise exception 'Meta Messenger binding is not eligible for configuration';end if;
 if exists(select 1 from public.communication_channel_bindings s where s.status='ACTIVE' and s.channel='FACEBOOK_MESSENGER' and s.provider='META' and s.provider_destination_id=v_destination and s.id<>v_current.id) then raise exception 'Meta Messenger Page is already bound';end if;
 if v_current.provider_secret_ref is null then
   v_secret_id:=vault.create_secret(v_token,'meta_messenger_binding_'||replace(v_current.id::text,'-',''),'Smart Visions tenant-bound Meta Messenger Page access token',null);
 else
   perform vault.update_secret(v_current.provider_secret_ref,v_token,null,'Smart Visions tenant-bound Meta Messenger Page access token',null);v_secret_id:=v_current.provider_secret_ref;
 end if;
 update public.communication_channel_bindings set provider='META',provider_account_id=v_account,provider_destination_id=v_destination,provider_destination_label=v_label,provider_secret_ref=v_secret_id,version=version+1,last_request_key=v_key,updated_by_user_id=v_actor
 where organization_id=p_organization_id and id=p_binding_id and version=p_expected_version returning * into v_updated;
 if not found then raise exception 'Meta Messenger binding configuration lost optimistic lock';end if;return v_updated;
end $$;

create or replace function public.resolve_meta_facebook_messenger_credential(p_organization_id uuid,p_tenant_business_id uuid,p_branch_id uuid default null)
returns table(binding_id uuid,integration_connection_id uuid,destination_id text,provider_account_id text,access_token text)
language plpgsql security definer set search_path=public,vault,pg_catalog
as $$
declare v_binding public.communication_channel_bindings%rowtype;v_secret text;v_count integer;
begin
 select count(*) into v_count from public.communication_channel_bindings b join public.integration_connections ic on ic.id=b.integration_connection_id and ic.organization_id=b.organization_id
 where b.organization_id=p_organization_id and b.tenant_business_id=p_tenant_business_id and b.status='ACTIVE' and b.channel='FACEBOOK_MESSENGER' and b.provider='META'
 and b.provider_destination_id is not null and b.provider_secret_ref is not null and ic.enabled=true and ic.status='CONNECTED' and ic.provider='META' and ic.channel='FACEBOOK_MESSENGER'
 and ((p_branch_id is not null and b.branch_id=p_branch_id) or (p_branch_id is null and b.branch_id is null));
 if v_count=0 then raise exception 'Meta Messenger tenant credential is not configured';elsif v_count>1 then raise exception 'Meta Messenger tenant credential is ambiguous';end if;
 select b.* into v_binding from public.communication_channel_bindings b join public.integration_connections ic on ic.id=b.integration_connection_id and ic.organization_id=b.organization_id
 where b.organization_id=p_organization_id and b.tenant_business_id=p_tenant_business_id and b.status='ACTIVE' and b.channel='FACEBOOK_MESSENGER' and b.provider='META'
 and b.provider_destination_id is not null and b.provider_secret_ref is not null and ic.enabled=true and ic.status='CONNECTED' and ic.provider='META' and ic.channel='FACEBOOK_MESSENGER'
 and ((p_branch_id is not null and b.branch_id=p_branch_id) or (p_branch_id is null and b.branch_id is null));
 select decrypted_secret into v_secret from vault.decrypted_secrets where id=v_binding.provider_secret_ref;
 if v_secret is null or length(trim(v_secret))<20 then raise exception 'Meta Messenger tenant credential secret is unavailable';end if;
 return query select v_binding.id,v_binding.integration_connection_id,v_binding.provider_destination_id,v_binding.provider_account_id,v_secret;
end $$;

create or replace function public.resolve_facebook_messenger_provider_business(p_organization_id uuid,p_binding_id uuid,p_provider_user_id text)
returns table(business_id uuid,identity_id uuid)
language plpgsql security definer set search_path=public,pg_catalog
as $$
declare v_value text:=trim(coalesce(p_provider_user_id,''));v_identity uuid;v_count integer;
begin
 if p_organization_id is null or p_binding_id is null or length(v_value) not between 1 and 512 then raise exception 'Messenger provider identity scope is required';end if;
 if not exists(select 1 from public.communication_channel_bindings b where b.organization_id=p_organization_id and b.id=p_binding_id and b.channel='FACEBOOK_MESSENGER' and b.provider='META' and b.status='ACTIVE') then raise exception 'Messenger binding is not active';end if;
 select i.id into v_identity from public.crm_identities i where i.organization_id=p_organization_id and i.identity_type='FACEBOOK_MESSENGER_PROVIDER_USER' and i.normalized_value=p_binding_id::text||':'||v_value and i.status='ACTIVE';
 if v_identity is null then return;end if;
 select count(distinct l.business_id)::integer into v_count from public.crm_identity_links l where l.organization_id=p_organization_id and l.identity_id=v_identity and l.status='ACTIVE';
 if v_count>1 then raise exception 'Messenger provider identity is ambiguous';elsif v_count=1 then return query select l.business_id,l.identity_id from public.crm_identity_links l where l.organization_id=p_organization_id and l.identity_id=v_identity and l.status='ACTIVE' limit 1;end if;
end $$;

revoke all on function public.configure_meta_facebook_messenger_binding(uuid,uuid,integer,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.configure_meta_facebook_messenger_binding(uuid,uuid,integer,text,text,text,text,text) to authenticated;
revoke all on function public.resolve_meta_facebook_messenger_credential(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_meta_facebook_messenger_credential(uuid,uuid,uuid) to service_role;
revoke all on function public.resolve_facebook_messenger_provider_business(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.resolve_facebook_messenger_provider_business(uuid,uuid,text) to service_role;
