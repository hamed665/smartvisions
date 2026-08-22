create unique index if not exists website_audits_one_running_per_business_uidx
  on public.website_audits (organization_id, business_id)
  where status = 'RUNNING';
