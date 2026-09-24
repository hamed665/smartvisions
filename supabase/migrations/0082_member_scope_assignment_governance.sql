-- 0082: governed Smart Core member scope assignment mutations.
-- Draft-only until exact-head runner-backed CI is green. No Chatwoot activation here.
--
-- Goals:
-- - keep member_scope_assignments as the canonical lower-scope IAM table;
-- - add optimistic version + request-key evidence;
-- - force authenticated writes through SECURITY INVOKER RPCs;
-- - remove direct service_role IAM mutation;
-- - preserve a durable immutable command ledger for create/update/delete replay;
-- - audit bounded role/scope changes without storing arbitrary policy attributes.

alter table public.member_scope_assignments
  add column if not exists version integer not null default 1
    check (version >= 1),
  add column if not exists last_request_key text,
  add column if not exists updated_by_user_id uuid
    references auth.users(id) on delete set null;

update public.member_scope_assignments
set last_request_key = 'migration-0082:' || id::text,
    updated_by_user_id = coalesce(updated_by_user_id, assigned_by)
where last_request_key is null;

alter table public.member_scope_assignments
  alter column last_request_key set not null;

alter table public.member_scope_assignments
  drop constraint if exists member_scope_assignments_last_request_key_length;

alter table public.member_scope_assignments
  add constraint member_scope_assignments_last_request_key_length
  check (length(trim(last_request_key)) between 1 and 200);

create index if not exists member_scope_assignments_updated_by_idx
  on public.member_scope_assignments(updated_by_user_id)
  where updated_by_user_id is not null;

create table if not exists public.member_scope_assignment_command_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_key text not null
    check (length(trim(request_key)) between 1 and 200),
  command_type text not null
    check (command_type in (
      'CREATE_SCOPE_ASSIGNMENT',
      'UPDATE_SCOPE_ASSIGNMENT',
      'DELETE_SCOPE_ASSIGNMENT'
    )),
  assignment_id uuid not null,
  applied_version integer not null check (applied_version >= 1),
  payload_hash text not null
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),

  unique (organization_id, request_key),

  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict
);

create index if not exists member_scope_assignment_command_claims_assignment_idx
  on public.member_scope_assignment_command_claims(
    organization_id, assignment_id, applied_version desc, created_at desc
  );

alter table public.member_scope_assignment_command_claims enable row level security;

drop policy if exists member_scope_assignment_claims_owner_read
  on public.member_scope_assignment_command_claims;
create policy member_scope_assignment_claims_owner_read
  on public.member_scope_assignment_command_claims
  for select
  to authenticated
  using (public.is_org_owner(organization_id));

drop policy if exists member_scope_assignment_claims_owner_insert
  on public.member_scope_assignment_command_claims;
create policy member_scope_assignment_claims_owner_insert
  on public.member_scope_assignment_command_claims
  for insert
  to authenticated
  with check (
    public.is_org_owner(organization_id)
    and coalesce(
      current_setting('smartvisions.member_scope_assignment_command', true),
      ''
    ) = '1'
    and created_by_user_id = (select auth.uid())
  );

create or replace function public.enforce_member_scope_assignment_claim_immutable()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'member scope assignment command claims are immutable';
  end if;

  if coalesce(
       current_setting('smartvisions.member_scope_assignment_command', true),
       ''
     ) <> '1'
  then
    raise exception 'member scope assignment claim requires governed command context';
  end if;

  return new;
end;
$$;

drop trigger if exists member_scope_assignment_claims_immutable
  on public.member_scope_assignment_command_claims;
create trigger member_scope_assignment_claims_immutable
before insert or update or delete
on public.member_scope_assignment_command_claims
for each row execute function public.enforce_member_scope_assignment_claim_immutable();

