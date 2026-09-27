-- 0121: OMNI-CHANNEL-HEALTH provider rate-limit evidence lookup hardening.
-- Indexes only the existing audit stream used by the channel-health read model.
-- No new source of truth, provider behavior, credential, or safety-control change.

create index if not exists audit_logs_channel_rate_limit_health_idx
  on public.audit_logs(
    organization_id,
    (after_data->>'channel'),
    created_at desc
  )
  where action='CHANNEL_PROVIDER_RATE_LIMIT_OBSERVED';
