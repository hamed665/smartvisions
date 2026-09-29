-- 0156: AUTO-NOTIFICATIONS FK index hardening
-- Covers the two foreign keys introduced by 0155 that Supabase's performance
-- advisor reported as unindexed. Index-only migration: no notification/runtime
-- semantics or data mutation changes.

create index if not exists notification_inbox_source_audit_log_fk_idx
  on public.notification_inbox(source_audit_log_id);

create index if not exists notification_delivery_notification_fk_idx
  on public.notification_delivery_receipts(organization_id,notification_id);