create or replace function public.enforce_member_scope_assignment_command_path()
returns trigger
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    -- Preserve existing FK ON DELETE CASCADE behavior for parent lifecycle cleanup.
    -- Direct top-level deletes still require the governed command context.
    if pg_trigger_depth() > 1 then
      return old;
    end if;

    if coalesce(
         current_setting('smartvisions.member_scope_assignment_command', true),
         ''
       ) <> '1'
    then
      raise exception 'member scope assignment mutations must use the governed command RPC';
    end if;

    return old;
  end if;

  if coalesce(
       current_setting('smartvisions.member_scope_assignment_command', true),
       ''
     ) <> '1'
  then
    raise exception 'member scope assignment mutations must use the governed command RPC';
  end if;

  if tg_op = 'INSERT' then
    if new.version <> 1
       or length(trim(new.last_request_key)) not between 1 and 200
       or new.assigned_by is distinct from auth.uid()
       or new.updated_by_user_id is distinct from auth.uid()
    then
      raise exception 'new member scope assignment has invalid command evidence';
    end if;

    new.updated_at := now();
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.user_id is distinct from old.user_id
     or new.scope_type is distinct from old.scope_type
     or new.brand_id is distinct from old.brand_id
     or new.tenant_business_id is distinct from old.tenant_business_id
     or new.branch_id is distinct from old.branch_id
     or new.department_id is distinct from old.department_id
     or new.team_id is distinct from old.team_id
     or new.assigned_by is distinct from old.assigned_by
     or new.created_at is distinct from old.created_at
  then
    raise exception 'member scope assignment identity/scope is immutable';
  end if;

  if new.version <> old.version + 1 then
    raise exception 'member scope assignment version must increment by exactly one';
  end if;

  if new.last_request_key = old.last_request_key then
    raise exception 'member scope assignment update requires a new request key';
  end if;

  if new.updated_by_user_id is distinct from auth.uid() then
    raise exception 'member scope assignment updater must match authenticated actor';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists member_scope_assignment_command_path
  on public.member_scope_assignments;
create trigger member_scope_assignment_command_path
before insert or update or delete
on public.member_scope_assignments
for each row execute function public.enforce_member_scope_assignment_command_path();

drop policy if exists member_scope_assignments_owner_insert
  on public.member_scope_assignments;
drop policy if exists member_scope_assignments_owner_update
  on public.member_scope_assignments;
drop policy if exists member_scope_assignments_owner_delete
  on public.member_scope_assignments;

create policy member_scope_assignments_owner_insert
  on public.member_scope_assignments
  for insert
  to authenticated
  with check (
    public.is_org_owner(organization_id)
    and coalesce(
      current_setting('smartvisions.member_scope_assignment_command', true),
      ''
    ) = '1'
  );

create policy member_scope_assignments_owner_update
  on public.member_scope_assignments
  for update
  to authenticated
  using (
    public.is_org_owner(organization_id)
    and coalesce(
      current_setting('smartvisions.member_scope_assignment_command', true),
      ''
    ) = '1'
  )
  with check (
    public.is_org_owner(organization_id)
    and coalesce(
      current_setting('smartvisions.member_scope_assignment_command', true),
      ''
    ) = '1'
  );

create policy member_scope_assignments_owner_delete
  on public.member_scope_assignments
  for delete
  to authenticated
  using (
    public.is_org_owner(organization_id)
    and coalesce(
      current_setting('smartvisions.member_scope_assignment_command', true),
      ''
    ) = '1'
  );

create or replace function public.claim_member_scope_assignment_command(
  p_organization_id uuid,
  p_request_key text,
  p_command_type text,
  p_assignment_id uuid,
  p_applied_version integer,
  p_payload_hash text
)
returns table(
  is_new boolean,
  assignment_id uuid,
  applied_version integer
)
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_existing public.member_scope_assignment_command_claims%rowtype;
  v_assignment_id uuid := coalesce(p_assignment_id, gen_random_uuid());
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_command_type text := upper(trim(coalesce(p_command_type, '')));
  v_payload_hash text := lower(trim(coalesce(p_payload_hash, '')));
begin
  if auth.uid() is null or not public.is_org_owner(p_organization_id) then
    raise exception 'member scope assignment mutation not permitted';
  end if;

  if coalesce(
       current_setting('smartvisions.member_scope_assignment_command', true),
       ''
     ) <> '1'
  then
    raise exception 'member scope assignment claim requires governed command context';
  end if;

  if length(v_request_key) not between 1 and 200
     or v_command_type not in (
       'CREATE_SCOPE_ASSIGNMENT',
       'UPDATE_SCOPE_ASSIGNMENT',
       'DELETE_SCOPE_ASSIGNMENT'
     )
     or p_applied_version is null
     or p_applied_version < 1
     or v_payload_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid member scope assignment command claim';
  end if;

  begin
    insert into public.member_scope_assignment_command_claims(
      organization_id,
      request_key,
      command_type,
      assignment_id,
      applied_version,
      payload_hash,
      created_by_user_id
    ) values (
      p_organization_id,
      v_request_key,
      v_command_type,
      v_assignment_id,
      p_applied_version,
      v_payload_hash,
      auth.uid()
    );

    return query select true, v_assignment_id, p_applied_version;
    return;
  exception
    when unique_violation then
      select *
        into v_existing
        from public.member_scope_assignment_command_claims
       where organization_id = p_organization_id
         and request_key = v_request_key;

      if not found then
        raise;
      end if;

      if v_existing.command_type <> v_command_type
         or (p_assignment_id is not null and v_existing.assignment_id <> p_assignment_id)
         or v_existing.applied_version <> p_applied_version
         or v_existing.payload_hash <> v_payload_hash
      then
        raise exception 'request key already used with different member scope assignment payload';
      end if;

      return query
      select false, v_existing.assignment_id, v_existing.applied_version;
      return;
  end;
