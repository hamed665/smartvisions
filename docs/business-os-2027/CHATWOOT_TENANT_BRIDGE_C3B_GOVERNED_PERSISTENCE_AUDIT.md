# COMM-TENANT-BRIDGE / Slice C3B — governed persistence gap audit

Status: **AUDIT ONLY / stacked Draft; no runtime, schema or Production change**.

Baseline: PR #203 head `b147ca510747b4421fbb6a1c8b1b472d228e859e` (C3A). Repository main at audit start: `0fc5175fb8016e0e5ef2f09d5190ec8eed0f8d2f`. This document records the actual C3B boundary; it does not authorize live provisioning. Recheck current heads and Production before implementation.

## Existing contracts to reuse

- `0077_chatwoot_tenant_bridge_slice_a.sql` owns `chatwoot_bridge_command_claims`, the OWNER-only `claim_chatwoot_bridge_command`, Account mapping commands, payload fingerprint, lifecycle/version guards and command-path triggers.
- `0078_chatwoot_tenant_bridge_slice_b.sql` extends the claim table's command/entity CHECK constraints and owns User, AccountUser, Inbox and Team mapping state. It grants `service_role` SELECT/INSERT/UPDATE on these four tables, while revoking ordinary Data API access. The four tables have contract/audit triggers, but no Slice A command-path trigger or dedicated OWNER command RPC.
- C3A `lib/chatwoot/provisioning.ts` performs external Account/User/AccountUser reconciliation without writing Smart Core tables. C2 is the sole HTTP boundary. No second command ledger or provider authority is needed.

## Verified gap

The Slice A claim function checks `auth.uid()`, `chatwoot_bridge_can_manage(organization_id)` and an internal transaction-local command flag. Account mapping command RPCs compute their own SHA-256 fingerprints and update mapping + claim together. `service_role` has SELECT, not INSERT/UPDATE, on Slice A governed tables. Slice B differs: its four mapping tables grant `service_role` direct INSERT/UPDATE, with contract/audit triggers but without a claim-path trigger. C3A has no persistence orchestration. A direct Slice B write would satisfy some schema guards but would not supply the same durable command semantics as Slice A.

A second concrete mismatch: 0078 extends the `chatwoot_bridge_command_claims` table's CHECK constraints with Slice B command/entity types, but the `claim_chatwoot_bridge_command` function in 0077 still rejects those types in its hard-coded whitelist. Extending the table constraint alone does not make the claim RPC usable for Slice B. This needs a narrowly scoped, reviewed migration before using that RPC for Slice B.

An external Chatwoot mutation and the Smart Core database commit cannot be one atomic transaction. The bridge must survive a response timeout, a process crash after external creation and a DB rejection after external success without blindly creating a second resource. A claim that only says “already seen” cannot be treated as proof that the external side effect or mapping state completed.

## Approved C3B implementation boundary

1. Keep `CHATWOOT_PROVISIONING_ENABLED=false` by default. Require an authenticated, current Smart OWNER for OWNER-governed operations and verify tenant Business scope before each intended operation. Do not store or replay the OWNER's access token for background work.
2. Use the existing OWNER-governed RPCs to establish or read the mapping and its `PROVISIONING` state before external mutation. Use a stable request key and mapping ID as reconciliation identity. Replays with a different payload fail closed.
3. Before invoking C3A, check the current mapping version/status and the existing command result. If the external ID is already recorded, verify that same Account/User/membership projection; do not issue another POST.
4. When an Account result is certain, use the existing OWNER-governed Account mapping state RPC with expected version and a *new* request key. Verify persisted ID, tenant scope and status after commit. For User/AccountUser, first close the missing governed command path in a narrow migration; do not describe a non-existent OWNER RPC as implemented. Account/User IDs are int32; AccountUser ID is lossless bigint in TypeScript.
5. When the external outcome is ambiguous or persistence fails after external success, retain `PROVISIONING` or mark `DEGRADED` through an existing governed state path where one exists, or through the newly reviewed Slice B command path once implemented. Resume by exact C3A marker/email/(account,user) reconciliation. Do not infer success from the claim alone and do not blind retry Account create.
6. Recompute Smart role/scope before AccountUser mutation. OWNER alone may become Chatwoot administrator; ADMIN and sales roles become agent; VIEWER receives no membership. A stale stored role projection never grants authority.
7. Keep logs/audit bounded to request key, opaque IDs, state/version and error code. Never persist an ephemeral password, Chatwoot token, decrypted Vault material or raw upstream response.
8. Defer unattended worker execution until a source-backed, least-privilege delegation design is reviewed. A service-role write shortcut or long-lived OWNER JWT is not an acceptable substitute for a governed command.

## Required verification before promotion

- Race/replay tests for the same key and for same key/different payload.
- Crash boundaries: before external call, after external success/before DB commit, and after committed state/response timeout.
- Duplicate Account marker, conflicting User marker, changed Smart role, stale expected version and cross-tenant ID all fail closed.
- No direct `service_role` mapping mutation, no `SECURITY DEFINER`, no plaintext or browser exposure.
- PostgreSQL 17 rollback-only smoke and mock-only Chatwoot tests; no real provider/customer send or Production Chatwoot call.
- Exact-head, runner-backed CI; review threads; then dependency-order promotion. The current hosted runner has failed before step 1, so this audit is not a merge/promotion signal.

## Next implementation unit

C3B should first connect Account mapping persistence to the existing governed OWNER RPCs with crash/reconciliation tests. Separately, close the concrete Slice B gap: update the claim function whitelist to match the intended command catalog and add narrowly scoped governed User/AccountUser mutation RPCs or equivalent command enforcement before enabling their external adapter. These must remain SECURITY INVOKER, preserve the current contract/audit triggers and use the existing command-claim table. Do not introduce a parallel source of truth.


## Follow-on role-integrity gap (observed while reviewing 0078)

The `enforce_chatwoot_account_membership_contract` trigger verifies that the row's *declared* `effective_smart_role` maps OWNER to Chatwoot administrator and other supported roles to agent. It verifies that a Smart user belongs to the Organization. It does **not** compare the declared effective role with current `organization_members.role` or applicable `member_scope_assignments`. Slice B also grants direct service-role INSERT/UPDATE. Therefore a future writer must never accept the row's effective role as authority: in particular, it must not project Chatwoot administrator for an Organization member who is not currently OWNER. OWNER demotion with an already-live administrator projection also needs an ordering/reconciliation guard before live activation.

Before User/AccountUser orchestration, verify the canonical scope resolution rules from the current control plane, add a narrow governed write path that recomputes them, and add reverse role-change tests. Do not solve this by making every Organization VIEWER ineligible if a valid Business scope assignment grants an agent role; the correct effective scope needs evidence. No membership mutation is enabled by C3B Account PRs #205–#207.
