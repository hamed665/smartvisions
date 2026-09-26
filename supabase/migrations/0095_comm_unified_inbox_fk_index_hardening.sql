-- 0095: COMM-UNIFIED-INBOX foreign-key index hardening.
--
-- Performance-only hardening for the projection/reconciliation tables added by
-- 0093/0094. No authorization, lifecycle, provider, provisioning or send
-- semantics change here.

create index if not exists unified_inbox_projection_conversation_fk_idx
  on public.unified_inbox_conversation_projections(conversation_id);

create index if not exists unified_inbox_projection_source_event_fk_idx
  on public.unified_inbox_conversation_projections(source_event_id);

create index if not exists unified_inbox_projection_org_brand_fk_idx
  on public.unified_inbox_conversation_projections(organization_id, brand_id);

create index if not exists unified_inbox_projection_org_branch_fk_idx
  on public.unified_inbox_conversation_projections(organization_id, branch_id);

create index if not exists unified_inbox_projection_org_department_fk_idx
  on public.unified_inbox_conversation_projections(organization_id, department_id);

create index if not exists unified_inbox_projection_org_team_fk_idx
  on public.unified_inbox_conversation_projections(organization_id, team_id);

create index if not exists unified_inbox_projection_org_binding_fk_idx
  on public.unified_inbox_conversation_projections(
    organization_id,
    communication_channel_binding_id
  );

create index if not exists unified_inbox_projection_org_team_mapping_fk_idx
  on public.unified_inbox_conversation_projections(
    organization_id,
    chatwoot_team_mapping_id
  );

create index if not exists unified_inbox_reconciliation_projection_fk_idx
  on public.unified_inbox_projection_reconciliation_receipts(projection_id);

create index if not exists unified_inbox_reconciliation_conversation_fk_idx
  on public.unified_inbox_projection_reconciliation_receipts(conversation_id);
