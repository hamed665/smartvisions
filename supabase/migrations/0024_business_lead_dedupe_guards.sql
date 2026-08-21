create unique index if not exists businesses_org_google_place_uidx
on public.businesses (organization_id, google_place_id)
where google_place_id is not null;

create unique index if not exists leads_org_business_uidx
on public.leads (organization_id, business_id)
where business_id is not null;
