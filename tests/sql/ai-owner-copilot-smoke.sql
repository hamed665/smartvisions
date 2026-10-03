\set ON_ERROR_STOP on

begin;

do $owner_copilot_registry$
declare
  expected_count integer:=20;
  actual_count integer;
  bad_count integer;
begin
  select count(*) into actual_count
  from public.tool_action_registry
  where action_key like 'OWNER_%'
    and metadata->'executionSurfaces' ? 'OWNER_COPILOT';
  if actual_count<>expected_count then
    raise exception 'AI-OWNER-COPILOT registry count mismatch: expected %, got %',expected_count,actual_count;
  end if;

  select count(*) into bad_count
  from public.tool_action_registry
  where action_key like 'OWNER_%'
    and metadata->'executionSurfaces' ? 'OWNER_COPILOT'
    and (
      availability<>'AVAILABLE'
      or approval_requirement<>'REQUIRED'
      or approval_policy_key<>'OWNER_COPILOT_CONFIRM'
      or coalesce((metadata->>'providerSend')::boolean,true)
      or coalesce((metadata->>'paymentExecution')::boolean,true)
      or coalesce((metadata->>'explicitConfirmationRequired')::boolean,false) is distinct from true
      or nullif(metadata->>'ownerCopilotAction','') is null
      or input_schema->>'type'<>'object'
      or jsonb_typeof(input_schema->'properties')<>'object'
      or input_schema->'properties'='{}'::jsonb
      or jsonb_typeof(input_schema->'required')<>'array'
      or coalesce((input_schema->>'additionalProperties')::boolean,true)
    );
  if bad_count<>0 then
    raise exception 'AI-OWNER-COPILOT registry contains % unsafe/malformed contract(s)',bad_count;
  end if;

  if exists (
    select 1 from public.tool_action_registry
    where action_key in ('OWNER_PAYMENT_INTENT_CREATE','OWNER_PAYMENT_INTENT_CANCEL','OWNER_PAYMENT_REFUND_REQUEST')
      and (side_effect_class='EXTERNAL_PROVIDER' or coalesce((metadata->>'paymentExecution')::boolean,false))
  ) then
    raise exception 'AI-OWNER-COPILOT payment contract can execute provider money movement';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.tool_action_registry'::regclass
      and conname='tool_action_registry_scope_type_check'
      and pg_get_constraintdef(oid) like '%CUSTOMER%'
      and pg_get_constraintdef(oid) like '%DEAL%'
      and pg_get_constraintdef(oid) like '%PAYMENT%'
  ) then
    raise exception 'AI-OWNER-COPILOT Tool Registry scope constraint was not extended';
  end if;
end;
$owner_copilot_registry$;

rollback;