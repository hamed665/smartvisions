-- AI-MODEL-PROMPT-CONTROL V1
-- Extend the existing prompt_versions + agent_settings authorities with staged
-- candidates, bounded shadow/canary control and atomic promotion/rollback.
-- No second Prompt Registry, model router or rollout table is introduced.

create or replace function public.stage_prompt_version(
  p_organization_id uuid,
  p_agent_name text,
  p_prompt_text text
)
returns table(id uuid, version integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_agent text := trim(coalesce(p_agent_name, ''));
  v_prompt text := trim(coalesce(p_prompt_text, ''));
  v_version integer;
  v_id uuid;
begin
  if p_organization_id is null then
    raise exception 'organizationId is required';
  end if;
  if not public.is_org_owner(p_organization_id) then
    raise exception 'OWNER role is required to stage prompts';
  end if;
  if v_agent = '' or length(v_agent) > 80 then
    raise exception 'agent name must be 1..80 characters';
  end if;
  if v_prompt = '' or length(v_prompt) > 7000 then
    raise exception 'prompt text must be 1..7000 characters';
  end if;
  if not exists (
    select 1
    from public.agent_settings s
    where s.organization_id = p_organization_id
      and s.agent_name = v_agent
  ) then
    raise exception 'agent setting does not exist';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':prompt:' || v_agent, 0)
  );

  select coalesce(max(p.version), 0) + 1
    into v_version
    from public.prompt_versions p
   where p.organization_id = p_organization_id
     and p.agent_name = v_agent;

  insert into public.prompt_versions(
    organization_id, agent_name, version, prompt_text, active, created_by
  ) values (
    p_organization_id, v_agent, v_version, v_prompt, false, auth.uid()
  )
  returning prompt_versions.id into v_id;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id, 'USER', auth.uid()::text,
    'STAGE_PROMPT_VERSION', 'prompt', v_id::text,
    jsonb_build_object(
      'agent_name', v_agent,
      'version', v_version,
      'active', false,
      'prompt_length', length(v_prompt)
    )
  );

  return query select v_id, v_version;
end;
$$;

create or replace function public.configure_prompt_rollout(
  p_organization_id uuid,
  p_agent_name text,
  p_mode text,
  p_candidate_version integer,
  p_canary_pct integer default 0,
  p_evaluation jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_agent text := trim(coalesce(p_agent_name, ''));
  v_mode text := upper(trim(coalesce(p_mode, 'OFF')));
  v_candidate_version integer := p_candidate_version;
  v_canary_pct integer := coalesce(p_canary_pct, 0);
  v_baseline_version integer;
  v_config jsonb;
  v_result jsonb;
begin
  if p_organization_id is null then
    raise exception 'organizationId is required';
  end if;
  if not public.is_org_owner(p_organization_id) then
    raise exception 'OWNER role is required to configure prompt rollout';
  end if;
  if v_agent = '' or length(v_agent) > 80 then
    raise exception 'agent name must be 1..80 characters';
  end if;
  if v_mode not in ('OFF','SHADOW','CANARY') then
    raise exception 'prompt rollout mode must be OFF, SHADOW or CANARY';
  end if;
  if p_evaluation is null or jsonb_typeof(p_evaluation) <> 'object' then
    raise exception 'evaluation must be a JSON object';
  end if;
  if length(p_evaluation::text) > 6000 then
    raise exception 'evaluation metadata is too large';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':prompt:' || v_agent, 0)
  );

  select p.version
    into v_baseline_version
    from public.prompt_versions p
   where p.organization_id = p_organization_id
     and p.agent_name = v_agent
     and p.active
   order by p.version desc
   limit 1;

  select s.config
    into v_config
    from public.agent_settings s
   where s.organization_id = p_organization_id
     and s.agent_name = v_agent
   for update;

  if not found then
    raise exception 'agent setting does not exist';
  end if;

  if v_mode = 'OFF' then
    update public.agent_settings
       set config = coalesce(v_config, '{}'::jsonb) - 'promptControl',
           updated_at = now()
     where organization_id = p_organization_id
       and agent_name = v_agent;

    v_result := jsonb_build_object(
      'mode', 'OFF',
      'baselineVersion', v_baseline_version
    );
  else
    if v_candidate_version is null or v_candidate_version < 1 then
      raise exception 'candidate version is required';
    end if;
    if not exists (
      select 1
      from public.prompt_versions p
      where p.organization_id = p_organization_id
        and p.agent_name = v_agent
        and p.version = v_candidate_version
        and not p.active
        and length(trim(p.prompt_text)) between 1 and 7000
    ) then
      raise exception 'candidate prompt version does not exist or is already active';
    end if;

    if v_mode = 'CANARY' and (v_canary_pct < 1 or v_canary_pct > 50) then
      raise exception 'canary percent must be between 1 and 50';
    end if;
    if v_mode = 'SHADOW' then
      v_canary_pct := 0;
    end if;

    v_result := jsonb_build_object(
      'mode', v_mode,
      'candidateVersion', v_candidate_version,
      'baselineVersion', v_baseline_version,
      'canaryPct', v_canary_pct,
      'evaluation', p_evaluation,
      'configuredAt', now(),
      'configuredBy', auth.uid()
    );

    update public.agent_settings
       set config = jsonb_set(
             coalesce(v_config, '{}'::jsonb),
             '{promptControl}',
             v_result,
             true
           ),
           updated_at = now()
     where organization_id = p_organization_id
       and agent_name = v_agent;
  end if;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id, after_data
  ) values (
    p_organization_id, 'USER', auth.uid()::text,
    'CONFIGURE_PROMPT_ROLLOUT', 'agent_settings', v_agent, v_result
  );

  return v_result;
