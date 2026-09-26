\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000009101'),
  ('00000000-0000-0000-0000-000000009102');

insert into public.organizations(id,name) values
  ('00000000-0000-0000-0000-000000009111','C5 scoped access org');

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-000000009111','00000000-0000-0000-0000-000000009101','OWNER'),
  ('00000000-0000-0000-0000-000000009111','00000000-0000-0000-0000-000000009102','ADMIN');

insert into public.brands(id,organization_id,name,slug,status) values
  ('10000000-0000-0000-0000-000000009111','00000000-0000-0000-0000-000000009111','C5 Brand','c5-brand','ACTIVE');

insert into public.tenant_businesses(
  id,organization_id,brand_id,name,slug,status
) values (
  '20000000-0000-0000-0000-000000009111',
  '00000000-0000-0000-0000-000000009111',
  '10000000-0000-0000-0000-000000009111',
  'C5 Business','c5-business','ACTIVE'
);

insert into public.branches(
  id,organization_id,tenant_business_id,name,code,status
) values (
  '30000000-0000-0000-0000-000000009111',
  '00000000-0000-0000-0000-000000009111',
  '20000000-0000-0000-0000-000000009111',
  'Main','main','ACTIVE'
);

insert into public.departments(
  id,organization_id,branch_id,name,code,status
) values (
  '40000000-0000-0000-0000-000000009111',
  '00000000-0000-0000-0000-000000009111',
  '30000000-0000-0000-0000-000000009111',
  'Customer Operations','customer-operations','ACTIVE'
);

insert into public.teams(
  id,organization_id,department_id,name,code,status
) values (
  '50000000-0000-0000-0000-000000009111',
  '00000000-0000-0000-0000-000000009111',
  '40000000-0000-0000-0000-000000009111',
  'Customer Care','customer-care','ACTIVE'
);

insert into public.integration_connections(
  id,organization_id,provider,channel,enabled,status
) values (
  '60000000-0000-0000-0000-000000009111',
  '00000000-0000-0000-0000-000000009111',
  'META','WHATSAPP',true,'CONNECTED'
);

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000009101',
  false
);

select (public.create_communication_channel_binding(
  '00000000-0000-0000-0000-000000009111',
  '20000000-0000-0000-0000-000000009111',
  '30000000-0000-0000-0000-000000009111',
  '60000000-0000-0000-0000-000000009111',
  'WHATSAPP',
  'c5-scoped-binding'
)).id as binding_id \gset

select (public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-000000009111',
  '20000000-0000-0000-0000-000000009111',
  'c5-scoped-account'
)).id as account_mapping_id \gset

select (public.set_chatwoot_account_mapping_state(
  '00000000-0000-0000-0000-000000009111',
  :'account_mapping_id'::uuid,
  1,
  'ACTIVE',
  9101,
  null,
  'c5-scoped-account-active'
)).id;

select (public.create_chatwoot_user_mapping(
  '00000000-0000-0000-0000-000000009111',
  '20000000-0000-0000-0000-000000009111',
  '00000000-0000-0000-0000-000000009102',
  'c5-scoped-user'
)).id as user_mapping_id \gset

reset role;
select set_config('request.jwt.claim.sub','',false);

-- Fixture-only superuser update. The migration under test is the scope
-- interlock, not the already-covered receipt-backed User activation path.
select set_config('smartvisions.chatwoot_bridge_command','1',true);
update public.chatwoot_user_mappings
   set chatwoot_user_id = 9102,
       status = 'ACTIVE',
       version = 2,
       last_request_key = 'c5-scoped-user-fixture-active',
       last_verified_at = statement_timestamp(),
       updated_by_user_id = '00000000-0000-0000-0000-000000009101'
 where id = :'user_mapping_id'::uuid;
select set_config('smartvisions.chatwoot_bridge_command','0',true);

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000009101',
  false
);

select (public.create_chatwoot_account_membership(
  '00000000-0000-0000-0000-000000009111',
  '20000000-0000-0000-0000-000000009111',
  '00000000-0000-0000-0000-000000009102',
  :'user_mapping_id'::uuid,
  :'account_mapping_id'::uuid,
  'c5-scoped-membership'
)).id as membership_id \gset

