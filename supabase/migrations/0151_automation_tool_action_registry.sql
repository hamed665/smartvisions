-- AUTO-TOOL-ACTION-REGISTRY
-- Canonical typed contract metadata for AI/workflow actions over existing
-- domain authorities. This migration does not create an executor, action
-- request store, queue, outbox, provider-send authority or approval engine.

create table public.tool_action_registry (
  action_key text primary key,
  tool_key text not null,
  authority_key text not null,
  contract_version integer not null default 1 check (contract_version >= 1),
  input_schema jsonb not null,
  output_schema jsonb not null,
  permission_key text not null,
  scope_type text not null check (scope_type in (
    'LEAD','CONVERSATION','AUTOMATION_RULE'
  )),
  idempotency_required boolean not null default true,
  idempotency_key_contract text not null,
  cost_class text not null check (cost_class in (
    'NONE','INTERNAL_METERED','PROVIDER_METERED'
  )),
  side_effect_class text not null check (side_effect_class in (
    'INTERNAL_STATE','EXTERNAL_PROVIDER','CONTROL_PLANE'
  )),
  approval_requirement text not null check (approval_requirement in (
    'NONE','CONDITIONAL','REQUIRED'
  )),
  approval_policy_key text,
  verifier_key text not null,
  audit_contract jsonb not null,
  availability text not null check (availability in (
    'AVAILABLE','DEPENDENCY_PENDING','DEPRECATED'
  )),
  required_work_packages text[] not null default '{}'::text[],
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint tool_action_registry_action_key_check
    check (action_key ~ '^[A-Z][A-Z0-9_.:-]{0,127}$'),
  constraint tool_action_registry_tool_key_check
    check (tool_key ~ '^[A-Z][A-Z0-9_.:-]{0,127}$'),
  constraint tool_action_registry_authority_key_check
    check (authority_key ~ '^[A-Z][A-Z0-9_.:-]{0,127}$'),
  constraint tool_action_registry_permission_key_check
    check (permission_key ~ '^[A-Z][A-Z0-9_.:-]{0,127}$'),
  constraint tool_action_registry_idempotency_contract_check
    check (length(btrim(idempotency_key_contract)) between 3 and 240),
  constraint tool_action_registry_verifier_key_check
    check (verifier_key ~ '^[A-Z][A-Z0-9_.:-]{0,127}$'),
  constraint tool_action_registry_input_schema_check
    check (
      jsonb_typeof(input_schema)='object'
      and input_schema->>'type'='object'
      and jsonb_typeof(coalesce(input_schema->'properties','{}'::jsonb))='object'
      and jsonb_typeof(coalesce(input_schema->'required','[]'::jsonb))='array'
    ),
  constraint tool_action_registry_output_schema_check
    check (
      jsonb_typeof(output_schema)='object'
      and output_schema->>'type'='object'
      and jsonb_typeof(coalesce(output_schema->'properties','{}'::jsonb))='object'
      and jsonb_typeof(coalesce(output_schema->'required','[]'::jsonb))='array'
    ),
  constraint tool_action_registry_approval_contract_check
    check (
      (approval_requirement='NONE' and approval_policy_key is null)
      or
      (
        approval_requirement in ('CONDITIONAL','REQUIRED')
        and approval_policy_key is not null
        and approval_policy_key ~ '^[A-Z][A-Z0-9_.:-]{0,127}$'
      )
    ),
  constraint tool_action_registry_audit_contract_check
    check (
      jsonb_typeof(audit_contract)='object'
      and nullif(btrim(audit_contract->>'event'),'') is not null
      and nullif(btrim(audit_contract->>'entityType'),'') is not null
      and jsonb_typeof(audit_contract->'correlationRequired')='boolean'
    ),
  constraint tool_action_registry_dependency_check
    check (
      (availability='DEPENDENCY_PENDING' and cardinality(required_work_packages)>0)
      or
      (availability in ('AVAILABLE','DEPRECATED'))
    ),
  constraint tool_action_registry_metadata_check
    check (jsonb_typeof(metadata)='object')
);

