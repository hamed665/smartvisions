-- 0164: WhatsApp onboarding Slice 1 advisor hardening.
-- Adds covering indexes for the four FK paths introduced by 0163 and an
-- explicit deny-all authenticated RLS policy so the service-role-only child
-- state remains fail closed even if table grants drift later.

create index communication_channel_setup_attempts_business_fk_idx
  on public.communication_channel_setup_attempts(organization_id, tenant_business_id);

create index communication_channel_setup_attempts_branch_fk_idx
  on public.communication_channel_setup_attempts(organization_id, branch_id);

create index communication_channel_setup_attempts_started_by_fk_idx
  on public.communication_channel_setup_attempts(organization_id, started_by_user_id);

create index communication_channel_setup_attempts_completed_by_fk_idx
  on public.communication_channel_setup_attempts(organization_id, completed_by_user_id);

create policy communication_channel_setup_attempts_authenticated_deny_all
  on public.communication_channel_setup_attempts
  for all
  to authenticated
  using (false)
  with check (false);
