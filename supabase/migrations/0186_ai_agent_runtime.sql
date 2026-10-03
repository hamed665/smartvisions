-- 0186: AI-AGENT-RUNTIME
-- Governed orchestration persistence over the existing Agent, IAM, Tool Registry,
-- Booking and audit authorities. No second agent framework, queue, approval
-- engine, provider-send path, payment truth or business mutation authority.

create unique index if not exists agent_runs_org_id_uidx
  on public.agent_runs(organization_id,id);

create unique index if not exists agent_outputs_org_run_agent_uidx
  on public.agent_outputs(organization_id,run_id,agent_name);

create unique index if not exists reply_decisions_org_run_uidx
  on public.reply_decisions(organization_id,run_id);

alter table public.agent_outputs
  drop constraint if exists agent_outputs_org_run_agent_runtime_fkey,
  add constraint agent_outputs_org_run_agent_runtime_fkey
  foreign key (organization_id,run_id)
  references public.agent_runs(organization_id,id)
  on delete cascade;

alter table public.reply_decisions
  drop constraint if exists reply_decisions_org_run_agent_runtime_fkey,
  add constraint reply_decisions_org_run_agent_runtime_fkey
  foreign key (organization_id,run_id)
  references public.agent_runs(organization_id,id)
  on delete cascade;
create or replace function public.unified_inbox_actor_effective_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_brand_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_department_id uuid,
  p_team_id uuid
)
returns text
language plpgsql
stable
security invoker
set search_path=public,auth,pg_catalog
as $$
declare
  v_org_role text;
  v_scope_role text;
  v_scope_attributes jsonb;
begin
  if p_organization_id is null or p_user_id is null then return null; end if;

  if current_user='authenticated' and auth.uid() is distinct from p_user_id then
    return null;
  end if;
  if current_user not in ('authenticated','service_role') then
    return null;
  end if;

  select m.role into v_org_role
  from public.organization_members m
  where m.organization_id=p_organization_id and m.user_id=p_user_id;

  if v_org_role is null then return null; end if;
  if v_org_role='OWNER' then return 'OWNER'; end if;
  select a.role,a.attributes
    into v_scope_role,v_scope_attributes
  from public.member_scope_assignments a
  where a.organization_id=p_organization_id
    and a.user_id=p_user_id
    and (
      (a.scope_type='TEAM' and a.team_id=p_team_id)
      or (a.scope_type='DEPARTMENT' and a.department_id=p_department_id)
      or (a.scope_type='BRANCH' and a.branch_id=p_branch_id)
      or (a.scope_type='BUSINESS' and a.tenant_business_id=p_tenant_business_id)
      or (a.scope_type='BRAND' and a.brand_id=p_brand_id)
    )
  order by case a.scope_type
    when 'TEAM' then 5 when 'DEPARTMENT' then 4 when 'BRANCH' then 3
    when 'BUSINESS' then 2 when 'BRAND' then 1 else 0 end desc
  limit 1;

  if v_scope_role is not null then
    if coalesce(v_scope_attributes,'{}'::jsonb)<>'{}'::jsonb then
      return null;
    end if;
    return v_scope_role;
  end if;

  if v_org_role='VIEWER' and exists(
    select 1 from public.member_scope_assignments a
    where a.organization_id=p_organization_id and a.user_id=p_user_id
  ) then
    return null;
  end if;

  return v_org_role;
end;
$$;
create or replace function public.unified_inbox_effective_role(
  p_organization_id uuid,
  p_brand_id uuid,
  p_tenant_business_id uuid,
  p_branch_id uuid,
  p_department_id uuid,
  p_team_id uuid
)
returns text
language sql
stable
security invoker
set search_path=public,auth,pg_catalog
as $$
  select public.unified_inbox_actor_effective_role(
    p_organization_id,
    auth.uid(),
    p_brand_id,
    p_tenant_business_id,
    p_branch_id,
    p_department_id,
    p_team_id
  );
$$;

