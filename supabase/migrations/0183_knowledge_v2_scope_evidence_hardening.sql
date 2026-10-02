-- 0183: KNOWLEDGE-V2 scope/evidence hardening
-- Extends the existing knowledge_versions / knowledge_sources authorities.
-- No second Knowledge Base, source store, approval queue, ingestion queue or IAM authority.

alter table public.knowledge_sources
  add column if not exists brand_id uuid,
  add column if not exists department_id uuid,
  add column if not exists team_id uuid;

alter table public.knowledge_versions
  add column if not exists brand_id uuid,
  add column if not exists department_id uuid,
  add column if not exists team_id uuid,
  add column if not exists confidence numeric(5,4)
    check (confidence is null or (confidence >= 0 and confidence <= 1));

alter table public.knowledge_sources
  add constraint knowledge_sources_organization_id_brand_id_fkey
    foreign key (organization_id,brand_id)
    references public.brands(organization_id,id) on delete cascade,
  add constraint knowledge_sources_organization_id_department_id_fkey
    foreign key (organization_id,department_id)
    references public.departments(organization_id,id) on delete cascade,
  add constraint knowledge_sources_organization_id_team_id_fkey
    foreign key (organization_id,team_id)
    references public.teams(organization_id,id) on delete cascade;

alter table public.knowledge_versions
  add constraint knowledge_versions_organization_id_brand_id_fkey
    foreign key (organization_id,brand_id)
    references public.brands(organization_id,id) on delete cascade,
  add constraint knowledge_versions_organization_id_department_id_fkey
    foreign key (organization_id,department_id)
    references public.departments(organization_id,id) on delete cascade,
  add constraint knowledge_versions_organization_id_team_id_fkey
    foreign key (organization_id,team_id)
    references public.teams(organization_id,id) on delete cascade;

alter table public.knowledge_sources
  drop constraint knowledge_sources_source_type_check,
  drop constraint knowledge_sources_scope_type_check,
  drop constraint knowledge_sources_check;

alter table public.knowledge_sources
  add constraint knowledge_sources_source_type_check
    check (source_type in (
      'MANUAL','WEBSITE','FILE','PDF','DOC','TEXT','FAQ','CATALOG',
      'SERVICE','POLICY','INTEGRATION','API','SYSTEM'
    )),
  add constraint knowledge_sources_scope_type_check
    check (scope_type in (
      'ORGANIZATION','BRAND','BUSINESS','BRANCH','DEPARTMENT','TEAM'
    )),
  add constraint knowledge_sources_scope_shape check (
    (scope_type='ORGANIZATION' and brand_id is null and tenant_business_id is null
      and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type='BRAND' and brand_id is not null and tenant_business_id is null
      and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type='BUSINESS' and brand_id is null and tenant_business_id is not null
      and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type='BRANCH' and brand_id is null and tenant_business_id is null
      and branch_id is not null and department_id is null and team_id is null)
    or
    (scope_type='DEPARTMENT' and brand_id is null and tenant_business_id is null
      and branch_id is null and department_id is not null and team_id is null)
    or
    (scope_type='TEAM' and brand_id is null and tenant_business_id is null
      and branch_id is null and department_id is null and team_id is not null)
  );

alter table public.knowledge_versions
  drop constraint knowledge_versions_scope_type_check,
  drop constraint knowledge_versions_scope_shape;

alter table public.knowledge_versions
  add constraint knowledge_versions_scope_type_check
    check (scope_type in (
      'ORGANIZATION','BRAND','BUSINESS','BRANCH','DEPARTMENT','TEAM'
    )),
  add constraint knowledge_versions_scope_shape check (
    (scope_type='ORGANIZATION' and brand_id is null and tenant_business_id is null
      and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type='BRAND' and brand_id is not null and tenant_business_id is null
      and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type='BUSINESS' and brand_id is null and tenant_business_id is not null
      and branch_id is null and department_id is null and team_id is null)
    or
    (scope_type='BRANCH' and brand_id is null and tenant_business_id is null
      and branch_id is not null and department_id is null and team_id is null)
    or
    (scope_type='DEPARTMENT' and brand_id is null and tenant_business_id is null
      and branch_id is null and department_id is not null and team_id is null)
    or
    (scope_type='TEAM' and brand_id is null and tenant_business_id is null
      and branch_id is null and department_id is null and team_id is not null)
  );

