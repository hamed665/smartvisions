grant usage on schema public to service_role;

grant select on table public.agent_settings to service_role;
grant select on table public.growth_opportunities to service_role;
grant select on table public.portfolio_items to service_role;
grant select, insert, update on table public.previews to service_role;
grant insert on table public.preview_events to service_role;

drop index if exists public.previews_org_lead_brief_hash_uidx;
create unique index previews_org_lead_brief_hash_uidx
  on public.previews (organization_id, lead_id, brief_hash)
  where brief_hash is not null
    and status not in ('EXPIRED', 'ARCHIVED');
