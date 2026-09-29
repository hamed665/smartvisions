-- AUTO-WORKFLOW-MODEL
-- Extends the canonical automation_rules authority with governed draft/publish
-- semantics and immutable published snapshots. This does not add an executor,
-- queue, outbox, trigger catalog, action registry, condition evaluator or send path.

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  trigger_key text not null,
  action_key text not null,
  enabled boolean not null default true,
  priority integer not null default 50 check (priority between 0 and 100),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.automation_rules
  add column if not exists owner_user_id uuid,
  add column if not exists conditions jsonb not null default '[]'::jsonb,
  add column if not exists actions jsonb not null default '[]'::jsonb,
  add column if not exists publication_state text not null default 'DRAFT',
  add column if not exists draft_revision integer not null default 1,
  add column if not exists published_revision integer,
  add column if not exists latest_published_version integer not null default 0,
  add column if not exists execution_state text not null default 'NOT_READY',
  add column if not exists creation_request_key text,
  add column if not exists last_published_at timestamptz,
  add column if not exists last_published_by_user_id uuid;

alter table public.automation_rules
  alter column enabled set default false;

-- Preserve any legacy rule definition without pretending it was already
-- published. Production has zero rows at this migration checkpoint.
update public.automation_rules
   set actions = jsonb_build_array(
     jsonb_build_object('key', action_key, 'config', '{}'::jsonb)
   )
 where jsonb_typeof(actions) <> 'array'
    or jsonb_array_length(actions) = 0;

alter table public.automation_rules
  add constraint automation_rules_conditions_array_check
    check (jsonb_typeof(conditions) = 'array'),
  add constraint automation_rules_actions_array_check
    check (
      case when jsonb_typeof(actions) = 'array'
        then jsonb_array_length(actions) > 0
        else false
      end
    ),
  add constraint automation_rules_config_object_check
    check (jsonb_typeof(config) = 'object'),
  add constraint automation_rules_publication_state_check
    check (publication_state in ('DRAFT','PUBLISHED')),
  add constraint automation_rules_draft_revision_check
    check (draft_revision >= 1),
  add constraint automation_rules_latest_published_version_check
    check (latest_published_version >= 0),
  add constraint automation_rules_published_revision_check
    check (
      (latest_published_version = 0 and published_revision is null)
      or
      (latest_published_version > 0
       and published_revision is not null
       and published_revision between 1 and draft_revision)
    ),
  add constraint automation_rules_publication_consistency_check
    check (
      publication_state = 'DRAFT'
      or (
        publication_state = 'PUBLISHED'
        and latest_published_version > 0
        and published_revision = draft_revision
      )
    ),
  add constraint automation_rules_execution_state_check
    check (
      (latest_published_version = 0 and execution_state = 'NOT_READY')
      or
      (latest_published_version > 0 and enabled and execution_state = 'READY')
      or
      (latest_published_version > 0 and not enabled and execution_state = 'DISABLED')
    ),
  add constraint automation_rules_publisher_consistency_check
    check (
      (latest_published_version = 0
       and last_published_at is null
       and last_published_by_user_id is null)
      or
      (latest_published_version > 0
       and last_published_at is not null
       and last_published_by_user_id is not null
       and owner_user_id is not null)
    );

create unique index if not exists automation_rules_org_id_id_uidx
  on public.automation_rules(organization_id,id);

create unique index if not exists automation_rules_creation_request_uidx
  on public.automation_rules(organization_id,creation_request_key)
  where creation_request_key is not null;

create index if not exists automation_rules_owner_idx
  on public.automation_rules(organization_id,owner_user_id)
  where owner_user_id is not null;

create table public.automation_rule_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  automation_rule_id uuid not null,
  version integer not null check (version >= 1),
  draft_revision integer not null check (draft_revision >= 1),
  name text not null,
  owner_user_id uuid not null,
  trigger_key text not null,
  conditions jsonb not null,
  actions jsonb not null,
  priority integer not null check (priority between 0 and 100),
  config jsonb not null,
  published_by_user_id uuid not null,
  published_at timestamptz not null default now(),
  constraint automation_rule_versions_rule_fkey
    foreign key (organization_id,automation_rule_id)
    references public.automation_rules(organization_id,id)
    on delete restrict,
  constraint automation_rule_versions_unique_version
    unique (automation_rule_id,version),
  constraint automation_rule_versions_conditions_array_check
    check (jsonb_typeof(conditions) = 'array'),
  constraint automation_rule_versions_actions_array_check
    check (
      case when jsonb_typeof(actions) = 'array'
        then jsonb_array_length(actions) > 0
        else false
      end
    ),
  constraint automation_rule_versions_config_object_check
    check (jsonb_typeof(config) = 'object')
);

