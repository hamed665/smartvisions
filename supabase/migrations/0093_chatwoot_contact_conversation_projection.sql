-- 0093: Chatwoot Contact + Conversation projection mappings.
--
-- Communication Plane mappings only. These rows do not become CRM truth and
-- never fabricate a Person/Customer/CRM Account from provider display names.
-- Contact identity resolution is optional and evidence-backed; unresolved is a
-- first-class state. Direct client reads/writes stay closed until the
-- scope-aware unified inbox exposes bounded server-side views.

create unique index if not exists chatwoot_webhook_events_org_id_unique
  on public.chatwoot_webhook_events(organization_id, id);

create table if not exists public.chatwoot_contact_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  chatwoot_account_mapping_id uuid not null,
  chatwoot_contact_id bigint not null check (chatwoot_contact_id > 0),
  crm_identity_id uuid,
  resolution_status text not null default 'UNRESOLVED'
    check (resolution_status in ('UNRESOLVED','RESOLVED','CONFLICTED')),
  source_event_id uuid not null,
  version integer not null default 1 check (version >= 1),
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),
  unique (organization_id, tenant_business_id, chatwoot_contact_id),

  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict,
  foreign key (organization_id, chatwoot_account_mapping_id)
    references public.chatwoot_account_mappings(organization_id, id)
    on delete restrict,
  foreign key (organization_id, crm_identity_id)
    references public.crm_identities(organization_id, id)
    on delete restrict,
  foreign key (organization_id, source_event_id)
    references public.chatwoot_webhook_events(organization_id, id)
    on delete restrict,

  check (
    (resolution_status = 'RESOLVED' and crm_identity_id is not null)
    or (resolution_status = 'UNRESOLVED' and crm_identity_id is null)
    or resolution_status = 'CONFLICTED'
  )
);

create index if not exists chatwoot_contact_mappings_account_idx
  on public.chatwoot_contact_mappings(
    organization_id, tenant_business_id, chatwoot_account_mapping_id
  );

create index if not exists chatwoot_contact_mappings_identity_idx
  on public.chatwoot_contact_mappings(organization_id, crm_identity_id)
  where crm_identity_id is not null;

create table if not exists public.chatwoot_conversation_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  chatwoot_account_mapping_id uuid not null,
  chatwoot_inbox_mapping_id uuid not null,
  chatwoot_contact_mapping_id uuid not null,
  chatwoot_team_mapping_id uuid,
  chatwoot_conversation_display_id integer not null
    check (chatwoot_conversation_display_id > 0),
  status text not null
    check (status in ('open','resolved','pending','snoozed')),
  priority text
    check (priority is null or priority in ('low','medium','high','urgent')),
  unread_count integer not null default 0 check (unread_count >= 0),
  can_reply boolean not null default false,
  last_activity_at timestamptz,
  source_event_id uuid not null,
  version integer not null default 1 check (version >= 1),
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, id),
  unique (
    organization_id,
    chatwoot_account_mapping_id,
    chatwoot_conversation_display_id
  ),

  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict,
  foreign key (organization_id, chatwoot_account_mapping_id)
    references public.chatwoot_account_mappings(organization_id, id)
    on delete restrict,
  foreign key (organization_id, chatwoot_inbox_mapping_id)
    references public.chatwoot_inbox_mappings(organization_id, id)
    on delete restrict,
  foreign key (organization_id, chatwoot_contact_mapping_id)
    references public.chatwoot_contact_mappings(organization_id, id)
    on delete restrict,
  foreign key (organization_id, chatwoot_team_mapping_id)
    references public.chatwoot_team_mappings(organization_id, id)
    on delete restrict,
  foreign key (organization_id, source_event_id)
    references public.chatwoot_webhook_events(organization_id, id)
    on delete restrict
);

create index if not exists chatwoot_conversation_mappings_business_activity_idx
  on public.chatwoot_conversation_mappings(
    organization_id, tenant_business_id, last_activity_at desc
  );

