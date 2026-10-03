\set ON_ERROR_STOP on

begin;

insert into public.organizations(id,name) values
  ('00000000-0000-4000-8000-000000018701','AI Prompt Control CI')
on conflict (id) do nothing;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000018711'),
  ('00000000-0000-4000-8000-000000018712')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-4000-8000-000000018701','00000000-0000-4000-8000-000000018711','OWNER'),
  ('00000000-0000-4000-8000-000000018701','00000000-0000-4000-8000-000000018712','VIEWER')
on conflict (organization_id,user_id) do update set role=excluded.role;

insert into public.agent_settings(
  organization_id,agent_name,enabled,confidence_threshold,config
) values (
  '00000000-0000-4000-8000-000000018701','secretary',true,0.75,'{}'::jsonb
)
on conflict (organization_id,agent_name) do update set config='{}'::jsonb;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000018711',false);

select * from public.stage_prompt_version(
  '00000000-0000-4000-8000-000000018701',
  'secretary',
  'Candidate one: concise evidence-first replies.'
);

do $staged$
begin
  if not exists (
    select 1 from public.prompt_versions
    where organization_id='00000000-0000-4000-8000-000000018701'
      and agent_name='secretary'
      and version=1
      and active=false
  ) then raise exception 'Prompt candidate was not staged inactive'; end if;
end;
$staged$;

select public.configure_prompt_rollout(
  '00000000-0000-4000-8000-000000018701',
  'secretary','SHADOW',1,0,
  '{"verdict":"PASS","checks":[{"key":"BOUNDED","level":"INFO"}]}'::jsonb
);

do $shadow$
begin
  if coalesce((
    select config#>>'{promptControl,mode}'
    from public.agent_settings
    where organization_id='00000000-0000-4000-8000-000000018701'
      and agent_name='secretary'
  ),'') <> 'SHADOW' then
    raise exception 'Shadow rollout was not persisted';
  end if;
end;
$shadow$;

select public.configure_prompt_rollout(
  '00000000-0000-4000-8000-000000018701',
  'secretary','CANARY',1,10,
  '{"verdict":"PASS"}'::jsonb
);

do $canary$
begin
  if coalesce((
    select (config#>>'{promptControl,canaryPct}')::integer
    from public.agent_settings
    where organization_id='00000000-0000-4000-8000-000000018701'
      and agent_name='secretary'
  ),0) <> 10 then
    raise exception 'Canary percentage was not persisted';
  end if;
end;
$canary$;

select * from public.set_active_prompt_version(
  '00000000-0000-4000-8000-000000018701','secretary',1
);

do $promoted$
begin
  if not exists (
    select 1 from public.prompt_versions
    where organization_id='00000000-0000-4000-8000-000000018701'
      and agent_name='secretary'
      and version=1
      and active
  ) then raise exception 'Prompt candidate was not promoted'; end if;

  if exists (
    select 1 from public.agent_settings
    where organization_id='00000000-0000-4000-8000-000000018701'
      and agent_name='secretary'
      and config ? 'promptControl'
  ) then raise exception 'Rollout config was not cleared after promotion'; end if;
end;
$promoted$;

select * from public.stage_prompt_version(
  '00000000-0000-4000-8000-000000018701',
  'secretary',
  'Candidate two: preserve evidence and brevity.'
);
select * from public.set_active_prompt_version(
  '00000000-0000-4000-8000-000000018701','secretary',2
);
select * from public.set_active_prompt_version(
  '00000000-0000-4000-8000-000000018701','secretary',1
);

do $rollback_check$
begin
  if not exists (
    select 1 from public.prompt_versions
    where organization_id='00000000-0000-4000-8000-000000018701'
      and agent_name='secretary' and version=1 and active
  ) then raise exception 'Prompt rollback did not reactivate v1'; end if;

  if not exists (
    select 1 from public.audit_logs
    where organization_id='00000000-0000-4000-8000-000000018701'
      and action='ROLLBACK_PROMPT_VERSION'
  ) then raise exception 'Prompt rollback audit is missing'; end if;
end;
$rollback_check$;

select * from public.set_active_prompt_version(
  '00000000-0000-4000-8000-000000018701','secretary',null
);

reset role;
select set_config('request.jwt.claim.sub','',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000018712',false);

do $viewer_denied$
begin
  begin
    perform public.stage_prompt_version(
      '00000000-0000-4000-8000-000000018701',
      'secretary',
      'Viewer must not stage this.'
    );
    raise exception 'VIEWER unexpectedly staged a prompt';
  exception when others then
    if sqlerrm='VIEWER unexpectedly staged a prompt' then raise; end if;
  end;
end;
$viewer_denied$;

reset role;
select set_config('request.jwt.claim.sub','',false);

do $acl$
begin
  if has_function_privilege(
    'anon',
    'public.stage_prompt_version(uuid,text,text)',
    'EXECUTE'
  ) then raise exception 'anon can execute prompt staging'; end if;

  if not has_function_privilege(
    'authenticated',
    'public.stage_prompt_version(uuid,text,text)',
    'EXECUTE'
  ) then raise exception 'authenticated cannot execute prompt staging'; end if;
end;
$acl$;

rollback;
