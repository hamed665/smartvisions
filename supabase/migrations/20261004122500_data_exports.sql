-- DATA-EXPORTS
--
-- Registers scheduled governed analytics delivery in the existing Tool/Action
-- Registry. Cloudflare Cron + AUTO-RUNTIME remain the only scheduler/runtime.
-- This migration creates no export fact store, queue, scheduler, metric store,
-- warehouse, recipient store or provider credential authority.

insert into public.tool_action_registry(
  action_key,tool_key,authority_key,contract_version,
  input_schema,output_schema,permission_key,scope_type,
  idempotency_required,idempotency_key_contract,cost_class,
  side_effect_class,approval_requirement,approval_policy_key,
  verifier_key,audit_contract,availability,required_work_packages,
  description,metadata
) values (
  'DELIVER_DATA_EXPORT','ANALYTICS_EXPORT','ANALYTICS_EXPORT_COMPOSER',1,
  '{
    "type":"object",
    "properties":{
      "format":{"type":"string","enum":["CSV","JSON","XLSX","PDF"]},
      "days":{"type":"integer","enum":[7,30,90]}
    },
    "required":["format","days"],
    "additionalProperties":false
  }'::jsonb,
  '{
    "type":"object",
    "properties":{
      "providerMessageId":{"type":"string"},
      "filename":{"type":"string"},
      "format":{"type":"string"},
      "days":{"type":"integer"},
      "scope":{"type":"string"}
    },
    "required":["providerMessageId","filename","format","days","scope"],
    "additionalProperties":true
  }'::jsonb,
  'REPORT_EXPORT','AUTOMATION_RULE',
  true,'AUTOMATION_ACTION_IDEMPOTENCY_KEY','PROVIDER_METERED',
  'EXTERNAL_PROVIDER','NONE',null,
  'PROVIDER_ACCEPTED_INTERNAL_REPORT_ATTACHMENT',
  '{"event":"AUTOMATION_DATA_EXPORT_DELIVERED","entityType":"automation_run","correlationRequired":true}'::jsonb,
  'DEPENDENCY_PENDING',array['DATA-REPORTING']::text[],
  'Generate a governed Organization-scoped analytics export and deliver it to the canonical Organization notification email through the existing email provider. Publication remains blocked until DATA-REPORTING supplies the canonical recurring schedule producer.',
  '{
    "evidence":["metric_registry_current_v1","analytics_warehouse_facts","automation_runs","provider message receipt"],
    "providerSend":true,
    "recipientAuthority":"organization_settings.notification_email",
    "mailboxAuthority":"organization_settings.config.notificationMailboxId",
    "scheduleAuthority":"SCHEDULE_DUE",
    "scheduleProducer":"DEPENDENCY_PENDING_DATA_REPORTING",
    "lowerScopeScheduledDelivery":false,
    "googleSheetsPublishing":false
  }'::jsonb
)
on conflict (action_key) do update
set
  tool_key=excluded.tool_key,
  authority_key=excluded.authority_key,
  contract_version=excluded.contract_version,
  input_schema=excluded.input_schema,
  output_schema=excluded.output_schema,
  permission_key=excluded.permission_key,
  scope_type=excluded.scope_type,
  idempotency_required=excluded.idempotency_required,
  idempotency_key_contract=excluded.idempotency_key_contract,
  cost_class=excluded.cost_class,
  side_effect_class=excluded.side_effect_class,
  approval_requirement=excluded.approval_requirement,
  approval_policy_key=excluded.approval_policy_key,
  verifier_key=excluded.verifier_key,
  audit_contract=excluded.audit_contract,
  availability=excluded.availability,
  required_work_packages=excluded.required_work_packages,
  description=excluded.description,
  metadata=excluded.metadata;

comment on table public.tool_action_registry is
  'Canonical system-owned Tool/Action contract metadata reused by workflow and AI execution boundaries. DATA-EXPORTS adds DELIVER_DATA_EXPORT only; this remains metadata and creates no second executor, scheduler, queue or provider credential authority.';
