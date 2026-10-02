-- 0182: KNOWLEDGE-V2
-- Extend the existing knowledge_versions authority with governed source provenance,
-- approval, freshness, conflict handling and scoped retrieval. No second Knowledge
-- Base, vector authority, ingestion queue or IAM model is introduced.

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_key text not null,
  source_type text not null check (source_type in (
    'WEBSITE','PDF','DOC','FAQ','POLICY','MANUAL','CATALOG','TEXT'
  )),
  title text not null check (length(btrim(title)) between 1 and 240),
  source_locator text,
  scope_type text not null default 'ORGANIZATION'
    check (scope_type in ('ORGANIZATION','BUSINESS','BRANCH')),
  tenant_business_id uuid,
  branch_id uuid,
  sensitivity text not null default 'INTERNAL'
    check (sensitivity in ('PUBLIC','INTERNAL','CONFIDENTIAL')),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','PAUSED','RETIRED')),
  refresh_policy text not null default 'MANUAL'
    check (refresh_policy in ('MANUAL','INTERVAL')),
  refresh_interval_minutes integer
    check (refresh_interval_minutes is null or refresh_interval_minutes between 60 and 525600),
  last_refresh_attempt_at timestamptz,
  last_refreshed_at timestamptz,
  last_changed_at timestamptz,
  next_refresh_at timestamptz,
  stale_after_at timestamptz,
  latest_content_hash text,
  latest_etag text,
  latest_modified text,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=32768),
  version integer not null default 1 check (version>=1),
  last_request_key text not null,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,source_key),
  foreign key (organization_id,tenant_business_id)
    references public.tenant_businesses(organization_id,id) on delete cascade,
  foreign key (organization_id,branch_id)
    references public.branches(organization_id,id) on delete cascade,
  foreign key (organization_id,created_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  foreign key (organization_id,updated_by_user_id)
    references public.organization_members(organization_id,user_id) on delete restrict,
  check (
    (scope_type='ORGANIZATION' and tenant_business_id is null and branch_id is null)
    or (scope_type='BUSINESS' and tenant_business_id is not null and branch_id is null)
    or (scope_type='BRANCH' and tenant_business_id is null and branch_id is not null)
  ),
  check (length(btrim(source_key)) between 2 and 120),
  check (source_key=lower(source_key) and source_key ~ '^[a-z][a-z0-9_.-]{1,119}$'),
  check (source_locator is null or length(source_locator)<=2000),
  check (length(btrim(last_request_key)) between 8 and 200)
);

comment on table public.knowledge_sources is
  'Canonical Knowledge source registry. It records provenance/freshness for knowledge_versions and does not persist a parallel retrieval store.';

create index knowledge_sources_org_status_idx
  on public.knowledge_sources(organization_id,status,updated_at desc);
create index knowledge_sources_org_business_idx
  on public.knowledge_sources(organization_id,tenant_business_id)
  where tenant_business_id is not null;
create index knowledge_sources_org_branch_idx
  on public.knowledge_sources(organization_id,branch_id)
  where branch_id is not null;
create index knowledge_sources_created_by_idx
  on public.knowledge_sources(organization_id,created_by_user_id);
create index knowledge_sources_updated_by_idx
  on public.knowledge_sources(organization_id,updated_by_user_id);
create index knowledge_sources_refresh_due_idx
  on public.knowledge_sources(next_refresh_at)
  where status='ACTIVE' and refresh_policy='INTERVAL';

alter table public.knowledge_sources enable row level security;

alter table public.knowledge_versions
  add column source_id uuid references public.knowledge_sources(id) on delete set null,
  add column content_hash text,
  add column approval_status text not null default 'APPROVED'
    check (approval_status in ('PENDING_REVIEW','APPROVED','REJECTED')),
  add column provenance jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance)='object' and octet_length(provenance::text)<=32768),
  add column approved_by_user_id uuid,
  add column approved_at timestamptz,
  add column rejected_by_user_id uuid,
  add column rejected_at timestamptz,
  add column rejection_reason text,
  add column supersedes_version_id uuid references public.knowledge_versions(id) on delete set null,
  add column conflict_state text not null default 'NONE'
    check (conflict_state in ('NONE','POTENTIAL','RESOLVED')),
  add column stale_after_at timestamptz,
  add column source_refreshed_at timestamptz,
  add column sensitivity text not null default 'INTERNAL'
    check (sensitivity in ('PUBLIC','INTERNAL','CONFIDENTIAL')),
  add column scope_type text not null default 'ORGANIZATION'
    check (scope_type in ('ORGANIZATION','BUSINESS','BRANCH')),
  add column tenant_business_id uuid,
  add column branch_id uuid,
  add column retrieval_enabled boolean not null default true,
  add foreign key (organization_id,approved_by_user_id)
    references public.organization_members(organization_id,user_id) on delete set null,
  add foreign key (organization_id,rejected_by_user_id)
    references public.organization_members(organization_id,user_id) on delete set null,
  add foreign key (organization_id,tenant_business_id)
    references public.tenant_businesses(organization_id,id) on delete cascade,
  add foreign key (organization_id,branch_id)
    references public.branches(organization_id,id) on delete cascade,
  add constraint knowledge_versions_scope_shape check (
    (scope_type='ORGANIZATION' and tenant_business_id is null and branch_id is null)
    or (scope_type='BUSINESS' and tenant_business_id is not null and branch_id is null)
    or (scope_type='BRANCH' and tenant_business_id is null and branch_id is not null)
  );

