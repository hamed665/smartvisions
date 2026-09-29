-- 0154: AUTO-RUNTIME FK index hardening
-- Covers the seven foreign keys introduced by 0153 that Supabase's advisor
-- reported as unindexed. Index-only migration: no runtime/data semantics change.

create index if not exists automation_run_actions_action_key_fk_idx
  on public.automation_run_actions(action_key);

create index if not exists automation_run_actions_run_fk_idx
  on public.automation_run_actions(organization_id,automation_run_id);

create index if not exists automation_runs_automation_rule_id_fk_idx
  on public.automation_runs(automation_rule_id);

create index if not exists automation_runs_automation_rule_version_id_fk_idx
  on public.automation_runs(automation_rule_version_id);

create index if not exists automation_runs_owner_fk_idx
  on public.automation_runs(organization_id,owner_user_id);

create index if not exists automation_runs_rule_version_fk_idx
  on public.automation_runs(automation_rule_id,rule_version);

create index if not exists automation_runs_trigger_key_fk_idx
  on public.automation_runs(trigger_key);