comment on table public.automation_rule_versions is
  'Immutable published snapshots for the canonical automation_rules authority; not a second workflow engine.';

create index automation_rule_versions_org_rule_version_idx
  on public.automation_rule_versions(organization_id,automation_rule_id,version desc);

create or replace function public.enforce_automation_rule_definition()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_item jsonb;
  v_definition_changed boolean := false;
begin
  if nullif(btrim(new.name),'') is null or length(new.name) > 160 then
    raise exception 'Automation rule name must be 1..160 characters';
  end if;
  if new.trigger_key !~ '^[A-Z][A-Z0-9_.:-]{0,127}$' then
    raise exception 'Automation trigger key is invalid';
  end if;
  if new.action_key !~ '^[A-Z][A-Z0-9_.:-]{0,127}$' then
    raise exception 'Automation primary action key is invalid';
  end if;
  if jsonb_typeof(new.conditions) <> 'array' then
    raise exception 'Automation conditions must be a JSON array';
  end if;
  if jsonb_typeof(new.actions) <> 'array' or jsonb_array_length(new.actions) = 0 then
    raise exception 'Automation actions must be a non-empty JSON array';
  end if;
  if jsonb_typeof(new.config) <> 'object' then
    raise exception 'Automation config must be a JSON object';
  end if;
  if pg_column_size(new.conditions) > 65536
     or pg_column_size(new.actions) > 65536
     or pg_column_size(new.config) > 65536
  then
    raise exception 'Automation definition exceeds the bounded model size';
  end if;

  for v_item in select value from jsonb_array_elements(new.conditions) as x(value)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Every automation condition must be a JSON object';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(new.actions) as x(value)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or nullif(btrim(v_item->>'key'),'') is null
       or (v_item ? 'config' and jsonb_typeof(v_item->'config') <> 'object')
    then
      raise exception 'Every automation action must contain a key and optional object config';
    end if;
  end loop;

  if new.action_key is distinct from (new.actions->0->>'key') then
    raise exception 'Legacy action_key must match the first modeled action';
  end if;

  if new.owner_user_id is not null and not exists (
    select 1
      from public.organization_members m
     where m.organization_id = new.organization_id
       and m.user_id = new.owner_user_id
       and m.role in ('OWNER','ADMIN','SALES_MANAGER')
  ) then
    raise exception 'Automation owner must be an eligible member of the same Organization';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.organization_id is distinct from old.organization_id
       or new.created_at is distinct from old.created_at
       or new.creation_request_key is distinct from old.creation_request_key
    then
      raise exception 'Automation rule identity/provenance is immutable';
    end if;

    if new.latest_published_version < old.latest_published_version then
      raise exception 'Automation published version pointer cannot move backwards';
    end if;
    if new.published_revision is not null
       and old.published_revision is not null
       and new.published_revision < old.published_revision
    then
      raise exception 'Automation published revision cannot move backwards';
    end if;

    v_definition_changed :=
      new.name is distinct from old.name
      or new.owner_user_id is distinct from old.owner_user_id
      or new.trigger_key is distinct from old.trigger_key
      or new.action_key is distinct from old.action_key
      or new.conditions is distinct from old.conditions
      or new.actions is distinct from old.actions
      or new.priority is distinct from old.priority
      or new.config is distinct from old.config;

    if v_definition_changed then
      if new.draft_revision <> old.draft_revision + 1
         or new.publication_state <> 'DRAFT'
      then
        raise exception 'Automation definition changes require exactly one new DRAFT revision';
      end if;
    elsif new.draft_revision <> old.draft_revision then
      raise exception 'Automation draft revision changed without a definition change';
    end if;

    if new.published_revision is distinct from old.published_revision
       and new.latest_published_version = old.latest_published_version
    then
      raise exception 'Automation published revision requires a new immutable version';
    end if;

    if new.latest_published_version > old.latest_published_version
       and not exists (
         select 1
           from public.automation_rule_versions v
          where v.organization_id = new.organization_id
            and v.automation_rule_id = new.id
            and v.version = new.latest_published_version
            and v.draft_revision = new.published_revision
       )
    then
      raise exception 'Automation published pointer requires an immutable version snapshot';
    end if;

    new.updated_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.enforce_automation_rule_version_immutable()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_rule public.automation_rules%rowtype;
  v_item jsonb;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Published automation versions are immutable';
  end if;

  select *
    into v_rule
    from public.automation_rules
   where organization_id = new.organization_id
     and id = new.automation_rule_id;

  if not found then
    raise exception 'Automation rule does not exist in the same Organization';
  end if;
  if new.version <> v_rule.latest_published_version + 1 then
    raise exception 'Automation published version must be monotonic';
  end if;
  if new.draft_revision <> v_rule.draft_revision
     or new.name is distinct from v_rule.name
     or new.owner_user_id is distinct from v_rule.owner_user_id
     or new.trigger_key is distinct from v_rule.trigger_key
     or new.conditions is distinct from v_rule.conditions
     or new.actions is distinct from v_rule.actions
     or new.priority is distinct from v_rule.priority
     or new.config is distinct from v_rule.config
  then
    raise exception 'Published automation snapshot must exactly match the current draft definition';
  end if;

  if jsonb_typeof(new.actions) <> 'array' or jsonb_array_length(new.actions) = 0 then
    raise exception 'Published automation actions must be a non-empty JSON array';
  end if;
  for v_item in select value from jsonb_array_elements(new.actions) as x(value)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or nullif(btrim(v_item->>'key'),'') is null
    then
      raise exception 'Published automation action shape is invalid';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists automation_rules_definition_guard on public.automation_rules;
