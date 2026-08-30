grant usage on schema public to service_role;

grant select, insert, update, delete on table public.integration_connections to service_role;
grant select, insert, update, delete on table public.whatsapp_events to service_role;
grant select, insert, update, delete on table public.businesses to service_role;
grant select, insert, update, delete on table public.leads to service_role;
grant select, insert, update, delete on table public.sales_conversations to service_role;
grant select, insert, update, delete on table public.outreach_messages to service_role;
grant select, insert, update, delete on table public.followup_jobs to service_role;
