-- 0083: private canonical Business-wide Chatwoot role authority.
-- Narrow read primitive only. No mapping mutation and no external Chatwoot call.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated, service_role;

create or replace function private.chatwoot_business_wide_role(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_target_user_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $authority$
declare
  v_actor uuid := auth.uid();
  v_org_role text;
  v_brand_id uuid;
  v_scope_role text;
begin
  if v_actor is null then
    raise exception 'authenticated actor required for canonical Chatwoot role';
  end if;

  if not exists (
    select 1
    from public.organization_members actor
    where actor.organization_id = p_organization_id
      and actor.user_id = v_actor
      and actor.role = 'OWNER'
  ) then
    raise exception 'current Organization OWNER required for canonical Chatwoot role';
  end if;

  select b.brand_id
    into v_brand_id
    from public.tenant_businesses b
    join public.brands br
      on br.organization_id = b.organization_id
     and br.id = b.brand_id
   where b.organization_id = p_organization_id
     and b.id = p_tenant_business_id
     and b.status = 'ACTIVE'
     and br.status = 'ACTIVE';

  if not found then
    raise exception 'ACTIVE tenant Business lineage required for canonical Chatwoot role';
  end if;

  select target.role
    into v_org_role
    from public.organization_members target
   where target.organization_id = p_organization_id
     and target.user_id = p_target_user_id;

  if not found
     or v_org_role not in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER')
  then
    raise exception 'canonical Organization member role unavailable';
  end if;

  if v_org_role = 'OWNER' then
    return 'OWNER';
  end if;

  select msa.role
    into v_scope_role
    from public.member_scope_assignments msa
   where msa.organization_id = p_organization_id
     and msa.user_id = p_target_user_id
     and msa.scope_type = 'BUSINESS'
     and msa.tenant_business_id = p_tenant_business_id
     and msa.attributes = '{}'::jsonb;

  if found then
    return v_scope_role;
  end if;

  select msa.role
    into v_scope_role
    from public.member_scope_assignments msa
   where msa.organization_id = p_organization_id
     and msa.user_id = p_target_user_id
     and msa.scope_type = 'BRAND'
     and msa.brand_id = v_brand_id
     and msa.attributes = '{}'::jsonb;

  return coalesce(v_scope_role, v_org_role);
end;
$authority$;

revoke all on function private.chatwoot_business_wide_role(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.chatwoot_business_wide_role(uuid,uuid,uuid)
  to authenticated;

comment on function private.chatwoot_business_wide_role(uuid,uuid,uuid) is
  'Read-only canonical Smart Core role projection for one ACTIVE tenant Business. OWNER-authenticated only; conditional scope assignments fail closed without trusted attributes.';
