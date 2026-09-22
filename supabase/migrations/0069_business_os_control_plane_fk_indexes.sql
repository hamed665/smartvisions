-- Business OS Control Plane Foundation
-- Post-0068 advisor cleanup: add covering indexes for every new FK reported by
-- the Supabase performance advisor. No data or runtime behavior changes.

create index if not exists audit_logs_org_brand_scope_idx
  on public.audit_logs(organization_id, brand_id);

create index if not exists audit_logs_org_business_scope_idx
  on public.audit_logs(organization_id, tenant_business_id);

create index if not exists audit_logs_org_branch_scope_idx
  on public.audit_logs(organization_id, branch_id);

create index if not exists audit_logs_org_department_scope_idx
  on public.audit_logs(organization_id, department_id);

create index if not exists audit_logs_org_team_scope_idx
  on public.audit_logs(organization_id, team_id);

create index if not exists feature_flag_overrides_updated_by_idx
  on public.feature_flag_overrides(updated_by);

create index if not exists member_scope_assignments_assigned_by_idx
  on public.member_scope_assignments(assigned_by);

create index if not exists member_scope_assignments_org_brand_fk_idx
  on public.member_scope_assignments(organization_id, brand_id);

create index if not exists member_scope_assignments_org_business_fk_idx
  on public.member_scope_assignments(organization_id, tenant_business_id);

create index if not exists member_scope_assignments_org_branch_fk_idx
  on public.member_scope_assignments(organization_id, branch_id);

create index if not exists member_scope_assignments_org_department_fk_idx
  on public.member_scope_assignments(organization_id, department_id);

create index if not exists member_scope_assignments_org_team_fk_idx
  on public.member_scope_assignments(organization_id, team_id);

create index if not exists organization_entitlement_overrides_created_by_idx
  on public.organization_entitlement_overrides(created_by);

create index if not exists scope_configuration_overrides_updated_by_idx
  on public.scope_configuration_overrides(updated_by);

create index if not exists subscriptions_pricing_version_idx
  on public.subscriptions(pricing_version_id);