end;
$$;

create or replace function public.create_member_scope_assignment(
  p_organization_id uuid,
  p_user_id uuid,
  p_scope_type text,
  p_role text,
  p_brand_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_department_id uuid,
  p_team_id uuid,
  p_attributes jsonb,
  p_request_key text
)
returns public.member_scope_assignments
language plpgsql
security invoker
set search_path = public, auth, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_scope_type text := upper(trim(coalesce(p_scope_type, '')));
  v_role text := upper(trim(coalesce(p_role, '')));
  v_attributes jsonb := coalesce(p_attributes, '{}'::jsonb);
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_payload_hash text;
  v_claim record;
  v_created public.member_scope_assignments%rowtype;
begin
  if v_actor is null or not public.is_org_owner(p_organization_id) then
    raise exception 'member scope assignment mutation not permitted';
  end if;

  if v_scope_type not in ('BRAND','BUSINESS','BRANCH','DEPARTMENT','TEAM')
     or v_role not in ('ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER')
     or jsonb_typeof(v_attributes) <> 'object'
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid member scope assignment create payload';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'userId', p_user_id,
    'scopeType', v_scope_type,
    'role', v_role,
    'brandId', p_brand_id,
    'tenantBusinessId', p_tenant_business_id,
    'branchId', p_branch_id,
    'departmentId', p_department_id,
    'teamId', p_team_id,
    'attributes', v_attributes
  )::text, 'sha256'), 'hex');

  perform set_config('smartvisions.member_scope_assignment_command', '1', true);

  select *
    into v_claim
    from public.claim_member_scope_assignment_command(
      p_organization_id,
      v_request_key,
      'CREATE_SCOPE_ASSIGNMENT',
      null,
      1,
      v_payload_hash
    );

  if not v_claim.is_new then
    select *
      into v_created
      from public.member_scope_assignments
     where organization_id = p_organization_id
       and id = v_claim.assignment_id;

    if not found then
      raise exception 'member scope assignment create claim has no assignment row';
    end if;

    perform set_config('smartvisions.member_scope_assignment_command', '0', true);
    return v_created;
  end if;

  insert into public.member_scope_assignments(
    id,
    organization_id,
    user_id,
    scope_type,
    role,
    brand_id,
    tenant_business_id,
    branch_id,
    department_id,
    team_id,
    attributes,
    assigned_by,
    version,
    last_request_key,
    updated_by_user_id
  ) values (
    v_claim.assignment_id,
    p_organization_id,
    p_user_id,
    v_scope_type,
    v_role,
    p_brand_id,
    p_tenant_business_id,
    p_branch_id,
    p_department_id,
    p_team_id,
    v_attributes,
    v_actor,
    1,
    v_request_key,
    v_actor
  )
  returning * into v_created;

  insert into public.audit_logs(
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    p_organization_id,
    'USER',
    v_actor::text,
    'MEMBER_SCOPE_ASSIGNMENT_CREATED',
    'member_scope_assignment',
    v_created.id::text,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'user_id', v_created.user_id,
      'scope_type', v_created.scope_type,
      'brand_id', v_created.brand_id,
      'tenant_business_id', v_created.tenant_business_id,
      'branch_id', v_created.branch_id,
      'department_id', v_created.department_id,
      'team_id', v_created.team_id,
      'role', v_created.role,
      'version', v_created.version,
      'request_key', v_request_key,
      'attribute_key_count', (select count(*) from jsonb_object_keys(coalesce(v_created.attributes, '{}'::jsonb)))
    ))
  );

  perform set_config('smartvisions.member_scope_assignment_command', '0', true);
  return v_created;
