-- Customer Business membership scope hardening.
--
-- Canonical customer representation for a Business-scoped invite:
-- - organization_members: VIEWER (scoped-only marker)
-- - member_scope_assignments: exact Business role (ADMIN/SALES_MANAGER/SALES_AGENT/VIEWER)
--
-- Existing Organization membership is never downgraded. OWNER remains Organization-wide.
-- This aligns Customer Access with the existing Unified Inbox scoped-only contract and
-- prevents a newly invited Business ADMIN/SALES role from becoming Organization-wide.

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
  v_invite_organization_id uuid;
  v_invite_business_id uuid;
  v_preexisting_org_role text;
  v_had_membership boolean := false;
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

  -- Capture membership state before the generic invitation bridge runs. Only a
  -- membership created by this Business-scoped acceptance is normalized to the
  -- scoped-only Organization VIEWER representation.
  select i.organization_id, i.tenant_business_id
    into v_invite_organization_id, v_invite_business_id
    from public.organization_member_invitations i
   where i.invitation_session_token_hash = lower(btrim(p_session_token_hash))
   limit 1;

  if found and v_invite_business_id is not null then
    select m.role
      into v_preexisting_org_role
      from public.organization_members m
     where m.organization_id = v_invite_organization_id
       and m.user_id = v_actor;

    v_had_membership := found;
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

  if not v_had_membership and v_base.canonical_role <> 'VIEWER' then
    update public.organization_members m
       set role = 'VIEWER'
     where m.organization_id = v_invite.organization_id
       and m.user_id = v_actor
       and m.role = v_base.canonical_role
       and m.role <> 'OWNER';

    if not found then
      raise exception 'new Business-scoped membership could not be normalized safely';
    end if;

    insert into public.audit_logs(
      organization_id,
      actor_type,
      actor_id,
      action,
      entity_type,
      entity_id,
      after_data
    ) values (
      v_invite.organization_id,
      'USER',
      v_actor::text,
      'CUSTOMER_BUSINESS_MEMBERSHIP_SCOPED',
      'organization_member',
      v_actor::text,
      pg_catalog.jsonb_build_object(
        'tenant_business_id', v_invite.tenant_business_id,
        'organization_role', 'VIEWER',
        'business_role', v_scope_role,
        'invited_role', v_invite.role,
        'reason', 'BUSINESS_SCOPED_INVITATION'
      )
    );

    v_base.canonical_role := 'VIEWER';
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

-- Align Chatwoot Account mapping reads with the same canonical Customer Business
-- authority. Mutation remains governed by the existing OWNER-only bridge RPCs.
drop policy if exists chatwoot_account_mappings_customer_scoped_read
  on public.chatwoot_account_mappings;
create policy chatwoot_account_mappings_customer_scoped_read
  on public.chatwoot_account_mappings
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.tenant_businesses b
       where b.organization_id = chatwoot_account_mappings.organization_id
         and b.id = chatwoot_account_mappings.tenant_business_id
         and public.customer_business_effective_role(
           b.organization_id,
           b.id,
           b.brand_id
         ) is not null
    )
  );

revoke all on function private.accept_organization_member_business_invitation(text,text)
  from public, anon, authenticated, service_role;
grant execute on function private.accept_organization_member_business_invitation(text,text)
  to authenticated;

comment on function private.accept_organization_member_business_invitation(text,text) is
  'Accepts a Business-scoped customer invite. New non-OWNER memberships are represented as Organization VIEWER plus the exact canonical Business role assignment; pre-existing Organization membership is preserved.';
