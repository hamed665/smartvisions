alter table public.followup_jobs
  add column if not exists channel text;

alter table public.followup_jobs
  drop constraint if exists followup_jobs_channel_check;

alter table public.followup_jobs
  add constraint followup_jobs_channel_check
  check (channel is null or channel in ('EMAIL', 'WHATSAPP'));

update public.followup_jobs as f
set channel = (
  select sc.channel
  from public.sales_conversations as sc
  where sc.organization_id = f.organization_id
    and sc.lead_id = f.lead_id
    and sc.channel in ('EMAIL', 'WHATSAPP')
  order by sc.updated_at desc nulls last
  limit 1
)
where f.channel is null;

create unique index if not exists followup_jobs_lead_channel_sequence_unique
  on public.followup_jobs(organization_id, lead_id, channel, sequence)
  where channel is not null;
