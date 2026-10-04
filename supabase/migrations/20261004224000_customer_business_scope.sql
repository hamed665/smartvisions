-- PR2 Customer Client Access + Business Scope.
-- Reuses Supabase Auth, organization_members, tenant_businesses and member_scope_assignments.
-- No parallel customer/tenant/membership authority is introduced.

alter table public.organization_member_invitations
  add column tenant_business_id uuid;

alter table public.organization_member_invitations
  add constraint organization_member_invitations_business_fkey
  foreign key (organization_id, tenant_business_id)
  references public.tenant_businesses(organization_id, id)
  on delete restrict;

create index organization_member_invitations_business_idx
  on public.organization_member_invitations(organization_id, tenant_business_id)
  where tenant_business_id is not null;

-- Customer-facing Business visibility is explicit:
-- Organization OWNER keeps full authority; every non-OWNER needs an unconditional
-- BRAND or BUSINESS assignment from the canonical member_scope_assignments table.
create or replace function public.customer_business_effective_role(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_brand_id uuid
)
returns text
language plpgsql
stable
security invoker
set search_path = 'public', 'auth', 'pg_catalog'
as $$
declare
  v_actor uuid := auth.uid();
  v_org_role text;
  v_scope_role text;
begin
  if v_actor is null
     or p_organization_id is null
     or p_tenant_business_id is null
     or p_brand_id is null
  then
    return null;
  end if;

  select m.role
    into v_org_role
    from public.organization_members m
   where m.organization_id = p_organization_id
     and m.user_id = v_actor;

  if not found then
    return null;
  end if;

  if v_org_role = 'OWNER' then
    return 'OWNER';
  end if;

  select a.role
    into v_scope_role
    from public.member_scope_assignments a
   where a.organization_id = p_organization_id
     and a.user_id = v_actor
     and a.attributes = '{}'::jsonb
     and (
       (a.scope_type = 'BUSINESS' and a.tenant_business_id = p_tenant_business_id)
       or
       (a.scope_type = 'BRAND' and a.brand_id = p_brand_id)
     )
   order by case a.scope_type when 'BUSINESS' then 2 when 'BRAND' then 1 else 0 end desc
   limit 1;

  return v_scope_role;
end;
$$;