create index if not exists chatwoot_conversation_mappings_inbox_idx
  on public.chatwoot_conversation_mappings(
    organization_id, chatwoot_inbox_mapping_id, status, last_activity_at desc
  );

create index if not exists chatwoot_conversation_mappings_team_idx
  on public.chatwoot_conversation_mappings(
    organization_id, chatwoot_team_mapping_id, status, last_activity_at desc
  )
  where chatwoot_team_mapping_id is not null;

alter table public.chatwoot_contact_mappings enable row level security;
alter table public.chatwoot_conversation_mappings enable row level security;

create or replace function public.enforce_chatwoot_contact_projection_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_account public.chatwoot_account_mappings%rowtype;
  v_event public.chatwoot_webhook_events%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.tenant_business_id is distinct from old.tenant_business_id
       or new.chatwoot_account_mapping_id is distinct from old.chatwoot_account_mapping_id
       or new.chatwoot_contact_id is distinct from old.chatwoot_contact_id
       or new.created_at is distinct from old.created_at
    then
      raise exception 'Chatwoot Contact projection identity is immutable';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'Chatwoot Contact projection version must increment by one';
    end if;
  elsif new.version <> 1 then
    raise exception 'new Chatwoot Contact projection must start at version 1';
  end if;

  select *
    into v_account
    from public.chatwoot_account_mappings a
   where a.organization_id = new.organization_id
     and a.id = new.chatwoot_account_mapping_id
     and a.tenant_business_id = new.tenant_business_id
     and a.status = 'ACTIVE';

  if not found then
    raise exception 'ACTIVE Chatwoot Account mapping required for Contact projection';
  end if;

  select *
    into v_event
    from public.chatwoot_webhook_events e
   where e.organization_id = new.organization_id
     and e.id = new.source_event_id
     and e.tenant_business_id = new.tenant_business_id;

  if not found then
    raise exception 'Chatwoot Contact projection source event is invalid';
  end if;

  if new.crm_identity_id is not null
     and not exists (
       select 1
         from public.crm_identities i
        where i.organization_id = new.organization_id
          and i.id = new.crm_identity_id
          and i.status = 'ACTIVE'
     )
  then
    raise exception 'Chatwoot Contact projection CRM identity is not ACTIVE';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.enforce_chatwoot_conversation_projection_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_account public.chatwoot_account_mappings%rowtype;
  v_inbox public.chatwoot_inbox_mappings%rowtype;
  v_contact public.chatwoot_contact_mappings%rowtype;
  v_team public.chatwoot_team_mappings%rowtype;
  v_event public.chatwoot_webhook_events%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.tenant_business_id is distinct from old.tenant_business_id
       or new.chatwoot_account_mapping_id is distinct from old.chatwoot_account_mapping_id
       or new.chatwoot_inbox_mapping_id is distinct from old.chatwoot_inbox_mapping_id
       or new.chatwoot_contact_mapping_id is distinct from old.chatwoot_contact_mapping_id
       or new.chatwoot_conversation_display_id is distinct from old.chatwoot_conversation_display_id
       or new.created_at is distinct from old.created_at
    then
      raise exception 'Chatwoot Conversation projection identity is immutable';
    end if;

    if new.version <> old.version + 1 then
      raise exception 'Chatwoot Conversation projection version must increment by one';
    end if;
  elsif new.version <> 1 then
    raise exception 'new Chatwoot Conversation projection must start at version 1';
  end if;

  select * into v_account
    from public.chatwoot_account_mappings a
   where a.organization_id = new.organization_id
     and a.id = new.chatwoot_account_mapping_id
     and a.tenant_business_id = new.tenant_business_id
     and a.status = 'ACTIVE';
  if not found then
    raise exception 'ACTIVE Chatwoot Account mapping required for Conversation projection';
  end if;

  select * into v_inbox
    from public.chatwoot_inbox_mappings i
   where i.organization_id = new.organization_id
     and i.id = new.chatwoot_inbox_mapping_id
     and i.tenant_business_id = new.tenant_business_id
     and i.chatwoot_account_mapping_id = new.chatwoot_account_mapping_id
     and i.status in ('ACTIVE','DEGRADED');
  if not found then
    raise exception 'live Chatwoot Inbox mapping required for Conversation projection';
  end if;

  select * into v_contact
    from public.chatwoot_contact_mappings c
   where c.organization_id = new.organization_id
     and c.id = new.chatwoot_contact_mapping_id
     and c.tenant_business_id = new.tenant_business_id
     and c.chatwoot_account_mapping_id = new.chatwoot_account_mapping_id;
  if not found then
    raise exception 'Chatwoot Contact projection does not match Conversation scope';
  end if;

  if new.chatwoot_team_mapping_id is not null then
    select * into v_team
      from public.chatwoot_team_mappings t
     where t.organization_id = new.organization_id
       and t.id = new.chatwoot_team_mapping_id
       and t.tenant_business_id = new.tenant_business_id
       and t.chatwoot_account_mapping_id = new.chatwoot_account_mapping_id
       and t.status in ('ACTIVE','DEGRADED');

    if not found then
      raise exception 'Chatwoot Team projection does not match Conversation scope';
    end if;
  end if;

  select * into v_event
    from public.chatwoot_webhook_events e
   where e.organization_id = new.organization_id
     and e.id = new.source_event_id
     and e.tenant_business_id = new.tenant_business_id
     and e.chatwoot_inbox_mapping_id = new.chatwoot_inbox_mapping_id;
  if not found then
    raise exception 'Chatwoot Conversation projection source event is invalid';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists chatwoot_contact_projection_contract_guard
  on public.chatwoot_contact_mappings;
