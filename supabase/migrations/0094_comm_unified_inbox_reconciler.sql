-- 0094: COMM-UNIFIED-INBOX signed webhook journal -> projection reconciler.
--
-- Boundaries:
-- - existing chatwoot_webhook_events is the durable journal; no second queue.
-- - Chatwoot remains Communication Plane only.
-- - service_role is the only runtime writer and only through governed RPCs.
-- - no provider send, Platform token, provisioning flag, or Shadow Mode change.

alter table public.unified_inbox_conversation_projections
  add column if not exists chatwoot_updated_at timestamptz;

create index if not exists unified_inbox_projection_external_update_idx
  on public.unified_inbox_conversation_projections(
    organization_id,
    tenant_business_id,
    chatwoot_updated_at desc,
    conversation_id
  )
  where lifecycle_status in ('ACTIVE','DEGRADED');

create table if not exists public.unified_inbox_projection_reconciliation_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  projection_id uuid not null references public.unified_inbox_conversation_projections(id) on delete restrict,
  conversation_id uuid not null references public.sales_conversations(id) on delete restrict,
  source_event_id uuid not null references public.chatwoot_webhook_events(id) on delete restrict,
  request_key text not null check (length(trim(request_key)) between 1 and 200),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in ('CREATED','UPDATED','NOOP','STALE_IGNORED')),
  applied_version integer not null check (applied_version >= 1),
  created_at timestamptz not null default now(),

  unique (organization_id, request_key),
  unique (source_event_id)
);

create index if not exists unified_inbox_reconciliation_receipts_projection_idx
  on public.unified_inbox_projection_reconciliation_receipts(
    organization_id, projection_id, applied_version desc, created_at desc
  );

alter table public.unified_inbox_projection_reconciliation_receipts
  enable row level security;

create or replace function public.enforce_unified_inbox_reconciliation_receipt_immutable()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Unified Inbox reconciliation receipts are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists unified_inbox_reconciliation_receipt_immutable
  on public.unified_inbox_projection_reconciliation_receipts;
create trigger unified_inbox_reconciliation_receipt_immutable
before insert or update or delete
on public.unified_inbox_projection_reconciliation_receipts
for each row execute function public.enforce_unified_inbox_reconciliation_receipt_immutable();

create index if not exists chatwoot_webhook_events_received_work_idx
  on public.chatwoot_webhook_events(received_at, id)
  where status = 'RECEIVED';

create or replace function public.finalize_chatwoot_webhook_event(
  p_event_id uuid,
  p_status text,
  p_error_code text
)
returns public.chatwoot_webhook_events
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_target text := upper(trim(coalesce(p_status, '')));
  v_error text := upper(trim(coalesce(p_error_code, '')));
  v_event public.chatwoot_webhook_events%rowtype;
begin
  if p_event_id is null
     or v_target not in ('IGNORED','FAILED')
     or length(v_error) not between 1 and 120
     or v_error !~ '^[A-Z0-9_:.-]+$'
  then
    raise exception 'invalid Chatwoot webhook finalization payload';
  end if;

  select *
    into v_event
    from public.chatwoot_webhook_events e
   where e.id = p_event_id
   for update;

  if not found then
    raise exception 'Chatwoot webhook event not found';
  end if;

  if v_event.status in ('PROCESSED','IGNORED') then
    if v_event.status = v_target
       and coalesce(v_event.error_code, '') = v_error
    then
      return v_event;
    end if;
    raise exception 'terminal Chatwoot webhook event cannot be re-finalized';
  end if;

  update public.chatwoot_webhook_events
     set status = v_target,
         error_code = v_error,
         processed_at = case when v_target = 'IGNORED' then statement_timestamp() else null end
   where id = p_event_id
  returning * into v_event;

  return v_event;
end;
$$;

