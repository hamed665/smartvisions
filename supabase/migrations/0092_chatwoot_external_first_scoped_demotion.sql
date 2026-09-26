-- 0092: verified external-first scoped Chatwoot demotion receipts.
--
-- Chatwoot HTTP remains server-side. service_role may record only immutable
-- verification receipts. Authenticated Organization OWNER remains the only
-- authority allowed to mutate canonical member_scope_assignments.
--
-- The existing 0091 interlock stays fail-closed. A lower-scope reduction that
-- would otherwise be blocked may pass only when the current transaction carries
-- a fresh receipt that exactly matches assignment/version/target mutation.

create table if not exists public.chatwoot_scoped_access_reduction_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assignment_id uuid not null,
  assignment_version integer not null check (assignment_version >= 1),
  smart_user_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (operation in ('UPDATE','DELETE')),
  post_role text check (
    post_role is null
    or post_role in ('ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER')
  ),
  post_attributes_hash text not null check (post_attributes_hash ~ '^[0-9a-f]{64}$'),
  chatwoot_user_id integer not null check (chatwoot_user_id > 0),
  verified_inbox_mapping_ids uuid[] not null default '{}'::uuid[],
  verified_team_mapping_ids uuid[] not null default '{}'::uuid[],
  verified_resource_count integer not null check (verified_resource_count >= 1),
  request_key text not null check (length(trim(request_key)) between 1 and 200),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),

  unique (organization_id, request_key),
  check (expires_at > observed_at),
  check (
    (operation = 'UPDATE' and post_role is not null)
    or (operation = 'DELETE' and post_role is null)
  ),
  check (
    verified_resource_count =
      coalesce(cardinality(verified_inbox_mapping_ids), 0)
      + coalesce(cardinality(verified_team_mapping_ids), 0)
  )
);

create index if not exists chatwoot_scoped_reduction_receipts_assignment_idx
  on public.chatwoot_scoped_access_reduction_receipts(
    organization_id, assignment_id, assignment_version, observed_at desc
  );

alter table public.chatwoot_scoped_access_reduction_receipts
  enable row level security;

create or replace function public.enforce_chatwoot_scoped_reduction_receipt_immutable()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'Chatwoot scoped access reduction receipts are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists chatwoot_scoped_reduction_receipts_immutable
  on public.chatwoot_scoped_access_reduction_receipts;
create trigger chatwoot_scoped_reduction_receipts_immutable
before insert or update or delete
on public.chatwoot_scoped_access_reduction_receipts
for each row execute function public.enforce_chatwoot_scoped_reduction_receipt_immutable();

create or replace function public.record_chatwoot_scoped_access_reduction(
  p_organization_id uuid,
  p_assignment_id uuid,
  p_expected_assignment_version integer,
  p_operation text,
  p_post_role text,
  p_post_attributes jsonb,
  p_chatwoot_user_id integer,
  p_verified_inbox_mapping_ids uuid[],
  p_verified_team_mapping_ids uuid[],
  p_request_key text
)
returns public.chatwoot_scoped_access_reduction_receipts
language plpgsql
security invoker
set search_path = public, extensions, pg_catalog
as $$
declare
  v_assignment public.member_scope_assignments%rowtype;
  v_operation text := upper(trim(coalesce(p_operation, '')));
  v_post_role text := nullif(upper(trim(coalesce(p_post_role, ''))), '');
  v_post_attributes jsonb := coalesce(p_post_attributes, '{}'::jsonb);
  v_request_key text := trim(coalesce(p_request_key, ''));
  v_inbox_ids uuid[] := coalesce(p_verified_inbox_mapping_ids, '{}'::uuid[]);
  v_team_ids uuid[] := coalesce(p_verified_team_mapping_ids, '{}'::uuid[]);
  v_business_id uuid;
  v_post_attributes_hash text;
  v_payload_hash text;
  v_existing public.chatwoot_scoped_access_reduction_receipts%rowtype;
  v_created public.chatwoot_scoped_access_reduction_receipts%rowtype;
  v_now timestamptz := now();
  v_expected_count integer;