create index knowledge_sources_org_brand_idx
  on public.knowledge_sources(organization_id,brand_id) where brand_id is not null;
create index knowledge_sources_org_department_idx
  on public.knowledge_sources(organization_id,department_id) where department_id is not null;
create index knowledge_sources_org_team_idx
  on public.knowledge_sources(organization_id,team_id) where team_id is not null;
create index knowledge_versions_org_brand_scope_idx
  on public.knowledge_versions(organization_id,brand_id) where brand_id is not null;
create index knowledge_versions_org_department_scope_idx
  on public.knowledge_versions(organization_id,department_id) where department_id is not null;
create index knowledge_versions_org_team_scope_idx
  on public.knowledge_versions(organization_id,team_id) where team_id is not null;

-- The historical index encoded Organization-wide uniqueness and therefore made
-- scoped Knowledge mutually exclusive. Preserve one active version per key+scope.
drop index if exists public.knowledge_versions_one_active_uidx;
create unique index knowledge_versions_one_active_scope_uidx
  on public.knowledge_versions(
    organization_id,knowledge_key,scope_type,
    brand_id,tenant_business_id,branch_id,department_id,team_id
  ) nulls not distinct
  where active;

create or replace function private.knowledge_v2_validate_scope(
  p_organization_id uuid,
  p_scope_type text,
  p_brand_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_department_id uuid,
  p_team_id uuid
)
returns void
language plpgsql
security invoker
set search_path=public,pg_catalog
as $knowledge_scope_v2$
declare
  v_scope text:=upper(btrim(coalesce(p_scope_type,'')));
  v_nonnull integer :=
    (p_brand_id is not null)::integer+
    (p_tenant_business_id is not null)::integer+
    (p_branch_id is not null)::integer+
    (p_department_id is not null)::integer+
    (p_team_id is not null)::integer;
begin
  if v_scope='ORGANIZATION' then
    if v_nonnull<>0 then raise exception 'Organization Knowledge scope cannot include hierarchy id'; end if;
  elsif v_scope='BRAND' then
    if v_nonnull<>1 or p_brand_id is null or not exists(
      select 1 from public.brands x
      where x.organization_id=p_organization_id and x.id=p_brand_id and x.status='ACTIVE'
    ) then raise exception 'Knowledge Brand scope is invalid'; end if;
  elsif v_scope='BUSINESS' then
    if v_nonnull<>1 or p_tenant_business_id is null or not exists(
      select 1 from public.tenant_businesses x
      where x.organization_id=p_organization_id and x.id=p_tenant_business_id and x.status='ACTIVE'
    ) then raise exception 'Knowledge Business scope is invalid'; end if;
  elsif v_scope='BRANCH' then
    if v_nonnull<>1 or p_branch_id is null or not exists(
      select 1 from public.branches x
      where x.organization_id=p_organization_id and x.id=p_branch_id and x.status='ACTIVE'
    ) then raise exception 'Knowledge Branch scope is invalid'; end if;
  elsif v_scope='DEPARTMENT' then
    if v_nonnull<>1 or p_department_id is null or not exists(
      select 1 from public.departments x
      where x.organization_id=p_organization_id and x.id=p_department_id and x.status='ACTIVE'
    ) then raise exception 'Knowledge Department scope is invalid'; end if;
  elsif v_scope='TEAM' then
    if v_nonnull<>1 or p_team_id is null or not exists(
      select 1 from public.teams x
      where x.organization_id=p_organization_id and x.id=p_team_id and x.status='ACTIVE'
    ) then raise exception 'Knowledge Team scope is invalid'; end if;
  else
    raise exception 'Knowledge scope type is invalid';
  end if;
