#!/usr/bin/env bash
set -euo pipefail
pids=()
for n in $(seq 1 12); do
 psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc \
 "set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000d901',false); select public.claim_chatwoot_account_receipt_recovery(organization_id,mapping_id,mapping_version,id,origin,original_request_key) from public.chatwoot_account_reconciliation_receipts where request_key='ci-full-review';" >"/tmp/account-recovery-$n.log" 2>&1 &
 pids+=("$!")
done
failure=0
for job in "${pids[@]}"; do wait "$job" || failure=1; done
if [ "$failure" -ne 0 ]; then cat /tmp/account-recovery-*.log; exit 1; fi
claims=$(cat /tmp/account-recovery-*.log | awk '$0=="t" { n++ } END { print n+0 }')
[ "$claims" = 1 ] || { echo "Expected one recovery reservation; got $claims"; exit 1; }
psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if (select count(*) from public.chatwoot_bridge_command_claims where organization_id='00000000-0000-0000-0000-00000000d901' and command_type='RECONCILE_ACCOUNT_EXTERNAL_CREATE')<>1
 or (select count(*) from public.chatwoot_bridge_command_claims where organization_id='00000000-0000-0000-0000-00000000d901' and command_type='CLAIM_ACCOUNT_EXTERNAL_CREATE')<>1 then
  raise exception 'Concurrent recovery/original Claim invariant failed';
 end if;
end $$;
SQL
