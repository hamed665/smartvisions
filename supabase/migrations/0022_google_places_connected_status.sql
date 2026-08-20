alter table public.integration_connections
  drop constraint if exists integration_connections_status_check;

alter table public.integration_connections
  add constraint integration_connections_status_check
  check (status in ('NOT_CONFIGURED','READY','CONNECTED','DEGRADED','ERROR','PAUSED'));