end;
$knowledge_scope_v2$;

-- Backward-compatible validator used by the original V2 command.
create or replace function private.knowledge_v2_validate_scope(
  p_organization_id uuid,
  p_scope_type text,
  p_tenant_business_id uuid,
  p_branch_id uuid
)
returns void
language sql
security invoker
set search_path=private,pg_catalog
as $knowledge_scope_compat$
  select private.knowledge_v2_validate_scope(
    p_organization_id,p_scope_type,null,p_tenant_business_id,p_branch_id,null,null
  );
$knowledge_scope_compat$;

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
  if tg_op='DELETE' then raise exception 'Knowledge Version history cannot be deleted'; end if;
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
       or new.brand_id is distinct from old.brand_id
       or new.tenant_business_id is distinct from old.tenant_business_id
       or new.branch_id is distinct from old.branch_id
       or new.department_id is distinct from old.department_id
       or new.team_id is distinct from old.team_id
       or new.sensitivity is distinct from old.sensitivity
       or new.confidence is distinct from old.confidence
       or new.supersedes_version_id is distinct from old.supersedes_version_id
    then
      raise exception 'Knowledge Version content/provenance identity is immutable';
    end if;
  end if;
  return new;
end;
$knowledge_version_guard$;

create or replace function public.configure_knowledge_source_scope_v2(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_source_key text,
  p_source_type text,
  p_title text,
  p_source_locator text,
  p_scope_type text,
  p_scope_id uuid,
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
as $knowledge_source_scope_configure$
declare
  v_key text:=lower(btrim(coalesce(p_source_key,'')));
  v_type text:=upper(btrim(coalesce(p_source_type,'')));
  v_scope text:=upper(btrim(coalesce(p_scope_type,'ORGANIZATION')));
  v_sensitivity text:=upper(btrim(coalesce(p_sensitivity,'INTERNAL')));
  v_status text:=upper(btrim(coalesce(p_status,'ACTIVE')));
  v_refresh text:=upper(btrim(coalesce(p_refresh_policy,'MANUAL')));
  v_brand_id uuid:=case when v_scope='BRAND' then p_scope_id end;
  v_business_id uuid:=case when v_scope='BUSINESS' then p_scope_id end;
  v_branch_id uuid:=case when v_scope='BRANCH' then p_scope_id end;
  v_department_id uuid:=case when v_scope='DEPARTMENT' then p_scope_id end;
  v_team_id uuid:=case when v_scope='TEAM' then p_scope_id end;
  v_existing public.knowledge_sources%rowtype;
  v_result public.knowledge_sources%rowtype;
  v_hash text;
  v_replay_hash text;
begin
  if current_user<>'service_role' then raise exception 'Knowledge Source mutation is service-only'; end if;
  perform private.knowledge_v2_assert_manager(p_organization_id,p_actor_user_id);
  perform private.knowledge_v2_validate_scope(
    p_organization_id,v_scope,v_brand_id,v_business_id,v_branch_id,v_department_id,v_team_id
  );

  if v_key !~ '^[a-z][a-z0-9_.-]{1,119}$' then raise exception 'Knowledge Source key is invalid'; end if;
  if v_type not in (
    'MANUAL','WEBSITE','FILE','PDF','DOC','TEXT','FAQ','CATALOG',
    'SERVICE','POLICY','INTEGRATION','API','SYSTEM'
  ) then raise exception 'Knowledge Source type is invalid'; end if;
  if length(btrim(coalesce(p_title,''))) not between 1 and 240 then raise exception 'Knowledge Source title is invalid'; end if;
  if p_source_locator is not null and length(p_source_locator)>2000 then raise exception 'Knowledge Source locator is too long'; end if;
  if v_sensitivity not in ('PUBLIC','INTERNAL','CONFIDENTIAL') then raise exception 'Knowledge Source sensitivity is invalid'; end if;
  if v_status not in ('ACTIVE','PAUSED','RETIRED') then raise exception 'Knowledge Source status is invalid'; end if;
  if v_refresh not in ('MANUAL','INTERVAL') then raise exception 'Knowledge Source refresh policy is invalid'; end if;
  if v_refresh='INTERVAL' and (p_refresh_interval_minutes is null or p_refresh_interval_minutes not between 60 and 525600)
    then raise exception 'Knowledge Source interval is invalid'; end if;
  if v_refresh='MANUAL' and p_refresh_interval_minutes is not null
    then raise exception 'Manual Knowledge Source cannot have refresh interval'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or octet_length(p_metadata::text)>32768
    then raise exception 'Knowledge Source metadata is invalid'; end if;
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200
    then raise exception 'Knowledge Source request key is invalid'; end if;

  v_hash:=md5(jsonb_build_object(
    'sourceKey',v_key,'sourceType',v_type,'title',btrim(p_title),
    'sourceLocator',nullif(btrim(coalesce(p_source_locator,'')),''),
    'scopeType',v_scope,'scopeId',p_scope_id,
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
    if p_expected_version is null or p_expected_version<>v_existing.version
      then raise exception 'Knowledge Source version changed'; end if;
  elsif p_expected_version is not null then
    raise exception 'Knowledge Source does not exist at expected version';
  end if;

  perform set_config('app.knowledge_v2_mutation','allowed',true);

  if v_existing.id is null then
    insert into public.knowledge_sources(
      organization_id,source_key,source_type,title,source_locator,
      scope_type,brand_id,tenant_business_id,branch_id,department_id,team_id,
      sensitivity,status,refresh_policy,refresh_interval_minutes,
      next_refresh_at,stale_after_at,metadata,version,last_request_key,
      created_by_user_id,updated_by_user_id
    ) values (
      p_organization_id,v_key,v_type,btrim(p_title),
      nullif(btrim(coalesce(p_source_locator,'')),''),
      v_scope,v_brand_id,v_business_id,v_branch_id,v_department_id,v_team_id,
      v_sensitivity,v_status,v_refresh,
      case when v_refresh='INTERVAL' then p_refresh_interval_minutes end,
      case when v_refresh='INTERVAL' then statement_timestamp() end,
      case when v_refresh='INTERVAL' then statement_timestamp() end,
      p_metadata,1,p_request_key,p_actor_user_id,p_actor_user_id
    ) returning * into v_result;
  else
    update public.knowledge_sources
    set source_type=v_type,title=btrim(p_title),
        source_locator=nullif(btrim(coalesce(p_source_locator,'')),''),
        scope_type=v_scope,brand_id=v_brand_id,tenant_business_id=v_business_id,
        branch_id=v_branch_id,department_id=v_department_id,team_id=v_team_id,
        sensitivity=v_sensitivity,status=v_status,refresh_policy=v_refresh,
        refresh_interval_minutes=case when v_refresh='INTERVAL' then p_refresh_interval_minutes end,
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
      'scopeId',p_scope_id,'status',v_result.status,'sensitivity',v_result.sensitivity
    ),p_request_key
  );

  return v_result;
end;
$knowledge_source_scope_configure$;

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
returns table(version_id uuid,resolved_version integer,approval_state text,unchanged boolean)
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
  v_confidence numeric(5,4);
begin
  if current_user<>'service_role' then raise exception 'Knowledge ingestion is service-only'; end if;
  perform private.knowledge_v2_assert_manager(p_organization_id,p_actor_user_id);
  if p_source_id is null then raise exception 'Knowledge ingestion requires a registered Source'; end if;
  if v_key !~ '^[a-z][a-z0-9_.-]{1,119}$' then raise exception 'Knowledge key is invalid'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_payload='{}'::jsonb
     or octet_length(p_payload::text)>524288 then raise exception 'Knowledge payload is invalid or too large'; end if;
  if p_provenance is null or jsonb_typeof(p_provenance)<>'object'
     or octet_length(p_provenance::text)>32768 then raise exception 'Knowledge provenance is invalid'; end if;
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200
     then raise exception 'Knowledge ingestion request key is invalid'; end if;

  if coalesce(p_provenance->>'confidence','') ~ '^(0([.][0-9]+)?|1([.]0+)?)$' then
    v_confidence:=(p_provenance->>'confidence')::numeric(5,4);
  end if;

  select * into v_source from public.knowledge_sources
  where organization_id=p_organization_id and id=p_source_id
  for update;
  if not found or v_source.status<>'ACTIVE' then raise exception 'Knowledge Source is missing or inactive'; end if;
  if p_expected_source_version is null or p_expected_source_version<>v_source.version
    then raise exception 'Knowledge Source version changed'; end if;

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

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':knowledge:'||v_key||':'||
    v_source.scope_type||':'||
    coalesce(
      v_source.brand_id::text,v_source.tenant_business_id::text,v_source.branch_id::text,
      v_source.department_id::text,v_source.team_id::text,'ORGANIZATION'
    ),0
  ));

  select * into v_active
  from public.knowledge_versions
  where organization_id=p_organization_id
    and knowledge_key=v_key
    and active
    and scope_type=v_source.scope_type
    and brand_id is not distinct from v_source.brand_id
    and tenant_business_id is not distinct from v_source.tenant_business_id
    and branch_id is not distinct from v_source.branch_id
    and department_id is not distinct from v_source.department_id
    and team_id is not distinct from v_source.team_id
  limit 1;

  v_stale_after:=case
    when v_source.refresh_policy='INTERVAL'
      then v_now + make_interval(mins=>v_source.refresh_interval_minutes*2)
    else null end;

  perform set_config('app.knowledge_v2_mutation','allowed',true);

  update public.knowledge_sources
  set last_refresh_attempt_at=v_now,last_refreshed_at=v_now,
      last_changed_at=case when latest_content_hash is distinct from v_hash then v_now else last_changed_at end,
      next_refresh_at=case when refresh_policy='INTERVAL' then v_now+make_interval(mins=>refresh_interval_minutes) end,
      stale_after_at=v_stale_after,latest_content_hash=v_hash,
      latest_etag=nullif(btrim(coalesce(p_etag,'')),''),
      latest_modified=nullif(btrim(coalesce(p_last_modified,'')),''),
      last_error_code=null,version=version+1,last_request_key=p_request_key,
      updated_by_user_id=p_actor_user_id
  where id=v_source.id
  returning * into v_source;

  if v_active.id is not null
     and v_active.source_id is not distinct from v_source.id
     and v_active.content_hash=v_hash
     and v_active.approval_status='APPROVED'
     and v_active.sensitivity=v_source.sensitivity
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
        'approvalStatus',v_existing.approval_status,'unchanged',true,'sourceId',v_source.id,
        'scopeType',v_source.scope_type
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
    and source_id=v_source.id
    and approval_status='PENDING_REVIEW'
    and scope_type=v_source.scope_type
    and brand_id is not distinct from v_source.brand_id
    and tenant_business_id is not distinct from v_source.tenant_business_id
    and branch_id is not distinct from v_source.branch_id
    and department_id is not distinct from v_source.department_id
    and team_id is not distinct from v_source.team_id
  order by version desc limit 1;

  if v_existing.id is not null then
    insert into public.audit_logs(
      organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
    ) values (
      p_organization_id,'USER',p_actor_user_id::text,'KNOWLEDGE_VERSION_STAGED',
      'knowledge',v_key,
      jsonb_build_object(
        'requestHash',v_request_hash,'versionId',v_existing.id,'version',v_existing.version,
        'approvalStatus',v_existing.approval_status,'unchanged',true,'sourceId',v_source.id,
        'pendingDeduplicated',true,'scopeType',v_source.scope_type
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
    brand_id,tenant_business_id,branch_id,department_id,team_id,
    confidence,retrieval_enabled
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
    v_source.brand_id,v_source.tenant_business_id,v_source.branch_id,
    v_source.department_id,v_source.team_id,v_confidence,true
  ) returning * into v_existing;

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,after_data,correlation_id
  ) values (
    p_organization_id,'USER',p_actor_user_id::text,'KNOWLEDGE_VERSION_STAGED',
    'knowledge',v_key,
    jsonb_build_object(
      'requestHash',v_request_hash,'versionId',v_existing.id,'version',v_existing.version,
      'approvalStatus',v_existing.approval_status,'unchanged',false,'sourceId',v_source.id,
      'conflictState',v_existing.conflict_state,'scopeType',v_source.scope_type
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
     or octet_length(p_payload::text)>524288 then raise exception 'Knowledge payload is invalid or too large'; end if;
  if length(btrim(coalesce(p_request_key,''))) not between 8 and 200
     then raise exception 'Knowledge publish request key is invalid'; end if;

  v_hash:=md5(p_payload::text);
  v_request_hash:=md5(jsonb_build_object('knowledgeKey',v_key,'payloadHash',v_hash)::text);

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
    return query select v_result.id,v_result.version,true; return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':knowledge:'||v_key||':ORGANIZATION',0
  ));

  select * into v_active
  from public.knowledge_versions
  where organization_id=p_organization_id and knowledge_key=v_key
    and active and scope_type='ORGANIZATION'
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
        'unchanged',true,'scopeType','ORGANIZATION'
      ),p_request_key
    );
    return query select v_active.id,v_active.version,true; return;
  end if;

  select coalesce(max(k.version),0)+1 into v_next
  from public.knowledge_versions k
  where k.organization_id=p_organization_id and k.knowledge_key=v_key;

  perform set_config('app.knowledge_v2_mutation','allowed',true);

  update public.knowledge_versions set active=false
  where organization_id=p_organization_id and knowledge_key=v_key
    and active and scope_type='ORGANIZATION';

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
      'unchanged',false,'scopeType','ORGANIZATION'
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
  if p_version_id is null or length(btrim(coalesce(p_request_key,''))) not between 8 and 200
    then raise exception 'Knowledge approval payload is invalid'; end if;

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

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text||':knowledge:'||v_target.knowledge_key||':'||
    v_target.scope_type||':'||
    coalesce(
      v_target.brand_id::text,v_target.tenant_business_id::text,v_target.branch_id::text,
      v_target.department_id::text,v_target.team_id::text,'ORGANIZATION'
    ),0
  ));

  select * into v_active from public.knowledge_versions
  where organization_id=p_organization_id
    and knowledge_key=v_target.knowledge_key and active
    and scope_type=v_target.scope_type
    and brand_id is not distinct from v_target.brand_id
    and tenant_business_id is not distinct from v_target.tenant_business_id
    and branch_id is not distinct from v_target.branch_id
    and department_id is not distinct from v_target.department_id
    and team_id is not distinct from v_target.team_id
  limit 1;

  if v_target.active and v_target.approval_status='APPROVED' then
    v_result:=v_target;
  else
    perform set_config('app.knowledge_v2_mutation','allowed',true);
    update public.knowledge_versions set active=false
    where organization_id=p_organization_id
      and knowledge_key=v_target.knowledge_key and active
      and id<>v_target.id
      and scope_type=v_target.scope_type
      and brand_id is not distinct from v_target.brand_id
      and tenant_business_id is not distinct from v_target.tenant_business_id
      and branch_id is not distinct from v_target.branch_id
      and department_id is not distinct from v_target.department_id
      and team_id is not distinct from v_target.team_id;

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
      'version',v_result.version,'supersededVersionId',v_active.id,
      'scopeType',v_result.scope_type
    ),p_request_key
  );

  return v_result;
