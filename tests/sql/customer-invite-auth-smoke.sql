\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email,email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000e501','owner-a@example.com',statement_timestamp()),
  ('00000000-0000-0000-0000-00000000e502','admin-a@example.com',statement_timestamp()),
  ('00000000-0000-0000-0000-00000000e503','customer@example.com',statement_timestamp()),
  ('00000000-0000-0000-0000-00000000e504','wrong@example.com',statement_timestamp()),
  ('00000000-0000-0000-0000-00000000e505','existing@example.com',statement_timestamp()),
  ('00000000-0000-0000-0000-00000000e506','owner-b@example.com',statement_timestamp());

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-00000000f501','Customer Invite Org A'),
  ('00000000-0000-0000-0000-00000000f502','Customer Invite Org B');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000f501','00000000-0000-0000-0000-00000000e501','OWNER'),
  ('00000000-0000-0000-0000-00000000f501','00000000-0000-0000-0000-00000000e502','ADMIN'),
  ('00000000-0000-0000-0000-00000000f501','00000000-0000-0000-0000-00000000e505','VIEWER'),
  ('00000000-0000-0000-0000-00000000f502','00000000-0000-0000-0000-00000000e506','OWNER');

-- OWNER can issue a bounded invite. Direct invitation-table DML stays closed.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e501',false);

do $issue_success$
declare
  v record;
begin
  select * into v
  from public.issue_organization_member_invitation(
    '00000000-0000-0000-0000-00000000f501',
    'Customer@Example.com',
    'ADMIN',
    repeat('a',64),
    'invite-success'
  );

  if v.email <> 'customer@example.com'
     or v.role <> 'ADMIN'
     or v.version <> 1
     or v.expires_at <= statement_timestamp()
  then
    raise exception 'issued customer invitation is not bounded correctly';
  end if;
end;
$issue_success$;

reset role;
select set_config('request.jwt.claim.sub','',false);

-- The anonymous-facing server capability exchanges the raw invite hash once for
-- a short session. Browser never receives service_role.
set role service_role;

do $redeem_success$
declare
  v record;
begin
  select * into v
  from public.redeem_organization_member_invitation(
    repeat('a',64),
    repeat('1',64),
    'redeem-success'
  );

  if v.email <> 'customer@example.com'
     or v.role <> 'ADMIN'
     or v.version <> 2
     or v.session_expires_at > statement_timestamp() + interval '61 minutes'
  then
    raise exception 'customer invitation redemption is not bounded correctly';
  end if;
end;
$redeem_success$;

reset role;

-- Auth-verified matching user accepts into canonical organization_members.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e503',false);

do $accept_success_and_replay$
declare
  v_first record;
  v_replay record;
begin
  select * into v_first
  from public.accept_organization_member_invitation(
    repeat('1',64),
    'accept-success'
  );

  if v_first.organization_id <> '00000000-0000-0000-0000-00000000f501'::uuid
     or v_first.user_id <> '00000000-0000-0000-0000-00000000e503'::uuid
     or v_first.canonical_role <> 'ADMIN'
     or v_first.invited_role <> 'ADMIN'
     or v_first.replayed
  then
    raise exception 'customer invitation did not create canonical membership correctly';
  end if;

  select * into v_replay
  from public.accept_organization_member_invitation(
    repeat('1',64),
    'accept-replay'
  );

  if not v_replay.replayed
     or v_replay.canonical_role <> 'ADMIN'
     or v_replay.accepted_at <> v_first.accepted_at
  then
    raise exception 'duplicate invitation acceptance was not idempotent';
  end if;

  if (
    select count(*)
    from public.organization_members m
    where m.organization_id='00000000-0000-0000-0000-00000000f501'
      and m.user_id='00000000-0000-0000-0000-00000000e503'
  ) <> 1 then
    raise exception 'duplicate acceptance created duplicate canonical membership';
  end if;
end;
$accept_success_and_replay$;

reset role;
select set_config('request.jwt.claim.sub','',false);

-- Used invite token cannot be redeemed again.
set role service_role;
do $used_token_rejected$
begin
  begin
    perform public.redeem_organization_member_invitation(
      repeat('a',64),
      repeat('2',64),
      'redeem-used-token'
    );
    raise exception 'accepted invite token unexpectedly redeemed again';
  exception when others then
    if sqlerrm not like 'customer invitation is invalid, expired, redeemed, accepted or revoked%' then
      raise;
    end if;
  end;
end;
$used_token_rejected$;
reset role;

-- Unconfirmed Auth email cannot accept even when the email string matches.
insert into auth.users(id,email,email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000e507','unconfirmed@example.com',null);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e501',false);
select *
from public.issue_organization_member_invitation(
  '00000000-0000-0000-0000-00000000f501',
  'unconfirmed@example.com',
  'VIEWER',
  repeat('9',64),
  'invite-unconfirmed'
);
reset role;
select set_config('request.jwt.claim.sub','',false);

