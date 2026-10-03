-- AI-OWNER-COPILOT
-- Extend the canonical Tool Registry with explicit Owner Copilot contracts.
-- This migration creates no executor, action store, approval engine, CRM authority,
-- provider-send path or payment execution path.

alter table public.tool_action_registry
  drop constraint tool_action_registry_scope_type_check,
  add constraint tool_action_registry_scope_type_check
    check (scope_type in (
      'LEAD','CONVERSATION','BOOKING','AUTOMATION_RULE',
      'CUSTOMER','DEAL','TASK','QUOTE','ORDER','INVOICE','PAYMENT','CAMPAIGN'
    ));

with owner_actions(
  action_key,tool_key,authority_key,permission_key,scope_type,side_effect_class,
  verifier_key,panel_action,description
) as (
  values
    ('OWNER_LEAD_UPDATE','CRM_LEAD','CRM_LEADS','CRM_LEAD_MUTATE','LEAD','INTERNAL_STATE','CRM_LEAD_RELOAD','lead.update','Update a Lead through the existing governed Lead Server Action.'),
    ('OWNER_AUTOMATION_UPDATE','AUTOMATION_CONTROL','AUTOMATION_RULES','AUTOMATION_OWNER_CONTROL','AUTOMATION_RULE','CONTROL_PLANE','AUTOMATION_RULE_RELOAD','automation.update','Update an Automation Rule through the existing governed Automation Server Action.'),
    ('OWNER_TASK_CREATE','CRM_TASK','CRM_TASKS','CRM_TASK_MUTATE','TASK','INTERNAL_STATE','CRM_TASK_REQUEST_KEY_RELOAD','crm.task.create','Create a CRM Task through the canonical CRM task authority.'),
    ('OWNER_CUSTOMER_TASK','CRM_TASK','CRM_TASKS','CRM_TASK_MUTATE','CUSTOMER','INTERNAL_STATE','CRM_TASK_REQUEST_KEY_RELOAD','customer.task','Create a customer-scoped CRM Task through the canonical CRM task authority.'),
    ('OWNER_TASK_UPDATE','CRM_TASK','CRM_TASKS','CRM_TASK_MUTATE','TASK','INTERNAL_STATE','CRM_TASK_RELOAD','crm.task.update','Update a CRM Task with canonical version checks.'),
    ('OWNER_DEAL_UPDATE','CRM_DEAL','CRM_DEALS','CRM_DEAL_MUTATE','DEAL','INTERNAL_STATE','CRM_DEAL_RELOAD','crm.deal.update','Update a CRM Deal through the existing permission and version gates.'),
    ('OWNER_BOOKING_CONFIRM','BOOKING','BOOKING_LIFECYCLE','BOOKING_MUTATE','BOOKING','INTERNAL_STATE','BOOKING_LIFECYCLE_RELOAD','booking.confirm','Confirm a Booking through the canonical lifecycle RPC.'),
    ('OWNER_BOOKING_RESCHEDULE','BOOKING','BOOKING_LIFECYCLE','BOOKING_MUTATE','BOOKING','INTERNAL_STATE','BOOKING_LIFECYCLE_RELOAD','booking.reschedule','Reschedule a Booking through the canonical lifecycle RPC.'),
    ('OWNER_BOOKING_CANCEL','BOOKING','BOOKING_LIFECYCLE','BOOKING_MUTATE','BOOKING','INTERNAL_STATE','BOOKING_LIFECYCLE_RELOAD','booking.cancel','Cancel a Booking through the canonical lifecycle RPC.'),
    ('OWNER_QUOTE_SUBMIT_REVIEW','QUOTE','QUOTE_ENGINE','QUOTE_MUTATE','QUOTE','INTERNAL_STATE','QUOTE_RELOAD','quote.submit_review','Submit a Quote to the canonical review lifecycle.'),
    ('OWNER_QUOTE_REVIEW_DECIDE','QUOTE','QUOTE_ENGINE','QUOTE_REVIEW','QUOTE','INTERNAL_STATE','QUOTE_RELOAD','quote.review_decide','Record a governed Quote review decision.'),
    ('OWNER_QUOTE_MARK_SENT','QUOTE','QUOTE_ENGINE','QUOTE_MUTATE','QUOTE','INTERNAL_STATE','QUOTE_RELOAD','quote.mark_sent','Record Quote SENT state only; this contract never sends a provider message.'),
    ('OWNER_ORDER_START','ORDER','ORDER_ENGINE','ORDER_MUTATE','ORDER','INTERNAL_STATE','ORDER_RELOAD','order.start','Start canonical Order processing.'),
    ('OWNER_ORDER_CANCEL','ORDER','ORDER_ENGINE','ORDER_MUTATE','ORDER','INTERNAL_STATE','ORDER_RELOAD','order.cancel','Cancel an Order with canonical evidence and version checks.'),
    ('OWNER_INVOICE_ISSUE','INVOICE','INVOICE_ENGINE','INVOICE_MUTATE','INVOICE','INTERNAL_STATE','INVOICE_RELOAD','invoice.issue','Issue an Invoice through the canonical Invoice lifecycle.'),
    ('OWNER_INVOICE_VOID','INVOICE','INVOICE_ENGINE','INVOICE_MUTATE','INVOICE','INTERNAL_STATE','INVOICE_RELOAD','invoice.void','Void an Invoice through the canonical manager-only evidence path.'),
    ('OWNER_PAYMENT_INTENT_CREATE','PAYMENT','PAYMENT_CORE','PAYMENT_MUTATE','PAYMENT','INTERNAL_STATE','PAYMENT_REQUEST_KEY_RELOAD','payment.intent_create','Create an internal Payment Intent only; no provider charge or payment execution occurs.'),
    ('OWNER_PAYMENT_INTENT_CANCEL','PAYMENT','PAYMENT_CORE','PAYMENT_MUTATE','PAYMENT','INTERNAL_STATE','PAYMENT_RELOAD','payment.intent_cancel','Cancel an internal Payment Intent only; no provider payment execution occurs.'),
    ('OWNER_PAYMENT_REFUND_REQUEST','PAYMENT','PAYMENT_CORE','PAYMENT_REFUND_REQUEST','PAYMENT','INTERNAL_STATE','PAYMENT_REFUND_RELOAD','payment.refund_request','Create a governed refund request only; no provider refund execution occurs.'),
    ('OWNER_CAMPAIGN_TRANSITION','CAMPAIGN','MARKETING_CAMPAIGNS','CAMPAIGN_MUTATE','CAMPAIGN','INTERNAL_STATE','MARKETING_CAMPAIGN_RELOAD','marketing_campaign.transition','Transition canonical Marketing Campaign state; provider sends remain downstream gated.')
)
insert into public.tool_action_registry(
  action_key,tool_key,authority_key,contract_version,
  input_schema,output_schema,permission_key,scope_type,
  idempotency_required,idempotency_key_contract,cost_class,
  side_effect_class,approval_requirement,approval_policy_key,
  verifier_key,audit_contract,availability,required_work_packages,
  description,metadata
)
select
  a.action_key,a.tool_key,a.authority_key,1,
  '{"type":"object","properties":{},"required":[],"additionalProperties":true}'::jsonb,
  '{"type":"object","properties":{},"required":[],"additionalProperties":true}'::jsonb,
  a.permission_key,a.scope_type,
  true,'OWNER_COPILOT_PREVIEW_TOKEN_PLUS_REQUEST_KEY','NONE',
  a.side_effect_class,'REQUIRED','OWNER_COPILOT_CONFIRM',
  a.verifier_key,
  jsonb_build_object('event','OWNER_COPILOT_ACTION_EXECUTED','entityType',lower(a.scope_type),'correlationRequired',true),
  'AVAILABLE','{}'::text[],a.description,
  jsonb_build_object(
    'executionSurfaces',jsonb_build_array('OWNER_COPILOT'),
    'ownerCopilotAction',a.panel_action,
    'providerSend',false,
    'paymentExecution',false,
    'explicitConfirmationRequired',true,
    'approvalAuthority','EXPLICIT_USER_CONFIRMATION'
  )