update public.knowledge_versions
set content_hash=md5(payload::text),
    approval_status='APPROVED',
    approved_by_user_id=created_by,
    approved_at=created_at,
    provenance=case
      when provenance='{}'::jsonb
        then jsonb_build_object('sourceType','LEGACY_APPROVED','migratedBy','0182_knowledge_v2')
      else provenance
    end,
    conflict_state='RESOLVED'
where content_hash is null;

alter table public.knowledge_versions
  alter column content_hash set not null;

create index knowledge_versions_source_idx
  on public.knowledge_versions(source_id);
create index knowledge_versions_supersedes_idx
  on public.knowledge_versions(supersedes_version_id);
create index knowledge_versions_org_approval_idx
  on public.knowledge_versions(organization_id,approval_status,active,created_at desc);
create index knowledge_versions_org_business_scope_idx
  on public.knowledge_versions(organization_id,tenant_business_id)
  where tenant_business_id is not null;
create index knowledge_versions_org_branch_scope_idx
  on public.knowledge_versions(organization_id,branch_id)
  where branch_id is not null;
create index knowledge_versions_approved_by_idx
  on public.knowledge_versions(organization_id,approved_by_user_id)
  where approved_by_user_id is not null;
create index knowledge_versions_rejected_by_idx
  on public.knowledge_versions(organization_id,rejected_by_user_id)
  where rejected_by_user_id is not null;

drop policy if exists org_member_knowledge_read on public.knowledge_versions;
drop policy if exists org_owner_knowledge_delete on public.knowledge_versions;
drop policy if exists org_owner_knowledge_insert on public.knowledge_versions;
drop policy if exists org_owner_knowledge_update on public.knowledge_versions;
drop policy if exists unified_inbox_business_wide_boundary on public.knowledge_versions;

create policy knowledge_versions_scoped_read
on public.knowledge_versions
for select
to authenticated
using (
  exists(
    select 1 from public.organization_members m
    where m.organization_id=knowledge_versions.organization_id
      and m.user_id=(select auth.uid())
      and m.role in ('OWNER','ADMIN')
  )
  or (
    approval_status='APPROVED'
    and active=true
    and retrieval_enabled=true
    and public.can_access_unified_inbox_scope(
      organization_id,null,tenant_business_id,branch_id,null,null
    )
  )
);

create policy knowledge_sources_manager_read
on public.knowledge_sources
for select
to authenticated
using (
  exists(
    select 1 from public.organization_members m
    where m.organization_id=knowledge_sources.organization_id
      and m.user_id=(select auth.uid())
      and m.role in ('OWNER','ADMIN')
  )
);

revoke all on table public.knowledge_sources from public,anon,authenticated,service_role;
grant select on table public.knowledge_sources to authenticated,service_role;
grant insert,update on table public.knowledge_sources to service_role;

revoke all on table public.knowledge_versions from public,anon,authenticated,service_role;
grant select on table public.knowledge_versions to authenticated,service_role;
grant insert,update on table public.knowledge_versions to service_role;

create unique index knowledge_v2_audit_request_uidx
  on public.audit_logs(organization_id,action,entity_type,entity_id,correlation_id)
  where action like 'KNOWLEDGE_%' and correlation_id is not null;