begin
  if p_expected_assignment_version is null
     or p_expected_assignment_version < 1
     or v_operation not in ('UPDATE','DELETE')
     or p_chatwoot_user_id is null
     or p_chatwoot_user_id <= 0
     or jsonb_typeof(v_post_attributes) <> 'object'
     or length(v_request_key) not between 1 and 200
  then
    raise exception 'invalid Chatwoot scoped reduction receipt payload';
  end if;

  if v_operation = 'UPDATE' and v_post_role not in (
    'ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER'
  ) then
    raise exception 'invalid Chatwoot scoped reduction target role';
  end if;

  if v_operation = 'DELETE' then
    v_post_role := null;
    v_post_attributes := '{}'::jsonb;
  end if;

  if cardinality(v_inbox_ids) <> cardinality(array(select distinct x from unnest(v_inbox_ids) x))
     or cardinality(v_team_ids) <> cardinality(array(select distinct x from unnest(v_team_ids) x))
  then
    raise exception 'duplicate Chatwoot scoped reduction mapping IDs are not allowed';
  end if;

  v_expected_count := coalesce(cardinality(v_inbox_ids), 0) + coalesce(cardinality(v_team_ids), 0);
  if v_expected_count < 1 or v_expected_count > 500 then
    raise exception 'invalid Chatwoot scoped reduction verified resource count';
  end if;

  select *
    into v_assignment
    from public.member_scope_assignments
   where organization_id = p_organization_id
     and id = p_assignment_id;

  if not found
     or v_assignment.version <> p_expected_assignment_version
     or v_assignment.scope_type not in ('BRANCH','DEPARTMENT','TEAM')
  then
    raise exception 'member scope assignment version/state changed before scoped reduction receipt';
  end if;

  if v_assignment.scope_type = 'BRANCH' then
    select br.tenant_business_id
      into v_business_id
      from public.branches br
     where br.organization_id = p_organization_id
       and br.id = v_assignment.branch_id;
  elsif v_assignment.scope_type = 'DEPARTMENT' then
    select br.tenant_business_id
      into v_business_id
      from public.departments d
      join public.branches br
        on br.organization_id = d.organization_id
       and br.id = d.branch_id
     where d.organization_id = p_organization_id
       and d.id = v_assignment.department_id;
  else
    select br.tenant_business_id
      into v_business_id
      from public.teams t
      join public.departments d
        on d.organization_id = t.organization_id
       and d.id = t.department_id
      join public.branches br
        on br.organization_id = d.organization_id
       and br.id = d.branch_id
     where t.organization_id = p_organization_id
       and t.id = v_assignment.team_id;
  end if;

  if v_business_id is null then
    raise exception 'canonical scoped reduction Business lineage is missing';
  end if;

  if not exists (
    select 1
      from public.chatwoot_account_memberships cm
      join public.chatwoot_user_mappings um
        on um.id = cm.chatwoot_user_mapping_id
       and um.smart_user_id = cm.smart_user_id
     where cm.organization_id = p_organization_id
       and cm.tenant_business_id = v_business_id
       and cm.smart_user_id = v_assignment.user_id
       and cm.status = 'ACTIVE'
       and um.status = 'ACTIVE'
       and um.chatwoot_user_id = p_chatwoot_user_id
  ) then
    raise exception 'verified ACTIVE Chatwoot AccountUser/User projection required for scoped reduction receipt';
  end if;

  if exists (
    select 1
      from unnest(v_inbox_ids) x(id)
      left join public.chatwoot_inbox_mappings im
        on im.organization_id = p_organization_id
       and im.tenant_business_id = v_business_id
       and im.id = x.id
       and im.status = 'ACTIVE'
     where im.id is null
  ) then
    raise exception 'scoped reduction Inbox receipt references a non-ACTIVE mapping';
  end if;

  if exists (
    select 1
      from unnest(v_team_ids) x(id)
      left join public.chatwoot_team_mappings tm
        on tm.organization_id = p_organization_id
       and tm.tenant_business_id = v_business_id
       and tm.id = x.id
       and tm.status = 'ACTIVE'
     where tm.id is null
  ) then
    raise exception 'scoped reduction Team receipt references a non-ACTIVE mapping';
  end if;

  v_post_attributes_hash := encode(
    extensions.digest(v_post_attributes::text, 'sha256'),
    'hex'
  );

  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'organizationId', p_organization_id,
    'assignmentId', p_assignment_id,
    'assignmentVersion', p_expected_assignment_version,
    'smartUserId', v_assignment.user_id,
    'operation', v_operation,
    'postRole', v_post_role,
    'postAttributesHash', v_post_attributes_hash,
    'chatwootUserId', p_chatwoot_user_id,
    'verifiedInboxMappingIds', to_jsonb(v_inbox_ids),
    'verifiedTeamMappingIds', to_jsonb(v_team_ids)
  )::text, 'sha256'), 'hex');

  select *
    into v_existing
    from public.chatwoot_scoped_access_reduction_receipts
   where organization_id = p_organization_id
     and request_key = v_request_key;

  if found then
    if v_existing.payload_hash <> v_payload_hash then
      raise exception 'scoped reduction request key already used with different verification payload';
    end if;
    return v_existing;
  end if;

  insert into public.chatwoot_scoped_access_reduction_receipts(
    organization_id,
    assignment_id,
    assignment_version,
    smart_user_id,
    operation,
    post_role,
    post_attributes_hash,
    chatwoot_user_id,
    verified_inbox_mapping_ids,
    verified_team_mapping_ids,
    verified_resource_count,
    request_key,
    payload_hash,
    observed_at,
    expires_at
  ) values (
    p_organization_id,
    p_assignment_id,
    p_expected_assignment_version,
    v_assignment.user_id,
    v_operation,
    v_post_role,
    v_post_attributes_hash,
    p_chatwoot_user_id,
    v_inbox_ids,
    v_team_ids,
    v_expected_count,
    v_request_key,
    v_payload_hash,
    v_now,
    v_now + interval '5 minutes'
  )
  returning * into v_created;

  return v_created;