revoke all on function public.unified_inbox_actor_effective_role(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid
) from public,anon,authenticated,service_role;
grant execute on function public.unified_inbox_actor_effective_role(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid
) to authenticated,service_role;

revoke all on function public.unified_inbox_effective_role(
  uuid,uuid,uuid,uuid,uuid,uuid
) from public,anon;
grant execute on function public.unified_inbox_effective_role(
  uuid,uuid,uuid,uuid,uuid,uuid
) to authenticated,service_role;
create or replace function public.persist_agent_runtime_outcome(
  p_organization_id uuid,
  p_run_id uuid,
  p_actor_user_id uuid,
  p_routed_agents jsonb,
  p_agent_outputs jsonb,
  p_reply_decision jsonb,
  p_trace jsonb,
  p_result_payload jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_run public.agent_runs%rowtype;
  v_route_count integer;
  v_output_count integer;
  v_distinct_route_count integer;
  v_distinct_output_count integer;
  v_item jsonb;
  v_agent text;
  v_confidence numeric;
  v_input_outputs jsonb;
  v_existing_outputs jsonb;
  v_input_reply jsonb;
  v_existing_reply jsonb;
begin
  if current_user<>'service_role' then
    raise exception 'Agent runtime persistence requires trusted service role';
  end if;
  if p_organization_id is null or p_run_id is null
     or jsonb_typeof(p_routed_agents)<>'array'
     or jsonb_typeof(p_agent_outputs)<>'array'
     or jsonb_typeof(p_reply_decision)<>'object'
     or jsonb_typeof(p_trace)<>'object'
     or jsonb_typeof(p_result_payload)<>'object'
  then raise exception 'Agent runtime outcome payload is invalid'; end if;
  if octet_length(p_trace::text)>131072
     or octet_length(p_result_payload::text)>262144
     or octet_length(p_agent_outputs::text)>262144
     or octet_length(p_reply_decision::text)>65536
  then raise exception 'Agent runtime outcome exceeds bounded persistence limits'; end if;

  if p_actor_user_id is not null and not exists(
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id and m.user_id=p_actor_user_id
  ) then raise exception 'Agent runtime USER actor is not an Organization member'; end if;

  select count(*),count(distinct value)
    into v_route_count,v_distinct_route_count
  from jsonb_array_elements_text(p_routed_agents);
  if v_route_count>10 or v_route_count<>v_distinct_route_count then
    raise exception 'Agent runtime routed Agents are invalid or duplicated';
  end if;
  if exists(
    select 1
    from jsonb_array_elements_text(p_routed_agents) routed(agent_name)
    where routed.agent_name not in (
      'intent_discovery','conversation_psychology','business_analyst',
      'culture_locale','sales_marketing','evidence_checker','preview_director',
      'decision_orchestrator','secretary','relevance_checker'
    )
  ) then
    raise exception 'Agent runtime routed Agent name is not canonical';
  end if;

  select count(*),count(distinct elem->>'agent')
    into v_output_count,v_distinct_output_count
  from jsonb_array_elements(p_agent_outputs) elem;
  if v_output_count<>v_route_count or v_output_count<>v_distinct_output_count then
    raise exception 'Agent runtime output cardinality must exactly match routed Agents';
  end if;

  if coalesce(p_reply_decision->>'delivery','') not in ('SEND','REVIEW','BLOCK')
     or jsonb_typeof(coalesce(p_reply_decision->'commercialDecision','{}'::jsonb))<>'object'
  then raise exception 'Agent runtime reply decision contract is invalid'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'agent',elem->>'agent',
      'confidence',(elem->>'confidence')::numeric,
      'summary',left(coalesce(elem->>'summary',''),4000),
      'data',coalesce(elem->'data','{}'::jsonb),
      'evidence',coalesce(elem->'evidence','[]'::jsonb),
      'blockers',coalesce(elem->'blockers','[]'::jsonb)
    ) order by elem->>'agent'
  ),'[]'::jsonb)
  into v_input_outputs
  from jsonb_array_elements(p_agent_outputs) elem;

  v_input_reply:=jsonb_build_object(
    'commercialDecision',coalesce(p_reply_decision->'commercialDecision','{}'::jsonb),
    'customerDraft',left(coalesce(p_reply_decision->>'customerDraft',''),12000),
    'draftLanguage',left(coalesce(p_reply_decision->>'draftLanguage',''),80),
    'relevancePassed',coalesce((p_reply_decision->>'relevancePassed')::boolean,false),
    'delivery',p_reply_decision->>'delivery'
  );

  select * into v_run from public.agent_runs
  where organization_id=p_organization_id and id=p_run_id
  for update;
  if not found then raise exception 'Agent runtime run not found'; end if;

  if v_run.status='COMPLETED' then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'agent',o.agent_name,
        'confidence',o.confidence,
        'summary',o.summary,
        'data',o.data,
        'evidence',o.evidence,
        'blockers',o.blockers
      ) order by o.agent_name
    ),'[]'::jsonb)
    into v_existing_outputs
    from public.agent_outputs o
    where o.organization_id=p_organization_id and o.run_id=p_run_id;

    select jsonb_build_object(
      'commercialDecision',d.commercial_decision,
      'customerDraft',coalesce(d.customer_draft,''),
      'draftLanguage',coalesce(d.draft_language,''),
      'relevancePassed',d.relevance_passed,
      'delivery',d.delivery
    )
    into v_existing_reply
    from public.reply_decisions d
    where d.organization_id=p_organization_id and d.run_id=p_run_id;

    if v_run.routed_agents=p_routed_agents
       and v_run.trace=p_trace
       and v_run.result_payload=p_result_payload
       and v_existing_outputs=v_input_outputs
       and v_existing_reply=v_input_reply
    then
      return jsonb_build_object('status','COMPLETED','replayed',true);
    end if;
    raise exception 'Agent runtime completion replay conflict';
  end if;
  if v_run.status<>'PROCESSING' then
    raise exception 'Agent runtime run is not PROCESSING';
  end if;
  for v_item in select value from jsonb_array_elements(p_agent_outputs)
  loop
    if jsonb_typeof(v_item)<>'object' then
      raise exception 'Agent runtime output must be an object';
    end if;
    v_agent:=btrim(coalesce(v_item->>'agent',''));
    if v_agent='' or not (p_routed_agents ? v_agent) then
      raise exception 'Agent runtime output Agent is not routed';
    end if;
    begin
      v_confidence:=(v_item->>'confidence')::numeric;
    exception when others then
      raise exception 'Agent runtime confidence is invalid';
    end;
    if v_confidence<0 or v_confidence>1
       or length(coalesce(v_item->>'summary',''))>4000
       or jsonb_typeof(coalesce(v_item->'data','{}'::jsonb))<>'object'
       or jsonb_typeof(coalesce(v_item->'evidence','[]'::jsonb))<>'array'
       or jsonb_typeof(coalesce(v_item->'blockers','[]'::jsonb))<>'array'
    then raise exception 'Agent runtime output contract is invalid'; end if;

    insert into public.agent_outputs(
      organization_id,run_id,agent_name,confidence,summary,data,evidence,blockers
    ) values (
      p_organization_id,p_run_id,v_agent,v_confidence,
      left(coalesce(v_item->>'summary',''),4000),
      coalesce(v_item->'data','{}'::jsonb),
      coalesce(v_item->'evidence','[]'::jsonb),
      coalesce(v_item->'blockers','[]'::jsonb)
    );
  end loop;
  if coalesce(p_reply_decision->>'delivery','') not in ('SEND','REVIEW','BLOCK')
     or jsonb_typeof(coalesce(p_reply_decision->'commercialDecision','{}'::jsonb))<>'object'
  then raise exception 'Agent runtime reply decision contract is invalid'; end if;

  insert into public.reply_decisions(
    organization_id,run_id,commercial_decision,customer_draft,draft_language,
    relevance_passed,delivery
  ) values (
    p_organization_id,p_run_id,
    coalesce(p_reply_decision->'commercialDecision','{}'::jsonb),
    left(coalesce(p_reply_decision->>'customerDraft',''),12000),
    left(coalesce(p_reply_decision->>'draftLanguage',''),80),
    coalesce((p_reply_decision->>'relevancePassed')::boolean,false),
    p_reply_decision->>'delivery'
  );

  update public.agent_runs
  set status='COMPLETED',
      routed_agents=p_routed_agents,
      trace=p_trace,
      result_payload=p_result_payload,
      completed_at=statement_timestamp()
  where organization_id=p_organization_id and id=p_run_id and status='PROCESSING';

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id
  ) values (
    p_organization_id,
    case when p_actor_user_id is null then 'SYSTEM' else 'USER' end,
    coalesce(p_actor_user_id::text,'agent_runtime'),
    'AGENT_RUNTIME_COMPLETED','agent_run',p_run_id::text,
    jsonb_build_object(
      'routedAgentCount',v_route_count,
      'outputCount',v_output_count,
      'delivery',p_reply_decision->>'delivery'
    ),
    coalesce(v_run.request_key,p_run_id::text)
  );

  return jsonb_build_object('status','COMPLETED','replayed',false);