create or replace function public.reconcile_unified_inbox_projection_event(
  p_event_id uuid,
  p_conversation_id uuid,
  p_chatwoot_conversation_display_id integer,
  p_chatwoot_contact_id bigint,
  p_chatwoot_assignee_user_id bigint,
  p_chatwoot_team_id bigint,
  p_chatwoot_status text,
  p_labels text[],
  p_last_activity_at timestamptz,
  p_chatwoot_updated_at timestamptz
)
returns table(
  outcome text,
  projection_id uuid,
  projection_version integer,
  event_status text
)
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_event public.chatwoot_webhook_events%rowtype;
  v_mapping public.chatwoot_inbox_mappings%rowtype;
  v_business public.tenant_businesses%rowtype;
  v_binding public.communication_channel_bindings%rowtype;
  v_conversation public.sales_conversations%rowtype;
  v_current public.unified_inbox_conversation_projections%rowtype;
  v_projection public.unified_inbox_conversation_projections%rowtype;
  v_receipt public.unified_inbox_projection_reconciliation_receipts%rowtype;
  v_team_mapping public.chatwoot_team_mappings%rowtype;
  v_team public.teams%rowtype;
  v_department public.departments%rowtype;
  v_request_key text;
  v_status text := lower(trim(coalesce(p_chatwoot_status, '')));
  v_labels text[];
  v_department_id uuid;
  v_team_id uuid;
  v_team_mapping_id uuid;
  v_outcome text;
  v_event_status text;