from owner_actions a
on conflict (action_key) do update set
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


-- Owner Copilot contracts are transport-typed for the canonical /panel key=value
-- adapter. Runtime domain authorities remain responsible for deeper semantic,
-- lifecycle, permission and optimistic-version validation.
with schemas(action_key,properties,required) as (
  values
  ('OWNER_LEAD_UPDATE',
    '{"id":{"type":"string","format":"uuid"},"status":{"type":"string"},"agent_mode":{"type":"string","enum":["AUTO","PAUSED","HUMAN"]},"recommended_offer":{"type":"string"}}'::jsonb,
    '["id","status","agent_mode"]'::jsonb),
  ('OWNER_AUTOMATION_UPDATE',
    '{"id":{"type":"string","format":"uuid"},"enabled":{"type":"string","enum":["true","false"]},"priority":{"type":"string","pattern":"^[0-9]+$"}}'::jsonb,
    '["id","enabled","priority"]'::jsonb),
  ('OWNER_TASK_CREATE',
    '{"business_id":{"type":"string","format":"uuid"},"lead_id":{"type":"string","format":"uuid"},"conversation_id":{"type":"string","format":"uuid"},"deal_id":{"type":"string","format":"uuid"},"person_id":{"type":"string","format":"uuid"},"task_type":{"type":"string"},"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"},"assignee_user_id":{"type":"string","format":"uuid"},"due_at":{"type":"string","format":"date-time"},"reminder_at":{"type":"string","format":"date-time"},"request_key":{"type":"string"}}'::jsonb,
    '["title","request_key"]'::jsonb),
  ('OWNER_CUSTOMER_TASK',
    '{"business_id":{"type":"string","format":"uuid"},"person_id":{"type":"string","format":"uuid"},"lead_id":{"type":"string","format":"uuid"},"deal_id":{"type":"string","format":"uuid"},"task_type":{"type":"string"},"title":{"type":"string"},"description":{"type":"string"},"priority":{"type":"string"},"assignee_user_id":{"type":"string","format":"uuid"},"due_at":{"type":"string","format":"date-time"},"reminder_at":{"type":"string","format":"date-time"},"request_key":{"type":"string"}}'::jsonb,
    '["business_id","title","request_key"]'::jsonb),
  ('OWNER_TASK_UPDATE',
    '{"task_id":{"type":"string","format":"uuid"},"expected_version":{"type":"string","pattern":"^[1-9][0-9]*$"},"task_type":{"type":"string"},"title":{"type":"string"},"description":{"type":"string"},"status":{"type":"string"},"priority":{"type":"string"},"assignee_user_id":{"type":"string","format":"uuid"},"due_at":{"type":"string","format":"date-time"},"reminder_at":{"type":"string","format":"date-time"},"blocked_reason":{"type":"string"},"completion_note":{"type":"string"}}'::jsonb,
    '["task_id","expected_version"]'::jsonb),
  ('OWNER_DEAL_UPDATE',
    '{"deal_id":{"type":"string","format":"uuid"},"expected_version":{"type":"string","pattern":"^[1-9][0-9]*$"},"title":{"type":"string"},"stage_id":{"type":"string","format":"uuid"},"amount":{"type":"string"},"currency":{"type":"string"},"expected_close_at":{"type":"string","format":"date-time"},"owner_user_id":{"type":"string","format":"uuid"},"team_id":{"type":"string","format":"uuid"},"probability_override_bps":{"type":"string"},"lost_reason":{"type":"string"}}'::jsonb,
    '["deal_id","expected_version"]'::jsonb),
  ('OWNER_BOOKING_CONFIRM',
    '{"booking_id":{"type":"string","format":"uuid"},"request_key":{"type":"string"}}'::jsonb,
    '["booking_id","request_key"]'::jsonb),
  ('OWNER_BOOKING_RESCHEDULE',
    '{"booking_id":{"type":"string","format":"uuid"},"hold_id":{"type":"string","format":"uuid"},"reason":{"type":"string"},"request_key":{"type":"string"}}'::jsonb,
    '["booking_id","hold_id","reason","request_key"]'::jsonb),
  ('OWNER_BOOKING_CANCEL',
    '{"booking_id":{"type":"string","format":"uuid"},"reason":{"type":"string"},"request_key":{"type":"string"}}'::jsonb,
    '["booking_id","reason","request_key"]'::jsonb),
  ('OWNER_QUOTE_SUBMIT_REVIEW',
    '{"quote_id":{"type":"string","format":"uuid"},"expected_quote_version":{"type":"string","pattern":"^[1-9][0-9]*$"},"request_key":{"type":"string"}}'::jsonb,
    '["quote_id","expected_quote_version","request_key"]'::jsonb),
  ('OWNER_QUOTE_REVIEW_DECIDE',
    '{"quote_id":{"type":"string","format":"uuid"},"decision":{"type":"string","enum":["APPROVE","REJECT"]},"note":{"type":"string"},"request_key":{"type":"string"}}'::jsonb,
    '["quote_id","decision","request_key"]'::jsonb),
  ('OWNER_QUOTE_MARK_SENT',
    '{"quote_id":{"type":"string","format":"uuid"},"expected_quote_version":{"type":"string","pattern":"^[1-9][0-9]*$"},"request_key":{"type":"string"}}'::jsonb,
    '["quote_id","expected_quote_version","request_key"]'::jsonb),
  ('OWNER_ORDER_START',
    '{"order_id":{"type":"string","format":"uuid"},"expected_version":{"type":"string","pattern":"^[1-9][0-9]*$"},"request_key":{"type":"string"}}'::jsonb,
    '["order_id","expected_version","request_key"]'::jsonb),
  ('OWNER_ORDER_CANCEL',
    '{"order_id":{"type":"string","format":"uuid"},"expected_version":{"type":"string","pattern":"^[1-9][0-9]*$"},"reason":{"type":"string"},"evidence_note":{"type":"string"},"request_key":{"type":"string"}}'::jsonb,
    '["order_id","expected_version","reason","evidence_note","request_key"]'::jsonb),
  ('OWNER_INVOICE_ISSUE',
    '{"invoice_id":{"type":"string","format":"uuid"},"order_id":{"type":"string","format":"uuid"},"expected_version":{"type":"string","pattern":"^[1-9][0-9]*$"},"request_key":{"type":"string"}}'::jsonb,
    '["invoice_id","expected_version","request_key"]'::jsonb),
  ('OWNER_INVOICE_VOID',
    '{"invoice_id":{"type":"string","format":"uuid"},"order_id":{"type":"string","format":"uuid"},"expected_version":{"type":"string","pattern":"^[1-9][0-9]*$"},"reason":{"type":"string"},"evidence_note":{"type":"string"},"request_key":{"type":"string"}}'::jsonb,
    '["invoice_id","expected_version","reason","evidence_note","request_key"]'::jsonb),
  ('OWNER_PAYMENT_INTENT_CREATE',
    '{"invoice_id":{"type":"string","format":"uuid"},"amount":{"type":"string","pattern":"^[0-9]+(?:\\.[0-9]+)?$"},"request_key":{"type":"string"}}'::jsonb,
    '["invoice_id","amount","request_key"]'::jsonb),
  ('OWNER_PAYMENT_INTENT_CANCEL',
    '{"payment_intent_id":{"type":"string","format":"uuid"},"invoice_id":{"type":"string","format":"uuid"},"reason":{"type":"string"},"request_key":{"type":"string"}}'::jsonb,
    '["payment_intent_id","reason","request_key"]'::jsonb),
  ('OWNER_PAYMENT_REFUND_REQUEST',
    '{"payment_intent_id":{"type":"string","format":"uuid"},"invoice_id":{"type":"string","format":"uuid"},"amount":{"type":"string","pattern":"^[0-9]+(?:\\.[0-9]+)?$"},"reason":{"type":"string"},"evidence_note":{"type":"string"},"request_key":{"type":"string"}}'::jsonb,
    '["payment_intent_id","amount","reason","evidence_note","request_key"]'::jsonb),
  ('OWNER_CAMPAIGN_TRANSITION',
    '{"campaign_id":{"type":"string","format":"uuid"},"action":{"type":"string","enum":["SUBMIT","APPROVE","REJECT","START","PAUSE","RESUME","COMPLETE"]}}'::jsonb,
    '["campaign_id","action"]'::jsonb)
)
update public.tool_action_registry r
set input_schema=jsonb_build_object(
      'type','object',
      'properties',s.properties,
      'required',s.required,
      'additionalProperties',false
    )
from schemas s
where r.action_key=s.action_key;
