\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-00000000c301'),
  ('00000000-0000-0000-0000-00000000c302');

insert into public.organizations(id, name) values
  ('00000000-0000-0000-0000-00000000c301', 'Claim catalog synthetic org');

insert into public.organization_members(organization_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000c301', '00000000-0000-0000-0000-00000000c301', 'OWNER'),
  ('00000000-0000-0000-0000-00000000c301', '00000000-0000-0000-0000-00000000c302', 'ADMIN');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c301', false);
select set_config('smartvisions.chatwoot_bridge_command', '1', true);

do $claim_smoke$
declare
  v_row record;
  v_first record;
  v_replay record;
  v_count integer := 0;
begin
  for v_row in
    select * from (values
    ('CREATE_CHANNEL_BINDING', 'COMMUNICATION_CHANNEL_BINDING', 1),
    ('SET_CHANNEL_BINDING_LIFECYCLE', 'COMMUNICATION_CHANNEL_BINDING', 2),
    ('CREATE_ACCOUNT_MAPPING', 'CHATWOOT_ACCOUNT_MAPPING', 3),
    ('SET_ACCOUNT_MAPPING_STATE', 'CHATWOOT_ACCOUNT_MAPPING', 4),
    ('CREATE_USER_MAPPING', 'CHATWOOT_USER_MAPPING', 5),
    ('SET_USER_MAPPING_STATE', 'CHATWOOT_USER_MAPPING', 6),
    ('CREATE_ACCOUNT_MEMBERSHIP', 'CHATWOOT_ACCOUNT_MEMBERSHIP', 7),
    ('SET_ACCOUNT_MEMBERSHIP_STATE', 'CHATWOOT_ACCOUNT_MEMBERSHIP', 8),
    ('CREATE_INBOX_MAPPING', 'CHATWOOT_INBOX_MAPPING', 9),
    ('SET_INBOX_MAPPING_STATE', 'CHATWOOT_INBOX_MAPPING', 10),
    ('CREATE_TEAM_MAPPING', 'CHATWOOT_TEAM_MAPPING', 11),
    ('SET_TEAM_MAPPING_STATE', 'CHATWOOT_TEAM_MAPPING', 12)
    ) as commands(command_type, entity_type, ordinal)
  loop
    select * into v_first from public.claim_chatwoot_bridge_command(
      '00000000-0000-0000-0000-00000000c301',
      'c3b-catalog-' || v_row.ordinal,
      v_row.command_type,
      v_row.entity_type,
      '10000000-0000-0000-0000-00000000c301',
      1,
      repeat('a', 64)
    );
    if v_first.is_new is distinct from true
       or v_first.applied_version <> 1 then
      raise exception 'new catalog command % did not claim', v_row.command_type;
    end if;

    select * into v_replay from public.claim_chatwoot_bridge_command(
      '00000000-0000-0000-0000-00000000c301',
      'c3b-catalog-' || v_row.ordinal,
      v_row.command_type,
      v_row.entity_type,
      '10000000-0000-0000-0000-00000000c301',
      1,
      repeat('a', 64)
    );
    if v_replay.is_new is distinct from false
       or v_replay.entity_id <> v_first.entity_id then
      raise exception 'catalog replay failed for %', v_row.command_type;
    end if;
    v_count := v_count + 1;
  end loop;

  if v_count <> 12 or
     (select count(*) from public.chatwoot_bridge_command_claims
      where organization_id='00000000-0000-0000-0000-00000000c301') <> 12 then
    raise exception 'catalog claims created duplicate or missing rows';
  end if;

  begin
    perform public.claim_chatwoot_bridge_command(
      '00000000-0000-0000-0000-00000000c301',
      'c3b-catalog-5',
      'CREATE_USER_MAPPING',
      'CHATWOOT_USER_MAPPING',
      '10000000-0000-0000-0000-00000000c301',
      1,
      repeat('b', 64)
    );
    raise exception 'changed payload replay unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'request key already used with different Chatwoot bridge payload%' then
      raise;
    end if;
  end;

  begin
    perform public.claim_chatwoot_bridge_command(
      '00000000-0000-0000-0000-00000000c301',
      'c3b-invalid-pair',
      'CREATE_USER_MAPPING',
      'CHATWOOT_TEAM_MAPPING',
      '10000000-0000-0000-0000-00000000c301',
      1,
      repeat('a', 64)
    );
    raise exception 'mismatched command/entity pair unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'invalid Chatwoot bridge command claim%' then
      raise;
    end if;
  end;

  begin
    perform public.claim_chatwoot_bridge_command(
      '00000000-0000-0000-0000-00000000c301',
      'c3b-catalog-5',
      'CREATE_USER_MAPPING',
      'CHATWOOT_USER_MAPPING',
      '10000000-0000-0000-0000-00000000c301',
      2,
      repeat('a', 64)
    );
    raise exception 'changed applied version replay unexpectedly succeeded';
  exception when others then
    if sqlerrm not like 'request key already used with different Chatwoot bridge payload%' then
      raise;
    end if;
  end;
end;
$claim_smoke$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c302', false);

do $claim_smoke$
begin
  begin
    perform public.claim_chatwoot_bridge_command(
      '00000000-0000-0000-0000-00000000c301',
      'c3b-admin-rejected',
      'CREATE_USER_MAPPING',
      'CHATWOOT_USER_MAPPING',
      '10000000-0000-0000-0000-00000000c301',
      1,
      repeat('a', 64)
    );
    raise exception 'ADMIN unexpectedly claimed an OWNER-only command';
  exception when others then
    if sqlerrm not like 'Chatwoot bridge mutation not permitted%' then
      raise;
    end if;
  end;
end;
$claim_smoke$;

reset role;

do $claim_smoke$
declare
  v_proc oid := 'public.claim_chatwoot_bridge_command(uuid,text,text,text,uuid,integer,text)'::regprocedure;
begin
  if (select prosecdef from pg_proc where oid=v_proc) then
    raise exception 'claim function must remain SECURITY INVOKER';
  end if;
  if not has_function_privilege('authenticated', v_proc, 'EXECUTE')
     or has_function_privilege('anon', v_proc, 'EXECUTE') then
    raise exception 'claim function role grants changed';
  end if;
end;
$claim_smoke$;

rollback;
