-- Customer Invite + Auth execution overlay for SAAS-AGENCY / ENT-IAM.
-- Extends Supabase Auth + canonical organization_members only.
-- No second user directory, tenant model, membership authority or credential store.

create table public.organization_member_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER')),
  invitation_token_hash text not null unique,
  invitation_created_at timestamptz not null default now(),
  invitation_expires_at timestamptz not null,
  invitation_redeemed_at timestamptz,
  invitation_session_token_hash text unique,
  invitation_session_expires_at timestamptz,
  accepted_by_user_id uuid references auth.users(id) on delete restrict,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id uuid not null,
  issue_request_key text not null,
  last_request_key text not null,
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, created_by_user_id)
    references public.organization_members(organization_id, user_id)
    on delete restrict,
  constraint organization_member_invitations_email_check
    check (
      length(email) between 3 and 320
      and email = lower(btrim(email))
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  constraint organization_member_invitations_invite_hash_check
    check (invitation_token_hash ~ '^[0-9a-f]{64}$'),
  constraint organization_member_invitations_session_hash_check
    check (
      invitation_session_token_hash is null
      or invitation_session_token_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint organization_member_invitations_issue_request_key_check
    check (length(btrim(issue_request_key)) between 1 and 150),
  constraint organization_member_invitations_last_request_key_check
    check (length(btrim(last_request_key)) between 1 and 200),
  constraint organization_member_invitations_expiry_check
    check (invitation_expires_at > invitation_created_at),
  constraint organization_member_invitations_session_shape_check
    check (
      (
        invitation_redeemed_at is null
        and invitation_session_token_hash is null
        and invitation_session_expires_at is null
      )
      or
      (
        invitation_redeemed_at is not null
        and invitation_session_token_hash is not null
        and invitation_session_expires_at is not null
        and invitation_session_expires_at > invitation_redeemed_at
        and invitation_session_expires_at <= invitation_expires_at
      )
      or
      (
        revoked_at is not null
        and invitation_session_token_hash is null
        and invitation_session_expires_at is null
      )
    ),
  constraint organization_member_invitations_acceptance_shape_check
    check (
      (accepted_at is null and accepted_by_user_id is null)
      or (accepted_at is not null and accepted_by_user_id is not null)
    ),
  unique (organization_id, issue_request_key)
);

create index organization_member_invitations_org_email_idx
  on public.organization_member_invitations(organization_id, email, invitation_created_at desc);

create index organization_member_invitations_created_by_idx
  on public.organization_member_invitations(organization_id, created_by_user_id);

create index organization_member_invitations_accepted_by_idx
  on public.organization_member_invitations(accepted_by_user_id)
  where accepted_by_user_id is not null;

create index organization_member_invitations_active_idx
  on public.organization_member_invitations(organization_id, invitation_expires_at)
  where accepted_at is null and revoked_at is null;

alter table public.organization_member_invitations enable row level security;

drop policy if exists organization_member_invitations_owner_read
  on public.organization_member_invitations;
create policy organization_member_invitations_owner_read
  on public.organization_member_invitations
  for select
  to authenticated
  using (public.is_org_owner(organization_id));

-- The invitation row carries bearer hashes and is not a browser data surface.
-- A scoped policy exists for defense in depth, while direct Data API grants stay closed.
revoke all on public.organization_member_invitations
  from public, anon, authenticated, service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to authenticated, service_role;

create or replace function private.issue_organization_member_invitation(
  p_organization_id uuid,
  p_email text,
  p_role text,
  p_invitation_token_hash text,
  p_request_key text
)
returns table(
  invitation_id uuid,
  organization_id uuid,
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
  v_actor uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_role text := upper(btrim(coalesce(p_role, '')));
  v_hash text := lower(btrim(coalesce(p_invitation_token_hash, '')));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_now timestamptz := statement_timestamp();
  v_existing public.organization_member_invitations%rowtype;
  v_created public.organization_member_invitations%rowtype;
begin
  if v_actor is null then
    raise exception 'authenticated actor required for customer invitation';
  end if;

  if not exists (
    select 1
      from public.organization_members m
     where m.organization_id = p_organization_id
       and m.user_id = v_actor
       and m.role = 'OWNER'
  ) then
    raise exception 'Organization OWNER required for customer invitation';
  end if;

  if length(v_email) not between 3 and 320
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or v_role not in ('OWNER','ADMIN','SALES_MANAGER','SALES_AGENT','VIEWER')
     or v_hash !~ '^[0-9a-f]{64}$'
     or length(v_request_key) not between 1 and 150
  then
    raise exception 'invalid customer invitation request';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || v_email, 0)
  );

  select i.*
    into v_existing
    from public.organization_member_invitations i
   where i.organization_id = p_organization_id
     and i.issue_request_key = v_request_key;

  if found then
    if v_existing.email <> v_email
       or v_existing.role <> v_role
       or v_existing.invitation_token_hash <> v_hash
    then
      raise exception 'customer invitation request key already used with different payload';
    end if;

    return query
    select v_existing.id, v_existing.organization_id, v_existing.email,
           v_existing.role, v_existing.version, v_existing.invitation_expires_at;
    return;
  end if;

  update public.organization_member_invitations i
     set revoked_at = v_now,
         invitation_session_token_hash = null,
         invitation_session_expires_at = null,
         version = i.version + 1,
         last_request_key = 'superseded:' || v_request_key,
         updated_at = v_now
   where i.organization_id = p_organization_id
     and i.email = v_email
     and i.accepted_at is null
     and i.revoked_at is null
     and i.invitation_expires_at > v_now;

  insert into public.organization_member_invitations(
    organization_id,
    email,
    role,
    invitation_token_hash,
    invitation_expires_at,
    created_by_user_id,
    issue_request_key,
    last_request_key
  ) values (
    p_organization_id,
    v_email,
    v_role,
    v_hash,
    v_now + interval '24 hours',
    v_actor,
    v_request_key,
    v_request_key
  )
  returning * into v_created;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id,
    'USER',
    v_actor::text,
    'ORGANIZATION_MEMBER_INVITE_ISSUED',
    'organization_member_invitation',
    v_created.id::text,
    pg_catalog.jsonb_build_object(
      'role', v_created.role,
      'expires_at', v_created.invitation_expires_at,
      'version', v_created.version
    )
  );

  return query
  select v_created.id, v_created.organization_id, v_created.email,
         v_created.role, v_created.version, v_created.invitation_expires_at;
