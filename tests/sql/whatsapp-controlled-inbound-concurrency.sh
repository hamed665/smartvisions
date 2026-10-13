#!/usr/bin/env bash
set -euo pipefail
# Run only against the committed C4 fixture in the disposable CI database.
pids=()
for n in $(seq 2 30); do
  psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc \
    "set role service_role; select public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',id,'96890000001',true) from public.outreach_messages where idempotency_key='ci:controlled-inbound:$n';" >"/tmp/controlled-inbound-$n.log" 2>&1 &
  pids+=("$!")
done
# Contending duplicates cannot consume more than the one existing admission.
for n in $(seq 31 40); do
  psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc \
    "set role service_role; select public.verify_or_claim_whatsapp_controlled_inbound('00000000-0000-0000-0000-00000000fb01',id,'96890000001',true) from public.outreach_messages where idempotency_key='ci:controlled-inbound:1';" >"/tmp/controlled-inbound-$n.log" 2>&1 &
  pids+=("$!")
done
failure=0
for job in "${pids[@]}"; do wait "$job" || failure=1; done
if [ "$failure" -ne 0 ]; then cat /tmp/controlled-inbound-*.log; exit 1; fi
psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$ declare n integer; d integer; begin
 select count(*),count(distinct entity_id) into n,d from public.audit_logs
 where organization_id='00000000-0000-0000-0000-00000000fb01' and action='INTERNAL_TEST_LIVE_REPLY_CLAIMED';
 if n<>20 or d<>20 then raise exception 'atomic total20 cap/replay failed: %, %',n,d; end if;
end $$;
SQL