create or replace function private.knowledge_v2_assert_manager(
  p_organization_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path=public,pg_catalog
as $knowledge_manager$
begin
  if p_organization_id is null or p_actor_user_id is null then
    raise exception 'Knowledge Organization and actor are required';
  end if;
  if not exists(
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id
      and m.user_id=p_actor_user_id
      and m.role in ('OWNER','ADMIN')
  ) then
    raise exception 'Knowledge mutation requires OWNER or ADMIN';
  end if;
end;
$knowledge_manager$;

create or replace function private.knowledge_v2_validate_scope(
  p_organization_id uuid,
  p_scope_type text,
  p_tenant_business_id uuid,
  p_branch_id uuid
)
returns void
language plpgsql
security invoker
set search_path=public,pg_catalog
as $knowledge_scope$
declare
  v_scope text:=upper(btrim(coalesce(p_scope_type,'')));
begin
  if v_scope='ORGANIZATION' then
    if p_tenant_business_id is not null or p_branch_id is not null then
      raise exception 'Organization Knowledge scope cannot include Business or Branch';
    end if;
  elsif v_scope='BUSINESS' then
    if p_tenant_business_id is null or p_branch_id is not null
       or not exists(
         select 1 from public.tenant_businesses b
         where b.organization_id=p_organization_id
           and b.id=p_tenant_business_id and b.status='ACTIVE'
       )
    then raise exception 'Knowledge Business scope is invalid'; end if;
  elsif v_scope='BRANCH' then
    if p_branch_id is null or p_tenant_business_id is not null
       or not exists(
         select 1 from public.branches b
         where b.organization_id=p_organization_id
           and b.id=p_branch_id and b.status='ACTIVE'
       )
    then raise exception 'Knowledge Branch scope is invalid'; end if;
  else
    raise exception 'Knowledge scope type is invalid';
  end if;
end;
$knowledge_scope$;

create or replace function public.guard_knowledge_source_v2_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $knowledge_source_guard$
begin
  if coalesce(current_setting('app.knowledge_v2_mutation',true),'')<>'allowed' then
    raise exception 'Knowledge Source mutation requires governed command';
  end if;
  if tg_op='DELETE' then
    raise exception 'Knowledge Source history cannot be deleted';
  end if;
  if tg_op='INSERT' and new.version<>1 then
    raise exception 'Knowledge Source first version must be 1';
  end if;
  if tg_op='UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.id is distinct from old.id
       or new.created_at is distinct from old.created_at
       or new.created_by_user_id is distinct from old.created_by_user_id
    then raise exception 'Knowledge Source identity is immutable'; end if;
    if new.version<>old.version+1 then
      raise exception 'Knowledge Source version must advance exactly once';
    end if;
  end if;
  new.updated_at:=statement_timestamp();
  return new;
end;
$knowledge_source_guard$;

create trigger knowledge_sources_governed_mutation
before insert or update or delete on public.knowledge_sources
for each row execute function public.guard_knowledge_source_v2_mutation();

create or replace function public.guard_knowledge_version_v2_mutation()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_catalog
as $knowledge_version_guard$
begin
  if coalesce(current_setting('app.knowledge_v2_mutation',true),'')<>'allowed' then
    raise exception 'Knowledge Version mutation requires governed command';
  end if;
  if tg_op='DELETE' then
    raise exception 'Knowledge Version history cannot be deleted';
  end if;
  if tg_op='UPDATE' then
    if new.organization_id is distinct from old.organization_id
       or new.knowledge_key is distinct from old.knowledge_key
       or new.version is distinct from old.version
       or new.payload is distinct from old.payload
       or new.content_hash is distinct from old.content_hash
       or new.source_id is distinct from old.source_id
       or new.provenance is distinct from old.provenance
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.scope_type is distinct from old.scope_type
       or new.tenant_business_id is distinct from old.tenant_business_id
       or new.branch_id is distinct from old.branch_id
       or new.sensitivity is distinct from old.sensitivity
       or new.supersedes_version_id is distinct from old.supersedes_version_id
    then
      raise exception 'Knowledge Version content/provenance identity is immutable';
    end if;
  end if;
  return new;
end;
$knowledge_version_guard$;

create trigger knowledge_versions_governed_mutation
before insert or update or delete on public.knowledge_versions
for each row execute function public.guard_knowledge_version_v2_mutation();

create or replace function public.configure_knowledge_source_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_source_key text,
  p_source_type text,
  p_title text,
  p_source_locator text,
  p_scope_type text,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_sensitivity text,
  p_status text,
  p_refresh_policy text,
  p_refresh_interval_minutes integer,
  p_metadata jsonb,
  p_expected_version integer,
  p_request_key text
)
returns public.knowledge_sources
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $knowledge_source_configure$
declare
  v_key text:=lower(btrim(coalesce(p_source_key,'')));
  v_type text:=upper(btrim(coalesce(p_source_type,'')));
  v_scope text:=upper(btrim(coalesce(p_scope_type,'ORGANIZATION')));
  v_sensitivity text:=upper(btrim(coalesce(p_sensitivity,'INTERNAL')));
  v_status text:=upper(btrim(coalesce(p_status,'ACTIVE')));
  v_refresh text:=upper(btrim(coalesce(p_refresh_policy,'MANUAL')));
  v_existing public.knowledge_sources%rowtype;
  v_result public.knowledge_sources%rowtype;
  v_hash text;
  v_replay_hash text;
