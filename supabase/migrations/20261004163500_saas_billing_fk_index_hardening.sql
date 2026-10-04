-- SAAS-BILLING FK index hardening
-- Covers the two direct foreign-key access paths reported by the Production
-- advisor. No billing behavior, pricing rule, tenant boundary or ledger state changes.

create index if not exists saas_billing_profiles_created_by_user_fk_idx
  on public.saas_billing_profiles(created_by_user_id)
  where created_by_user_id is not null;

create index if not exists saas_billing_statements_pricing_version_fk_idx
  on public.saas_billing_statements(pricing_version_id);