end;
$$;

create or replace function private.redeem_organization_member_invitation(
  p_invitation_token_hash text,
  p_session_token_hash text,
  p_request_key text
)
returns table(
  invitation_id uuid,
  organization_id uuid,
  email text,
  role text,
  version integer,
  session_expires_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite_hash text := lower(btrim(coalesce(p_invitation_token_hash, '')));
  v_session_hash text := lower(btrim(coalesce(p_session_token_hash, '')));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_now timestamptz := statement_timestamp();
  v_invite public.organization_member_invitations%rowtype;
begin
  if v_invite_hash !~ '^[0-9a-f]{64}$'
     or v_session_hash !~ '^[0-9a-f]{64}$'
     or length(v_request_key) not between 1 and 150
  then
    raise exception 'invalid customer invitation redemption';
  end if;

  select i.*
    into v_invite
    from public.organization_member_invitations i
   where i.invitation_token_hash = v_invite_hash
   for update;

  if not found
     or v_invite.revoked_at is not null
     or v_invite.accepted_at is not null
     or v_invite.invitation_expires_at <= v_now
     or v_invite.invitation_redeemed_at is not null
  then
    raise exception 'customer invitation is invalid, expired, redeemed, accepted or revoked';
  end if;

  update public.organization_member_invitations i
     set invitation_redeemed_at = v_now,
         invitation_session_token_hash = v_session_hash,
         invitation_session_expires_at = least(i.invitation_expires_at, v_now + interval '60 minutes'),
         version = i.version + 1,
         last_request_key = v_request_key,
         updated_at = v_now
   where i.id = v_invite.id
     and i.version = v_invite.version
  returning * into v_invite;

  if not found then
    raise exception 'customer invitation redemption lost optimistic state';
  end if;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id, after_data
  ) values (
    v_invite.organization_id,
    'SYSTEM',
    'customer_invite_capability',
    'ORGANIZATION_MEMBER_INVITE_REDEEMED',
    'organization_member_invitation',
    v_invite.id::text,
    pg_catalog.jsonb_build_object(
      'session_expires_at', v_invite.invitation_session_expires_at,
      'version', v_invite.version
    )
  );

  return query
  select v_invite.id, v_invite.organization_id, v_invite.email,
         v_invite.role, v_invite.version, v_invite.invitation_session_expires_at,
         v_invite.accepted_at;