comment on table public.tool_action_registry is
  'Canonical system-owned Tool/Action contract metadata reused by workflow and future AI execution boundaries. It stores no action requests and is not an executor, queue, outbox, provider-send authority or approval engine.';

create index tool_action_registry_tool_availability_idx
  on public.tool_action_registry(tool_key,availability,action_key);

insert into public.tool_action_registry(
  action_key,tool_key,authority_key,contract_version,
  input_schema,output_schema,permission_key,scope_type,
  idempotency_required,idempotency_key_contract,cost_class,
  side_effect_class,approval_requirement,approval_policy_key,
  verifier_key,audit_contract,availability,required_work_packages,
  description,metadata
) values
(
  'GENERATE_PREVIEW','PREVIEW','PREVIEW_PRODUCTION_SERVICE',1,
  '{
    "type":"object",
    "properties":{
      "organizationId":{"type":"string","format":"uuid"},
      "leadId":{"type":"string","format":"uuid"},
      "explicitRequest":{"type":"boolean"},
      "ownerApprovedHeavyGeneration":{"type":"boolean"},
      "siteLanguage":{"type":"string"},
      "siteLanguageSource":{"type":"string"}
    },
    "required":["organizationId","leadId"],
    "additionalProperties":false
  }'::jsonb,
  '{
    "type":"object",
    "properties":{
      "eligible":{"type":"boolean"},
      "previewId":{"type":"string","format":"uuid"},
      "status":{"type":"string"},
      "reused":{"type":"boolean"},
      "reconciliationRequired":{"type":"boolean"}
    },
    "required":["eligible"],
    "additionalProperties":true
  }'::jsonb,
  'PREVIEW_GENERATE','LEAD',
  true,'PREVIEW_BRIEF_HASH_UNIQUE','INTERNAL_METERED',
  'INTERNAL_STATE','NONE',null,
  'PREVIEW_PERSISTED_WITH_EVENT',
  '{"event":"AUTOMATION_PREVIEW_GENERATED","entityType":"preview","correlationRequired":true}'::jsonb,
  'AVAILABLE','{}'::text[],
  'Generate or reuse a deterministic governed Preview through the existing Preview production authority.',
  '{"evidence":["previews.brief_hash unique authority","preview_events","usage_events"],"providerSend":false}'::jsonb
),
(
  'HANDOFF_HUMAN','HUMAN_HANDOFF','HANDOFF_EVENTS',1,
  '{
    "type":"object",
    "properties":{
      "organizationId":{"type":"string","format":"uuid"},
      "conversationId":{"type":"string","format":"uuid"},
      "leadId":{"type":"string","format":"uuid"},
      "requestKey":{"type":"string"},
      "reasons":{"type":"array","items":{"type":"string"}}
    },
    "required":["organizationId","conversationId","requestKey","reasons"],
    "additionalProperties":false
  }'::jsonb,
  '{
    "type":"object",
    "properties":{
      "handoffEventId":{"type":"string","format":"uuid"},
      "mode":{"type":"string","enum":["HUMAN"]},
      "replayed":{"type":"boolean"}
    },
    "required":["mode"],
    "additionalProperties":true
  }'::jsonb,
  'CONVERSATION_HANDOFF','CONVERSATION',
  true,'HANDOFF_EVENTS_REQUEST_KEY_UNIQUE','NONE',
  'INTERNAL_STATE','NONE',null,
  'HANDOFF_EVENT_AND_AGENT_MODE',
  '{"event":"AUTOMATION_HUMAN_HANDOFF_VERIFIED","entityType":"handoff_event","correlationRequired":true}'::jsonb,
  'AVAILABLE','{}'::text[],
  'Move a conversation to the existing human-handoff boundary with durable request-key evidence.',
  '{"evidence":["handoff_events.request_key unique","sales_conversations agent/handoff state"],"providerSend":false}'::jsonb
),
(
  'SEND_FOLLOWUP','OUTREACH_SEND','APPROVED_SEND_POLICY',1,
  '{
    "type":"object",
    "properties":{
      "organizationId":{"type":"string","format":"uuid"},
      "conversationId":{"type":"string","format":"uuid"},
      "messageId":{"type":"string","format":"uuid"},
      "idempotencyKey":{"type":"string"}
    },
    "required":["organizationId","conversationId","messageId","idempotencyKey"],
    "additionalProperties":false
  }'::jsonb,
  '{
    "type":"object",
    "properties":{
      "accepted":{"type":"boolean"},
      "providerMessageId":{"type":"string"},
      "deliveryStatus":{"type":"string"},
      "reconciliationRequired":{"type":"boolean"}
    },
    "required":["accepted"],
    "additionalProperties":true
  }'::jsonb,
  'OUTBOUND_SEND','CONVERSATION',
  true,'OUTBOUND_PROVIDER_MESSAGE_IDEMPOTENCY','PROVIDER_METERED',
  'EXTERNAL_PROVIDER','REQUIRED','OUTBOUND_SEND',
  'PROVIDER_RECEIPT_RECONCILIATION',
  '{"event":"AUTOMATION_FOLLOWUP_SEND_VERIFIED","entityType":"conversation_message","correlationRequired":true}'::jsonb,
  'DEPENDENCY_PENDING',array['AUTO-APPROVAL','AUTO-RUNTIME']::text[],
  'Provider-bound follow-up through the existing approved-send policy. Publication remains blocked until Automation approval/runtime orchestration exists.',
  '{"evidence":["approved-send-policy","shadow-approval queue","provider reconciliation"],"providerSend":true}'::jsonb
),
(
  'CREATE_OPERATOR_BRIEF','OPERATOR_BRIEF','OPERATOR_BRIEFS',1,
  '{
    "type":"object",
    "properties":{
      "organizationId":{"type":"string","format":"uuid"},
      "conversationId":{"type":"string","format":"uuid"},
      "messageId":{"type":"string","format":"uuid"},
      "requestKey":{"type":"string"},
      "briefType":{"type":"string"},
      "title":{"type":"string"},
      "summary":{"type":"string"},
      "details":{"type":"object"},
      "requiresAction":{"type":"boolean"}
    },
    "required":["organizationId","conversationId","requestKey","briefType","title","summary"],
    "additionalProperties":false
  }'::jsonb,
  '{
    "type":"object",
    "properties":{
      "briefId":{"type":"string","format":"uuid"},
      "replayed":{"type":"boolean"}
    },
    "required":["briefId"],
    "additionalProperties":false
  }'::jsonb,
  'OPERATOR_BRIEF_CREATE','CONVERSATION',
  true,'OPERATOR_BRIEF_REQUEST_KEY','NONE',
  'INTERNAL_STATE','NONE',null,
  'OPERATOR_BRIEF_PERSISTENCE',
  '{"event":"AUTOMATION_OPERATOR_BRIEF_CREATED","entityType":"operator_brief","correlationRequired":true}'::jsonb,
  'DEPENDENCY_PENDING',array['AUTO-RUNTIME']::text[],
  'Create an operator brief. Existing storage is canonical, but an idempotent workflow command boundary is still required.',
  '{"evidence":["operator_briefs canonical storage"],"missing":["idempotent workflow command boundary"],"providerSend":false}'::jsonb
),
(
  'PAUSE_AUTOMATION','AUTOMATION_CONTROL','AUTOMATION_RULES',1,
  '{
    "type":"object",
    "properties":{
      "organizationId":{"type":"string","format":"uuid"},
      "ruleId":{"type":"string","format":"uuid"},
      "actorUserId":{"type":"string","format":"uuid"}
    },
    "required":["organizationId","ruleId","actorUserId"],
    "additionalProperties":false
  }'::jsonb,
  '{
    "type":"object",
    "properties":{
      "ruleId":{"type":"string","format":"uuid"},
      "enabled":{"type":"boolean"},
      "executionState":{"type":"string"},
      "replayed":{"type":"boolean"}
    },
    "required":["ruleId","enabled","executionState","replayed"],
    "additionalProperties":false
  }'::jsonb,
  'AUTOMATION_OWNER_CONTROL','AUTOMATION_RULE',
  true,'AUTOMATION_ENABLEMENT_STATE_REPLAY','NONE',
  'CONTROL_PLANE','NONE',null,
  'AUTOMATION_RULE_STATE_RELOAD',
  '{"event":"AUTOMATION_RULE_DISABLED","entityType":"automation_rule","correlationRequired":false}'::jsonb,
  'DEPENDENCY_PENDING',array['AUTO-RUNTIME']::text[],
  'Pause a published workflow through the existing automation_rules authority. Runtime system-actor semantics remain unresolved.',
  '{"evidence":["set_automation_rule_enabled state replay + audit"],"missing":["runtime actor contract"],"providerSend":false}'::jsonb
),
(
  'MARK_HOT','SALES_SCORING','SALES_SCORING_GOVERNANCE',1,
  '{
    "type":"object",
    "properties":{
      "organizationId":{"type":"string","format":"uuid"},
      "leadId":{"type":"string","format":"uuid"},
      "requestKey":{"type":"string"},
      "evidence":{"type":"object"}
    },
    "required":["organizationId","leadId","requestKey","evidence"],
    "additionalProperties":false
  }'::jsonb,
  '{
    "type":"object",
    "properties":{
      "leadId":{"type":"string","format":"uuid"},
      "status":{"type":"string"},
      "scoringRevision":{"type":"integer"},
      "replayed":{"type":"boolean"}
    },
    "required":["leadId","status"],
    "additionalProperties":true
  }'::jsonb,
  'CRM_LEAD_SCORING_MUTATE','LEAD',
  true,'CRM_LEAD_SCORING_REQUEST_KEY','NONE',
  'INTERNAL_STATE','NONE',null,
  'LEAD_SCORING_AND_STATUS_RELOAD',
  '{"event":"AUTOMATION_LEAD_HOT_VERIFIED","entityType":"lead","correlationRequired":true}'::jsonb,
  'DEPENDENCY_PENDING',array['AUTO-RUNTIME']::text[],
  'Request HOT Lead state only through governed Sales Scoring evidence. Direct Lead-status mutation is not an automation authority.',
  '{"evidence":["SALES-SCORING governed score mutation"],"forbidden":["direct leads.status write"],"providerSend":false}'::jsonb
);