begin
  if current_user<>'service_role' then raise exception 'Knowledge Source mutation is service-only'; end if;
  perform private.knowledge_v2_assert_manager(p_organization_id,p_actor_user_id);
  perform private.knowledge_v2_validate_scope(
    p_organization_id,v_scope,p_tenant_business_id,p_branch_id
  );

  if v_key !~ '^[a-z][a-z0-9_.-]{1,119}$' then raise exception 'Knowledge Source key is invalid'; end if;
  if v_type not in ('WEBSITE','PDF','DOC','FAQ','POLICY','MANUAL','CATALOG','TEXT') then
    raise exception 'Knowledge Source type is invalid';
  end if;
  if length(btrim(coalesce(p_title,''))) not between 1 and 240 then
    raise exception 'Knowledge Source title is invalid';
  end if;
  if p_source_locator is not null and length(p_source_locator)>2000 then
    raise exception 'Knowledge Source locator is too long';
  end if;
  if v_sensitivity not in ('PUBLIC','INTERNAL','CONFIDENTIAL') then
    raise exception 'Knowledge Source sensitivity is invalid';
  end if;
  if v_status not in ('ACTIVE','PAUSED','RETIRED') then raise exception 'Knowledge Source status is invalid'; end if;
  if v_refresh not in ('MANUAL','INTERVAL') then raise exception 'Knowledge Source refresh policy is invalid'; end if;
  if v_refresh='INTERVAL' and (
    p_refresh_interval_minutes is null or p_refresh_interval_minutes not between 60 and 525600
  ) then raise exception 'Knowledge Source interval is invalid'; end if;
  if v_refresh='MANUAL' and p_refresh_interval_minutes is not null then
    raise exception 'Manual Knowledge Source cannot have refresh interval';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>32768 then
    raise exception 'Knowledge Source metadata is invalid';
  end if;
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Knowledge Source request key is invalid';
  end if;

  v_hash:=md5(jsonb_build_object(
    'sourceKey',v_key,'sourceType',v_type,'title',btrim(p_title),
    'sourceLocator',nullif(btrim(coalesce(p_source_locator,'')),''),
    'scopeType',v_scope,'businessId',p_tenant_business_id,'branchId',p_branch_id,
    'sensitivity',v_sensitivity,'status',v_status,'refreshPolicy',v_refresh,
    'refreshIntervalMinutes',p_refresh_interval_minutes,'metadata',p_metadata,
    'expectedVersion',p_expected_version
  )::text);

  select a.after_data->>'requestHash' into v_replay_hash
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action='KNOWLEDGE_SOURCE_CONFIGURED'
    and a.entity_type='knowledge_source'
    and a.entity_id=v_key
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc limit 1;

  if v_replay_hash is not null then
    if v_replay_hash<>v_hash then raise exception 'Knowledge Source request key conflict'; end if;
    select * into v_result from public.knowledge_sources
    where organization_id=p_organization_id and source_key=v_key;
    if not found then raise exception 'Knowledge Source replay target missing'; end if;
    return v_result;
  end if;

  select * into v_existing
  from public.knowledge_sources
  where organization_id=p_organization_id and source_key=v_key
  for update;

  if found then
    if p_expected_version is null or p_expected_version<>v_existing.version then
      raise exception 'Knowledge Source version changed';
    end if;
  elsif p_expected_version is not null then
    raise exception 'Knowledge Source does not exist at expected version';
  end if;

  perform set_config('app.knowledge_v2_mutation','allowed',true);

  if v_existing.id is null then
    insert into public.knowledge_sources(
      organization_id,source_key,source_type,title,source_locator,
      scope_type,tenant_business_id,branch_id,sensitivity,status,
      refresh_policy,refresh_interval_minutes,next_refresh_at,stale_after_at,
      metadata,version,last_request_key,created_by_user_id,updated_by_user_id
    ) values (
      p_organization_id,v_key,v_type,btrim(p_title),
      nullif(btrim(coalesce(p_source_locator,'')),''),
      v_scope,p_tenant_business_id,p_branch_id,v_sensitivity,v_status,
      v_refresh,case when v_refresh='INTERVAL' then p_refresh_interval_minutes else null end,
      case when v_refresh='INTERVAL' then statement_timestamp() else null end,
      case when v_refresh='INTERVAL' then statement_timestamp() else null end,
      p_metadata,1,p_request_key,p_actor_user_id,p_actor_user_id
    ) returning * into v_result;
  else
    update public.knowledge_sources
    set source_type=v_type,title=btrim(p_title),
        source_locator=nullif(btrim(coalesce(p_source_locator,'')),''),
        scope_type=v_scope,tenant_business_id=p_tenant_business_id,branch_id=p_branch_id,
        sensitivity=v_sensitivity,status=v_status,refresh_policy=v_refresh,
        refresh_interval_minutes=case when v_refresh='INTERVAL' then p_refresh_interval_minutes else null end,
        next_refresh_at=case
          when v_refresh='INTERVAL' and last_refreshed_at is null then statement_timestamp()
          when v_refresh='INTERVAL' then last_refreshed_at+make_interval(mins=>p_refresh_interval_minutes)
          else null end,
        stale_after_at=case
          when v_refresh='INTERVAL' and last_refreshed_at is null then statement_timestamp()
          when v_refresh='INTERVAL' then last_refreshed_at+make_interval(mins=>p_refresh_interval_minutes*2)
          else null end,
        metadata=p_metadata,version=version+1,last_request_key=p_request_key,
        updated_by_user_id=p_actor_user_id
    where id=v_existing.id
    returning * into v_result;
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'KNOWLEDGE_SOURCE_CONFIGURED',
    'knowledge_source',v_key,
    jsonb_build_object(
      'requestHash',v_hash,'sourceId',v_result.id,'version',v_result.version,
      'sourceType',v_result.source_type,'scopeType',v_result.scope_type,
      'status',v_result.status,'sensitivity',v_result.sensitivity
    ),
    p_request_key
  );

  return v_result;
end;
$knowledge_source_configure$;