begin
  if p_event_id is null
     or p_conversation_id is null
     or p_chatwoot_conversation_display_id is null
     or p_chatwoot_conversation_display_id <= 0
     or (p_chatwoot_contact_id is not null and p_chatwoot_contact_id <= 0)
     or (p_chatwoot_assignee_user_id is not null and p_chatwoot_assignee_user_id <= 0)
     or (p_chatwoot_team_id is not null and p_chatwoot_team_id <= 0)
     or length(v_status) not between 1 and 40
     or v_status !~ '^[a-z0-9_:-]+$'
     or p_last_activity_at is null
     or p_chatwoot_updated_at is null
  then
    raise exception 'invalid Unified Inbox projection event payload';
  end if;

  if cardinality(coalesce(p_labels, '{}'::text[])) > 100
     or exists (
       select 1
         from unnest(coalesce(p_labels, '{}'::text[])) value
        where value is null
           or length(trim(value)) not between 1 and 120
     )
  then
    raise exception 'Unified Inbox labels exceed the bounded contract';
  end if;

  v_labels := array(
    select distinct trim(value)
      from unnest(coalesce(p_labels, '{}'::text[])) value
     order by trim(value)
  );

  select *
    into v_event
    from public.chatwoot_webhook_events e
   where e.id = p_event_id
   for update;

  if not found then
    raise exception 'Chatwoot webhook event not found';
  end if;

  v_request_key := 'unified-inbox:event:' || v_event.id::text;

  select *
    into v_receipt
    from public.unified_inbox_projection_reconciliation_receipts r
   where r.source_event_id = v_event.id;

  if found then
    if v_receipt.organization_id <> v_event.organization_id
       or v_receipt.payload_hash <> v_event.raw_body_sha256
       or v_receipt.conversation_id <> p_conversation_id
    then
      raise exception 'Unified Inbox event replay does not match its reconciliation receipt';
    end if;

    return query
    select v_receipt.outcome, v_receipt.projection_id,
           v_receipt.applied_version, v_event.status;
    return;
  end if;

  if v_event.status not in ('RECEIVED','FAILED') then
    raise exception 'terminal Chatwoot webhook event has no reconciliation receipt';
  end if;

  select *
    into v_mapping
    from public.chatwoot_inbox_mappings m
   where m.id = v_event.chatwoot_inbox_mapping_id
     and m.organization_id = v_event.organization_id
     and m.tenant_business_id = v_event.tenant_business_id
     and m.chatwoot_inbox_id = v_event.chatwoot_inbox_id
     and m.channel_type = 'Channel::Api'
     and m.status in ('ACTIVE','DEGRADED');

  if not found or v_mapping.branch_id is null then
    raise exception 'live Branch-scoped Chatwoot Inbox mapping required for Unified Inbox reconciliation';
  end if;

  select *
    into v_business
    from public.tenant_businesses b
   where b.organization_id = v_event.organization_id
     and b.id = v_event.tenant_business_id
     and b.status = 'ACTIVE';

  if not found then
    raise exception 'ACTIVE tenant Business required for Unified Inbox reconciliation';
  end if;

  select *
    into v_binding
    from public.communication_channel_bindings cb
   where cb.organization_id = v_event.organization_id
     and cb.id = v_mapping.communication_channel_binding_id
     and cb.tenant_business_id = v_event.tenant_business_id
     and cb.branch_id = v_mapping.branch_id
     and cb.status = 'ACTIVE';

  if not found then
    raise exception 'ACTIVE communication binding required for Unified Inbox reconciliation';
  end if;

  select *
    into v_conversation
    from public.sales_conversations sc
   where sc.id = p_conversation_id
     and sc.organization_id = v_event.organization_id;

  if not found or upper(v_conversation.channel) <> v_binding.channel then
    raise exception 'Smart Core conversation does not match the signed Chatwoot event scope';
  end if;

  if p_chatwoot_team_id is not null then
    select *
      into v_team_mapping
      from public.chatwoot_team_mappings tm
     where tm.organization_id = v_event.organization_id
       and tm.tenant_business_id = v_event.tenant_business_id
       and tm.chatwoot_account_mapping_id = v_mapping.chatwoot_account_mapping_id
       and tm.chatwoot_team_id = p_chatwoot_team_id
       and tm.status in ('ACTIVE','DEGRADED');

    if not found then
      raise exception 'Chatwoot Team is not governed by an active Smart Team mapping';
    end if;

    select *
      into v_team
      from public.teams t
     where t.organization_id = v_event.organization_id
       and t.id = v_team_mapping.smart_team_id
       and t.status = 'ACTIVE';

    if not found then
      raise exception 'ACTIVE Smart Team required for Unified Inbox reconciliation';
    end if;

    select *
      into v_department
      from public.departments d
     where d.organization_id = v_event.organization_id
       and d.id = v_team.department_id
       and d.branch_id = v_mapping.branch_id
       and d.status = 'ACTIVE';

    if not found then
      raise exception 'Chatwoot Team mapping escaped the canonical Branch lineage';
    end if;

    v_team_id := v_team.id;
    v_department_id := v_department.id;
    v_team_mapping_id := v_team_mapping.id;
  end if;

  if exists (
    select 1
      from public.unified_inbox_conversation_projections p
     where p.organization_id = v_event.organization_id
       and p.tenant_business_id = v_event.tenant_business_id
       and p.chatwoot_conversation_display_id = p_chatwoot_conversation_display_id
       and p.conversation_id <> p_conversation_id
  ) then
    raise exception 'Chatwoot Conversation identity already belongs to another Smart Core conversation';
  end if;

  select *
    into v_current
    from public.unified_inbox_conversation_projections p
   where p.organization_id = v_event.organization_id
     and p.conversation_id = p_conversation_id
   for update;

  if found then
    if v_current.lifecycle_status = 'ARCHIVED'
       or v_current.brand_id <> v_business.brand_id
       or v_current.tenant_business_id <> v_event.tenant_business_id
       or v_current.branch_id <> v_mapping.branch_id
       or v_current.communication_channel_binding_id <> v_mapping.communication_channel_binding_id
       or v_current.chatwoot_inbox_mapping_id <> v_mapping.id
       or v_current.chatwoot_conversation_display_id <> p_chatwoot_conversation_display_id
    then
      raise exception 'Unified Inbox projection immutable scope/identity drift detected';
    end if;

    if v_current.chatwoot_updated_at is not null
       and p_chatwoot_updated_at < v_current.chatwoot_updated_at
    then
      v_projection := v_current;
      v_outcome := 'STALE_IGNORED';
      v_event_status := 'IGNORED';
    elsif v_current.chatwoot_updated_at = p_chatwoot_updated_at
       and v_current.department_id is not distinct from v_department_id
       and v_current.team_id is not distinct from v_team_id
       and v_current.chatwoot_team_mapping_id is not distinct from v_team_mapping_id
       and v_current.chatwoot_contact_id is not distinct from p_chatwoot_contact_id
       and v_current.chatwoot_assignee_user_id is not distinct from p_chatwoot_assignee_user_id
       and v_current.chatwoot_status is not distinct from v_status
       and v_current.labels = v_labels
       and v_current.last_activity_at is not distinct from p_last_activity_at
    then
      v_projection := v_current;
      v_outcome := 'NOOP';
      v_event_status := 'PROCESSED';
    else
      perform set_config('smartvisions.unified_inbox_projection_command', '1', true);

      update public.unified_inbox_conversation_projections
         set department_id = v_department_id,
             team_id = v_team_id,
             chatwoot_team_mapping_id = v_team_mapping_id,
             chatwoot_contact_id = p_chatwoot_contact_id,
             chatwoot_assignee_user_id = p_chatwoot_assignee_user_id,
             chatwoot_status = v_status,
             labels = v_labels,
             last_activity_at = p_last_activity_at,
             source_event_id = v_event.id,
             lifecycle_status = 'ACTIVE',
             version = version + 1,
             last_request_key = v_request_key,
             last_reconciled_at = statement_timestamp(),
             chatwoot_updated_at = p_chatwoot_updated_at
       where id = v_current.id
         and version = v_current.version
      returning * into v_projection;

      perform set_config('smartvisions.unified_inbox_projection_command', '0', true);

      if not found then
        raise exception 'Unified Inbox projection changed concurrently';
      end if;

      v_outcome := 'UPDATED';
      v_event_status := 'PROCESSED';
    end if;
  else
    perform set_config('smartvisions.unified_inbox_projection_command', '1', true);

    insert into public.unified_inbox_conversation_projections(
      organization_id, conversation_id, brand_id, tenant_business_id, branch_id,
      department_id, team_id, communication_channel_binding_id,
      chatwoot_inbox_mapping_id, chatwoot_team_mapping_id,
      chatwoot_conversation_display_id, chatwoot_contact_id,
      chatwoot_assignee_user_id, chatwoot_status, labels, last_activity_at,
      source_event_id, lifecycle_status, version, last_request_key,
      last_reconciled_at, chatwoot_updated_at
    ) values (
      v_event.organization_id, p_conversation_id, v_business.brand_id,
      v_event.tenant_business_id, v_mapping.branch_id, v_department_id,
      v_team_id, v_mapping.communication_channel_binding_id, v_mapping.id,
      v_team_mapping_id, p_chatwoot_conversation_display_id,
      p_chatwoot_contact_id, p_chatwoot_assignee_user_id, v_status, v_labels,
      p_last_activity_at, v_event.id, 'ACTIVE', 1, v_request_key,
      statement_timestamp(), p_chatwoot_updated_at
    )
    returning * into v_projection;

    perform set_config('smartvisions.unified_inbox_projection_command', '0', true);

    v_outcome := 'CREATED';
    v_event_status := 'PROCESSED';
  end if;

  insert into public.unified_inbox_projection_reconciliation_receipts(
    organization_id, projection_id, conversation_id, source_event_id,
    request_key, payload_hash, outcome, applied_version
  ) values (
    v_event.organization_id, v_projection.id, p_conversation_id, v_event.id,
    v_request_key, v_event.raw_body_sha256, v_outcome, v_projection.version
  )
  returning * into v_receipt;

  update public.chatwoot_webhook_events
     set status = v_event_status,
         error_code = case when v_event_status = 'IGNORED' then 'STALE_EVENT' else null end,
         processed_at = statement_timestamp()
   where id = v_event.id;

  perform set_config('smartvisions.unified_inbox_projection_command', '0', true);

  return query
  select v_receipt.outcome, v_receipt.projection_id,
         v_receipt.applied_version, v_event_status;
  return;
exception
  when others then
    perform set_config('smartvisions.unified_inbox_projection_command', '0', true);
    raise;
end;
$$;

revoke all on table public.unified_inbox_projection_reconciliation_receipts
  from public, anon, authenticated, service_role;
grant select, insert on table public.unified_inbox_projection_reconciliation_receipts
  to service_role;

grant insert, update on table public.unified_inbox_conversation_projections
  to service_role;

revoke all on function public.enforce_unified_inbox_reconciliation_receipt_immutable()
  from public, anon, authenticated, service_role;

revoke all on function public.finalize_chatwoot_webhook_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_chatwoot_webhook_event(uuid, text, text)
  to service_role;

revoke all on function public.reconcile_unified_inbox_projection_event(
  uuid, uuid, integer, bigint, bigint, bigint, text, text[], timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.reconcile_unified_inbox_projection_event(
  uuid, uuid, integer, bigint, bigint, bigint, text, text[], timestamptz, timestamptz
) to service_role;
