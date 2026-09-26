-- 0093: COMM-UNIFIED-INBOX scoped read boundary.
--
-- Security package only. This migration does NOT activate Chatwoot provisioning,
-- does NOT send messages and does NOT make Chatwoot a CRM/IAM source of truth.
--
-- Canonical authorities remain:
-- - organization_members + member_scope_assignments for IAM;
-- - Brand -> tenant Business -> Branch -> Department -> Team for tenant scope;
-- - sales_conversations / leads / businesses / CRM identities for Smart Core truth.
--
-- The new table is a Communication Plane projection that binds an existing
-- Smart Core sales_conversation to exact Chatwoot/hierarchy identifiers so
-- PostgreSQL RLS can fail closed for scoped-only operators.

create table if not exists public.unified_inbox_conversation_projections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.sales_conversations(id) on delete cascade,
  brand_id uuid not null,
  tenant_business_id uuid not null,
  branch_id uuid not null,
  department_id uuid,
  team_id uuid,
  communication_channel_binding_id uuid not null,
  chatwoot_inbox_mapping_id uuid not null,
  chatwoot_team_mapping_id uuid,
  chatwoot_conversation_display_id integer not null
    check (chatwoot_conversation_display_id > 0),
  chatwoot_conversation_uuid uuid,
  chatwoot_contact_id bigint
    check (chatwoot_contact_id is null or chatwoot_contact_id > 0),
  chatwoot_assignee_user_id bigint
    check (chatwoot_assignee_user_id is null or chatwoot_assignee_user_id > 0),
  chatwoot_status text
    check (
      chatwoot_status is null
      or (
        length(chatwoot_status) between 1 and 40
        and chatwoot_status = lower(chatwoot_status)
        and chatwoot_status ~ '^[a-z0-9_:-]+$'
      )
    ),
  labels text[] not null default '{}'::text[],
  last_activity_at timestamptz,
  source_event_id uuid references public.chatwoot_webhook_events(id) on delete restrict,
  lifecycle_status text not null default 'ACTIVE'
    check (lifecycle_status in ('ACTIVE','DEGRADED','ARCHIVED')),
  version integer not null default 1 check (version >= 1),
  last_request_key text not null
    check (length(trim(last_request_key)) between 1 and 200),
  last_reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),
  unique (organization_id, conversation_id),
  unique (
    organization_id,
    tenant_business_id,
    chatwoot_conversation_display_id
  ),

  foreign key (organization_id, brand_id)
    references public.brands(organization_id, id)
    on delete restrict,
  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict,
  foreign key (organization_id, branch_id)
    references public.branches(organization_id, id)
    on delete restrict,
  foreign key (organization_id, department_id)
    references public.departments(organization_id, id)
    on delete restrict,
  foreign key (organization_id, team_id)
    references public.teams(organization_id, id)
    on delete restrict,
  foreign key (organization_id, communication_channel_binding_id)
    references public.communication_channel_bindings(organization_id, id)
    on delete restrict,
  foreign key (organization_id, chatwoot_inbox_mapping_id)
    references public.chatwoot_inbox_mappings(organization_id, id)
    on delete restrict,
  foreign key (organization_id, chatwoot_team_mapping_id)
    references public.chatwoot_team_mappings(organization_id, id)
    on delete restrict,

  check (department_id is not null or team_id is null),
  check (team_id is not null or chatwoot_team_mapping_id is null)
);

create index if not exists unified_inbox_projection_scope_activity_idx
  on public.unified_inbox_conversation_projections(
    organization_id,
    tenant_business_id,
    branch_id,
    department_id,
    team_id,
    last_activity_at desc,
    conversation_id
  )
  where lifecycle_status in ('ACTIVE','DEGRADED');

create index if not exists unified_inbox_projection_chatwoot_inbox_idx
  on public.unified_inbox_conversation_projections(
    organization_id,
    chatwoot_inbox_mapping_id,
    chatwoot_conversation_display_id
  )
  where lifecycle_status in ('ACTIVE','DEGRADED');