end;
$$;
create or replace function public.fail_agent_runtime(
  p_organization_id uuid,
  p_run_id uuid,
  p_actor_user_id uuid,
  p_trace jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=public,pg_catalog
as $$
declare
  v_run public.agent_runs%rowtype;
begin
  if current_user<>'service_role' then
    raise exception 'Agent runtime failure persistence requires trusted service role';
  end if;
  if p_organization_id is null or p_run_id is null
     or jsonb_typeof(p_trace)<>'object'
     or octet_length(p_trace::text)>131072
  then raise exception 'Agent runtime failure payload is invalid'; end if;

  if p_actor_user_id is not null and not exists(
    select 1 from public.organization_members m
    where m.organization_id=p_organization_id and m.user_id=p_actor_user_id
  ) then raise exception 'Agent runtime USER actor is not an Organization member'; end if;

  select * into v_run from public.agent_runs
  where organization_id=p_organization_id and id=p_run_id
  for update;
  if not found then raise exception 'Agent runtime run not found'; end if;

  if v_run.status='FAILED' then
    if v_run.trace=p_trace then
      return jsonb_build_object('status','FAILED','replayed',true);
    end if;
    raise exception 'Agent runtime failure replay conflict';
  end if;
  if v_run.status='COMPLETED' then
    raise exception 'Completed Agent runtime cannot be failed';
  end if;
  if v_run.status<>'PROCESSING' then
    raise exception 'Agent runtime run is not PROCESSING';
  end if;
  update public.agent_runs
  set status='FAILED',
      trace=p_trace,
      completed_at=statement_timestamp()
  where organization_id=p_organization_id and id=p_run_id and status='PROCESSING';

  insert into public.audit_logs(
    organization_id,actor_type,actor_id,action,entity_type,entity_id,
    after_data,correlation_id
  ) values (
    p_organization_id,
    case when p_actor_user_id is null then 'SYSTEM' else 'USER' end,
    coalesce(p_actor_user_id::text,'agent_runtime'),
    'AGENT_RUNTIME_FAILED','agent_run',p_run_id::text,
    jsonb_build_object('automaticRetry',false),
    coalesce(v_run.request_key,p_run_id::text)
  );

  return jsonb_build_object('status','FAILED','replayed',false);
end;
$$;

revoke all on function public.persist_agent_runtime_outcome(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.persist_agent_runtime_outcome(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb
) to service_role;

revoke all on function public.fail_agent_runtime(
  uuid,uuid,uuid,jsonb
) from public,anon,authenticated,service_role;
grant execute on function public.fail_agent_runtime(
  uuid,uuid,uuid,jsonb
) to service_role;

grant select,insert on public.agent_outputs to service_role;
grant select,insert on public.reply_decisions to service_role;
grant select,insert on public.audit_logs to service_role;

comment on function public.persist_agent_runtime_outcome(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb
) is 'Atomic canonical Agent Runtime completion persistence. Tool proposals are not execution authority.';
