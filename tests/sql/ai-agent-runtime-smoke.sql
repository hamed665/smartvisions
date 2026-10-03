\set ON_ERROR_STOP on

begin;

insert into public.organizations(id,name) values
  ('00000000-0000-4000-8000-000000018601','AI Agent Runtime CI'),
  ('00000000-0000-4000-8000-000000018602','AI Agent Runtime Other CI')
on conflict (id) do nothing;

insert into auth.users(id) values
  ('00000000-0000-4000-8000-000000018611'),
  ('00000000-0000-4000-8000-000000018612')
on conflict (id) do nothing;

insert into public.organization_members(organization_id,user_id,role) values
  ('00000000-0000-4000-8000-000000018601','00000000-0000-4000-8000-000000018611','OWNER'),
  ('00000000-0000-4000-8000-000000018601','00000000-0000-4000-8000-000000018612','VIEWER')
on conflict (organization_id,user_id) do update set role=excluded.role;

insert into public.brands(id,organization_id,name,slug,status) values
  ('10000000-0000-4000-8000-000000018601','00000000-0000-4000-8000-000000018601','Runtime Brand','runtime-brand','ACTIVE')
on conflict (id) do nothing;
insert into public.tenant_businesses(
  id,organization_id,brand_id,name,slug,status
) values (
  '20000000-0000-4000-8000-000000018601',
  '00000000-0000-4000-8000-000000018601',
  '10000000-0000-4000-8000-000000018601',
  'Runtime Business','runtime-business','ACTIVE'
) on conflict (id) do nothing;

insert into public.branches(id,organization_id,tenant_business_id,name,code,status) values
  ('30000000-0000-4000-8000-000000018611','00000000-0000-4000-8000-000000018601','20000000-0000-4000-8000-000000018601','Runtime A','A','ACTIVE'),
  ('30000000-0000-4000-8000-000000018612','00000000-0000-4000-8000-000000018601','20000000-0000-4000-8000-000000018601','Runtime B','B','ACTIVE'),
  ('30000000-0000-4000-8000-000000018613','00000000-0000-4000-8000-000000018601','20000000-0000-4000-8000-000000018601','Runtime C','C','ACTIVE')
on conflict (id) do nothing;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000018611',false);

select (public.create_member_scope_assignment(
  '00000000-0000-4000-8000-000000018601',
  '00000000-0000-4000-8000-000000018612',
  'BRANCH','SALES_AGENT',
  null,null,'30000000-0000-4000-8000-000000018611',null,null,
  '{}'::jsonb,'runtime-scope-a'
)).id;

select (public.create_member_scope_assignment(
  '00000000-0000-4000-8000-000000018601',
  '00000000-0000-4000-8000-000000018612',
  'BRANCH','VIEWER',
  null,null,'30000000-0000-4000-8000-000000018612',null,null,
  '{"region":"restricted"}'::jsonb,'runtime-scope-b'
)).id;

reset role;
select set_config('request.jwt.claim.sub','',false);
set role service_role;

do $roles$
declare
  v_role text;
begin
  v_role:=public.unified_inbox_actor_effective_role(
    '00000000-0000-4000-8000-000000018601',
    '00000000-0000-4000-8000-000000018612',
    '10000000-0000-4000-8000-000000018601',
    '20000000-0000-4000-8000-000000018601',
    '30000000-0000-4000-8000-000000018611',
    null,null
  );
  if v_role<>'SALES_AGENT' then
    raise exception 'Scoped USER role mismatch: %',v_role;
  end if;

  v_role:=public.unified_inbox_actor_effective_role(
    '00000000-0000-4000-8000-000000018601',
    '00000000-0000-4000-8000-000000018612',
    '10000000-0000-4000-8000-000000018601',
    '20000000-0000-4000-8000-000000018601',
    '30000000-0000-4000-8000-000000018612',
    null,null
  );
  if v_role is not null then
    raise exception 'Attribute-bearing target must fail closed: %',v_role;
  end if;

  v_role:=public.unified_inbox_actor_effective_role(
    '00000000-0000-4000-8000-000000018601',
    '00000000-0000-4000-8000-000000018612',
    '10000000-0000-4000-8000-000000018601',
    '20000000-0000-4000-8000-000000018601',
    '30000000-0000-4000-8000-000000018613',
    null,null
  );
  if v_role is not null then
    raise exception 'USER outside assigned branch scope must fail closed: %',v_role;
  end if;

  v_role:=public.unified_inbox_actor_effective_role(
    '00000000-0000-4000-8000-000000018601',
    '00000000-0000-4000-8000-000000018611',
    null,null,null,null,null
  );
  if v_role<>'OWNER' then raise exception 'OWNER role was not preserved'; end if;