end;
$$;

create or replace function private.chatwoot_scoped_reduction_receipt_allows(
  p_organization_id uuid,
  p_assignment_id uuid,
  p_assignment_version integer,
  p_user_id uuid,
  p_operation text,
  p_post_role text,
  p_post_attributes jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_receipt_setting text := nullif(
    current_setting('smartvisions.chatwoot_scoped_reduction_receipt', true),
    ''
  );
  v_receipt_id uuid;
  v_post_attributes_hash text;
begin
  if v_receipt_setting is null
     or v_receipt_setting !~ '^[0-9a-fA-F-]{36}$'
  then
    return false;
  end if;

  begin
    v_receipt_id := v_receipt_setting::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  v_post_attributes_hash := encode(
    extensions.digest(coalesce(p_post_attributes, '{}'::jsonb)::text, 'sha256'),
    'hex'
  );

  return exists (
    select 1
      from public.chatwoot_scoped_access_reduction_receipts r
     where r.id = v_receipt_id
       and r.organization_id = p_organization_id
       and r.assignment_id = p_assignment_id
       and r.assignment_version = p_assignment_version
       and r.smart_user_id = p_user_id
       and r.operation = upper(trim(p_operation))
       and r.post_role is not distinct from nullif(upper(trim(coalesce(p_post_role, ''))), '')
       and r.post_attributes_hash = v_post_attributes_hash
       and r.expires_at >= now()
  );
end;
$$;

create or replace function public.enforce_member_scope_chatwoot_reduction_interlock()
returns trigger
language plpgsql
security invoker
set search_path = private, pg_catalog
as $$
declare
  v_safe boolean;
  v_receipt_allows boolean := false;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.scope_type in ('BRAND','BUSINESS') then
      v_safe := private.member_scope_chatwoot_reduction_safe(
        new.organization_id,
        new.id,
        new.user_id,
        new.scope_type,
        new.brand_id,
        new.tenant_business_id,
        new.role,
        new.attributes,
        false
      );
      if not v_safe then
        raise exception 'archive verified Chatwoot Account membership before reducing Business-wide authority to VIEWER';
      end if;
      return new;
    end if;

    v_safe := private.member_scope_chatwoot_lower_reduction_safe(
      new.organization_id,
      new.id,
      new.user_id,
      new.scope_type,
      new.branch_id,
      new.department_id,
      new.team_id,
      new.role,
      new.attributes,
      false
    );
  else
    if old.scope_type in ('BRAND','BUSINESS') then
      v_safe := private.member_scope_chatwoot_reduction_safe(
        old.organization_id,
        old.id,
        old.user_id,
        old.scope_type,
        old.brand_id,
        old.tenant_business_id,
        case when tg_op = 'DELETE' then null else new.role end,
        case when tg_op = 'DELETE' then null else new.attributes end,
        tg_op = 'DELETE'
      );
      if not v_safe then
        raise exception 'archive verified Chatwoot Account membership before reducing Business-wide authority to VIEWER';
      end if;
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;

    v_safe := private.member_scope_chatwoot_lower_reduction_safe(
      old.organization_id,
      old.id,
      old.user_id,
      old.scope_type,
      old.branch_id,
      old.department_id,
      old.team_id,
      case when tg_op = 'DELETE' then null else new.role end,
      case when tg_op = 'DELETE' then null else new.attributes end,
      tg_op = 'DELETE'
    );

    if not v_safe then
      v_receipt_allows := private.chatwoot_scoped_reduction_receipt_allows(
        old.organization_id,
        old.id,
        old.version,
        old.user_id,
        tg_op,
        case when tg_op = 'DELETE' then null else new.role end,
        case when tg_op = 'DELETE' then '{}'::jsonb else new.attributes end
      );
      if v_receipt_allows then
        if tg_op = 'DELETE' then return old; end if;
        return new;
      end if;
    end if;
  end if;

  if not v_safe then
    raise exception 'scoped Chatwoot external-first demotion required before reducing projected BRANCH/DEPARTMENT/TEAM authority to VIEWER';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.apply_member_scope_assignment_reduction_verified(
  p_organization_id uuid,
  p_assignment_id uuid,
  p_expected_version integer,
  p_operation text,
  p_post_role text,
  p_post_attributes jsonb,
  p_receipt_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_operation text := upper(trim(coalesce(p_operation, '')));
  v_result public.member_scope_assignments%rowtype;
  v_deleted jsonb;
begin
  if auth.uid() is null or not public.is_org_owner(p_organization_id) then
    raise exception 'verified member scope reduction not permitted';
  end if;

  if v_operation not in ('UPDATE','DELETE')
     or p_expected_version is null
     or p_expected_version < 1
     or p_receipt_id is null
     or length(trim(coalesce(p_request_key, ''))) not between 1 and 200
  then
    raise exception 'invalid verified member scope reduction payload';
  end if;

  perform set_config(
    'smartvisions.chatwoot_scoped_reduction_receipt',
    p_receipt_id::text,
    true
  );

  if v_operation = 'UPDATE' then
    select *
      into v_result
      from public.update_member_scope_assignment(
        p_organization_id,
        p_assignment_id,
        p_expected_version,
        p_post_role,
        coalesce(p_post_attributes, '{}'::jsonb),
        p_request_key
      );

    perform set_config('smartvisions.chatwoot_scoped_reduction_receipt', '', true);

    return jsonb_build_object(
      'assignment_id', v_result.id,
      'deleted', false,
      'version', v_result.version,
      'role', v_result.role
    );
  end if;

  v_deleted := public.delete_member_scope_assignment(
    p_organization_id,
    p_assignment_id,
    p_expected_version,
    p_request_key
  );

  perform set_config('smartvisions.chatwoot_scoped_reduction_receipt', '', true);
  return v_deleted;
exception
  when others then
    perform set_config('smartvisions.chatwoot_scoped_reduction_receipt', '', true);
    raise;
end;
$$;

revoke all on public.chatwoot_scoped_access_reduction_receipts
  from public, anon, authenticated;
grant select, insert on public.chatwoot_scoped_access_reduction_receipts
  to service_role;

revoke all on function public.enforce_chatwoot_scoped_reduction_receipt_immutable()
  from public, anon, authenticated, service_role;

revoke all on function public.record_chatwoot_scoped_access_reduction(
  uuid, uuid, integer, text, text, jsonb, integer, uuid[], uuid[], text
) from public, anon, authenticated;
grant execute on function public.record_chatwoot_scoped_access_reduction(
  uuid, uuid, integer, text, text, jsonb, integer, uuid[], uuid[], text
) to service_role;

revoke all on function private.chatwoot_scoped_reduction_receipt_allows(
  uuid, uuid, integer, uuid, text, text, jsonb
) from public, anon, authenticated, service_role;
-- The member_scope_assignments reduction trigger executes as the authenticated
-- OWNER, matching the existing 0091 private interlock helper pattern. Expose
-- only EXECUTE; the helper returns a boolean and cannot mutate IAM or receipts.
grant execute on function private.chatwoot_scoped_reduction_receipt_allows(
  uuid, uuid, integer, uuid, text, text, jsonb
) to authenticated;

revoke all on function public.apply_member_scope_assignment_reduction_verified(
  uuid, uuid, integer, text, text, jsonb, uuid, text
) from public, anon, service_role;
grant execute on function public.apply_member_scope_assignment_reduction_verified(
  uuid, uuid, integer, text, text, jsonb, uuid, text
) to authenticated;