create trigger chatwoot_contact_projection_contract_guard
before insert or update
on public.chatwoot_contact_mappings
for each row execute function public.enforce_chatwoot_contact_projection_contract();

drop trigger if exists chatwoot_conversation_projection_contract_guard
  on public.chatwoot_conversation_mappings;
create trigger chatwoot_conversation_projection_contract_guard
before insert or update
on public.chatwoot_conversation_mappings
for each row execute function public.enforce_chatwoot_conversation_projection_contract();

create or replace function public.upsert_chatwoot_contact_projection(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_chatwoot_account_mapping_id uuid,
  p_chatwoot_contact_id bigint,
  p_source_event_id uuid
)
returns public.chatwoot_contact_mappings
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_existing public.chatwoot_contact_mappings%rowtype;
  v_result public.chatwoot_contact_mappings%rowtype;
begin
  if p_chatwoot_contact_id is null or p_chatwoot_contact_id <= 0 then
    raise exception 'invalid Chatwoot Contact ID';
  end if;

  select *
    into v_existing
    from public.chatwoot_contact_mappings
   where organization_id = p_organization_id
     and tenant_business_id = p_tenant_business_id
     and chatwoot_contact_id = p_chatwoot_contact_id;

  if found and v_existing.source_event_id = p_source_event_id then
    return v_existing;
  end if;

  if found then
    update public.chatwoot_contact_mappings
       set source_event_id = p_source_event_id,
           version = version + 1,
           last_verified_at = now()
     where id = v_existing.id
    returning * into v_result;
    return v_result;
  end if;

  insert into public.chatwoot_contact_mappings(
    organization_id,
    tenant_business_id,
    chatwoot_account_mapping_id,
    chatwoot_contact_id,
    source_event_id
  ) values (
    p_organization_id,
    p_tenant_business_id,
    p_chatwoot_account_mapping_id,
    p_chatwoot_contact_id,
    p_source_event_id
  )
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function public.upsert_chatwoot_conversation_projection(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_chatwoot_account_mapping_id uuid,
  p_chatwoot_inbox_mapping_id uuid,
  p_chatwoot_contact_mapping_id uuid,
  p_chatwoot_team_mapping_id uuid,
  p_chatwoot_conversation_display_id integer,
  p_status text,
  p_priority text,
  p_unread_count integer,
  p_can_reply boolean,
  p_last_activity_at timestamptz,
  p_source_event_id uuid
)
returns public.chatwoot_conversation_mappings
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_status text := lower(trim(coalesce(p_status,'')));
  v_priority text := nullif(lower(trim(coalesce(p_priority,''))), '');
  v_existing public.chatwoot_conversation_mappings%rowtype;
  v_result public.chatwoot_conversation_mappings%rowtype;