create or replace function public.stage_knowledge_version_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_source_id uuid,
  p_knowledge_key text,
  p_payload jsonb,
  p_provenance jsonb,
  p_expected_source_version integer,
  p_etag text,
  p_last_modified text,
  p_request_key text
)
returns table(
  version_id uuid,
  resolved_version integer,
  approval_state text,
  unchanged boolean
)
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $knowledge_stage$
declare
  v_key text:=lower(btrim(coalesce(p_knowledge_key,'')));
  v_source public.knowledge_sources%rowtype;
  v_active public.knowledge_versions%rowtype;
  v_existing public.knowledge_versions%rowtype;
  v_next integer;
  v_hash text;
  v_request_hash text;
  v_replay_hash text;
  v_replay_id uuid;
  v_now timestamptz:=statement_timestamp();
  v_stale_after timestamptz;
begin
  if current_user<>'service_role' then raise exception 'Knowledge ingestion is service-only'; end if;
  perform private.knowledge_v2_assert_manager(p_organization_id,p_actor_user_id);
  if p_source_id is null then raise exception 'Knowledge ingestion requires a registered Source'; end if;
  if v_key !~ '^[a-z][a-z0-9_.-]{1,119}$' then raise exception 'Knowledge key is invalid'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_payload='{}'::jsonb
     or octet_length(p_payload::text)>524288 then
    raise exception 'Knowledge payload is invalid or too large';
  end if;
  if p_provenance is null or jsonb_typeof(p_provenance)<>'object'
     or octet_length(p_provenance::text)>32768 then
    raise exception 'Knowledge provenance is invalid';
  end if;
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Knowledge ingestion request key is invalid';
  end if;

  select * into v_source from public.knowledge_sources
  where organization_id=p_organization_id and id=p_source_id
  for update;
  if not found or v_source.status<>'ACTIVE' then
    raise exception 'Knowledge Source is missing or inactive';
  end if;
  if p_expected_source_version is null or p_expected_source_version<>v_source.version then
    raise exception 'Knowledge Source version changed';
  end if;

  v_hash:=md5(p_payload::text);
  v_request_hash:=md5(jsonb_build_object(
    'sourceId',p_source_id,'knowledgeKey',v_key,'payloadHash',v_hash,
    'expectedSourceVersion',p_expected_source_version,
    'etag',nullif(btrim(coalesce(p_etag,'')),''),
    'lastModified',nullif(btrim(coalesce(p_last_modified,'')),'')
  )::text);

  select a.after_data->>'requestHash',(a.after_data->>'versionId')::uuid
    into v_replay_hash,v_replay_id
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action='KNOWLEDGE_VERSION_STAGED'
    and a.entity_type='knowledge'
    and a.entity_id=v_key
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc limit 1;

  if v_replay_hash is not null then
    if v_replay_hash<>v_request_hash then raise exception 'Knowledge ingestion request key conflict'; end if;
    select * into v_existing from public.knowledge_versions
    where organization_id=p_organization_id and id=v_replay_id;
    if not found then raise exception 'Knowledge ingestion replay version is missing'; end if;
    return query select v_existing.id,v_existing.version,v_existing.approval_status,false;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':knowledge:'||v_key,0));

  select * into v_active
  from public.knowledge_versions
  where organization_id=p_organization_id and knowledge_key=v_key and active
  limit 1;

  v_stale_after:=case
    when v_source.refresh_policy='INTERVAL'
      then v_now + make_interval(mins=>v_source.refresh_interval_minutes*2)
    else null
  end;

  perform set_config('app.knowledge_v2_mutation','allowed',true);

  update public.knowledge_sources
  set last_refresh_attempt_at=v_now,last_refreshed_at=v_now,
      last_changed_at=case when latest_content_hash is distinct from v_hash then v_now else last_changed_at end,
      next_refresh_at=case when refresh_policy='INTERVAL' then v_now+make_interval(mins=>refresh_interval_minutes) else null end,
      stale_after_at=v_stale_after,latest_content_hash=v_hash,
      latest_etag=nullif(btrim(coalesce(p_etag,'')),''),
      latest_modified=nullif(btrim(coalesce(p_last_modified,'')),''),
      last_error_code=null,version=version+1,last_request_key=p_request_key,
      updated_by_user_id=p_actor_user_id
  where id=v_source.id
  returning * into v_source;

  if v_active.id is not null and v_active.content_hash=v_hash
     and v_active.approval_status='APPROVED'
  then
    update public.knowledge_versions
    set source_refreshed_at=v_now,stale_after_at=v_stale_after
    where id=v_active.id
    returning * into v_existing;

    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
    ) values (
      p_organization_id,'USER',p_actor_user_id::text,'KNOWLEDGE_VERSION_STAGED',
      'knowledge',v_key,
      jsonb_build_object(
        'requestHash',v_request_hash,'versionId',v_existing.id,'version',v_existing.version,
        'approvalStatus',v_existing.approval_status,'unchanged',true,'sourceId',v_source.id
      ),p_request_key
    );
    return query select v_existing.id,v_existing.version,v_existing.approval_status,true;
    return;
  end if;

  select * into v_existing
  from public.knowledge_versions
  where organization_id=p_organization_id
    and knowledge_key=v_key
    and content_hash=v_hash
    and approval_status='PENDING_REVIEW'
  order by version desc
  limit 1;

  if v_existing.id is not null then
    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
    ) values (
      p_organization_id,'USER',p_actor_user_id::text,'KNOWLEDGE_VERSION_STAGED',
      'knowledge',v_key,
      jsonb_build_object(
        'requestHash',v_request_hash,'versionId',v_existing.id,'version',v_existing.version,
        'approvalStatus',v_existing.approval_status,'unchanged',true,'sourceId',v_source.id,
        'pendingDeduplicated',true
      ),p_request_key
    );
    return query select v_existing.id,v_existing.version,v_existing.approval_status,true;
    return;
  end if;

  select coalesce(max(k.version),0)+1 into v_next
  from public.knowledge_versions k
  where k.organization_id=p_organization_id and k.knowledge_key=v_key;

  insert into public.knowledge_versions(
    organization_id,knowledge_key,version,payload,active,created_by,
    source_id,content_hash,approval_status,provenance,supersedes_version_id,
    conflict_state,stale_after_at,source_refreshed_at,sensitivity,scope_type,
    tenant_business_id,branch_id,retrieval_enabled
  ) values (
    p_organization_id,v_key,v_next,p_payload,false,p_actor_user_id,
    v_source.id,v_hash,'PENDING_REVIEW',
    p_provenance||jsonb_build_object(
      'sourceId',v_source.id,'sourceKey',v_source.source_key,
      'sourceType',v_source.source_type,'sourceLocator',v_source.source_locator,
      'observedAt',v_now
    ),
    v_active.id,
    case when v_active.id is not null and v_active.content_hash<>v_hash then 'POTENTIAL' else 'NONE' end,
    v_stale_after,v_now,v_source.sensitivity,v_source.scope_type,
    v_source.tenant_business_id,v_source.branch_id,true
  ) returning * into v_existing;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'KNOWLEDGE_VERSION_STAGED',
    'knowledge',v_key,
    jsonb_build_object(
      'requestHash',v_request_hash,'versionId',v_existing.id,'version',v_existing.version,
      'approvalStatus',v_existing.approval_status,'unchanged',false,'sourceId',v_source.id,
      'conflictState',v_existing.conflict_state
    ),p_request_key
  );

  return query select v_existing.id,v_existing.version,v_existing.approval_status,false;