exception
  when others then
    perform set_config('smartvisions.member_scope_assignment_command', '0', true);
    raise;
end;
$$;

create or replace function public.update_member_scope_assignment(
  p_organization_id uuid,
  p_assignment_id uuid,
  p_expected_version integer,
  p_role text,
  p_attributes jsonb,
  p_request_key text
)
returns public.member_scope_assignments
language plpgsql
security invoker
set search_path = public, auth, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := upper(trim(coalesce(p_role, '')));
  v_attributes jsonb := coalesce(p_attributes, '{}'::jsonb);
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_payload_hash text;
  v_claim record;
  v_current public.member_scope_assignments%rowtype;
  v_updated public.member_scope_assignments%rowtype;
begin
  if v_actor is null or not public.is_org_owner(p_organization_id) then
    raise exception 'member scope assignment mutation not permitted';
  end if;

  if p_expected_version is null
     or p_expected_version < 1
     or v_role not in ('ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER')
     or jsonb_typeof(v_attributes) <> 'object'
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid member scope assignment update payload';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'assignmentId', p_assignment_id,
    'expectedVersion', p_expected_version,
    'role', v_role,
    'attributes', v_attributes
  )::text, 'sha256'), 'hex');

  perform set_config('smartvisions.member_scope_assignment_command', '1', true);

  select *
    into v_claim
    from public.claim_member_scope_assignment_command(
      p_organization_id,
      v_request_key,
      'UPDATE_SCOPE_ASSIGNMENT',
      p_assignment_id,
      p_expected_version + 1,
      v_payload_hash
    );

  if not v_claim.is_new then
    select *
      into v_current
      from public.member_scope_assignments
     where organization_id = p_organization_id
       and id = p_assignment_id;

    if not found then
      raise exception 'member scope assignment update replay has no assignment row';
    end if;

    perform set_config('smartvisions.member_scope_assignment_command', '0', true);
    return v_current;
  end if;

  select *
    into v_current
    from public.member_scope_assignments
   where organization_id = p_organization_id
     and id = p_assignment_id
   for update;

  if not found then
    raise exception 'member scope assignment not found';
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'member scope assignment version conflict; current version is %',
      v_current.version;
  end if;

  if v_current.role = v_role
     and v_current.attributes = v_attributes
  then
    raise exception 'member scope assignment update has no change';
  end if;

  update public.member_scope_assignments
     set role = v_role,
         attributes = v_attributes,
         version = version + 1,
         last_request_key = v_request_key,
         updated_by_user_id = v_actor
   where organization_id = p_organization_id
     and id = p_assignment_id
     and version = p_expected_version
  returning * into v_updated;

  if not found then
    raise exception 'member scope assignment changed concurrently';
  end if;

  insert into public.audit_logs(
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    p_organization_id,
    'USER',
    v_actor::text,
    'MEMBER_SCOPE_ASSIGNMENT_UPDATED',
    'member_scope_assignment',
    p_assignment_id::text,
    jsonb_build_object(
      'role', v_current.role,
      'version', v_current.version,
      'request_key', v_current.last_request_key,
      'attribute_key_count', (select count(*) from jsonb_object_keys(coalesce(v_current.attributes, '{}'::jsonb)))
    ),
    jsonb_build_object(
      'role', v_updated.role,
      'version', v_updated.version,
      'request_key', v_updated.last_request_key,
      'attribute_key_count', (select count(*) from jsonb_object_keys(coalesce(v_updated.attributes, '{}'::jsonb)))
    )
  );

  perform set_config('smartvisions.member_scope_assignment_command', '0', true);
  return v_updated;
exception
  when others then
    perform set_config('smartvisions.member_scope_assignment_command', '0', true);
    raise;
end;
$$;