revoke all on function public.customer_business_effective_role(uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.customer_business_effective_role(uuid,uuid,uuid)
  to authenticated;

drop policy if exists tenant_businesses_member_read on public.tenant_businesses;
drop policy if exists tenant_businesses_customer_scoped_read on public.tenant_businesses;
create policy tenant_businesses_customer_scoped_read
  on public.tenant_businesses
  for select
  to authenticated
  using (
    public.customer_business_effective_role(
      organization_id,
      id,
      brand_id
    ) is not null
  );

-- Bound the rest of the canonical hierarchy to Businesses that survived the
-- customer Business policy. OWNER still sees every active/inactive row in its Org.
drop policy if exists brands_member_read on public.brands;
drop policy if exists brands_customer_scoped_read on public.brands;
create policy brands_customer_scoped_read
  on public.brands
  for select
  to authenticated
  using (
    public.is_org_owner(organization_id)
    or exists (
      select 1
        from public.tenant_businesses b
       where b.organization_id = brands.organization_id
         and b.brand_id = brands.id
    )
  );

drop policy if exists branches_member_read on public.branches;
drop policy if exists branches_customer_scoped_read on public.branches;
create policy branches_customer_scoped_read
  on public.branches
  for select
  to authenticated
  using (
    public.is_org_owner(organization_id)
    or exists (
      select 1
        from public.tenant_businesses b
       where b.organization_id = branches.organization_id
         and b.id = branches.tenant_business_id
    )
  );

drop policy if exists departments_member_read on public.departments;
drop policy if exists departments_customer_scoped_read on public.departments;
create policy departments_customer_scoped_read
  on public.departments
  for select
  to authenticated
  using (
    public.is_org_owner(organization_id)
    or exists (
      select 1
        from public.branches br
       where br.organization_id = departments.organization_id
         and br.id = departments.branch_id
    )
  );

drop policy if exists teams_member_read on public.teams;
drop policy if exists teams_customer_scoped_read on public.teams;
create policy teams_customer_scoped_read
  on public.teams
  for select
  to authenticated
  using (
    public.is_org_owner(organization_id)
    or exists (
      select 1
        from public.departments d
       where d.organization_id = teams.organization_id
         and d.id = teams.department_id
    )
  );

-- A delegated ADMIN may read a Chatwoot Account mapping only when the same
-- authenticated actor can read the mapped canonical Business.
drop policy if exists chatwoot_account_mappings_admin_read
  on public.chatwoot_account_mappings;
drop policy if exists chatwoot_account_mappings_customer_scoped_read
  on public.chatwoot_account_mappings;
create policy chatwoot_account_mappings_customer_scoped_read
  on public.chatwoot_account_mappings
  for select
  to authenticated
  using (
    public.chatwoot_bridge_can_read(organization_id)
    and exists (
      select 1
        from public.tenant_businesses b
       where b.organization_id = chatwoot_account_mappings.organization_id
         and b.id = chatwoot_account_mappings.tenant_business_id
    )
  );

-- The trigger bridge below is deliberately narrow. It only permits the invitee
-- to materialize the exact BUSINESS assignment already authorized by a current
-- accepted invitation. It does not grant generic self-service IAM mutation.
create or replace function private.member_scope_invite_acceptance_allowed(
  p_organization_id uuid,
  p_user_id uuid,
  p_tenant_business_id uuid,
  p_role text,
  p_assigned_by uuid,
  p_updated_by uuid,
  p_attributes jsonb,
  p_request_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or v_actor is distinct from p_user_id
     or v_actor is distinct from p_updated_by
     or p_tenant_business_id is null
     or p_role not in ('ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER')
     or coalesce(p_attributes, '{}'::jsonb) <> '{}'::jsonb
     or length(btrim(coalesce(p_request_key, ''))) not between 1 and 200
  then
    return false;
  end if;

  if not exists (
    select 1
      from public.organization_member_invitations i
     where i.organization_id = p_organization_id
       and i.accepted_by_user_id = v_actor
       and i.accepted_at is not null
       and i.revoked_at is null
       and i.tenant_business_id = p_tenant_business_id
       and i.created_by_user_id = p_assigned_by
       and i.last_request_key = p_request_key
       and (
         i.role = p_role
         or (
           i.role = 'OWNER'
           and exists (
             select 1
               from public.organization_members m
              where m.organization_id = p_organization_id
                and m.user_id = v_actor
                and m.role = p_role
           )
         )
       )
  ) then
    return false;
  end if;

  -- Preserve the existing external-first Chatwoot safety contract.
  if p_role = 'VIEWER'
     and exists (
       select 1
         from public.chatwoot_account_memberships cm
        where cm.organization_id = p_organization_id
          and cm.tenant_business_id = p_tenant_business_id
          and cm.smart_user_id = v_actor
          and cm.status in ('PROVISIONING','ACTIVE','DEGRADED')
     )
  then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function private.member_scope_invite_acceptance_allowed(
  uuid,uuid,uuid,text,uuid,uuid,jsonb,text
) from public, anon, authenticated, service_role;
grant execute on function private.member_scope_invite_acceptance_allowed(
  uuid,uuid,uuid,text,uuid,uuid,jsonb,text
) to authenticated;

create or replace function public.enforce_member_scope_assignment_command_path()
returns trigger
language plpgsql
set search_path = 'public', 'private', 'auth', 'pg_catalog'
as $$
declare
  v_invite_acceptance boolean :=
    coalesce(current_setting('smartvisions.member_scope_invite_acceptance', true), '') = '1';
  v_invite_request_key text :=
    coalesce(current_setting('smartvisions.member_scope_invite_request_key', true), '');
begin
  if tg_op = 'DELETE' then
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
    if v_invite_acceptance then
      if new.version <> 1
         or new.scope_type <> 'BUSINESS'
         or new.brand_id is not null
         or new.branch_id is not null
         or new.department_id is not null
         or new.team_id is not null
         or new.last_request_key <> v_invite_request_key
         or not private.member_scope_invite_acceptance_allowed(
           new.organization_id,
           new.user_id,
           new.tenant_business_id,
           new.role,
           new.assigned_by,
           new.updated_by_user_id,
           new.attributes,
           v_invite_request_key
         )
      then
        raise exception 'invited Business scope assignment evidence is invalid';
      end if;

      new.updated_at := now();
      return new;
    end if;

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

create or replace function public.enforce_member_scope_chatwoot_reduction_interlock()
returns trigger
language plpgsql
set search_path = 'private', 'pg_catalog'
as $$
declare
  v_safe boolean;
  v_receipt_allows boolean := false;
  v_invite_request_key text :=
    coalesce(current_setting('smartvisions.member_scope_invite_request_key', true), '');
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_op = 'INSERT'
     and coalesce(current_setting('smartvisions.member_scope_invite_acceptance', true), '') = '1'
  then
    if private.member_scope_invite_acceptance_allowed(
      new.organization_id,
      new.user_id,
      new.tenant_business_id,
      new.role,
      new.assigned_by,
      new.updated_by_user_id,
      new.attributes,
      v_invite_request_key
    ) then
      return new;
    end if;
    raise exception 'invited Business scope assignment failed Chatwoot safety evidence';
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

create or replace function private.issue_organization_member_business_invitation(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_email text,
  p_role text,
  p_invitation_token_hash text,
  p_request_key text
)
returns table(
  invitation_id uuid,
  organization_id uuid,
  tenant_business_id uuid,
  email text,
  role text,
  version integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base record;
  v_invite public.organization_member_invitations%rowtype;
begin
  if not exists (
    select 1
      from public.tenant_businesses b
     where b.organization_id = p_organization_id
       and b.id = p_tenant_business_id
       and b.status = 'ACTIVE'
  ) then
    raise exception 'ACTIVE tenant Business in the invitation Organization is required';
  end if;

  select *
    into v_base
    from private.issue_organization_member_invitation(
      p_organization_id,
      p_email,
      p_role,
      p_invitation_token_hash,
      p_request_key
    );

  select *
    into v_invite
    from public.organization_member_invitations i
   where i.id = v_base.invitation_id
   for update;

  if v_invite.tenant_business_id is not null
     and v_invite.tenant_business_id is distinct from p_tenant_business_id
  then
    raise exception 'customer invitation request key already bound to another Business';
  end if;

  if v_invite.tenant_business_id is null then
    update public.organization_member_invitations i
       set tenant_business_id = p_tenant_business_id,
           updated_at = statement_timestamp()
     where i.id = v_invite.id
    returning * into v_invite;
  end if;

  return query
  select
    v_invite.id,
    v_invite.organization_id,
    v_invite.tenant_business_id,
    v_invite.email,
    v_invite.role,
    v_invite.version,
    v_invite.invitation_expires_at;
end;
$$;

create or replace function private.get_organization_member_business_invitation_context(
  p_session_token_hash text
)
returns table(
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
  tenant_business_id uuid,
  business_name text,
  email text,
  role text,
  version integer,
  session_expires_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hash text := lower(btrim(coalesce(p_session_token_hash, '')));
  v_now timestamptz := statement_timestamp();
begin
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid customer invitation session';
  end if;

  return query
  select
    i.id,
    i.organization_id,
    o.name,
    i.tenant_business_id,
    b.name,
    i.email,
    i.role,
    i.version,
    i.invitation_session_expires_at,
    i.accepted_at
  from public.organization_member_invitations i
  join public.organizations o on o.id = i.organization_id
  left join public.tenant_businesses b
    on b.organization_id = i.organization_id
   and b.id = i.tenant_business_id
  where i.invitation_session_token_hash = v_hash
    and i.revoked_at is null
    and i.invitation_expires_at > v_now
    and i.invitation_session_expires_at is not null
    and i.invitation_session_expires_at > v_now
  limit 1;
end;
$$;

create or replace function private.accept_organization_member_business_invitation(
  p_session_token_hash text,
  p_request_key text
)
returns table(
  organization_id uuid,
  user_id uuid,
  canonical_role text,
  invited_role text,
  tenant_business_id uuid,
  business_role text,
  accepted_at timestamptz,
  replayed boolean,
  scope_replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_base record;
  v_invite public.organization_member_invitations%rowtype;
  v_scope_role text;
  v_existing public.member_scope_assignments%rowtype;
  v_scope_replayed boolean := false;
begin
  if v_actor is null then
    raise exception 'authenticated actor required to accept customer invitation';
  end if;

  if length(v_request_key) not between 1 and 150 then
    raise exception 'invalid customer Business invitation acceptance';
  end if;

  select *
    into v_base
    from private.accept_organization_member_invitation(
      p_session_token_hash,
      v_request_key
    );

  select *
    into v_invite
    from public.organization_member_invitations i
   where i.invitation_session_token_hash = lower(btrim(p_session_token_hash))
     and i.accepted_by_user_id = v_actor
   for update;

  if not found then
    raise exception 'accepted customer invitation evidence is unavailable';
  end if;

  if v_invite.tenant_business_id is null then
    return query
    select
      v_base.organization_id,
      v_base.user_id,
      v_base.canonical_role,
      v_base.invited_role,
      null::uuid,
      null::text,
      v_base.accepted_at,
      v_base.replayed,
      false;
    return;
  end if;

  if not exists (
    select 1
      from public.tenant_businesses b
     where b.organization_id = v_invite.organization_id
       and b.id = v_invite.tenant_business_id
       and b.status = 'ACTIVE'
  ) then
    raise exception 'invited tenant Business is not ACTIVE';
  end if;

  if v_base.canonical_role = 'OWNER' then
    return query
    select
      v_base.organization_id,
      v_base.user_id,
      v_base.canonical_role,
      v_base.invited_role,
      v_invite.tenant_business_id,
      'OWNER'::text,
      v_base.accepted_at,
      v_base.replayed,
      false;
    return;
  end if;

  if v_invite.role in ('ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER') then
    v_scope_role := v_invite.role;
  elsif v_base.canonical_role in ('ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER') then
    v_scope_role := v_base.canonical_role;
  else
    raise exception 'accepted invitation cannot derive a canonical Business role';
  end if;

  select a.*
    into v_existing
    from public.member_scope_assignments a
   where a.organization_id = v_invite.organization_id
     and a.user_id = v_actor
     and a.scope_type = 'BUSINESS'
     and a.tenant_business_id = v_invite.tenant_business_id
   for update;

  if found then
    if v_existing.role <> v_scope_role
       or v_existing.attributes <> '{}'::jsonb
    then
      raise exception 'existing Business scope conflicts with accepted invitation';
    end if;
    v_scope_replayed := true;
  else
    perform set_config('smartvisions.member_scope_assignment_command', '1', true);
    perform set_config('smartvisions.member_scope_invite_acceptance', '1', true);
    perform set_config('smartvisions.member_scope_invite_request_key', v_request_key, true);

    insert into public.member_scope_assignments(
      organization_id,
      user_id,
      scope_type,
      role,
      tenant_business_id,
      attributes,
      assigned_by,
      version,
      last_request_key,
      updated_by_user_id
    ) values (
      v_invite.organization_id,
      v_actor,
      'BUSINESS',
      v_scope_role,
      v_invite.tenant_business_id,
      '{}'::jsonb,
      v_invite.created_by_user_id,
      1,
      v_request_key,
      v_actor
    );

    perform set_config('smartvisions.member_scope_invite_acceptance', '0', true);
    perform set_config('smartvisions.member_scope_invite_request_key', '', true);
    perform set_config('smartvisions.member_scope_assignment_command', '0', true);
  end if;

  return query
  select
    v_base.organization_id,
    v_base.user_id,
    v_base.canonical_role,
    v_base.invited_role,
    v_invite.tenant_business_id,
    v_scope_role,
    v_base.accepted_at,
    v_base.replayed,
    v_scope_replayed;
exception
  when others then
    perform set_config('smartvisions.member_scope_invite_acceptance', '0', true);
    perform set_config('smartvisions.member_scope_invite_request_key', '', true);
    perform set_config('smartvisions.member_scope_assignment_command', '0', true);
    raise;
end;
$$;

create or replace function public.issue_organization_member_business_invitation(
  p_organization_id uuid,
  p_tenant_business_id uuid,
  p_email text,
  p_role text,
  p_invitation_token_hash text,
  p_request_key text
)
returns table(
  invitation_id uuid,
  organization_id uuid,
  tenant_business_id uuid,
  email text,
  role text,
  version integer,
  expires_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.issue_organization_member_business_invitation(
    p_organization_id,
    p_tenant_business_id,
    p_email,
    p_role,
    p_invitation_token_hash,
    p_request_key
  );
$$;

create or replace function public.get_organization_member_business_invitation_context(
  p_session_token_hash text
)
returns table(
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
  tenant_business_id uuid,
  business_name text,
  email text,
  role text,
  version integer,
  session_expires_at timestamptz,
  accepted_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from private.get_organization_member_business_invitation_context(
    p_session_token_hash
  );
$$;

create or replace function public.accept_organization_member_business_invitation(
  p_session_token_hash text,
  p_request_key text
)
returns table(
  organization_id uuid,
  user_id uuid,
  canonical_role text,
  invited_role text,
  tenant_business_id uuid,
  business_role text,
  accepted_at timestamptz,
  replayed boolean,
  scope_replayed boolean
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.accept_organization_member_business_invitation(
    p_session_token_hash,
    p_request_key
  );
$$;

revoke all on function private.issue_organization_member_business_invitation(
  uuid,uuid,text,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function private.issue_organization_member_business_invitation(
  uuid,uuid,text,text,text,text
) to authenticated;

revoke all on function private.get_organization_member_business_invitation_context(text)
  from public, anon, authenticated, service_role;
grant execute on function private.get_organization_member_business_invitation_context(text)
  to service_role;

revoke all on function private.accept_organization_member_business_invitation(text,text)
  from public, anon, authenticated, service_role;
grant execute on function private.accept_organization_member_business_invitation(text,text)
  to authenticated;

revoke all on function public.issue_organization_member_business_invitation(
  uuid,uuid,text,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.issue_organization_member_business_invitation(
  uuid,uuid,text,text,text,text
) to authenticated;

revoke all on function public.get_organization_member_business_invitation_context(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_organization_member_business_invitation_context(text)
  to service_role;

revoke all on function public.accept_organization_member_business_invitation(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.accept_organization_member_business_invitation(text,text)
  to authenticated;

comment on function public.customer_business_effective_role(uuid,uuid,uuid) is
  'Customer Business access boundary. OWNER is Organization-wide; every non-OWNER requires an unconditional canonical BRAND or BUSINESS scope assignment.';

comment on column public.organization_member_invitations.tenant_business_id is
  'Optional canonical Business bound to a customer invite. Legacy PR1 invitations remain valid and fail closed to no Business scope.';
