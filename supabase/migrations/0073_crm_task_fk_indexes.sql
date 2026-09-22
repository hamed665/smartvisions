-- Smart Visions AI Business OS 2027
-- Post-0072 CRM Task FK coverage cleanup.
-- Cover only advisor-reported foreign keys. No runtime behavior change.

create index if not exists crm_tasks_org_created_by_fk_idx
  on public.crm_tasks(organization_id, created_by_user_id)
  where created_by_user_id is not null;

create index if not exists crm_tasks_org_completed_by_fk_idx
  on public.crm_tasks(organization_id, completed_by_user_id)
  where completed_by_user_id is not null;

create index if not exists crm_tasks_org_canceled_by_fk_idx
  on public.crm_tasks(organization_id, canceled_by_user_id)
  where canceled_by_user_id is not null;

create index if not exists crm_tasks_org_conversation_lead_fk_idx
  on public.crm_tasks(organization_id, conversation_id, lead_id)
  where conversation_id is not null;

create index if not exists crm_tasks_org_lead_business_fk_idx
  on public.crm_tasks(organization_id, lead_id, business_id)
  where lead_id is not null;
