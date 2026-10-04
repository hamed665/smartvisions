-- PR3 Customer Dashboard + Connections read boundary.
-- Reuses the PR2 customer Business scope authority and existing communication
-- binding / integration authorities. No second connection or IAM model is added.

drop policy if exists communication_channel_bindings_admin_read
  on public.communication_channel_bindings;
drop policy if exists communication_channel_bindings_customer_scoped_read
  on public.communication_channel_bindings;

create policy communication_channel_bindings_customer_scoped_read
  on public.communication_channel_bindings
  for select
  to authenticated
  using (
    public.is_org_owner(organization_id)
    or exists (
      select 1
        from public.tenant_businesses b
       where b.organization_id = communication_channel_bindings.organization_id
         and b.id = communication_channel_bindings.tenant_business_id
         and public.customer_business_effective_role(
           communication_channel_bindings.organization_id,
           communication_channel_bindings.tenant_business_id,
           b.brand_id
         ) is not null
    )
  );

-- The old Organization-member read and Unified Inbox business-wide ALL policy
-- predate customer Business scoping. Service-role runtime is unaffected by RLS.
drop policy if exists org_member_integration_connections_read
  on public.integration_connections;
drop policy if exists unified_inbox_business_wide_boundary
  on public.integration_connections;
drop policy if exists integration_connections_customer_scoped_read
  on public.integration_connections;

-- A nested RLS lookup from the integration policy can evaluate under the
-- integration table owner's context and admit sibling-Business bindings.
-- Resolve visibility from the authenticated actor explicitly instead.
create or replace function public.customer_integration_connection_visible(
  p_organization_id uuid,
  p_integration_connection_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $customer_integration_scope$
  select
    (select auth.uid()) is not null
    and (
      exists (
        select 1
          from public.organization_members m
         where m.organization_id = p_organization_id
           and m.user_id = (select auth.uid())
           and m.role = 'OWNER'
      )
      or exists (
        select 1
          from public.communication_channel_bindings cb
          join public.tenant_businesses b
            on b.organization_id = cb.organization_id
           and b.id = cb.tenant_business_id
         where cb.organization_id = p_organization_id
           and cb.integration_connection_id = p_integration_connection_id
           and cb.status = 'ACTIVE'
           and exists (
             select 1
               from public.organization_members m
              where m.organization_id = p_organization_id
                and m.user_id = (select auth.uid())
           )
           and exists (
             select 1
               from public.member_scope_assignments a
              where a.organization_id = p_organization_id
                and a.user_id = (select auth.uid())
                and a.attributes = '{}'::jsonb
                and (
                  (a.scope_type = 'BUSINESS'
                   and a.tenant_business_id = cb.tenant_business_id)
                  or
                  (a.scope_type = 'BRAND'
                   and a.brand_id = b.brand_id)
                )
           )
      )
    );
$customer_integration_scope$;

revoke all on function public.customer_integration_connection_visible(uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_integration_connection_visible(uuid,uuid)
  to authenticated;

create policy integration_connections_customer_scoped_read
  on public.integration_connections
  for select
  to authenticated
  using (
    public.customer_integration_connection_visible(
      organization_id,
      id
    )
  );

-- DML remains governed by the existing OWNER RLS policies. These privileges
-- are not required by the Data API and bypass useful row-level intent.
revoke truncate, references, trigger
  on table public.integration_connections
  from authenticated;

comment on policy communication_channel_bindings_customer_scoped_read
  on public.communication_channel_bindings is
  'OWNER sees Organization bindings; non-OWNER customers see only bindings for Businesses admitted by canonical customer Business scope.';

comment on policy integration_connections_customer_scoped_read
  on public.integration_connections is
  'OWNER sees Organization integration rows; non-OWNER customers see only integrations referenced by an ACTIVE binding in a canonically visible Business.';