create trigger automation_rules_definition_guard
before insert or update on public.automation_rules
for each row execute function public.enforce_automation_rule_definition();

drop trigger if exists automation_rule_versions_immutable_guard on public.automation_rule_versions;
create trigger automation_rule_versions_immutable_guard
before insert or update or delete on public.automation_rule_versions
for each row execute function public.enforce_automation_rule_version_immutable();

create or replace function public.create_automation_rule_draft(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_name text,
  p_trigger_key text,
  p_conditions jsonb,
  p_actions jsonb,
  p_priority integer,
  p_config jsonb,
  p_owner_user_id uuid,
  p_request_key text
)
returns table(resolved_rule_id uuid,resolved_draft_revision integer,replayed boolean)
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor_role text;
  v_owner_role text;
  v_owner uuid := coalesce(p_owner_user_id,p_actor_user_id);
  v_action_key text;
  v_existing public.automation_rules%rowtype;
  v_inserted public.automation_rules%rowtype;
begin
  select role into v_actor_role
    from public.organization_members
   where organization_id=p_organization_id and user_id=p_actor_user_id;
  if v_actor_role is distinct from 'OWNER' then
    raise exception 'Automation workflow mutation requires Organization OWNER';
  end if;

  select role into v_owner_role
    from public.organization_members
   where organization_id=p_organization_id and user_id=v_owner;
  if v_owner_role is null or v_owner_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'Automation owner is not eligible in this Organization';
  end if;

  if nullif(btrim(p_request_key),'') is null or length(p_request_key)>200 then
    raise exception 'Automation creation request key is required and bounded';
  end if;
  if p_priority not between 0 and 100 then
    raise exception 'Automation priority must be between 0 and 100';
  end if;
  if jsonb_typeof(p_actions)<>'array' or jsonb_array_length(p_actions)=0 then
    raise exception 'Automation actions must be a non-empty JSON array';
  end if;
  v_action_key := p_actions->0->>'key';

  select * into v_existing
    from public.automation_rules
   where organization_id=p_organization_id
     and creation_request_key=p_request_key;

  if found then
    if v_existing.name is distinct from p_name
       or v_existing.owner_user_id is distinct from v_owner
       or v_existing.trigger_key is distinct from p_trigger_key
       or v_existing.conditions is distinct from coalesce(p_conditions,'[]'::jsonb)
       or v_existing.actions is distinct from p_actions
       or v_existing.priority is distinct from p_priority
       or v_existing.config is distinct from coalesce(p_config,'{}'::jsonb)
    then
      raise exception 'Automation creation request key was reused with different content';
    end if;
    return query select v_existing.id,v_existing.draft_revision,true;
    return;
  end if;

  insert into public.automation_rules(
    organization_id,name,owner_user_id,trigger_key,action_key,
    conditions,actions,enabled,priority,config,
    publication_state,draft_revision,published_revision,
    latest_published_version,execution_state,creation_request_key
  ) values (
    p_organization_id,p_name,v_owner,p_trigger_key,v_action_key,
    coalesce(p_conditions,'[]'::jsonb),p_actions,false,p_priority,coalesce(p_config,'{}'::jsonb),
    'DRAFT',1,null,0,'NOT_READY',p_request_key
  )
  returning * into v_inserted;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'AUTOMATION_RULE_DRAFT_CREATED','automation_rule',v_inserted.id::text,
    jsonb_build_object(
      'draftRevision',v_inserted.draft_revision,
      'publicationState',v_inserted.publication_state,
      'executionState',v_inserted.execution_state,
      'ownerUserId',v_inserted.owner_user_id,
      'triggerKey',v_inserted.trigger_key,
      'actionKeys',(select jsonb_agg(value->>'key') from jsonb_array_elements(v_inserted.actions))
    )
  );

  return query select v_inserted.id,v_inserted.draft_revision,false;