end;
$roles$;
reset role;

insert into public.agent_runs(
  id,organization_id,input_message,status,trace,request_key
) values
  ('50000000-0000-4000-8000-000000018611','00000000-0000-4000-8000-000000018601','runtime success','PROCESSING','{}'::jsonb,'runtime-success'),
  ('50000000-0000-4000-8000-000000018612','00000000-0000-4000-8000-000000018601','runtime fail','PROCESSING','{}'::jsonb,'runtime-fail')
on conflict (id) do nothing;

do $cross_tenant$
begin
  begin
    insert into public.agent_outputs(
      organization_id,run_id,agent_name,confidence,summary
    ) values (
      '00000000-0000-4000-8000-000000018602',
      '50000000-0000-4000-8000-000000018611',
      'intent_discovery',0.5,'cross tenant'
    );
    raise exception 'Cross-tenant Agent output linkage unexpectedly succeeded';
  exception when foreign_key_violation then
    null;
  end;
end;
$cross_tenant$;

set role service_role;
select public.persist_agent_runtime_outcome(
  '00000000-0000-4000-8000-000000018601',
  '50000000-0000-4000-8000-000000018611',
  '00000000-0000-4000-8000-000000018611',
  '["intent_discovery","secretary"]'::jsonb,
  '[
    {"agent":"intent_discovery","confidence":0.91,"summary":"intent","data":{"intent":"booking"},"evidence":["message"],"blockers":[]},
    {"agent":"secretary","confidence":0.88,"summary":"reply","data":{"customer_reply":"hello"},"evidence":["intent"],"blockers":[]}
  ]'::jsonb,
  '{
    "commercialDecision":{"action":"ANSWER","useDiscount":false,"explainValue":false,"askLowPressureCta":false,"requiresHuman":false,"reasons":[]},
    "customerDraft":"hello",
    "draftLanguage":"en",
    "relevancePassed":true,
    "delivery":"REVIEW"
  }'::jsonb,
  '{"agentExecutions":[],"toolProposals":[]}'::jsonb,
  '{"draft":{"text":"hello","language":"en"},"trace":{"delivery":"REVIEW"}}'::jsonb
);

do $completed$
begin
  if not exists(
    select 1 from public.agent_runs
    where organization_id='00000000-0000-4000-8000-000000018601'
      and id='50000000-0000-4000-8000-000000018611'
      and status='COMPLETED'
  ) then raise exception 'Agent run did not reach COMPLETED'; end if;

  if (select count(*) from public.agent_outputs
      where organization_id='00000000-0000-4000-8000-000000018601'
        and run_id='50000000-0000-4000-8000-000000018611')<>2
  then raise exception 'Per-Agent provenance cardinality mismatch'; end if;

  if (select count(*) from public.reply_decisions
      where organization_id='00000000-0000-4000-8000-000000018601'
        and run_id='50000000-0000-4000-8000-000000018611')<>1
  then raise exception 'Reply decision persistence mismatch'; end if;

  if not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-4000-8000-000000018601'
      and action='AGENT_RUNTIME_COMPLETED'
      and entity_id='50000000-0000-4000-8000-000000018611'
  ) then raise exception 'Completion audit missing'; end if;
end;
$completed$;
do $replay$
declare
  v_result jsonb;
begin
  v_result:=public.persist_agent_runtime_outcome(
    '00000000-0000-4000-8000-000000018601',
    '50000000-0000-4000-8000-000000018611',
    '00000000-0000-4000-8000-000000018611',
    '["intent_discovery","secretary"]'::jsonb,
    '[
      {"agent":"intent_discovery","confidence":0.91,"summary":"intent","data":{"intent":"booking"},"evidence":["message"],"blockers":[]},
      {"agent":"secretary","confidence":0.88,"summary":"reply","data":{"customer_reply":"hello"},"evidence":["intent"],"blockers":[]}
    ]'::jsonb,
    '{
      "commercialDecision":{"action":"ANSWER","useDiscount":false,"explainValue":false,"askLowPressureCta":false,"requiresHuman":false,"reasons":[]},
      "customerDraft":"hello","draftLanguage":"en","relevancePassed":true,"delivery":"REVIEW"
    }'::jsonb,
    '{"agentExecutions":[],"toolProposals":[]}'::jsonb,
    '{"draft":{"text":"hello","language":"en"},"trace":{"delivery":"REVIEW"}}'::jsonb
  );
  if coalesce((v_result->>'replayed')::boolean,false) is distinct from true then
    raise exception 'Identical completion replay was not idempotent: %',v_result;
  end if;