end;
$knowledge_approve$;

drop policy knowledge_versions_scoped_read on public.knowledge_versions;
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
      organization_id,brand_id,tenant_business_id,branch_id,department_id,team_id
    )
  )
);

create or replace function public.get_knowledge_context_v2(
  p_organization_id uuid,
  p_brand_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_department_id uuid,
  p_team_id uuid,
  p_include_stale boolean,
  p_limit integer
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
  conflict_state text,
  confidence numeric,
  review_state text
)
language sql
stable
security invoker
set search_path=public,pg_catalog
as $knowledge_context_scoped$
  select
    k.knowledge_key,k.version,k.payload,
    coalesce(s.source_type,k.provenance->>'sourceType','MANUAL') as source_type,
    s.source_locator,k.provenance,k.sensitivity,k.scope_type,
    coalesce(coalesce(k.stale_after_at,s.stale_after_at)<statement_timestamp(),false) as stale,
    k.conflict_state,k.confidence,k.approval_status as review_state
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
      or (k.scope_type='BRAND' and k.brand_id=p_brand_id)
      or (k.scope_type='BUSINESS' and k.tenant_business_id=p_tenant_business_id)
      or (k.scope_type='BRANCH' and k.branch_id=p_branch_id)
      or (k.scope_type='DEPARTMENT' and k.department_id=p_department_id)
      or (k.scope_type='TEAM' and k.team_id=p_team_id)
    )
    and (
      p_include_stale
      or coalesce(k.stale_after_at,s.stale_after_at) is null
      or coalesce(k.stale_after_at,s.stale_after_at)>=statement_timestamp()
    )
  order by
    case k.scope_type
      when 'TEAM' then 1 when 'DEPARTMENT' then 2 when 'BRANCH' then 3
      when 'BUSINESS' then 4 when 'BRAND' then 5 else 6
    end,
    case k.sensitivity when 'PUBLIC' then 1 when 'INTERNAL' then 2 else 3 end,
    k.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),100));