select (public.create_chatwoot_inbox_mapping(
  '00000000-0000-0000-0000-000000009111',
  '20000000-0000-0000-0000-000000009111',
  '30000000-0000-0000-0000-000000009111',
  :'binding_id'::uuid,
  :'account_mapping_id'::uuid,
  'c5-scoped-inbox'
)).id as inbox_mapping_id \gset

select (public.create_chatwoot_team_mapping(
  '00000000-0000-0000-0000-000000009111',
  '20000000-0000-0000-0000-000000009111',
  '50000000-0000-0000-0000-000000009111',
  :'account_mapping_id'::uuid,
  'c5-scoped-team'
)).id as team_mapping_id \gset

select (public.create_member_scope_assignment(
  '00000000-0000-0000-0000-000000009111',
  '00000000-0000-0000-0000-000000009102',
  'BRANCH',
  'SALES_AGENT',
  null,null,
  '30000000-0000-0000-0000-000000009111',
  null,null,
  '{}'::jsonb,
  'c5-scoped-branch-role'
)).id as branch_assignment_id \gset

do $branch_reduction_blocked$
begin
  begin
    perform public.update_member_scope_assignment(
      '00000000-0000-0000-0000-000000009111',
      (
        select id
          from public.member_scope_assignments
         where organization_id = '00000000-0000-0000-0000-000000009111'
           and user_id = '00000000-0000-0000-0000-000000009102'
           and scope_type = 'BRANCH'
           and branch_id = '30000000-0000-0000-0000-000000009111'
      ),
      1,
      'VIEWER',
      '{}'::jsonb,
      'c5-scoped-branch-viewer'
    );
    raise exception 'BRANCH reduction unexpectedly bypassed scoped Chatwoot interlock';
  exception
    when others then
      if sqlerrm not like '%external-first demotion required%' then
        raise;
      end if;
  end;
end;
$branch_reduction_blocked$;

select (public.create_member_scope_assignment(
  '00000000-0000-0000-0000-000000009111',
  '00000000-0000-0000-0000-000000009102',
  'TEAM',
  'SALES_AGENT',
  null,null,null,null,
  '50000000-0000-0000-0000-000000009111',
  '{}'::jsonb,
  'c5-scoped-team-role'
)).id as team_assignment_id \gset

do $team_reduction_blocked$
begin
  begin
    perform public.update_member_scope_assignment(
      '00000000-0000-0000-0000-000000009111',
      (
        select id
          from public.member_scope_assignments
         where organization_id = '00000000-0000-0000-0000-000000009111'
           and user_id = '00000000-0000-0000-0000-000000009102'
           and scope_type = 'TEAM'
           and team_id = '50000000-0000-0000-0000-000000009111'
      ),
      1,
      'VIEWER',
      '{}'::jsonb,
      'c5-scoped-team-viewer'
    );
    raise exception 'TEAM reduction unexpectedly bypassed scoped Chatwoot interlock';
  exception
    when others then
      if sqlerrm not like '%external-first demotion required%' then
        raise;
      end if;
  end;
end;
$team_reduction_blocked$;

-- A non-reducing agent-to-agent change remains allowed. This preserves the
-- directional contract: promotions/equivalent communication privilege may
-- commit canonically before external reconciliation.
select (public.update_member_scope_assignment(
  '00000000-0000-0000-0000-000000009111',
  :'team_assignment_id'::uuid,
  1,
  'SALES_MANAGER',
  '{}'::jsonb,
  'c5-scoped-team-manager'
)).version as team_assignment_version \gset

do $assert_non_reduction$
begin
  if (
    select version
      from public.member_scope_assignments
     where organization_id = '00000000-0000-0000-0000-000000009111'
       and user_id = '00000000-0000-0000-0000-000000009102'
       and scope_type = 'TEAM'
       and team_id = '50000000-0000-0000-0000-000000009111'
  ) <> 2 then
    raise exception 'non-reducing TEAM role update did not advance version';
  end if;
end;
$assert_non_reduction$;

rollback;
