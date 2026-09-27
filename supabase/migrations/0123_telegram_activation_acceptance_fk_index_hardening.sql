-- 0123: Cover Telegram activation acceptance composite foreign keys.
-- Keeps acceptance evidence service-only; no channel activation or provider send.

create index telegram_acceptance_org_binding_fk_idx
  on public.telegram_activation_acceptance_receipts(
    organization_id,communication_channel_binding_id
  );

create index telegram_acceptance_org_event_fk_idx
  on public.telegram_activation_acceptance_receipts(
    organization_id,inbound_event_id
  );

create index telegram_acceptance_org_branch_fk_idx
  on public.telegram_activation_acceptance_receipts(
    organization_id,branch_id
  );