end;
$$;

create or replace function public.update_automation_rule_draft(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_rule_id uuid,
  p_expected_draft_revision integer,
  p_name text,
  p_trigger_key text,
  p_conditions jsonb,
  p_actions jsonb,
  p_priority integer,
  p_config jsonb,
  p_owner_user_id uuid
)
returns table(resolved_rule_id uuid,resolved_draft_revision integer,replayed boolean)
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor_role text;
  v_owner_role text;
  v_owner uuid := coalesce(p_owner_user_id,p_actor_user_id);
  v_action_key text;
  v_rule public.automation_rules%rowtype;
  v_updated public.automation_rules%rowtype;
begin
  select role into v_actor_role
    from public.organization_members
   where organization_id=p_organization_id and user_id=p_actor_user_id;
  if v_actor_role is distinct from 'OWNER' then
    raise exception 'Automation workflow mutation requires Organization OWNER';
  end if;

  select role into v_owner_role
    from public.organization_members
   where organization_id=p_organization_id and user_id=v_owner;
  if v_owner_role is null or v_owner_role not in ('OWNER','ADMIN','SALES_MANAGER') then
    raise exception 'Automation owner is not eligible in this Organization';
  end if;

  if p_priority not between 0 and 100 then
    raise exception 'Automation priority must be between 0 and 100';
  end if;
  if jsonb_typeof(p_actions)<>'array' or jsonb_array_length(p_actions)=0 then
    raise exception 'Automation actions must be a non-empty JSON array';
  end if;
  v_action_key := p_actions->0->>'key';

  select * into v_rule
    from public.automation_rules
   where organization_id=p_organization_id and id=p_rule_id
   for update;
  if not found then raise exception 'Automation rule was not found'; end if;

  if v_rule.draft_revision <> p_expected_draft_revision then
    if v_rule.draft_revision = p_expected_draft_revision + 1
       and v_rule.name is not distinct from p_name
       and v_rule.owner_user_id is not distinct from v_owner
       and v_rule.trigger_key is not distinct from p_trigger_key
       and v_rule.conditions is not distinct from coalesce(p_conditions,'[]'::jsonb)
       and v_rule.actions is not distinct from p_actions
       and v_rule.priority is not distinct from p_priority
       and v_rule.config is not distinct from coalesce(p_config,'{}'::jsonb)
    then
      return query select v_rule.id,v_rule.draft_revision,true;
      return;
    end if;
    raise exception 'Automation draft revision conflict';
  end if;

  if v_rule.name is not distinct from p_name
     and v_rule.owner_user_id is not distinct from v_owner
     and v_rule.trigger_key is not distinct from p_trigger_key
     and v_rule.conditions is not distinct from coalesce(p_conditions,'[]'::jsonb)
     and v_rule.actions is not distinct from p_actions
     and v_rule.priority is not distinct from p_priority
     and v_rule.config is not distinct from coalesce(p_config,'{}'::jsonb)
  then
    return query select v_rule.id,v_rule.draft_revision,true;
    return;
  end if;

  update public.automation_rules
     set name=p_name,
         owner_user_id=v_owner,
         trigger_key=p_trigger_key,
         action_key=v_action_key,
         conditions=coalesce(p_conditions,'[]'::jsonb),
         actions=p_actions,
         priority=p_priority,
         config=coalesce(p_config,'{}'::jsonb),
         publication_state='DRAFT',
         draft_revision=v_rule.draft_revision+1
   where id=v_rule.id
  returning * into v_updated;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'AUTOMATION_RULE_DRAFT_UPDATED','automation_rule',v_rule.id::text,
    jsonb_build_object(
      'draftRevision',v_rule.draft_revision,
      'publicationState',v_rule.publication_state,
      'ownerUserId',v_rule.owner_user_id
    ),
    jsonb_build_object(
      'draftRevision',v_updated.draft_revision,
      'publicationState',v_updated.publication_state,
      'ownerUserId',v_updated.owner_user_id,
      'triggerKey',v_updated.trigger_key,
      'actionKeys',(select jsonb_agg(value->>'key') from jsonb_array_elements(v_updated.actions))
    )
  );

  return query select v_updated.id,v_updated.draft_revision,false;