alter table public.tool_action_registry enable row level security;

create policy tool_action_registry_authenticated_read
on public.tool_action_registry
for select
to authenticated
using (true);

revoke all on table public.tool_action_registry
  from public,anon,authenticated,service_role;
grant select on table public.tool_action_registry
  to authenticated,service_role;

create or replace function public.validate_automation_actions(
  p_organization_id uuid,
  p_actions jsonb,
  p_for_publish boolean default false
)
returns integer
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_item jsonb;
  v_key text;
  v_contract public.tool_action_registry%rowtype;
  v_count integer := 0;
begin
  if p_organization_id is null then
    raise exception 'Automation action validation requires Organization';
  end if;

  if p_actions is null
     or jsonb_typeof(p_actions)<>'array'
     or jsonb_array_length(p_actions) not between 1 and 20
  then
    raise exception 'Automation actions must contain 1..20 action objects';
  end if;

  for v_item in select value from jsonb_array_elements(p_actions) x(value)
  loop
    if jsonb_typeof(v_item)<>'object'
       or (v_item - array['key','config']::text[])<>'{}'::jsonb
       or nullif(btrim(v_item->>'key'),'') is null
       or not (v_item ? 'config')
       or jsonb_typeof(v_item->'config')<>'object'
       or pg_column_size(v_item->'config')>8192
    then
      raise exception 'Automation action shape is invalid';
    end if;

    v_key := upper(btrim(v_item->>'key'));
    if v_key is distinct from v_item->>'key'
       or v_key !~ '^[A-Z][A-Z0-9_.:-]{0,127}$'
    then
      raise exception 'Automation action key is invalid';
    end if;

    select * into v_contract
    from public.tool_action_registry
    where action_key=v_key;

    if not found then
      raise exception 'Automation action is not cataloged: %',v_key;
    end if;

    if p_for_publish then
      if v_contract.availability<>'AVAILABLE' then
        raise exception 'Automation action is not publishable: % (%)',
          v_key,v_contract.availability;
      end if;

      if v_contract.approval_requirement='REQUIRED'
         and not exists(
           select 1
           from public.approval_rules a
           where a.organization_id=p_organization_id
             and a.action_key=v_contract.approval_policy_key
             and a.requires_approval=true
         )
      then
        raise exception 'Required approval policy is not configured: %',
          v_contract.approval_policy_key;
      end if;

      if v_contract.approval_requirement='CONDITIONAL'
         and not exists(
           select 1
           from public.approval_rules a
           where a.organization_id=p_organization_id
             and a.action_key=v_contract.approval_policy_key
         )
      then
        raise exception 'Conditional approval policy is not configured: %',
          v_contract.approval_policy_key;
      end if;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.enforce_automation_rule_action_registry()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  perform public.validate_automation_actions(
    new.organization_id,new.actions,false
  );

  if new.action_key is distinct from (new.actions->0->>'key') then
    raise exception 'Automation primary action key must match the first cataloged action';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_automation_published_action_registry()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
