-- OMNI-META-SOCIAL: provider-scoped Instagram customer identity.
-- Extends the canonical CRM identity authority; no second customer store.

alter table public.crm_identities
  drop constraint if exists crm_identities_identity_type_check;
alter table public.crm_identities
  add constraint crm_identities_identity_type_check
  check (identity_type in ('EMAIL','PHONE','WHATSAPP','INSTAGRAM','INSTAGRAM_PROVIDER_USER'));

alter table public.crm_identity_links
  drop constraint if exists crm_identity_links_source_type_check;
alter table public.crm_identity_links
  add constraint crm_identity_links_source_type_check
  check (source_type in (
    'BUSINESS_FIELD','EMAIL_INBOUND','WHATSAPP_INBOUND','INSTAGRAM_INBOUND','MANUAL','IMPORT'
  ));

create or replace function public.resolve_instagram_provider_business(
  p_organization_id uuid,
  p_binding_id uuid,
  p_provider_user_id text
)
returns table(business_id uuid, identity_id uuid)
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_value text := trim(coalesce(p_provider_user_id,''));
  v_identity uuid;
  v_count integer;
begin
  if p_organization_id is null or p_binding_id is null or length(v_value) not between 1 and 512 then
    raise exception 'Instagram provider identity scope is required';
  end if;
  if not exists (
    select 1 from public.communication_channel_bindings b
    where b.organization_id=p_organization_id and b.id=p_binding_id
      and b.channel='INSTAGRAM' and b.provider='META' and b.status='ACTIVE'
  ) then raise exception 'Instagram binding is not active'; end if;

  select i.id into v_identity
  from public.crm_identities i
  where i.organization_id=p_organization_id
    and i.identity_type='INSTAGRAM_PROVIDER_USER'
    and i.normalized_value=p_binding_id::text || ':' || v_value
    and i.status='ACTIVE';

  if v_identity is null then return; end if;

  select count(distinct l.business_id)::integer into v_count
  from public.crm_identity_links l
  where l.organization_id=p_organization_id and l.identity_id=v_identity and l.status='ACTIVE';

  if v_count > 1 then raise exception 'Instagram provider identity is ambiguous';
  elsif v_count = 1 then
    return query select l.business_id,l.identity_id
    from public.crm_identity_links l
    where l.organization_id=p_organization_id and l.identity_id=v_identity and l.status='ACTIVE'
    limit 1;
  end if;
end;
$$;

revoke all on function public.resolve_instagram_provider_business(uuid,uuid,text)
from public,anon,authenticated,service_role;
grant execute on function public.resolve_instagram_provider_business(uuid,uuid,text) to service_role;