end;
$$;

create or replace function public.set_active_prompt_version(
  p_organization_id uuid,
  p_agent_name text,
  p_version integer
)
returns table(previous_version integer, active_version integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_agent text := trim(coalesce(p_agent_name, ''));
  v_previous integer;
  v_target_id uuid;
  v_action text;
begin
  if p_organization_id is null then
    raise exception 'organizationId is required';
  end if;
  if not public.is_org_owner(p_organization_id) then
    raise exception 'OWNER role is required to activate or rollback prompts';
  end if;
  if v_agent = '' or length(v_agent) > 80 then
    raise exception 'agent name must be 1..80 characters';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':prompt:' || v_agent, 0)
  );

  select p.version
    into v_previous
    from public.prompt_versions p
   where p.organization_id = p_organization_id
     and p.agent_name = v_agent
     and p.active
   order by p.version desc
   limit 1;

  if p_version is not null then
    select p.id
      into v_target_id
      from public.prompt_versions p
     where p.organization_id = p_organization_id
       and p.agent_name = v_agent
       and p.version = p_version
       and length(trim(p.prompt_text)) between 1 and 7000;

    if v_target_id is null then
      raise exception 'target prompt version does not exist';
    end if;
  end if;

  update public.prompt_versions
     set active = false
   where organization_id = p_organization_id
     and agent_name = v_agent
     and active;

  if p_version is not null then
    update public.prompt_versions
       set active = true
     where id = v_target_id;
  end if;

  update public.agent_settings
     set config = coalesce(config, '{}'::jsonb) - 'promptControl',
         updated_at = now()
   where organization_id = p_organization_id
     and agent_name = v_agent;

  if not found then
    raise exception 'agent setting does not exist';
  end if;

  v_action := case
    when p_version is null then 'RESET_PROMPT_TO_BUILTIN'
    when v_previous is not null and p_version < v_previous then 'ROLLBACK_PROMPT_VERSION'
    else 'ACTIVATE_PROMPT_VERSION'
  end;

  insert into public.audit_logs(
    organization_id, actor_type, actor_id, action, entity_type, entity_id,
    before_data, after_data
  ) values (
    p_organization_id, 'USER', auth.uid()::text,
    v_action, 'prompt', v_agent,
    jsonb_build_object('version', v_previous),
    jsonb_build_object('version', p_version)
  );

  return query select v_previous, p_version;
end;
$$;

revoke all on function public.stage_prompt_version(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.stage_prompt_version(uuid,text,text) to authenticated;

revoke all on function public.configure_prompt_rollout(uuid,text,text,integer,integer,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.configure_prompt_rollout(uuid,text,text,integer,integer,jsonb) to authenticated;

revoke all on function public.set_active_prompt_version(uuid,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.set_active_prompt_version(uuid,text,integer) to authenticated;

comment on function public.stage_prompt_version(uuid,text,text)
  is 'OWNER-only staged prompt candidate in canonical prompt_versions; inactive until explicit promotion.';
comment on function public.configure_prompt_rollout(uuid,text,text,integer,integer,jsonb)
  is 'OWNER-only prompt rollout control stored in canonical agent_settings.config promptControl.';
comment on function public.set_active_prompt_version(uuid,text,integer)
  is 'OWNER-only atomic prompt promotion/rollback/reset over canonical prompt_versions.';