begin
  perform public.validate_automation_actions(
    new.organization_id,new.actions,true
  );
  return new;
end;
$$;

create or replace function public.enforce_automation_enable_action_registry()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_actions jsonb;
begin
  if new.enabled
     and (tg_op='INSERT' or old.enabled is distinct from true)
     and new.latest_published_version>0
  then
    select v.actions into v_actions
    from public.automation_rule_versions v
    where v.organization_id=new.organization_id
      and v.automation_rule_id=new.id
      and v.version=new.latest_published_version;

    if v_actions is null then
      raise exception 'Automation latest published action snapshot is missing';
    end if;

    perform public.validate_automation_actions(
      new.organization_id,v_actions,true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists automation_rules_action_registry_guard
  on public.automation_rules;
create trigger automation_rules_action_registry_guard
before insert or update of action_key,actions on public.automation_rules
for each row execute function public.enforce_automation_rule_action_registry();

drop trigger if exists automation_rule_versions_action_registry_guard
  on public.automation_rule_versions;
create trigger automation_rule_versions_action_registry_guard
before insert on public.automation_rule_versions
for each row execute function public.enforce_automation_published_action_registry();

drop trigger if exists automation_rules_enable_action_registry_guard
  on public.automation_rules;
create trigger automation_rules_enable_action_registry_guard
before insert or update of enabled on public.automation_rules
for each row execute function public.enforce_automation_enable_action_registry();

revoke all on function public.validate_automation_actions(uuid,jsonb,boolean)
  from public,anon,authenticated;
grant execute on function public.validate_automation_actions(uuid,jsonb,boolean)
  to service_role;

revoke all on function public.enforce_automation_rule_action_registry()
  from public,anon,authenticated,service_role;
revoke all on function public.enforce_automation_published_action_registry()
  from public,anon,authenticated,service_role;
revoke all on function public.enforce_automation_enable_action_registry()
  from public,anon,authenticated,service_role;
