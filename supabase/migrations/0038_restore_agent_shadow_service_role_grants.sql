grant usage on schema public to service_role;

grant select, insert, update on table public.agent_runs to service_role;
grant select, insert on table public.conversation_messages to service_role;