create index if not exists unified_inbox_projection_contact_idx
  on public.unified_inbox_conversation_projections(
    organization_id,
    tenant_business_id,
    chatwoot_contact_id
  )
  where chatwoot_contact_id is not null
    and lifecycle_status in ('ACTIVE','DEGRADED');

alter table public.unified_inbox_conversation_projections enable row level security;

-- Projection identity and tenant lineage are immutable. Communication state may
-- be reconciled later, but only through an explicit reconciler command path.
create or replace function public.enforce_unified_inbox_projection_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_conversation_org uuid;
begin
  if tg_op = 'DELETE' then
    raise exception 'Unified Inbox projections use lifecycle state; DELETE is not permitted';
  end if;

  if current_setting('smartvisions.unified_inbox_projection_command', true) <> '1' then
    raise exception 'Unified Inbox projection mutation requires reconciler command path';
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.conversation_id is distinct from old.conversation_id
       or new.brand_id is distinct from old.brand_id
       or new.tenant_business_id is distinct from old.tenant_business_id
       or new.branch_id is distinct from old.branch_id
       or new.department_id is distinct from old.department_id
       or new.team_id is distinct from old.team_id
       or new.communication_channel_binding_id is distinct from old.communication_channel_binding_id
       or new.chatwoot_inbox_mapping_id is distinct from old.chatwoot_inbox_mapping_id
       or new.chatwoot_team_mapping_id is distinct from old.chatwoot_team_mapping_id
       or new.chatwoot_conversation_display_id is distinct from old.chatwoot_conversation_display_id
       or (
         old.chatwoot_conversation_uuid is not null
         and new.chatwoot_conversation_uuid is distinct from old.chatwoot_conversation_uuid
       )
    then
      raise exception 'Unified Inbox projection identity/scope is immutable';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'Unified Inbox projection version must increment by exactly one';
    end if;

    if new.last_request_key = old.last_request_key then
      raise exception 'Unified Inbox projection update requires a new request key';
    end if;

    if old.lifecycle_status = 'ARCHIVED' then
      raise exception 'ARCHIVED Unified Inbox projection is terminal';
    end if;
  elsif new.version <> 1 or new.lifecycle_status = 'ARCHIVED' then
    raise exception 'new Unified Inbox projection must start live at version 1';
  end if;

  select sc.organization_id
    into v_conversation_org
    from public.sales_conversations sc
   where sc.id = new.conversation_id;

  if v_conversation_org is null
     or v_conversation_org <> new.organization_id
  then
    raise exception 'Unified Inbox projection conversation tenant mismatch';
  end if;

  if not exists (
    select 1
      from public.tenant_businesses b
     where b.organization_id = new.organization_id
       and b.id = new.tenant_business_id
       and b.brand_id = new.brand_id
  ) then
    raise exception 'Unified Inbox projection Business lineage mismatch';
  end if;

  if not exists (
    select 1
      from public.branches br
     where br.organization_id = new.organization_id
       and br.id = new.branch_id
       and br.tenant_business_id = new.tenant_business_id
  ) then
    raise exception 'Unified Inbox projection Branch lineage mismatch';
  end if;

  if new.department_id is not null
     and not exists (
       select 1
         from public.departments d
        where d.organization_id = new.organization_id
          and d.id = new.department_id
          and d.branch_id = new.branch_id
     )
  then
    raise exception 'Unified Inbox projection Department lineage mismatch';
  end if;

  if new.team_id is not null
     and not exists (
       select 1
         from public.teams t
        where t.organization_id = new.organization_id
          and t.id = new.team_id
          and t.department_id = new.department_id
     )
  then
    raise exception 'Unified Inbox projection Team lineage mismatch';
  end if;

  if not exists (
    select 1
      from public.communication_channel_bindings cb
     where cb.organization_id = new.organization_id
       and cb.id = new.communication_channel_binding_id
       and cb.tenant_business_id = new.tenant_business_id
       and cb.branch_id = new.branch_id
       and cb.status = 'ACTIVE'
  ) then
    raise exception 'Unified Inbox projection channel binding mismatch';
  end if;

  if not exists (
    select 1
      from public.chatwoot_inbox_mappings im
     where im.organization_id = new.organization_id
       and im.id = new.chatwoot_inbox_mapping_id
       and im.tenant_business_id = new.tenant_business_id
       and im.branch_id = new.branch_id
       and im.communication_channel_binding_id = new.communication_channel_binding_id
       and im.chatwoot_inbox_id is not null
       and im.status in ('ACTIVE','DEGRADED')
  ) then
    raise exception 'Unified Inbox projection Chatwoot Inbox mapping mismatch';
  end if;

  if new.chatwoot_team_mapping_id is not null
     and not exists (
       select 1
         from public.chatwoot_team_mappings tm
        where tm.organization_id = new.organization_id
          and tm.id = new.chatwoot_team_mapping_id
          and tm.tenant_business_id = new.tenant_business_id
          and tm.smart_team_id = new.team_id
          and tm.chatwoot_team_id is not null
          and tm.status in ('ACTIVE','DEGRADED')
     )
  then
    raise exception 'Unified Inbox projection Chatwoot Team mapping mismatch';
  end if;

  if new.source_event_id is not null
     and not exists (
       select 1
         from public.chatwoot_webhook_events e
        where e.id = new.source_event_id
          and e.organization_id = new.organization_id
          and e.tenant_business_id = new.tenant_business_id
          and e.chatwoot_inbox_mapping_id = new.chatwoot_inbox_mapping_id
     )
  then
    raise exception 'Unified Inbox projection webhook evidence mismatch';
  end if;

  if exists (
    select 1
      from unnest(new.labels) value
     where value is null
        or length(trim(value)) not between 1 and 120
  ) then
    raise exception 'Unified Inbox projection labels must be bounded non-empty values';
  end if;

  new.labels := array(
    select distinct trim(value)
      from unnest(new.labels) value
     order by trim(value)
  );
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists unified_inbox_projection_contract
  on public.unified_inbox_conversation_projections;