end;
$$;

create or replace function public.publish_automation_rule(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_rule_id uuid,
  p_expected_draft_revision integer
)
returns table(resolved_rule_id uuid,published_version integer,replayed boolean)
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor_role text;
  v_rule public.automation_rules%rowtype;
  v_version integer;
begin
  select role into v_actor_role
    from public.organization_members
   where organization_id=p_organization_id and user_id=p_actor_user_id;
  if v_actor_role is distinct from 'OWNER' then
    raise exception 'Automation workflow publish requires Organization OWNER';
  end if;

  select * into v_rule
    from public.automation_rules
   where organization_id=p_organization_id and id=p_rule_id
   for update;
  if not found then raise exception 'Automation rule was not found'; end if;

  if v_rule.draft_revision <> p_expected_draft_revision then
    raise exception 'Automation draft revision conflict';
  end if;
  if v_rule.owner_user_id is null then
    raise exception 'Automation workflow must have an owner before publish';
  end if;

  if v_rule.publication_state='PUBLISHED'
     and v_rule.published_revision=v_rule.draft_revision
     and v_rule.latest_published_version>0
  then
    return query select v_rule.id,v_rule.latest_published_version,true;
    return;
  end if;

  v_version := v_rule.latest_published_version + 1;

  insert into public.automation_rule_versions(
    organization_id,automation_rule_id,version,draft_revision,
    name,owner_user_id,trigger_key,conditions,actions,priority,config,
    published_by_user_id
  ) values (
    v_rule.organization_id,v_rule.id,v_version,v_rule.draft_revision,
    v_rule.name,v_rule.owner_user_id,v_rule.trigger_key,
    v_rule.conditions,v_rule.actions,v_rule.priority,v_rule.config,
    p_actor_user_id
  );

  update public.automation_rules
     set publication_state='PUBLISHED',
         published_revision=v_rule.draft_revision,
         latest_published_version=v_version,
         last_published_at=now(),
         last_published_by_user_id=p_actor_user_id,
         execution_state=case when enabled then 'READY' else 'DISABLED' end
   where id=v_rule.id;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    'AUTOMATION_RULE_PUBLISHED','automation_rule',v_rule.id::text,
    jsonb_build_object(
      'draftRevision',v_rule.draft_revision,
      'latestPublishedVersion',v_rule.latest_published_version,
      'publicationState',v_rule.publication_state
    ),
    jsonb_build_object(
      'draftRevision',v_rule.draft_revision,
      'publishedVersion',v_version,
      'publicationState','PUBLISHED',
      'executionState',case when v_rule.enabled then 'READY' else 'DISABLED' end
    )
  );

  return query select v_rule.id,v_version,false;
end;
$$;

create or replace function public.set_automation_rule_enabled(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_rule_id uuid,
  p_enabled boolean
)
returns table(resolved_rule_id uuid,resolved_enabled boolean,resolved_execution_state text,replayed boolean)
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_actor_role text;
  v_rule public.automation_rules%rowtype;
  v_state text;