end;
$knowledge_stage$;

create or replace function public.publish_manual_knowledge_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_knowledge_key text,
  p_payload jsonb,
  p_request_key text
)
returns table(version_id uuid,resolved_version integer,unchanged boolean)
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $knowledge_manual$
declare
  v_key text:=lower(btrim(coalesce(p_knowledge_key,'')));
  v_hash text;
  v_active public.knowledge_versions%rowtype;
  v_result public.knowledge_versions%rowtype;
  v_next integer;
  v_request_hash text;
  v_replay_hash text;
  v_replay_id uuid;
begin
  if current_user<>'service_role' then raise exception 'Manual Knowledge publish is service-only'; end if;
  perform private.knowledge_v2_assert_manager(p_organization_id,p_actor_user_id);
  if v_key !~ '^[a-z][a-z0-9_.-]{1,119}$' then raise exception 'Knowledge key is invalid'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_payload='{}'::jsonb
     or octet_length(p_payload::text)>524288 then
    raise exception 'Knowledge payload is invalid or too large';
  end if;
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Knowledge publish request key is invalid';
  end if;

  v_hash:=md5(p_payload::text);
  v_request_hash:=md5(jsonb_build_object(
    'knowledgeKey',v_key,'payloadHash',v_hash
  )::text);

  select a.after_data->>'requestHash',(a.after_data->>'versionId')::uuid
  into v_replay_hash,v_replay_id
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action='KNOWLEDGE_MANUAL_PUBLISHED'
    and a.entity_type='knowledge'
    and a.entity_id=v_key
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc limit 1;

  if v_replay_hash is not null then
    if v_replay_hash<>v_request_hash then raise exception 'Knowledge publish request key conflict'; end if;
    select * into v_result from public.knowledge_versions
    where organization_id=p_organization_id and id=v_replay_id;
    if not found then raise exception 'Knowledge publish replay version is missing'; end if;
    return query select v_result.id,v_result.version,true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':knowledge:'||v_key,0));

  select * into v_active
  from public.knowledge_versions
  where organization_id=p_organization_id and knowledge_key=v_key and active
  limit 1;

  if v_active.id is not null and v_active.content_hash=v_hash
     and v_active.approval_status='APPROVED'
  then
    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
    ) values (
      p_organization_id,'USER',p_actor_user_id::text,'KNOWLEDGE_MANUAL_PUBLISHED',
      'knowledge',v_key,
      jsonb_build_object(
        'requestHash',v_request_hash,'versionId',v_active.id,'version',v_active.version,
        'unchanged',true
      ),p_request_key
    );
    return query select v_active.id,v_active.version,true;
    return;
  end if;

  select coalesce(max(k.version),0)+1 into v_next
  from public.knowledge_versions k
  where k.organization_id=p_organization_id and k.knowledge_key=v_key;

  perform set_config('app.knowledge_v2_mutation','allowed',true);

  update public.knowledge_versions set active=false
  where organization_id=p_organization_id and knowledge_key=v_key and active;

  insert into public.knowledge_versions(
    organization_id,knowledge_key,version,payload,active,created_by,
    content_hash,approval_status,provenance,approved_by_user_id,approved_at,
    supersedes_version_id,conflict_state,sensitivity,scope_type,retrieval_enabled
  ) values (
    p_organization_id,v_key,v_next,p_payload,true,p_actor_user_id,
    v_hash,'APPROVED',
    jsonb_build_object('sourceType','MANUAL','approvedExplicitly',true),
    p_actor_user_id,statement_timestamp(),v_active.id,'RESOLVED',
    'INTERNAL','ORGANIZATION',true
  ) returning * into v_result;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'KNOWLEDGE_MANUAL_PUBLISHED',
    'knowledge',v_key,
    jsonb_build_object(
      'requestHash',v_request_hash,'versionId',v_result.id,'version',v_result.version,
      'unchanged',false
    ),p_request_key
  );

  return query select v_result.id,v_result.version,false;
