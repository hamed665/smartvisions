-- Complete the existing nullable Business-level projection contract.
-- No new permission, scope authority, send path or historical backfill.
begin;
create or replace function public.enforce_unified_inbox_projection_contract()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_conversation_org uuid;
  v_conversation_channel text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Unified Inbox projections use lifecycle state; DELETE is not permitted';
  end if;

  if coalesce(current_setting('smartvisions.unified_inbox_projection_command', true), '') <> '1' then
    raise exception 'Unified Inbox projection mutation requires reconciler command path';
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.conversation_id is distinct from old.conversation_id
       or new.brand_id is distinct from old.brand_id
       or new.tenant_business_id is distinct from old.tenant_business_id
       or new.branch_id is distinct from old.branch_id
       or new.communication_channel_binding_id is distinct from old.communication_channel_binding_id
       or new.chatwoot_inbox_mapping_id is distinct from old.chatwoot_inbox_mapping_id
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

  select sc.organization_id, upper(sc.channel)
    into v_conversation_org, v_conversation_channel
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

  if new.branch_id is not null and not exists (
    select 1
      from public.branches br
     where br.organization_id = new.organization_id
       and br.id = new.branch_id
       and br.tenant_business_id = new.tenant_business_id
  ) then
    raise exception 'Unified Inbox projection Branch lineage mismatch';
  end if;

  if new.branch_id is null and (new.department_id is not null or new.team_id is not null or new.chatwoot_team_mapping_id is not null) then
    raise exception 'Business-scoped Unified Inbox projection cannot carry Branch-scoped assignment';
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
       and cb.branch_id is not distinct from new.branch_id
       and cb.channel = v_conversation_channel
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
       and im.branch_id is not distinct from new.branch_id
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
commit;
