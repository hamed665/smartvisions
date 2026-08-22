alter table public.agent_runs
  add column if not exists request_key text,
  add column if not exists result_payload jsonb;

create unique index if not exists agent_runs_org_request_key_uidx
  on public.agent_runs (organization_id, request_key)
  where request_key is not null;

comment on column public.agent_runs.request_key is
  'Caller-supplied idempotency key for one logical inbound AI processing request.';

comment on column public.agent_runs.result_payload is
  'Persisted final API result used to safely replay a completed logical request without rerunning paid AI.';