end;
$knowledge_manual$;

create or replace function public.approve_knowledge_version_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_version_id uuid,
  p_request_key text
)
returns public.knowledge_versions
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $knowledge_approve$
declare
  v_target public.knowledge_versions%rowtype;
  v_active public.knowledge_versions%rowtype;
  v_result public.knowledge_versions%rowtype;
  v_request_hash text;
  v_replay_hash text;
begin
  if current_user<>'service_role' then raise exception 'Knowledge approval is service-only'; end if;
  perform private.knowledge_v2_assert_manager(p_organization_id,p_actor_user_id);
  if p_version_id is null or length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Knowledge approval payload is invalid';
  end if;

  v_request_hash:=md5(jsonb_build_object('versionId',p_version_id)::text);
  select a.after_data->>'requestHash' into v_replay_hash
  from public.audit_logs a
  where a.organization_id=p_organization_id
    and a.action='KNOWLEDGE_VERSION_APPROVED'
    and a.entity_type='knowledge_version'
    and a.entity_id=p_version_id::text
    and a.correlation_id=p_request_key
  order by a.created_at desc,a.id desc limit 1;
  if v_replay_hash is not null then
    if v_replay_hash<>v_request_hash then raise exception 'Knowledge approval request key conflict'; end if;
    select * into v_result from public.knowledge_versions
    where organization_id=p_organization_id and id=p_version_id;
    return v_result;
  end if;

  select * into v_target from public.knowledge_versions
  where organization_id=p_organization_id and id=p_version_id
  for update;
  if not found then raise exception 'Knowledge version not found'; end if;
  if v_target.approval_status='REJECTED' then raise exception 'Rejected Knowledge version cannot be approved'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':knowledge:'||v_target.knowledge_key,0));

  select * into v_active from public.knowledge_versions
  where organization_id=p_organization_id
    and knowledge_key=v_target.knowledge_key and active
  limit 1;

  if v_target.active and v_target.approval_status='APPROVED' then
    v_result:=v_target;
  else
    perform set_config('app.knowledge_v2_mutation','allowed',true);
    update public.knowledge_versions set active=false
    where organization_id=p_organization_id
      and knowledge_key=v_target.knowledge_key and active
      and id<>v_target.id;

    update public.knowledge_versions
    set active=true,approval_status='APPROVED',
        approved_by_user_id=p_actor_user_id,approved_at=statement_timestamp(),
        rejected_by_user_id=null,rejected_at=null,rejection_reason=null,
        conflict_state='RESOLVED'
    where id=v_target.id
    returning * into v_result;
  end if;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'KNOWLEDGE_VERSION_APPROVED',
    'knowledge_version',p_version_id::text,
    jsonb_build_object(
      'requestHash',v_request_hash,'knowledgeKey',v_result.knowledge_key,
      'version',v_result.version,'supersededVersionId',v_active.id
    ),p_request_key
  );

  return v_result;
end;
$knowledge_approve$;

create or replace function public.reject_knowledge_version_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_version_id uuid,
  p_reason text,
  p_request_key text
)
returns public.knowledge_versions
language plpgsql
security invoker
set search_path=public,private,pg_catalog
as $knowledge_reject$
declare
  v_target public.knowledge_versions%rowtype;
  v_result public.knowledge_versions%rowtype;
  v_reason text:=btrim(coalesce(p_reason,''));
begin
  if current_user<>'service_role' then raise exception 'Knowledge rejection is service-only'; end if;
  perform private.knowledge_v2_assert_manager(p_organization_id,p_actor_user_id);
  if p_version_id is null or length(v_reason) not between 2 and 500
     or length(btrim(coalesce(p_request_key,''))) not between 8 and 200 then
    raise exception 'Knowledge rejection payload is invalid';
  end if;

  select * into v_target from public.knowledge_versions
  where organization_id=p_organization_id and id=p_version_id
  for update;
  if not found then raise exception 'Knowledge version not found'; end if;
  if v_target.active or v_target.approval_status='APPROVED' then
    raise exception 'Active/approved Knowledge version cannot be rejected';
  end if;

  perform set_config('app.knowledge_v2_mutation','allowed',true);
  update public.knowledge_versions
  set approval_status='REJECTED',rejected_by_user_id=p_actor_user_id,
      rejected_at=statement_timestamp(),rejection_reason=v_reason,
      retrieval_enabled=false
  where id=v_target.id
  returning * into v_result;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'KNOWLEDGE_VERSION_REJECTED',
    'knowledge_version',p_version_id::text,
    jsonb_build_object(
      'knowledgeKey',v_result.knowledge_key,'version',v_result.version,
      'reason',v_reason
    ),p_request_key
  );

  return v_result;
