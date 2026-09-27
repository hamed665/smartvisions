-- 0119: Cover Web Chat acceptance receipt foreign keys surfaced by the Production performance advisor.
-- Keeps the receipt service-only; no RLS policy or authority change.

create index if not exists web_chat_acceptance_org_binding_fk_idx
  on public.web_chat_activation_acceptance_receipts(
    organization_id, communication_channel_binding_id
  );

create index if not exists web_chat_acceptance_org_branch_fk_idx
  on public.web_chat_activation_acceptance_receipts(
    organization_id, branch_id
  );

create index if not exists web_chat_acceptance_session_fk_idx
  on public.web_chat_activation_acceptance_receipts(session_id);

create index if not exists web_chat_acceptance_inbound_event_fk_idx
  on public.web_chat_activation_acceptance_receipts(inbound_event_id);

create index if not exists web_chat_acceptance_outbound_event_fk_idx
  on public.web_chat_activation_acceptance_receipts(outbound_webhook_event_id);

create index if not exists web_chat_acceptance_widget_fk_idx
  on public.web_chat_activation_acceptance_receipts(widget_config_id);