set role service_role;
select *
from public.redeem_organization_member_invitation(
  repeat('9',64),
  repeat('8',64),
  'redeem-unconfirmed'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e507',false);
do $unconfirmed_email_rejected$
begin
  begin
    perform public.accept_organization_member_invitation(
      repeat('8',64),
      'accept-unconfirmed'
    );
    raise exception 'unconfirmed Auth email unexpectedly accepted invite';
  exception when others then
    if sqlerrm not like 'confirmed Auth email required to accept customer invitation%' then
      raise;
    end if;
  end;
end;
$unconfirmed_email_rejected$;
reset role;
select set_config('request.jwt.claim.sub','',false);

-- Wrong authenticated email cannot accept an otherwise valid invitation session.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e501',false);
select *
from public.issue_organization_member_invitation(
  '00000000-0000-0000-0000-00000000f501',
  'another@example.com',
  'VIEWER',
  repeat('b',64),
  'invite-wrong-email'
);
reset role;
select set_config('request.jwt.claim.sub','',false);

set role service_role;
select *
from public.redeem_organization_member_invitation(
  repeat('b',64),
  repeat('3',64),
  'redeem-wrong-email'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e504',false);
do $wrong_email_rejected$
begin
  begin
    perform public.accept_organization_member_invitation(
      repeat('3',64),
      'accept-wrong-email'
    );
    raise exception 'wrong authenticated email unexpectedly accepted invite';
  exception when others then
    if sqlerrm not like 'authenticated email does not match customer invitation%' then
      raise;
    end if;
  end;
end;
$wrong_email_rejected$;
reset role;
select set_config('request.jwt.claim.sub','',false);

-- Expired invitation fails closed.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e501',false);
select *
from public.issue_organization_member_invitation(
  '00000000-0000-0000-0000-00000000f501',
  'expired@example.com',
  'ADMIN',
  repeat('c',64),
  'invite-expired'
);
reset role;
select set_config('request.jwt.claim.sub','',false);

update public.organization_member_invitations
set invitation_created_at = statement_timestamp() - interval '2 hours',
    invitation_expires_at = statement_timestamp() - interval '1 hour'
where issue_request_key='invite-expired';

set role service_role;
do $expired_rejected$
begin
  begin
    perform public.redeem_organization_member_invitation(
      repeat('c',64),
      repeat('4',64),
      'redeem-expired'
    );
    raise exception 'expired invitation unexpectedly redeemed';
  exception when others then
    if sqlerrm not like 'customer invitation is invalid, expired, redeemed, accepted or revoked%' then
      raise;
    end if;
  end;
end;
$expired_rejected$;
reset role;

-- Revocation is OWNER-only and prevents later redemption.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e501',false);
do $revoke_success$
declare
  v_invite record;
  v_revoked record;
begin
  select * into v_invite
  from public.issue_organization_member_invitation(
    '00000000-0000-0000-0000-00000000f501',
    'revoked@example.com',
    'ADMIN',
    repeat('d',64),
    'invite-revoked'
  );

  select * into v_revoked
  from public.revoke_organization_member_invitation(
    '00000000-0000-0000-0000-00000000f501',
    v_invite.invitation_id,
    v_invite.version,
    'revoke-success'
  );

  if v_revoked.revoked_at is null
     or v_revoked.version <> 2
     or v_revoked.replayed
  then
    raise exception 'customer invitation revoke did not apply';
  end if;

  select * into v_revoked
  from public.revoke_organization_member_invitation(
    '00000000-0000-0000-0000-00000000f501',
    v_invite.invitation_id,
    v_invite.version,
    'revoke-replay'
  );

  if not v_revoked.replayed or v_revoked.version <> 2 then
    raise exception 'customer invitation revoke replay was not idempotent';
  end if;
end;
$revoke_success$;
reset role;
select set_config('request.jwt.claim.sub','',false);

set role service_role;
do $revoked_rejected$
begin
  begin
    perform public.redeem_organization_member_invitation(
      repeat('d',64),
      repeat('5',64),
      'redeem-revoked'
    );
    raise exception 'revoked invitation unexpectedly redeemed';
  exception when others then
    if sqlerrm not like 'customer invitation is invalid, expired, redeemed, accepted or revoked%' then
      raise;
    end if;
  end;
end;
$revoked_rejected$;
reset role;

-- Existing canonical membership is preserved even if a later invite requests OWNER.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e501',false);
select *
from public.issue_organization_member_invitation(
  '00000000-0000-0000-0000-00000000f501',
  'existing@example.com',
  'OWNER',
  repeat('e',64),
  'invite-existing'
);
reset role;
select set_config('request.jwt.claim.sub','',false);

set role service_role;
select *
from public.redeem_organization_member_invitation(
  repeat('e',64),
  repeat('6',64),
  'redeem-existing'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e505',false);
do $existing_role_preserved$
declare
  v record;
  v_rows bigint;
  v_role text;
begin
  select * into v
  from public.accept_organization_member_invitation(
    repeat('6',64),
    'accept-existing'
  );

  if v.canonical_role <> 'VIEWER' or v.invited_role <> 'OWNER' then
    raise exception 'existing canonical role was overwritten by invitation';
  end if;

  update public.organization_members
  set role='OWNER'
  where organization_id='00000000-0000-0000-0000-00000000f501'
    and user_id='00000000-0000-0000-0000-00000000e505';
  get diagnostics v_rows = row_count;

  if v_rows <> 0 then
    raise exception 'authenticated user self-promoted outside governed invitation flow';
  end if;

  select role into v_role
  from public.organization_members
  where organization_id='00000000-0000-0000-0000-00000000f501'
    and user_id='00000000-0000-0000-0000-00000000e505';

  if v_role <> 'VIEWER' then
    raise exception 'existing canonical role changed after self-promotion attempt';
  end if;
end;
$existing_role_preserved$;
reset role;
select set_config('request.jwt.claim.sub','',false);

-- Non-owner and cross-organization actors cannot issue invitations.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e502',false);
do $non_owner_rejected$
begin
  begin
    perform public.issue_organization_member_invitation(
      '00000000-0000-0000-0000-00000000f501',
      'nope@example.com',
      'ADMIN',
      repeat('f',64),
      'invite-non-owner'
    );
    raise exception 'non-owner unexpectedly issued customer invitation';
  exception when others then
    if sqlerrm not like 'Organization OWNER required for customer invitation%' then
      raise;
    end if;
  end;
end;
$non_owner_rejected$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000e506',false);
do $cross_org_rejected$
begin
  begin
    perform public.issue_organization_member_invitation(
      '00000000-0000-0000-0000-00000000f501',
      'cross@example.com',
      'ADMIN',
      repeat('0',64),
      'invite-cross-org'
    );
    raise exception 'foreign Organization OWNER unexpectedly issued invite';
  exception when others then
    if sqlerrm not like 'Organization OWNER required for customer invitation%' then
      raise;
    end if;
  end;
end;
$cross_org_rejected$;
reset role;
select set_config('request.jwt.claim.sub','',false);

-- anon cannot create arbitrary canonical membership.
set role anon;
do $anon_membership_denied$
begin
  begin
    insert into public.organization_members(organization_id,user_id,role)
    values (
      '00000000-0000-0000-0000-00000000f501',
      '00000000-0000-0000-0000-00000000e504',
      'OWNER'
    );
    raise exception 'anon unexpectedly created canonical membership';
  exception when others then
    if sqlstate <> '42501' then
      raise;
    end if;
  end;
end;
$anon_membership_denied$;
reset role;

-- Security contract: RLS + no direct invite-table access + narrow privileged bridge.
do $security_contract$
declare
  v_private_accept oid := 'private.accept_organization_member_invitation(text,text)'::regprocedure;
  v_public_accept oid := 'public.accept_organization_member_invitation(text,text)'::regprocedure;
  v_private_issue oid := 'private.issue_organization_member_invitation(uuid,text,text,text,text)'::regprocedure;
begin
  if not (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='organization_member_invitations'
  ) then
    raise exception 'customer invitation RLS is not enabled';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='organization_member_invitations'
      and policyname='organization_member_invitations_owner_read'
  ) then
    raise exception 'customer invitation scoped RLS policy is missing';
  end if;

  if has_table_privilege('anon','public.organization_member_invitations','SELECT')
     or has_table_privilege('authenticated','public.organization_member_invitations','SELECT')
     or has_table_privilege('service_role','public.organization_member_invitations','SELECT')
     or has_table_privilege('authenticated','public.organization_member_invitations','INSERT')
     or has_table_privilege('authenticated','public.organization_member_invitations','UPDATE')
     or has_table_privilege('service_role','public.organization_member_invitations','UPDATE')
  then
    raise exception 'customer invitation table grants are broader than intended';
  end if;

  if not (select prosecdef from pg_proc where oid=v_private_accept)
     or not (select prosecdef from pg_proc where oid=v_private_issue)
     or (select prosecdef from pg_proc where oid=v_public_accept)
  then
    raise exception 'customer invitation privileged bridge security mode is invalid';
  end if;

  if not has_function_privilege(
       'authenticated',
       'public.accept_organization_member_invitation(text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.accept_organization_member_invitation(text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.accept_organization_member_invitation(text,text)',
       'EXECUTE'
     )
  then
    raise exception 'customer invitation acceptance grants are broader than intended';
  end if;

  if not has_function_privilege(
       'service_role',
       'public.redeem_organization_member_invitation(text,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.redeem_organization_member_invitation(text,text,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'public.redeem_organization_member_invitation(text,text,text)',
       'EXECUTE'
     )
  then
    raise exception 'customer invitation redemption grants are broader than intended';
  end if;
end;
$security_contract$;

-- Replay did not duplicate audit acceptance.
do $audit_contract$
begin
  if (
    select count(*)
    from public.audit_logs
    where organization_id='00000000-0000-0000-0000-00000000f501'
      and action='ORGANIZATION_MEMBER_INVITE_ACCEPTED'
      and actor_id='00000000-0000-0000-0000-00000000e503'
  ) <> 1 then
    raise exception 'customer invitation acceptance audit is not replay-safe';
  end if;
end;
$audit_contract$;

rollback;
