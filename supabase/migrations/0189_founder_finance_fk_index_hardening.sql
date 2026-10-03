-- Smart Visions AI Business OS 2027
-- FOUNDER-FINANCE-UNIT-ECONOMICS-V1 post-deploy FK index hardening.
-- Keeps the existing Finance V1 authorities unchanged; adds only FK-supporting indexes
-- surfaced by the Production Supabase performance advisor.

create index if not exists company_financial_snapshots_created_by_fk_idx
  on public.company_financial_snapshots(created_by_user_id);

create index if not exists founder_finance_scenarios_created_by_fk_idx
  on public.founder_finance_scenarios(created_by_user_id);

create index if not exists founder_finance_scenarios_updated_by_fk_idx
  on public.founder_finance_scenarios(updated_by_user_id);