end;
$replay$;

do $conflicting_replay$
declare
  v_rejected boolean:=false;
begin
  begin
    perform public.persist_agent_runtime_outcome(
      '00000000-0000-4000-8000-000000018601',
      '50000000-0000-4000-8000-000000018611',
      '00000000-0000-4000-8000-000000018611',
      '["intent_discovery","secretary"]'::jsonb,
      '[
        {"agent":"intent_discovery","confidence":0.91,"summary":"intent","data":{"intent":"booking"},"evidence":["message"],"blockers":[]},
        {"agent":"secretary","confidence":0.88,"summary":"reply","data":{"customer_reply":"changed"},"evidence":["intent"],"blockers":[]}
      ]'::jsonb,
      '{
        "commercialDecision":{"action":"ANSWER","useDiscount":false,"explainValue":false,"askLowPressureCta":false,"requiresHuman":false,"reasons":[]},
        "customerDraft":"hello","draftLanguage":"en","relevancePassed":true,"delivery":"REVIEW"
      }'::jsonb,
      '{"agentExecutions":[],"toolProposals":[]}'::jsonb,
      '{"draft":{"text":"hello","language":"en"},"trace":{"delivery":"REVIEW"}}'::jsonb
    );
  exception when others then
    if position('completion replay conflict' in sqlerrm)>0 then
      v_rejected:=true;
    else
      raise;
    end if;
  end;
  if not v_rejected then
    raise exception 'Conflicting completion replay unexpectedly succeeded';
  end if;
end;
$conflicting_replay$;

select public.fail_agent_runtime(
  '00000000-0000-4000-8000-000000018601',
  '50000000-0000-4000-8000-000000018612',
  null,
  '{"error":"controlled failure","automatic_retry":false}'::jsonb
);

do $failed$
begin
  if not exists(
    select 1 from public.agent_runs
    where organization_id='00000000-0000-4000-8000-000000018601'
      and id='50000000-0000-4000-8000-000000018612'
      and status='FAILED'
  ) then raise exception 'Agent run did not reach FAILED'; end if;

  if not exists(
    select 1 from public.audit_logs
    where organization_id='00000000-0000-4000-8000-000000018601'
      and action='AGENT_RUNTIME_FAILED'
      and entity_id='50000000-0000-4000-8000-000000018612'
  ) then raise exception 'Failure audit missing'; end if;
end;
$failed$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000018611',false);

do $authenticated_denial$
begin
  begin
    perform public.fail_agent_runtime(
      '00000000-0000-4000-8000-000000018601',
      '50000000-0000-4000-8000-000000018612',
      '00000000-0000-4000-8000-000000018611',
      '{"error":"forbidden"}'::jsonb
    );
    raise exception 'Authenticated caller unexpectedly executed trusted persistence';
  exception when insufficient_privilege then null;
  end;
end;
$authenticated_denial$;
reset role;
select set_config('request.jwt.claim.sub','',false);

do $function_security$
declare
  v_definer boolean;
begin
  select p.prosecdef into v_definer
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='unified_inbox_actor_effective_role';
  if coalesce(v_definer,true) then
    raise exception 'Actor role evaluator must remain SECURITY INVOKER';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.persist_agent_runtime_outcome(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) then raise exception 'authenticated can execute completion persistence'; end if;

  if not has_function_privilege(
    'service_role',
    'public.persist_agent_runtime_outcome(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) then raise exception 'service_role cannot execute completion persistence'; end if;

  if not has_table_privilege('service_role','public.agent_runs','SELECT')
     or not has_table_privilege('service_role','public.agent_runs','UPDATE')
  then raise exception 'service_role lacks Agent run persistence privileges'; end if;
end;
$function_security$;

rollback;