end;
$knowledge_reject$;

create or replace function public.get_knowledge_context_v2(
  p_organization_id uuid,
  p_tenant_business_id uuid default null,
  p_branch_id uuid default null,
  p_include_stale boolean default false,
  p_limit integer default 50
)
returns table(
  knowledge_key text,
  version integer,
  payload jsonb,
  source_type text,
  source_locator text,
  provenance jsonb,
  sensitivity text,
  scope_type text,
  stale boolean,
  conflict_state text
)
language sql
stable
security invoker
set search_path=public,pg_catalog
as $knowledge_context$
  select
    k.knowledge_key,k.version,k.payload,
    coalesce(s.source_type,k.provenance->>'sourceType','MANUAL') as source_type,
    s.source_locator,k.provenance,k.sensitivity,k.scope_type,
    coalesce(coalesce(k.stale_after_at,s.stale_after_at)<statement_timestamp(),false) as stale,
    k.conflict_state
  from public.knowledge_versions k
  left join public.knowledge_sources s
    on s.organization_id=k.organization_id and s.id=k.source_id
  where k.organization_id=p_organization_id
    and k.active=true
    and k.approval_status='APPROVED'
    and k.retrieval_enabled=true
    and (s.id is null or s.status='ACTIVE')
    and (
      k.scope_type='ORGANIZATION'
      or (k.scope_type='BUSINESS' and k.tenant_business_id=p_tenant_business_id)
      or (k.scope_type='BRANCH' and k.branch_id=p_branch_id)
    )
    and (
      p_include_stale
      or coalesce(k.stale_after_at,s.stale_after_at) is null
      or coalesce(k.stale_after_at,s.stale_after_at)>=statement_timestamp()
    )
  order by
    case k.sensitivity when 'PUBLIC' then 1 when 'INTERNAL' then 2 else 3 end,
    k.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),100));
$knowledge_context$;

-- The V1 owner-direct publisher is superseded. Keep the function object for old
-- migrations/history but remove runtime execute capability so V2 governance
-- cannot be bypassed.
revoke all on function public.publish_knowledge_version(uuid,text,jsonb)
  from public,anon,authenticated,service_role;

revoke all on function public.guard_knowledge_source_v2_mutation() from public,anon,authenticated,service_role;
revoke all on function public.guard_knowledge_version_v2_mutation() from public,anon,authenticated,service_role;
revoke all on function private.knowledge_v2_assert_manager(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.knowledge_v2_validate_scope(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.configure_knowledge_source_v2(
  uuid,uuid,text,text,text,text,text,uuid,uuid,text,text,text,integer,jsonb,integer,text
) from public,anon,authenticated,service_role;
revoke all on function public.stage_knowledge_version_v2(
  uuid,uuid,uuid,text,jsonb,jsonb,integer,text,text,text
) from public,anon,authenticated,service_role;
revoke all on function public.publish_manual_knowledge_v2(uuid,uuid,text,jsonb,text)
  from public,anon,authenticated,service_role;
revoke all on function public.approve_knowledge_version_v2(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
revoke all on function public.reject_knowledge_version_v2(uuid,uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.get_knowledge_context_v2(uuid,uuid,uuid,boolean,integer)
  from public,anon,authenticated,service_role;

grant execute on function private.knowledge_v2_assert_manager(uuid,uuid) to service_role;
grant execute on function private.knowledge_v2_validate_scope(uuid,text,uuid,uuid) to service_role;
grant execute on function public.configure_knowledge_source_v2(
  uuid,uuid,text,text,text,text,text,uuid,uuid,text,text,text,integer,jsonb,integer,text
) to service_role;
grant execute on function public.stage_knowledge_version_v2(
  uuid,uuid,uuid,text,jsonb,jsonb,integer,text,text,text
) to service_role;
grant execute on function public.publish_manual_knowledge_v2(uuid,uuid,text,jsonb,text)
  to service_role;
grant execute on function public.approve_knowledge_version_v2(uuid,uuid,uuid,text)
  to service_role;
grant execute on function public.reject_knowledge_version_v2(uuid,uuid,uuid,text,text)
  to service_role;
grant execute on function public.get_knowledge_context_v2(uuid,uuid,uuid,boolean,integer)
  to service_role;

comment on function public.stage_knowledge_version_v2(
  uuid,uuid,uuid,text,jsonb,jsonb,integer,text,text,text
) is 'Stages externally ingested Knowledge for explicit approval. Refresh never silently overwrites active approved truth.';
comment on function public.get_knowledge_context_v2(uuid,uuid,uuid,boolean,integer)
  is 'Scoped Knowledge V2 retrieval over approved active canonical knowledge_versions. Stale content is excluded by default.';
