-- 0091: scoped Chatwoot access reduction safety gate.
--
-- This migration does not call Chatwoot and does not activate provisioning.
-- It extends the existing reverse-role interlock so BRANCH/DEPARTMENT/TEAM
-- authority cannot be reduced from Chatwoot-visible access to VIEWER while an
-- ACTIVE projected Inbox/Team could still expose conversations. External-first
-- scoped demotion orchestration remains a later gate.

create or replace function private.chatwoot_lower_scope_effective_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_scope_type text,
  p_branch_id uuid,
  p_department_id uuid,
  p_team_id uuid,
  p_skip_assignment_id uuid,
  p_apply_hypothetical boolean,
  p_hypothetical_role text,
  p_hypothetical_attributes jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org_role text;
  v_brand_id uuid;
  v_business_id uuid;
  v_branch_id uuid;
  v_department_id uuid;
  v_team_id uuid;
  v_role text;
begin
  if auth.uid() is null
     or not exists (
       select 1
         from public.organization_members owner_member
        where owner_member.organization_id = p_organization_id
          and owner_member.user_id = auth.uid()
          and owner_member.role = 'OWNER'
     )
  then
    raise exception 'current Organization OWNER required for scoped Chatwoot role evaluation';
  end if;

  if p_scope_type = 'BRANCH' then
    select br.id, br.tenant_business_id, b.brand_id
      into v_branch_id, v_business_id, v_brand_id
      from public.branches br
      join public.tenant_businesses b
        on b.organization_id = br.organization_id
       and b.id = br.tenant_business_id
     where br.organization_id = p_organization_id
       and br.id = p_branch_id;
  elsif p_scope_type = 'DEPARTMENT' then
    select d.id, br.id, br.tenant_business_id, b.brand_id
      into v_department_id, v_branch_id, v_business_id, v_brand_id
      from public.departments d
      join public.branches br
        on br.organization_id = d.organization_id
       and br.id = d.branch_id
      join public.tenant_businesses b
        on b.organization_id = br.organization_id
       and b.id = br.tenant_business_id
     where d.organization_id = p_organization_id
       and d.id = p_department_id;
  elsif p_scope_type = 'TEAM' then
    select t.id, d.id, br.id, br.tenant_business_id, b.brand_id
      into v_team_id, v_department_id, v_branch_id, v_business_id, v_brand_id
      from public.teams t
      join public.departments d
        on d.organization_id = t.organization_id
       and d.id = t.department_id
      join public.branches br
        on br.organization_id = d.organization_id
       and br.id = d.branch_id
      join public.tenant_businesses b
        on b.organization_id = br.organization_id
       and b.id = br.tenant_business_id
     where t.organization_id = p_organization_id
       and t.id = p_team_id;
  else
    raise exception 'unsupported lower scope type for Chatwoot role evaluation';
  end if;

  if v_business_id is null or v_brand_id is null or v_branch_id is null then
    raise exception 'canonical lower-scope lineage missing for Chatwoot role evaluation';
  end if;

  select m.role
    into v_org_role
    from public.organization_members m
   where m.organization_id = p_organization_id
     and m.user_id = p_user_id;

  if not found then
    raise exception 'target Organization member missing during scoped Chatwoot role evaluation';
  end if;

  if v_org_role = 'OWNER' then
    return 'OWNER';
  end if;

  if p_scope_type = 'TEAM' then
    if p_apply_hypothetical
       and coalesce(p_hypothetical_attributes, '{}'::jsonb) = '{}'::jsonb
    then
      v_role := p_hypothetical_role;
    else
      select msa.role
        into v_role
        from public.member_scope_assignments msa
       where msa.organization_id = p_organization_id
         and msa.user_id = p_user_id
         and msa.scope_type = 'TEAM'
         and msa.team_id = v_team_id
         and (p_skip_assignment_id is null or msa.id <> p_skip_assignment_id)
         and msa.attributes = '{}'::jsonb
       limit 1;
    end if;
    if v_role is not null then return v_role; end if;
  end if;

  v_role := null;
  if p_scope_type in ('TEAM','DEPARTMENT') then
    if p_scope_type = 'DEPARTMENT'
       and p_apply_hypothetical
       and coalesce(p_hypothetical_attributes, '{}'::jsonb) = '{}'::jsonb
    then
      v_role := p_hypothetical_role;
    else
      select msa.role
        into v_role
        from public.member_scope_assignments msa
       where msa.organization_id = p_organization_id
         and msa.user_id = p_user_id
         and msa.scope_type = 'DEPARTMENT'
         and msa.department_id = v_department_id
         and (p_skip_assignment_id is null or msa.id <> p_skip_assignment_id)
         and msa.attributes = '{}'::jsonb
       limit 1;
    end if;
    if v_role is not null then return v_role; end if;
  end if;

  v_role := null;
  if p_scope_type = 'BRANCH'
     and p_apply_hypothetical
     and coalesce(p_hypothetical_attributes, '{}'::jsonb) = '{}'::jsonb
  then
    v_role := p_hypothetical_role;
  else
    select msa.role
      into v_role
      from public.member_scope_assignments msa
     where msa.organization_id = p_organization_id
       and msa.user_id = p_user_id
       and msa.scope_type = 'BRANCH'
       and msa.branch_id = v_branch_id
       and (p_skip_assignment_id is null or msa.id <> p_skip_assignment_id)
       and msa.attributes = '{}'::jsonb
     limit 1;
  end if;
  if v_role is not null then return v_role; end if;

  select msa.role
    into v_role
    from public.member_scope_assignments msa
   where msa.organization_id = p_organization_id
     and msa.user_id = p_user_id
     and msa.scope_type = 'BUSINESS'
     and msa.tenant_business_id = v_business_id
     and (p_skip_assignment_id is null or msa.id <> p_skip_assignment_id)
     and msa.attributes = '{}'::jsonb
   limit 1;
  if v_role is not null then return v_role; end if;

  select msa.role
    into v_role
    from public.member_scope_assignments msa
   where msa.organization_id = p_organization_id
     and msa.user_id = p_user_id
     and msa.scope_type = 'BRAND'
     and msa.brand_id = v_brand_id
     and (p_skip_assignment_id is null or msa.id <> p_skip_assignment_id)
     and msa.attributes = '{}'::jsonb
   limit 1;
  if v_role is not null then return v_role; end if;

  return v_org_role;
