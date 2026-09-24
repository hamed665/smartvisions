-- 0090: targeted FK index hardening for the Chatwoot Communication Plane.
-- Source: Production Supabase unindexed_foreign_keys advisor after 0077-0089 promotion.
-- Scope is intentionally limited to currently reported Chatwoot/communication FK gaps.

create index if not exists cw_mem_rcpt_org_account_fk_idx
  on public.chatwoot_account_membership_reconciliation_receipts (organization_id, chatwoot_account_mapping_id);
create index if not exists cw_mem_rcpt_org_business_fk_idx
  on public.chatwoot_account_membership_reconciliation_receipts (organization_id, tenant_business_id);
create index if not exists cw_mem_rcpt_smart_user_fk_idx
  on public.chatwoot_account_membership_reconciliation_receipts (smart_user_id);

create index if not exists cw_membership_created_by_fk_idx
  on public.chatwoot_account_memberships (created_by_user_id);
create index if not exists cw_membership_smart_user_fk_idx
  on public.chatwoot_account_memberships (smart_user_id);
create index if not exists cw_membership_updated_by_fk_idx
  on public.chatwoot_account_memberships (updated_by_user_id);

create index if not exists cw_claim_org_created_by_fk_idx
  on public.chatwoot_bridge_command_claims (organization_id, created_by_user_id);

create index if not exists cw_inbox_branch_fk_idx
  on public.chatwoot_inbox_mappings (branch_id);
create index if not exists cw_inbox_created_by_fk_idx
  on public.chatwoot_inbox_mappings (created_by_user_id);
create index if not exists cw_inbox_org_business_fk_idx
  on public.chatwoot_inbox_mappings (organization_id, tenant_business_id);
create index if not exists cw_inbox_updated_by_fk_idx
  on public.chatwoot_inbox_mappings (updated_by_user_id);

create index if not exists cw_inbox_rcpt_org_account_fk_idx
  on public.chatwoot_inbox_reconciliation_receipts (organization_id, chatwoot_account_mapping_id);
create index if not exists cw_inbox_rcpt_org_binding_fk_idx
  on public.chatwoot_inbox_reconciliation_receipts (organization_id, communication_channel_binding_id);
create index if not exists cw_inbox_rcpt_org_business_fk_idx
  on public.chatwoot_inbox_reconciliation_receipts (organization_id, tenant_business_id);

create index if not exists cw_team_created_by_fk_idx
  on public.chatwoot_team_mappings (created_by_user_id);
create index if not exists cw_team_org_business_fk_idx
  on public.chatwoot_team_mappings (organization_id, tenant_business_id);
create index if not exists cw_team_smart_team_fk_idx
  on public.chatwoot_team_mappings (smart_team_id);
create index if not exists cw_team_updated_by_fk_idx
  on public.chatwoot_team_mappings (updated_by_user_id);

create index if not exists cw_team_rcpt_org_account_fk_idx
  on public.chatwoot_team_reconciliation_receipts (organization_id, chatwoot_account_mapping_id);
create index if not exists cw_team_rcpt_org_business_fk_idx
  on public.chatwoot_team_reconciliation_receipts (organization_id, tenant_business_id);
create index if not exists cw_team_rcpt_smart_team_fk_idx
  on public.chatwoot_team_reconciliation_receipts (smart_team_id);

create index if not exists cw_user_created_by_fk_idx
  on public.chatwoot_user_mappings (created_by_user_id);
create index if not exists cw_user_updated_by_fk_idx
  on public.chatwoot_user_mappings (updated_by_user_id);

create index if not exists cw_user_rcpt_org_business_fk_idx
  on public.chatwoot_user_reconciliation_receipts (organization_id, tenant_business_id);
create index if not exists cw_user_rcpt_smart_user_fk_idx
  on public.chatwoot_user_reconciliation_receipts (smart_user_id);

create index if not exists cw_webhook_org_inbox_fk_idx
  on public.chatwoot_webhook_events (organization_id, chatwoot_inbox_mapping_id);

create index if not exists comm_binding_branch_fk_idx
  on public.communication_channel_bindings (branch_id);