$knowledge_context_scoped$;

-- PostgreSQL cannot CREATE OR REPLACE a function with a changed TABLE return shape.
-- Drop only the exact legacy signature, then recreate it as a compatibility wrapper.
drop function public.get_knowledge_context_v2(uuid,uuid,uuid,boolean,integer);

-- Preserve the original 5-argument resolver while enriching its evidence contract.
create function public.get_knowledge_context_v2(
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
  conflict_state text,
  confidence numeric,
  review_state text
)
language sql
stable
security invoker
set search_path=public,pg_catalog
as $knowledge_context_compat$
  select *
  from public.get_knowledge_context_v2(
    p_organization_id,null,p_tenant_business_id,p_branch_id,null,null,p_include_stale,p_limit
  );
$knowledge_context_compat$;

revoke all on function private.knowledge_v2_validate_scope(uuid,text,uuid,uuid,uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.configure_knowledge_source_scope_v2(
  uuid,uuid,text,text,text,text,text,uuid,text,text,text,integer,jsonb,integer,text
) from public,anon,authenticated,service_role;
revoke all on function public.get_knowledge_context_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,boolean,integer
) from public,anon,authenticated,service_role;

grant execute on function private.knowledge_v2_validate_scope(uuid,text,uuid,uuid,uuid,uuid,uuid)
  to service_role;
grant execute on function public.configure_knowledge_source_scope_v2(
  uuid,uuid,text,text,text,text,text,uuid,text,text,text,integer,jsonb,integer,text
) to service_role;
grant execute on function public.get_knowledge_context_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,boolean,integer
) to service_role;

-- Re-assert original runtime grants after CREATE OR REPLACE.
revoke all on function public.get_knowledge_context_v2(uuid,uuid,uuid,boolean,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.get_knowledge_context_v2(uuid,uuid,uuid,boolean,integer)
  to service_role;

comment on function public.configure_knowledge_source_scope_v2(
  uuid,uuid,text,text,text,text,text,uuid,text,text,text,integer,jsonb,integer,text
) is 'Configures the canonical Knowledge source registry across Organization/Brand/Business/Branch/Department/Team scopes.';
comment on function public.get_knowledge_context_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,boolean,integer
) is 'Full hierarchy-aware Knowledge V2 resolver. Returns approved active evidence with provenance, freshness, conflict, confidence and review state.';