end;
$$;

create or replace function private.member_scope_chatwoot_lower_reduction_safe(
  p_organization_id uuid,
  p_assignment_id uuid,
  p_user_id uuid,
  p_scope_type text,
  p_branch_id uuid,
  p_department_id uuid,
  p_team_id uuid,
  p_new_role text,
  p_new_attributes jsonb,
  p_is_delete boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_before_role text;
  v_after_role text;
  v_business_id uuid;
  v_branch_id uuid;
  v_department_id uuid;
  v_team_id uuid;
begin
  if p_scope_type not in ('BRANCH','DEPARTMENT','TEAM') then
    return true;
  end if;

  v_before_role := private.chatwoot_lower_scope_effective_role(
    p_organization_id,
    p_user_id,
    p_scope_type,
    p_branch_id,
    p_department_id,
    p_team_id,
    null,
    false,
    null,
    null
  );

  v_after_role := private.chatwoot_lower_scope_effective_role(
    p_organization_id,
    p_user_id,
    p_scope_type,
    p_branch_id,
    p_department_id,
    p_team_id,
    p_assignment_id,
    not p_is_delete,
    p_new_role,
    p_new_attributes
  );

  if v_before_role = 'VIEWER' or v_after_role <> 'VIEWER' then
    return true;
  end if;

  if p_scope_type = 'BRANCH' then
    select br.tenant_business_id, br.id
      into v_business_id, v_branch_id
      from public.branches br
     where br.organization_id = p_organization_id
       and br.id = p_branch_id;
  elsif p_scope_type = 'DEPARTMENT' then
    select br.tenant_business_id, br.id, d.id
      into v_business_id, v_branch_id, v_department_id
      from public.departments d
      join public.branches br
        on br.organization_id = d.organization_id
       and br.id = d.branch_id
     where d.organization_id = p_organization_id
       and d.id = p_department_id;
  else
    select br.tenant_business_id, br.id, d.id, t.id
      into v_business_id, v_branch_id, v_department_id, v_team_id
      from public.teams t
      join public.departments d
        on d.organization_id = t.organization_id
       and d.id = t.department_id
      join public.branches br
        on br.organization_id = d.organization_id
       and br.id = d.branch_id
     where t.organization_id = p_organization_id
       and t.id = p_team_id;
  end if;

  if v_business_id is null then
    raise exception 'canonical lower-scope lineage missing for scoped Chatwoot reduction interlock';
  end if;

  if not exists (
    select 1
      from public.chatwoot_account_memberships cm
     where cm.organization_id = p_organization_id
       and cm.tenant_business_id = v_business_id
       and cm.smart_user_id = p_user_id
       and cm.status in ('PROVISIONING','ACTIVE','DEGRADED')
  ) then
    return true;
  end if;

  if p_scope_type = 'BRANCH' then
    if exists (
      select 1
        from public.chatwoot_inbox_mappings im
       where im.organization_id = p_organization_id
         and im.tenant_business_id = v_business_id
         and im.branch_id = v_branch_id
         and im.status in ('PROVISIONING','ACTIVE','DEGRADED')
    ) then
      return false;
    end if;

    if exists (
      select 1
        from public.chatwoot_team_mappings tm
        join public.teams t
          on t.organization_id = tm.organization_id
         and t.id = tm.smart_team_id
        join public.departments d
          on d.organization_id = t.organization_id
         and d.id = t.department_id
       where tm.organization_id = p_organization_id
         and tm.tenant_business_id = v_business_id
         and d.branch_id = v_branch_id
         and tm.status in ('PROVISIONING','ACTIVE','DEGRADED')
    ) then
      return false;
    end if;
  elsif p_scope_type = 'DEPARTMENT' then
    if exists (
      select 1
        from public.chatwoot_team_mappings tm
        join public.teams t
          on t.organization_id = tm.organization_id
         and t.id = tm.smart_team_id
       where tm.organization_id = p_organization_id
         and tm.tenant_business_id = v_business_id
         and t.department_id = v_department_id
         and tm.status in ('PROVISIONING','ACTIVE','DEGRADED')
    ) then
      return false;
    end if;
  else
    if exists (
      select 1
        from public.chatwoot_team_mappings tm
       where tm.organization_id = p_organization_id
         and tm.tenant_business_id = v_business_id
         and tm.smart_team_id = v_team_id
         and tm.status in ('PROVISIONING','ACTIVE','DEGRADED')
    ) then
      return false;
    end if;
  end if;

  return true;
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
  end if;

  if not v_safe then
    raise exception 'scoped Chatwoot external-first demotion required before reducing projected BRANCH/DEPARTMENT/TEAM authority to VIEWER';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.chatwoot_lower_scope_effective_role(
  uuid, uuid, text, uuid, uuid, uuid, uuid, boolean, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function private.chatwoot_lower_scope_effective_role(
  uuid, uuid, text, uuid, uuid, uuid, uuid, boolean, text, jsonb
) to authenticated;

revoke all on function private.member_scope_chatwoot_lower_reduction_safe(
  uuid, uuid, uuid, text, uuid, uuid, uuid, text, jsonb, boolean
) from public, anon, authenticated, service_role;
grant execute on function private.member_scope_chatwoot_lower_reduction_safe(
  uuid, uuid, uuid, text, uuid, uuid, uuid, text, jsonb, boolean
) to authenticated;