create trigger unified_inbox_projection_contract
before insert or update or delete
on public.unified_inbox_conversation_projections
for each row execute function public.enforce_unified_inbox_projection_contract();

-- SQL equivalent of lib/business-os/control-plane.ts effectiveRoleForScope for
-- an empty trusted policy-attributes context. Non-empty assignment attributes
-- intentionally fail closed until a trusted server policy context is provided.
create or replace function public.unified_inbox_effective_role(
  p_organization_id uuid,
  p_brand_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_department_id uuid,
  p_team_id uuid
)
returns text
language plpgsql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_role text;
  v_scope_role text;
begin
  if v_user_id is null then
    return null;
  end if;

  select m.role
    into v_org_role
    from public.organization_members m
   where m.organization_id = p_organization_id
     and m.user_id = v_user_id;

  if v_org_role is null then
    return null;
  end if;

  if v_org_role = 'OWNER' then
    return 'OWNER';
  end if;

  select a.role
    into v_scope_role
    from public.member_scope_assignments a
   where a.organization_id = p_organization_id
     and a.user_id = v_user_id
     and a.attributes = '{}'::jsonb
     and (
       (a.scope_type = 'TEAM' and a.team_id = p_team_id)
       or (a.scope_type = 'DEPARTMENT' and a.department_id = p_department_id)
       or (a.scope_type = 'BRANCH' and a.branch_id = p_branch_id)
       or (a.scope_type = 'BUSINESS' and a.tenant_business_id = p_tenant_business_id)
       or (a.scope_type = 'BRAND' and a.brand_id = p_brand_id)
     )
   order by case a.scope_type
     when 'TEAM' then 5
     when 'DEPARTMENT' then 4
     when 'BRANCH' then 3
     when 'BUSINESS' then 2
     when 'BRAND' then 1
     else 0
   end desc
   limit 1;

  return coalesce(v_scope_role, v_org_role);
end;
$$;

