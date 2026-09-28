-- 0143: MARKETING-CAMPAIGNS FK index hardening.
--
-- Production advisor verification after 0142 identified three composite foreign
-- keys on marketing_campaign_conversion_evidence without covering indexes.
-- Add only the missing indexes. No data mutation, seed, authority change, send
-- behavior, RLS policy or lifecycle semantics are changed.

create index if not exists marketing_campaign_conversion_deal_fk_idx
  on public.marketing_campaign_conversion_evidence(organization_id,deal_id);

create index if not exists marketing_campaign_conversion_variant_fk_idx
  on public.marketing_campaign_conversion_evidence(organization_id,message_variant_id);

create index if not exists marketing_campaign_conversion_recorded_by_fk_idx
  on public.marketing_campaign_conversion_evidence(organization_id,recorded_by_user_id);
