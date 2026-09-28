-- 0133: CRM Support Case foreign-key index hardening.
--
-- The 0132 query indexes are tenant-first, which is correct for operator reads but
-- does not cover several FK maintenance paths whose constrained columns begin with
-- Business/Conversation or with (organization_id, actor_id).
-- Add exact FK-covering indexes and remove superseded actor-only indexes.

create index if not exists crm_support_cases_business_fk_idx
  on public.crm_support_cases(business_id);

create index if not exists crm_support_cases_conversation_fk_idx
  on public.crm_support_cases(conversation_id);

create index if not exists crm_support_cases_org_closed_by_fk_idx
  on public.crm_support_cases(organization_id, closed_by_user_id);

create index if not exists crm_support_cases_org_created_by_fk_idx
  on public.crm_support_cases(organization_id, created_by_user_id);

create index if not exists crm_support_cases_org_resolved_by_fk_idx
  on public.crm_support_cases(organization_id, resolved_by_user_id);

create index if not exists crm_support_cases_org_sla_policy_fk_idx
  on public.crm_support_cases(organization_id, sla_policy_id);

create index if not exists crm_support_cases_org_updated_by_fk_idx
  on public.crm_support_cases(organization_id, updated_by_user_id);

create index if not exists crm_support_sla_org_created_by_fk_idx
  on public.crm_support_sla_policies(organization_id, created_by_user_id);

create index if not exists crm_support_sla_org_updated_by_fk_idx
  on public.crm_support_sla_policies(organization_id, updated_by_user_id);

drop index if exists public.crm_support_cases_created_by_fk_idx;
drop index if exists public.crm_support_cases_updated_by_fk_idx;
drop index if exists public.crm_support_cases_resolved_by_fk_idx;
drop index if exists public.crm_support_cases_closed_by_fk_idx;
drop index if exists public.crm_support_sla_created_by_fk_idx;
drop index if exists public.crm_support_sla_updated_by_fk_idx;

comment on index public.crm_support_cases_business_fk_idx is
  'Covers crm_support_cases_business_id_fkey maintenance; operator reads keep their tenant-first index.';
comment on index public.crm_support_cases_conversation_fk_idx is
  'Covers crm_support_cases_conversation_id_fkey maintenance; operator reads keep their tenant-first index.';
