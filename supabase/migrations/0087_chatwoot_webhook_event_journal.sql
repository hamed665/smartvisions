-- 0087: durable signed Chatwoot API Inbox webhook journal.
--
-- This is Communication Plane event evidence, not a second provider journal.
-- The HTTP boundary verifies HMAC/timestamp/mapping before calling the service-only
-- recorder. Raw signing secrets and signature headers are never persisted here.

create table if not exists public.chatwoot_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tenant_business_id uuid not null,
  chatwoot_inbox_mapping_id uuid not null,
  chatwoot_inbox_id integer not null check (chatwoot_inbox_id > 0),
  delivery_id uuid not null,
  event_type text not null check (
    length(trim(event_type)) between 1 and 120
    and event_type ~ '^[a-z0-9_:-]+$'
  ),
  raw_body_sha256 text not null check (raw_body_sha256 ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED','PROCESSED','IGNORED','FAILED')),
  error_code text check (
    error_code is null
    or (
      length(error_code) between 1 and 120
      and error_code = upper(error_code)
      and error_code ~ '^[A-Z0-9_:.-]+$'
    )
  ),
  received_at timestamptz not null default now(),
  processed_at timestamptz,

  unique (chatwoot_inbox_mapping_id, delivery_id),

  foreign key (organization_id, chatwoot_inbox_mapping_id)
    references public.chatwoot_inbox_mappings(organization_id, id)
    on delete restrict,
  foreign key (organization_id, tenant_business_id)
    references public.tenant_businesses(organization_id, id)
    on delete restrict
);

create index if not exists chatwoot_webhook_events_business_received_idx
  on public.chatwoot_webhook_events(
    organization_id, tenant_business_id, received_at desc
  );

create index if not exists chatwoot_webhook_events_processing_idx
  on public.chatwoot_webhook_events(status, received_at)
  where status in ('RECEIVED','FAILED');

alter table public.chatwoot_webhook_events enable row level security;

create or replace function public.enforce_chatwoot_webhook_event_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_mapping public.chatwoot_inbox_mappings%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.tenant_business_id is distinct from old.tenant_business_id
       or new.chatwoot_inbox_mapping_id is distinct from old.chatwoot_inbox_mapping_id
       or new.chatwoot_inbox_id is distinct from old.chatwoot_inbox_id
       or new.delivery_id is distinct from old.delivery_id
       or new.event_type is distinct from old.event_type
       or new.raw_body_sha256 is distinct from old.raw_body_sha256
       or new.payload is distinct from old.payload
       or new.received_at is distinct from old.received_at
    then
      raise exception 'Chatwoot webhook journal evidence is immutable';
    end if;

    if old.status in ('PROCESSED','IGNORED')
       and new.status is distinct from old.status
    then
      raise exception 'terminal Chatwoot webhook event cannot change state';
    end if;

    if old.status = 'RECEIVED'
       and new.status not in ('RECEIVED','PROCESSED','IGNORED','FAILED')
    then
      raise exception 'invalid Chatwoot webhook event transition';
    end if;

    if old.status = 'FAILED'
       and new.status not in ('FAILED','PROCESSED','IGNORED')
    then
      raise exception 'invalid Chatwoot webhook retry transition';
    end if;

    if new.status = 'FAILED' and new.error_code is null then
      raise exception 'FAILED Chatwoot webhook event requires bounded error code';
    end if;

    if new.status in ('PROCESSED','IGNORED') and new.processed_at is null then
      raise exception 'terminal Chatwoot webhook event requires processed_at';
    end if;

    return new;
  end if;

  select *
    into v_mapping
    from public.chatwoot_inbox_mappings m
   where m.organization_id = new.organization_id
     and m.id = new.chatwoot_inbox_mapping_id;

  if not found
     or v_mapping.tenant_business_id <> new.tenant_business_id
     or v_mapping.chatwoot_inbox_id is null
     or v_mapping.chatwoot_inbox_id <> new.chatwoot_inbox_id
     or v_mapping.channel_type <> 'Channel::Api'
     or v_mapping.status not in ('ACTIVE','DEGRADED')
     or v_mapping.webhook_secret_ref is null
  then
    raise exception 'Chatwoot webhook event does not match a live API Inbox mapping';
  end if;

  if new.status <> 'RECEIVED'
     or new.error_code is not null
     or new.processed_at is not null
  then
    raise exception 'new Chatwoot webhook event must start RECEIVED';
  end if;

  return new;
end;
$$;

drop trigger if exists chatwoot_webhook_events_contract_guard
  on public.chatwoot_webhook_events;
create trigger chatwoot_webhook_events_contract_guard
before insert or update
on public.chatwoot_webhook_events
for each row execute function public.enforce_chatwoot_webhook_event_contract();

create or replace function public.record_chatwoot_webhook_event(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_chatwoot_inbox_mapping_id uuid,
  p_chatwoot_inbox_id integer,
  p_delivery_id uuid,
  p_event_type text,
  p_raw_body_sha256 text,
  p_payload jsonb
)
returns table(
  is_new boolean,
  event_id uuid,
  event_status text
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_hash text := lower(trim(coalesce(p_raw_body_sha256, '')));
  v_inserted_id uuid;
  v_existing public.chatwoot_webhook_events%rowtype;
begin
  if p_chatwoot_inbox_id is null
     or p_chatwoot_inbox_id <= 0
     or p_delivery_id is null
     or length(v_event_type) not between 1 and 120
     or v_event_type !~ '^[a-z0-9_:-]+$'
     or v_hash !~ '^[0-9a-f]{64}$'
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 1048576
  then
    raise exception 'invalid Chatwoot webhook event payload';
  end if;

  insert into public.chatwoot_webhook_events(
    organization_id,
    tenant_business_id,
    chatwoot_inbox_mapping_id,
    chatwoot_inbox_id,
    delivery_id,
    event_type,
    raw_body_sha256,
    payload
  ) values (
    p_organization_id,
    p_tenant_business_id,
    p_chatwoot_inbox_mapping_id,
    p_chatwoot_inbox_id,
    p_delivery_id,
    v_event_type,
    v_hash,
    p_payload
  )
  on conflict (chatwoot_inbox_mapping_id, delivery_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is not null then
    return query
    select true, v_inserted_id, 'RECEIVED'::text;
    return;
  end if;

  select *
    into v_existing
    from public.chatwoot_webhook_events e
   where e.chatwoot_inbox_mapping_id = p_chatwoot_inbox_mapping_id
     and e.delivery_id = p_delivery_id;

  if not found then
    raise exception 'Chatwoot webhook replay could not be reconciled';
  end if;

  if v_existing.organization_id <> p_organization_id
     or v_existing.tenant_business_id <> p_tenant_business_id
     or v_existing.chatwoot_inbox_id <> p_chatwoot_inbox_id
     or v_existing.event_type <> v_event_type
     or v_existing.raw_body_sha256 <> v_hash
     or v_existing.payload <> p_payload
  then
    raise exception 'Chatwoot delivery ID replay payload mismatch';
  end if;

  return query
  select false, v_existing.id, v_existing.status;
end;
$$;

revoke all on table public.chatwoot_webhook_events
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.chatwoot_webhook_events
  to service_role;

revoke all on function public.enforce_chatwoot_webhook_event_contract()
  from public, anon, authenticated, service_role;

revoke all on function public.record_chatwoot_webhook_event(
  uuid, uuid, uuid, integer, uuid, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_chatwoot_webhook_event(
  uuid, uuid, uuid, integer, uuid, text, text, jsonb
) to service_role;