create or replace function public.can_access_unified_inbox_scope(
  p_organization_id uuid,
  p_brand_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_department_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
  select coalesce(
    public.unified_inbox_effective_role(
      p_organization_id,
      p_brand_id,
      p_tenant_business_id,
      p_branch_id,
      p_department_id,
      p_team_id
    ) in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT'),
    false
  );
$$;

drop policy if exists unified_inbox_projection_scope_read
  on public.unified_inbox_conversation_projections;
create policy unified_inbox_projection_scope_read
on public.unified_inbox_conversation_projections
for select
to authenticated
using (
  lifecycle_status in ('ACTIVE','DEGRADED')
  and public.can_access_unified_inbox_scope(
    organization_id,
    brand_id,
    tenant_business_id,
    branch_id,
    department_id,
    team_id
  )
);

create or replace function public.can_read_unified_inbox_conversation(
  p_organization_id uuid,
  p_conversation_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
  select
    public.is_org_owner(p_organization_id)
    or exists (
      select 1
        from public.unified_inbox_conversation_projections p
       where p.organization_id = p_organization_id
         and p.conversation_id = p_conversation_id
         and p.lifecycle_status in ('ACTIVE','DEGRADED')
         and public.can_access_unified_inbox_scope(
           p.organization_id,
           p.brand_id,
           p.tenant_business_id,
           p.branch_id,
           p.department_id,
           p.team_id
         )
    );
$$;

create or replace function public.can_read_unified_inbox_lead(
  p_organization_id uuid,
  p_lead_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
  select
    public.is_org_owner(p_organization_id)
    or exists (
      select 1
        from public.sales_conversations sc
       where sc.organization_id = p_organization_id
         and sc.lead_id = p_lead_id
         and public.can_read_unified_inbox_conversation(sc.organization_id, sc.id)
    );
$$;

create or replace function public.can_read_unified_inbox_business(
  p_organization_id uuid,
  p_business_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, auth, pg_catalog
as $$
  select
    public.is_org_owner(p_organization_id)
    or exists (
      select 1
        from public.leads l
       where l.organization_id = p_organization_id
         and l.business_id = p_business_id
         and public.can_read_unified_inbox_lead(l.organization_id, l.id)
    );
$$;

-- Replace legacy Organization-member ALL policies with scoped SELECT and
-- OWNER-only authenticated mutation. service_role keeps its existing runtime
-- authority and bypasses RLS; it does not become canonical user/scope authority.
drop policy if exists org_member_sales_conversations on public.sales_conversations;
drop policy if exists org_member_conversation_messages on public.conversation_messages;
drop policy if exists org_member_operator_briefs on public.operator_briefs;
drop policy if exists org_member_agent_runs on public.agent_runs;
drop policy if exists org_member_leads on public.leads;
drop policy if exists org_member_businesses on public.businesses;
drop policy if exists crm_identities_member_read on public.crm_identities;
drop policy if exists crm_identity_links_member_read on public.crm_identity_links;

drop policy if exists unified_inbox_sales_conversations_read on public.sales_conversations;
create policy unified_inbox_sales_conversations_read
on public.sales_conversations
for select
to authenticated
using (public.can_read_unified_inbox_conversation(organization_id, id));

drop policy if exists unified_inbox_sales_conversations_owner_mutation on public.sales_conversations;
create policy unified_inbox_sales_conversations_owner_mutation
on public.sales_conversations
for all
to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists unified_inbox_conversation_messages_read on public.conversation_messages;
create policy unified_inbox_conversation_messages_read
on public.conversation_messages
for select
to authenticated
using (
  public.can_read_unified_inbox_conversation(organization_id, conversation_id)
);

drop policy if exists unified_inbox_conversation_messages_owner_mutation on public.conversation_messages;
create policy unified_inbox_conversation_messages_owner_mutation
on public.conversation_messages
for all
to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists unified_inbox_operator_briefs_read on public.operator_briefs;
create policy unified_inbox_operator_briefs_read
on public.operator_briefs
for select
to authenticated
using (
  public.can_read_unified_inbox_conversation(organization_id, conversation_id)
);

drop policy if exists unified_inbox_operator_briefs_owner_mutation on public.operator_briefs;
create policy unified_inbox_operator_briefs_owner_mutation
on public.operator_briefs
for all
to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists unified_inbox_agent_runs_read on public.agent_runs;
create policy unified_inbox_agent_runs_read
on public.agent_runs
for select
to authenticated
using (
  public.is_org_owner(organization_id)
  or (
    conversation_id is not null
    and public.can_read_unified_inbox_conversation(organization_id, conversation_id)
  )
);

drop policy if exists unified_inbox_agent_runs_owner_mutation on public.agent_runs;
create policy unified_inbox_agent_runs_owner_mutation
on public.agent_runs
for all
to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists unified_inbox_leads_read on public.leads;
create policy unified_inbox_leads_read
on public.leads
for select
to authenticated
using (public.can_read_unified_inbox_lead(organization_id, id));

drop policy if exists unified_inbox_leads_owner_mutation on public.leads;
create policy unified_inbox_leads_owner_mutation
on public.leads
for all
to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists unified_inbox_businesses_read on public.businesses;
create policy unified_inbox_businesses_read
on public.businesses
for select
to authenticated
using (public.can_read_unified_inbox_business(organization_id, id));

drop policy if exists unified_inbox_businesses_owner_mutation on public.businesses;
create policy unified_inbox_businesses_owner_mutation
on public.businesses
for all
to authenticated
using (public.is_org_owner(organization_id))
with check (public.is_org_owner(organization_id));

drop policy if exists unified_inbox_crm_identity_links_read on public.crm_identity_links;
create policy unified_inbox_crm_identity_links_read
on public.crm_identity_links
for select
to authenticated
using (
  public.can_read_unified_inbox_business(organization_id, business_id)
);

drop policy if exists unified_inbox_crm_identities_read on public.crm_identities;
create policy unified_inbox_crm_identities_read
on public.crm_identities
for select
to authenticated
using (
  public.is_org_owner(organization_id)
  or exists (
    select 1
      from public.crm_identity_links l
     where l.organization_id = crm_identities.organization_id
       and l.identity_id = crm_identities.id
       and public.can_read_unified_inbox_business(
         l.organization_id,
         l.business_id
       )
  )
);

-- No authenticated or service-role write path to the projection exists in this
-- security package. The runtime reconciler is deliberately added only in the
-- subsequent delivery package after its idempotency/reconciliation contract is
-- reviewed. Superuser migrations/tests can set the transaction-local command
-- marker to create fixtures.
revoke all on table public.unified_inbox_conversation_projections
  from public, anon, authenticated, service_role;
grant select on table public.unified_inbox_conversation_projections
  to authenticated, service_role;

revoke all on function public.enforce_unified_inbox_projection_contract()
  from public, anon, authenticated, service_role;
revoke all on function public.unified_inbox_effective_role(
  uuid, uuid, uuid, uuid, uuid, uuid
) from public, anon;
revoke all on function public.can_access_unified_inbox_scope(
  uuid, uuid, uuid, uuid, uuid, uuid
) from public, anon;
revoke all on function public.can_read_unified_inbox_conversation(uuid, uuid)
  from public, anon;
revoke all on function public.can_read_unified_inbox_lead(uuid, uuid)
  from public, anon;
revoke all on function public.can_read_unified_inbox_business(uuid, uuid)
  from public, anon;

grant execute on function public.unified_inbox_effective_role(
  uuid, uuid, uuid, uuid, uuid, uuid
) to authenticated, service_role;
grant execute on function public.can_access_unified_inbox_scope(
  uuid, uuid, uuid, uuid, uuid, uuid
) to authenticated, service_role;
grant execute on function public.can_read_unified_inbox_conversation(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.can_read_unified_inbox_lead(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.can_read_unified_inbox_business(uuid, uuid)
  to authenticated, service_role;
