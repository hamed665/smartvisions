alter table public.previews
  add column if not exists brief_hash text;

create unique index if not exists previews_org_lead_brief_hash_uidx
  on public.previews (organization_id, lead_id, brief_hash)
  where brief_hash is not null;
