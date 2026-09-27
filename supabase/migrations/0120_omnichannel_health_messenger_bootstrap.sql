-- 0120: OMNI-CHANNEL-HEALTH Messenger configuration bootstrap.
-- Creates only the missing organization-level configuration row.
-- It does not enable Messenger, persist credentials, create a tenant binding,
-- activate an adapter, call Meta, or change any safety control.

insert into public.integration_connections(
  organization_id,
  provider,
  channel,
  enabled,
  status,
  account_label,
  config
)
select
  o.id,
  'META',
  'FACEBOOK_MESSENGER',
  false,
  'NOT_CONFIGURED',
  'Facebook Messenger',
  '{}'::jsonb
from public.organizations o
on conflict (organization_id,provider,channel) do nothing;
