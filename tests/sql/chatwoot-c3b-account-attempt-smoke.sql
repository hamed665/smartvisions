\set ON_ERROR_STOP on

begin;

create temp table account_attempt_test_state(key text primary key, value text not null)
  on commit drop;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000d301'),
  ('00000000-0000-0000-0000-00000000d302');

insert into public.organizations(id, name) values
  ('00000000-0000-0000-0000-00000000d301', 'Account attempt synthetic org');
insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-0000-0000-00000000d301','00000000-0000-0000-0000-00000000d301','OWNER'),
  ('00000000-0000-0000-0000-00000000d301','00000000-0000-0000-0000-00000000d302','ADMIN');
insert into public.brands(id,organization_id,name,slug) values
  ('10000000-0000-0000-0000-00000000d301',
   '00000000-0000-0000-0000-00000000d301','Attempt Brand','attempt-brand');
insert into public.tenant_businesses(id,organization_id,brand_id,name,slug) values
  ('20000000-0000-0000-0000-00000000d301',
   '00000000-0000-0000-0000-00000000d301',
   '10000000-0000-0000-0000-00000000d301','Attempt Business','attempt-business');
insert into public.integration_connections(id,organization_id,provider,channel,enabled,status)
values ('40000000-0000-0000-0000-00000000d301',
        '00000000-0000-0000-0000-00000000d301',
        'EMAIL_PROVIDER','EMAIL',true,'CONNECTED');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000d301',false);

select public.create_communication_channel_binding(
  '00000000-0000-0000-0000-00000000d301',
  '20000000-0000-0000-0000-00000000d301',
  null,
  '40000000-0000-0000-0000-00000000d301',
  'EMAIL',
  'c3b-attempt-binding'
);

insert into account_attempt_test_state(key,value)
select 'mapping_id',(public.create_chatwoot_account_mapping(
  '00000000-0000-0000-0000-00000000d301',
  '20000000-0000-0000-0000-00000000d301',
  'c3b-attempt-mapping'
)).id::text;

do $attempt_smoke$
declare
  v_mapping_id uuid := (select value::uuid from account_attempt_test_state where key='mapping_id');
  v_first record;
  v_replay record;
begin
  select * into v_first from public.claim_chatwoot_account_external_create(
    '00000000-0000-0000-0000-00000000d301',v_mapping_id,'c3b-attempt-1'
  );
  if v_first.may_attempt_create is distinct from true
     or v_first.mapping_id <> v_mapping_id
     or v_first.tenant_business_id <> '20000000-0000-0000-0000-00000000d301'::uuid
     or v_first.mapping_version <> 1 then
    raise exception 'first Account attempt did not claim expected mapping';
  end if;

  select * into v_replay from public.claim_chatwoot_account_external_create(
    '00000000-0000-0000-0000-00000000d301',v_mapping_id,'c3b-attempt-1'
  );
  if v_replay.may_attempt_create is distinct from false then
    raise exception 'same Account claim replay could POST again';
  end if;

  begin
    perform public.claim_chatwoot_account_external_create(
      '00000000-0000-0000-0000-00000000d301',v_mapping_id,'c3b-attempt-2'
    );
    raise exception 'different request key could claim second external attempt';
  exception when others then
    if sqlerrm not like 'Chatwoot Account external attempt already claimed; reconcile%' then
      raise;
    end if;
  end;

  if (select count(*) from public.chatwoot_bridge_command_claims
      where organization_id='00000000-0000-0000-0000-00000000d301'
        and command_type='CLAIM_ACCOUNT_EXTERNAL_CREATE'
        and entity_id=v_mapping_id) <> 1 then
    raise exception 'Account external attempt claim was not unique';
  end if;
end;
$attempt_smoke$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000d302',false);

do $attempt_smoke$
declare
  v_mapping_id uuid := (select value::uuid from account_attempt_test_state where key='mapping_id');
begin
  begin
    perform public.claim_chatwoot_account_external_create(
      '00000000-0000-0000-0000-00000000d301',v_mapping_id,'c3b-admin-attempt'
    );
    raise exception 'ADMIN unexpectedly claimed Account external mutation';
  exception when others then
    if sqlerrm not like 'Chatwoot Account external claim not permitted%' then
      raise;
    end if;
  end;
end;
$attempt_smoke$;

reset role;

do $attempt_smoke$
declare
  v_proc oid := 'public.claim_chatwoot_account_external_create(uuid,uuid,text)'::regprocedure;
begin
  if (select prosecdef from pg_proc where oid=v_proc) then
    raise exception 'Account external claim function must be SECURITY INVOKER';
  end if;
  if not has_function_privilege('authenticated',v_proc,'EXECUTE')
     or has_function_privilege('anon',v_proc,'EXECUTE')
     or has_function_privilege('service_role',v_proc,'EXECUTE') then
    raise exception 'Account external claim function grants are too broad';
  end if;
end;
$attempt_smoke$;

rollback;