begin
  if p_chatwoot_conversation_display_id is null
     or p_chatwoot_conversation_display_id <= 0
     or v_status not in ('open','resolved','pending','snoozed')
     or (v_priority is not null and v_priority not in ('low','medium','high','urgent'))
     or p_unread_count is null
     or p_unread_count < 0
     or p_can_reply is null
  then
    raise exception 'invalid Chatwoot Conversation projection payload';
  end if;

  select *
    into v_existing
    from public.chatwoot_conversation_mappings
   where organization_id = p_organization_id
     and chatwoot_account_mapping_id = p_chatwoot_account_mapping_id
     and chatwoot_conversation_display_id = p_chatwoot_conversation_display_id;

  if found and v_existing.source_event_id = p_source_event_id then
    return v_existing;
  end if;

  if found then
    update public.chatwoot_conversation_mappings
       set chatwoot_team_mapping_id = p_chatwoot_team_mapping_id,
           status = v_status,
           priority = v_priority,
           unread_count = p_unread_count,
           can_reply = p_can_reply,
           last_activity_at = p_last_activity_at,
           source_event_id = p_source_event_id,
           version = version + 1,
           last_verified_at = now()
     where id = v_existing.id
    returning * into v_result;
    return v_result;
  end if;

  insert into public.chatwoot_conversation_mappings(
    organization_id,
    tenant_business_id,
    chatwoot_account_mapping_id,
    chatwoot_inbox_mapping_id,
    chatwoot_contact_mapping_id,
    chatwoot_team_mapping_id,
    chatwoot_conversation_display_id,
    status,
    priority,
    unread_count,
    can_reply,
    last_activity_at,
    source_event_id
  ) values (
    p_organization_id,
    p_tenant_business_id,
    p_chatwoot_account_mapping_id,
    p_chatwoot_inbox_mapping_id,
    p_chatwoot_contact_mapping_id,
    p_chatwoot_team_mapping_id,
    p_chatwoot_conversation_display_id,
    v_status,
    v_priority,
    p_unread_count,
    p_can_reply,
    p_last_activity_at,
    p_source_event_id
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on public.chatwoot_contact_mappings
  from public, anon, authenticated, service_role;
revoke all on public.chatwoot_conversation_mappings
  from public, anon, authenticated, service_role;

grant select, insert, update on public.chatwoot_contact_mappings to service_role;
grant select, insert, update on public.chatwoot_conversation_mappings to service_role;

revoke all on function public.enforce_chatwoot_contact_projection_contract()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_chatwoot_conversation_projection_contract()
  from public, anon, authenticated, service_role;

revoke all on function public.upsert_chatwoot_contact_projection(
  uuid, uuid, uuid, bigint, uuid
) from public, anon, authenticated;
grant execute on function public.upsert_chatwoot_contact_projection(
  uuid, uuid, uuid, bigint, uuid
) to service_role;

revoke all on function public.upsert_chatwoot_conversation_projection(
  uuid, uuid, uuid, uuid, uuid, uuid, integer, text, text,
  integer, boolean, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.upsert_chatwoot_conversation_projection(
  uuid, uuid, uuid, uuid, uuid, uuid, integer, text, text,
  integer, boolean, timestamptz, uuid
) to service_role;