create or replace function public.delete_member_scope_assignment(
  p_organization_id uuid,
  p_assignment_id uuid,
  p_expected_version integer,
  p_request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth, extensions, pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_payload_hash text;
  v_claim record;
  v_current public.member_scope_assignments%rowtype;
begin
  if v_actor is null or not public.is_org_owner(p_organization_id) then
    raise exception 'member scope assignment mutation not permitted';
  end if;

  if p_expected_version is null
     or p_expected_version < 1
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid member scope assignment delete payload';
  end if;

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'assignmentId', p_assignment_id,
    'expectedVersion', p_expected_version
  )::text, 'sha256'), 'hex');

  perform set_config('smartvisions.member_scope_assignment_command', '1', true);

  select *
    into v_claim
    from public.claim_member_scope_assignment_command(
      p_organization_id,
      v_request_key,
      'DELETE_SCOPE_ASSIGNMENT',
      p_assignment_id,
      p_expected_version + 1,
      v_payload_hash
    );

  if not v_claim.is_new then
    if exists (
      select 1
      from public.member_scope_assignments
      where organization_id = p_organization_id
        and id = p_assignment_id
    ) then
      raise exception 'member scope assignment delete replay conflicts with a live assignment';
    end if;

    perform set_config('smartvisions.member_scope_assignment_command', '0', true);
    return jsonb_build_object(
      'assignment_id', p_assignment_id,
      'deleted', true,
      'replayed', true,
      'applied_version', v_claim.applied_version
    );
  end if;

  select *
    into v_current
    from public.member_scope_assignments
   where organization_id = p_organization_id
     and id = p_assignment_id
   for update;

  if not found then
    raise exception 'member scope assignment not found';
  end if;

  if v_current.version <> p_expected_version then
    raise exception 'member scope assignment version conflict; current version is %',
      v_current.version;
  end if;

  delete from public.member_scope_assignments
   where organization_id = p_organization_id
     and id = p_assignment_id
     and version = p_expected_version;

  if not found then
    raise exception 'member scope assignment changed concurrently';
  end if;

  insert into public.audit_logs(
    organization_id,
    actor_type,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    p_organization_id,
    'USER',
    v_actor::text,
    'MEMBER_SCOPE_ASSIGNMENT_DELETED',
    'member_scope_assignment',
    p_assignment_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'user_id', v_current.user_id,
      'scope_type', v_current.scope_type,
      'brand_id', v_current.brand_id,
      'tenant_business_id', v_current.tenant_business_id,
      'branch_id', v_current.branch_id,
      'department_id', v_current.department_id,
      'team_id', v_current.team_id,
      'role', v_current.role,
      'version', v_current.version,
      'attribute_key_count', (select count(*) from jsonb_object_keys(coalesce(v_current.attributes, '{}'::jsonb)))
    )),
    jsonb_build_object(
      'deleted', true,
      'applied_version', p_expected_version + 1,
      'request_key', v_request_key
    )
  );

  perform set_config('smartvisions.member_scope_assignment_command', '0', true);
  return jsonb_build_object(
    'assignment_id', p_assignment_id,
    'deleted', true,
    'replayed', false,
    'applied_version', p_expected_version + 1
  );
exception
  when others then
    perform set_config('smartvisions.member_scope_assignment_command', '0', true);
    raise;
end;
$$;

revoke all on public.member_scope_assignment_command_claims
  from anon, authenticated, service_role;
grant select, insert on public.member_scope_assignment_command_claims
  to authenticated;
grant select on public.member_scope_assignment_command_claims
  to service_role;

-- The server service role may inspect IAM state but must not mutate canonical scope authority.
revoke insert, update, delete on public.member_scope_assignments
  from service_role;
grant select on public.member_scope_assignments
  to service_role;

revoke all on function public.enforce_member_scope_assignment_claim_immutable()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_member_scope_assignment_command_path()
  from public, anon, authenticated, service_role;

revoke all on function public.claim_member_scope_assignment_command(
  uuid, text, text, uuid, integer, text
) from public, anon, service_role;
grant execute on function public.claim_member_scope_assignment_command(
  uuid, text, text, uuid, integer, text
) to authenticated;

revoke all on function public.create_member_scope_assignment(
  uuid, uuid, text, text, uuid, uuid, uuid, uuid, uuid, jsonb, text
) from public, anon, service_role;
grant execute on function public.create_member_scope_assignment(
  uuid, uuid, text, text, uuid, uuid, uuid, uuid, uuid, jsonb, text
) to authenticated;

revoke all on function public.update_member_scope_assignment(
  uuid, uuid, integer, text, jsonb, text
) from public, anon, service_role;
grant execute on function public.update_member_scope_assignment(
  uuid, uuid, integer, text, jsonb, text
) to authenticated;

revoke all on function public.delete_member_scope_assignment(
  uuid, uuid, integer, text
) from public, anon, service_role;
grant execute on function public.delete_member_scope_assignment(
  uuid, uuid, integer, text
) to authenticated;