begin
  select role into v_actor_role
    from public.organization_members
   where organization_id=p_organization_id and user_id=p_actor_user_id;
  if v_actor_role is distinct from 'OWNER' then
    raise exception 'Automation enable/disable requires Organization OWNER';
  end if;

  select * into v_rule
    from public.automation_rules
   where organization_id=p_organization_id and id=p_rule_id
   for update;
  if not found then raise exception 'Automation rule was not found'; end if;

  if p_enabled and v_rule.latest_published_version=0 then
    raise exception 'Automation cannot be enabled before a published version exists';
  end if;

  v_state := case
    when v_rule.latest_published_version=0 then 'NOT_READY'
    when p_enabled then 'READY'
    else 'DISABLED'
  end;

  if v_rule.enabled=p_enabled and v_rule.execution_state=v_state then
    return query select v_rule.id,v_rule.enabled,v_rule.execution_state,true;
    return;
  end if;

  update public.automation_rules
     set enabled=p_enabled,
         execution_state=v_state
   where id=v_rule.id;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,before_data,after_data
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,
    case when p_enabled then 'AUTOMATION_RULE_ENABLED' else 'AUTOMATION_RULE_DISABLED' end,
    'automation_rule',v_rule.id::text,
    jsonb_build_object('enabled',v_rule.enabled,'executionState',v_rule.execution_state),
    jsonb_build_object('enabled',p_enabled,'executionState',v_state,'publishedVersion',v_rule.latest_published_version)
  );

  return query select v_rule.id,p_enabled,v_state,false;
end;
$$;

-- Browser sessions read governed definitions only. All mutation is routed
-- through server-only service-role RPCs carrying the human actor explicitly.
alter table public.automation_rules enable row level security;
alter table public.automation_rule_versions enable row level security;

drop policy if exists org_member_automation_rules on public.automation_rules;
drop policy if exists org_member_automation_rules_read on public.automation_rules;
drop policy if exists org_owner_automation_rules_write on public.automation_rules;
drop policy if exists org_owner_automation_rules_insert on public.automation_rules;
drop policy if exists org_owner_automation_rules_update on public.automation_rules;
drop policy if exists org_owner_automation_rules_delete on public.automation_rules;
drop policy if exists unified_inbox_business_wide_boundary on public.automation_rules;

create policy org_member_automation_rules_read
on public.automation_rules
for select
to authenticated
using (public.is_org_member(organization_id));

create policy unified_inbox_business_wide_boundary
on public.automation_rules
as restrictive
for all
to authenticated
using (public.is_unified_inbox_business_wide_member(organization_id))
with check (public.is_unified_inbox_business_wide_member(organization_id));

create policy automation_rule_versions_member_read
on public.automation_rule_versions
for select
to authenticated
using (public.is_org_member(organization_id));

create policy automation_rule_versions_business_wide_boundary
on public.automation_rule_versions
as restrictive
for all
to authenticated
using (public.is_unified_inbox_business_wide_member(organization_id))
with check (public.is_unified_inbox_business_wide_member(organization_id));

revoke all on table public.automation_rules from public,anon,authenticated,service_role;
grant select on table public.automation_rules to authenticated,service_role;
grant insert,update on table public.automation_rules to service_role;

revoke all on table public.automation_rule_versions from public,anon,authenticated,service_role;
grant select on table public.automation_rule_versions to authenticated,service_role;
grant insert on table public.automation_rule_versions to service_role;

revoke all on function public.enforce_automation_rule_definition() from public,anon,authenticated,service_role;
revoke all on function public.enforce_automation_rule_version_immutable() from public,anon,authenticated,service_role;

revoke all on function public.create_automation_rule_draft(uuid,uuid,text,text,jsonb,jsonb,integer,jsonb,uuid,text)
  from public,anon,authenticated;
revoke all on function public.update_automation_rule_draft(uuid,uuid,uuid,integer,text,text,jsonb,jsonb,integer,jsonb,uuid)
  from public,anon,authenticated;
revoke all on function public.publish_automation_rule(uuid,uuid,uuid,integer)
  from public,anon,authenticated;
revoke all on function public.set_automation_rule_enabled(uuid,uuid,uuid,boolean)
  from public,anon,authenticated;

grant execute on function public.create_automation_rule_draft(uuid,uuid,text,text,jsonb,jsonb,integer,jsonb,uuid,text)
  to service_role;
grant execute on function public.update_automation_rule_draft(uuid,uuid,uuid,integer,text,text,jsonb,jsonb,integer,jsonb,uuid)
  to service_role;
grant execute on function public.publish_automation_rule(uuid,uuid,uuid,integer)
  to service_role;
grant execute on function public.set_automation_rule_enabled(uuid,uuid,uuid,boolean)
  to service_role;