end;
$$;

create or replace function private.get_organization_member_invitation_context(
  p_session_token_hash text
)
returns table(
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
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
    i.email,
    i.role,
    i.version,
    i.invitation_session_expires_at,
    i.accepted_at
  from public.organization_member_invitations i
  join public.organizations o on o.id = i.organization_id
  where i.invitation_session_token_hash = v_hash
    and i.revoked_at is null
    and i.invitation_expires_at > v_now
    and i.invitation_session_expires_at is not null
    and i.invitation_session_expires_at > v_now
  limit 1;
end;
$$;

create or replace function private.accept_organization_member_invitation(
  p_session_token_hash text,
  p_request_key text
)
returns table(
  organization_id uuid,
  user_id uuid,
  canonical_role text,
  invited_role text,
  accepted_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text;
  v_email_confirmed_at timestamptz;
  v_hash text := lower(btrim(coalesce(p_session_token_hash, '')));
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_now timestamptz := statement_timestamp();
  v_invite public.organization_member_invitations%rowtype;
  v_canonical_role text;
  v_membership_created boolean := false;
begin
  if v_actor is null then
    raise exception 'authenticated actor required to accept customer invitation';
  end if;

  if v_hash !~ '^[0-9a-f]{64}$'
     or length(v_request_key) not between 1 and 150
  then
    raise exception 'invalid customer invitation acceptance';
  end if;

  select lower(btrim(coalesce(u.email, ''))), u.email_confirmed_at
    into v_actor_email, v_email_confirmed_at
    from auth.users u
   where u.id = v_actor;

  if not found or v_actor_email = '' or v_email_confirmed_at is null then
    raise exception 'confirmed Auth email required to accept customer invitation';
  end if;

  select i.*
    into v_invite
    from public.organization_member_invitations i
   where i.invitation_session_token_hash = v_hash
   for update;

  if not found
     or v_invite.revoked_at is not null
     or v_invite.invitation_expires_at <= v_now
     or v_invite.invitation_session_expires_at is null
     or v_invite.invitation_session_expires_at <= v_now
  then
    raise exception 'customer invitation session is invalid, expired or revoked';
  end if;

  if v_invite.email <> v_actor_email then
    raise exception 'authenticated email does not match customer invitation';
  end if;

  if not exists (
    select 1
      from public.organization_members inviter
     where inviter.organization_id = v_invite.organization_id
       and inviter.user_id = v_invite.created_by_user_id
       and inviter.role = 'OWNER'
  ) then
    raise exception 'customer invitation issuer no longer has OWNER authority';
  end if;

  if v_invite.accepted_at is not null then
    if v_invite.accepted_by_user_id is distinct from v_actor then
      raise exception 'customer invitation was accepted by a different user';
    end if;

    select m.role
      into v_canonical_role
      from public.organization_members m
     where m.organization_id = v_invite.organization_id
       and m.user_id = v_actor;

    if not found then
      raise exception 'accepted customer invitation has no canonical membership';
    end if;

    return query
    select v_invite.organization_id, v_actor, v_canonical_role, v_invite.role,
           v_invite.accepted_at, true;
    return;
  end if;

  select m.role
    into v_canonical_role
    from public.organization_members m
   where m.organization_id = v_invite.organization_id
     and m.user_id = v_actor;

  if not found then
    insert into public.organization_members(organization_id, user_id, role)
    values (v_invite.organization_id, v_actor, v_invite.role);

    v_canonical_role := v_invite.role;
    v_membership_created := true;
  end if;

  update public.organization_member_invitations i
     set accepted_by_user_id = v_actor,
         accepted_at = v_now,
         version = i.version + 1,
         last_request_key = v_request_key,
         updated_at = v_now
   where i.id = v_invite.id
     and i.version = v_invite.version
  returning * into v_invite;

  if not found then
    raise exception 'customer invitation acceptance lost optimistic state';
  end if;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id, after_data
  ) values (
    v_invite.organization_id,
    'USER',
    v_actor::text,
    'ORGANIZATION_MEMBER_INVITE_ACCEPTED',
    'organization_member_invitation',
    v_invite.id::text,
    pg_catalog.jsonb_build_object(
      'invited_role', v_invite.role,
      'canonical_role', v_canonical_role,
      'membership_created', v_membership_created,
      'version', v_invite.version
    )
  );

  return query
  select v_invite.organization_id, v_actor, v_canonical_role, v_invite.role,
         v_invite.accepted_at, false;
end;
$$;

create or replace function private.revoke_organization_member_invitation(
  p_organization_id uuid,
  p_invitation_id uuid,
  p_expected_version integer,
  p_request_key text
)
returns table(
  invitation_id uuid,
  organization_id uuid,
  version integer,
  revoked_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_request_key text := btrim(coalesce(p_request_key, ''));
  v_now timestamptz := statement_timestamp();
  v_invite public.organization_member_invitations%rowtype;
begin
  if v_actor is null then
    raise exception 'authenticated actor required to revoke customer invitation';
  end if;

  if not exists (
    select 1
      from public.organization_members m
     where m.organization_id = p_organization_id
       and m.user_id = v_actor
       and m.role = 'OWNER'
  ) then
    raise exception 'Organization OWNER required to revoke customer invitation';
  end if;

  if p_expected_version is null
     or p_expected_version < 1
     or length(v_request_key) not between 1 and 150
  then
    raise exception 'invalid customer invitation revoke request';
  end if;

  select i.*
    into v_invite
    from public.organization_member_invitations i
   where i.organization_id = p_organization_id
     and i.id = p_invitation_id
   for update;

  if not found then
    raise exception 'customer invitation not found';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'accepted customer invitation cannot be revoked';
  end if;

  if v_invite.revoked_at is not null then
    return query
    select v_invite.id, v_invite.organization_id, v_invite.version,
           v_invite.revoked_at, true;
    return;
  end if;

  if v_invite.version <> p_expected_version then
    raise exception 'customer invitation version conflict; current version is %', v_invite.version;
  end if;

  update public.organization_member_invitations i
     set revoked_at = v_now,
         invitation_session_token_hash = null,
         invitation_session_expires_at = null,
         version = i.version + 1,
         last_request_key = v_request_key,
         updated_at = v_now
   where i.id = v_invite.id
     and i.version = p_expected_version
  returning * into v_invite;

  if not found then
    raise exception 'customer invitation revoke lost optimistic state';
  end if;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id,
    'USER',
    v_actor::text,
    'ORGANIZATION_MEMBER_INVITE_REVOKED',
    'organization_member_invitation',
    v_invite.id::text,
    pg_catalog.jsonb_build_object('version', v_invite.version)
  );

  return query
  select v_invite.id, v_invite.organization_id, v_invite.version,
         v_invite.revoked_at, false;
end;
$$;

-- PostgREST-facing wrappers remain SECURITY INVOKER. The privileged bridge is
-- private, narrowly executable and validates Auth identity + canonical OWNER state.
create or replace function public.issue_organization_member_invitation(
  p_organization_id uuid,
  p_email text,
  p_role text,
  p_invitation_token_hash text,
  p_request_key text
)
returns table(
  invitation_id uuid,
  organization_id uuid,
  email text,
  role text,
  version integer,
  expires_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.issue_organization_member_invitation(
    p_organization_id, p_email, p_role, p_invitation_token_hash, p_request_key
  );
$$;

create or replace function public.redeem_organization_member_invitation(
  p_invitation_token_hash text,
  p_session_token_hash text,
  p_request_key text
)
returns table(
  invitation_id uuid,
  organization_id uuid,
  email text,
  role text,
  version integer,
  session_expires_at timestamptz,
  accepted_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.redeem_organization_member_invitation(
    p_invitation_token_hash, p_session_token_hash, p_request_key
  );
$$;

create or replace function public.get_organization_member_invitation_context(
  p_session_token_hash text
)
returns table(
  invitation_id uuid,
  organization_id uuid,
  organization_name text,
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
  select * from private.get_organization_member_invitation_context(p_session_token_hash);
$$;

create or replace function public.accept_organization_member_invitation(
  p_session_token_hash text,
  p_request_key text
)
returns table(
  organization_id uuid,
  user_id uuid,
  canonical_role text,
  invited_role text,
  accepted_at timestamptz,
  replayed boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.accept_organization_member_invitation(
    p_session_token_hash, p_request_key
  );
$$;

create or replace function public.revoke_organization_member_invitation(
  p_organization_id uuid,
  p_invitation_id uuid,
  p_expected_version integer,
  p_request_key text
)
returns table(
  invitation_id uuid,
  organization_id uuid,
  version integer,
  revoked_at timestamptz,
  replayed boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.revoke_organization_member_invitation(
    p_organization_id, p_invitation_id, p_expected_version, p_request_key
  );
$$;

revoke all on function private.issue_organization_member_invitation(uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function private.issue_organization_member_invitation(uuid,text,text,text,text)
  to authenticated;

revoke all on function private.redeem_organization_member_invitation(text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function private.redeem_organization_member_invitation(text,text,text)
  to service_role;

revoke all on function private.get_organization_member_invitation_context(text)
  from public, anon, authenticated, service_role;
grant execute on function private.get_organization_member_invitation_context(text)
  to service_role;

revoke all on function private.accept_organization_member_invitation(text,text)
  from public, anon, authenticated, service_role;
grant execute on function private.accept_organization_member_invitation(text,text)
  to authenticated;

revoke all on function private.revoke_organization_member_invitation(uuid,uuid,integer,text)
  from public, anon, authenticated, service_role;
grant execute on function private.revoke_organization_member_invitation(uuid,uuid,integer,text)
  to authenticated;

revoke all on function public.issue_organization_member_invitation(uuid,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.issue_organization_member_invitation(uuid,text,text,text,text)
  to authenticated;

revoke all on function public.redeem_organization_member_invitation(text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.redeem_organization_member_invitation(text,text,text)
  to service_role;

revoke all on function public.get_organization_member_invitation_context(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_organization_member_invitation_context(text)
  to service_role;

revoke all on function public.accept_organization_member_invitation(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.accept_organization_member_invitation(text,text)
  to authenticated;

revoke all on function public.revoke_organization_member_invitation(uuid,uuid,integer,text)
  from public, anon, authenticated, service_role;
grant execute on function public.revoke_organization_member_invitation(uuid,uuid,integer,text)
  to authenticated;

comment on table public.organization_member_invitations is
  'Bounded customer invitation lifecycle only. Canonical identity remains Supabase Auth and canonical membership remains organization_members.';

comment on function private.accept_organization_member_invitation(text,text) is
  'Private privileged bridge required to atomically convert an Auth-verified, email-bound invite into canonical organization_members while direct browser IAM mutation remains closed.';
