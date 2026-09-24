# COMM-TENANT-BRIDGE / C3B — reverse-role mutation interlock audit

Status: **AUDIT / stacked Draft only. No external membership activation.**

This audit follows Draft PR #210. It closes a separate safety question: even with a trustworthy canonical-role reader, a later Smart Core role/scope change must not leave Chatwoot with a stronger live privilege than Smart Core.

## Fresh Production evidence

Production remains on migration `0076_crm_segment_governance`; no Chatwoot mapping table exists there yet and `member_scope_assignments` currently has zero rows.

Current `organization_members` boundary:

- authenticated still has legacy table-level DML grants;
- RLS is enabled;
- the only authenticated policy on the table is self-read SELECT;
- therefore authenticated INSERT/UPDATE/DELETE has no current RLS-authorized runtime path;
- `service_role` has SELECT but no INSERT/UPDATE/DELETE grant;
- the only current function that writes organization membership is the first-owner bootstrap trigger.

Consequence: Organization-role demotion is **not currently a normal runtime operation**. A future IAM/member-management path must adopt the reverse-role contract before it becomes writable.

Current `member_scope_assignments` boundary is different:

- authenticated OWNER may SELECT/INSERT/UPDATE/DELETE through current RLS policies;
- service_role has SELECT/INSERT/UPDATE/DELETE table privileges;
- the table has no optimistic `version` column;
- no dedicated governed scope-mutation command/RPC currently binds a mutation to expected version + request key.

Consequence: BRAND/BUSINESS scope mutation is the first real reverse-role boundary that must be closed before live Chatwoot membership is enabled.

## Existing Slice B weakness

Migration 0078 stores a declared `effective_smart_role` on `chatwoot_account_memberships`.

Its trigger proves structural consistency and maps declared OWNER -> administrator / ADMIN|SALES_* -> agent, but it does not recompute the target's canonical role from Smart Core.

PR #210 addresses the canonical read primitive. That is necessary but not sufficient.

A second problem remains: after a valid projection exists, a later Smart Core role/scope mutation can make the persisted/external Chatwoot role stale.

## Required invariant

At all times after external membership activation:

> external Chatwoot privilege may be equal to or weaker than current Smart Core authority, but never stronger.

Temporary under-privilege is acceptable and reconcilable.
Temporary over-privilege is not.

## Directional ordering

### Promotion

Examples:

- VIEWER/no membership -> SALES_AGENT;
- SALES_AGENT -> ADMIN;
- ADMIN -> OWNER.

Safe order:

1. commit the canonical Smart Core promotion through the governed IAM/scope path;
2. create/upgrade the Chatwoot projection;
3. verify the external AccountUser state;
4. persist fresh mapping verification.

If step 2 or 3 fails, the external user is temporarily under-privileged. That is safe and can be reconciled.

### Demotion: administrator -> agent

Example:

- OWNER -> ADMIN.

Safe order:

1. claim one external mutation attempt;
2. change Chatwoot AccountUser to `agent`;
3. GET/reconcile and verify the external role;
4. persist the verified Chatwoot mapping as agent;
5. only then commit the canonical Smart Core demotion.

If the canonical mutation fails after step 4, the user is temporarily under-privileged. That is safe.

The opposite order is forbidden because it can leave a non-OWNER with a live Chatwoot administrator projection.

### Demotion: membership -> VIEWER/no membership

Safe order:

1. claim one external membership-removal attempt;
2. remove/archive the Chatwoot AccountUser relationship;
3. reconcile absence/disabled membership;
4. archive the Smart Core Chatwoot membership mapping;
5. only then commit the canonical scope/role mutation that removes Business-wide membership.

Again, external-first creates only temporary under-privilege if the final canonical commit fails.

## Scope-specific impact

A BUSINESS assignment change affects exactly one tenant Business.

A BRAND assignment change can affect every ACTIVE tenant Business under that Brand. Therefore a governed Brand mutation must:

1. derive the complete affected ACTIVE Business set from canonical lineage;
2. compute the proposed post-mutation effective role for each Business;
3. complete every required external demotion/removal first;
4. fail the canonical Brand mutation if any affected Business remains over-privileged.

A BRANCH/DEPARTMENT/TEAM assignment does not by itself authorize an Account-wide Chatwoot membership and must never silently widen into one.

## No HTTP inside the database transaction

The database must not call Chatwoot while holding the canonical IAM transaction.

External side effects and DB commits are split deliberately:

- projection mutation/reconciliation occurs through the existing C3 adapter + claim semantics;
- the final Smart Core role/scope mutation is permitted only when persisted Chatwoot mapping evidence already proves the safe external state.

This preserves crash recovery:

- external demotion succeeded, canonical mutation failed -> under-privileged, reconcile later;
- canonical promotion succeeded, external promotion failed -> under-privileged, reconcile later;
- ambiguous external mutation -> reconciliation only, never blind replay.

## Required Smart Core interlock before activation

Direct scope DML must not remain the activation path once live Chatwoot membership exists.

A future implementation must introduce one governed scope mutation boundary with:

- authenticated current OWNER authority;
- canonical target member read;
- exact BRAND/BUSINESS lineage;
- proposed post-mutation effective-role computation;
- stable request key;
- optimistic concurrency / expected version;
- bounded audit;
- no caller-declared effective role authority;
- no direct service-role IAM mutation;
- no direct service-role Chatwoot mapping mutation.

Because `member_scope_assignments` currently has no `version` column and no governed mutation command, this is a concrete pre-activation blocker.

## Interlock rule

Once a user has any live `chatwoot_account_memberships` projection affected by a scope mutation:

- ordinary direct INSERT/UPDATE/DELETE on the relevant scope assignment must not be sufficient to change effective authority;
- the governed mutation path must prove all stronger external projections were safely downgraded/removed before allowing a demotion;
- promotions may commit canonically before external promotion;
- agent-to-agent changes still require mapping evidence reconciliation so `effective_smart_role` does not become stale evidence.

## Organization role follow-on

When Organization membership management is eventually implemented, it must use the same directional contract.

At minimum:

- any OWNER demotion must prove there is no affected live Chatwoot `administrator` projection before commit;
- a transition to VIEWER must additionally prove each Business without a surviving lower-scope grant has no live AccountUser membership;
- the future Organization-member writer needs stable request/version semantics and must not expose broad table DML as its command API.

This is deliberately future-gated because Production currently has no normal authenticated Organization-role mutation path.

## Test requirements for a future implementation

PostgreSQL 17 rollback smoke must prove:

- direct scope mutation cannot bypass the interlock when a live projection exists;
- promotion is allowed to be temporarily under-privileged;
- OWNER administrator demotion is rejected until verified external agent evidence exists;
- membership removal to VIEWER is rejected until the external membership mapping is archived;
- BRAND mutation checks every affected ACTIVE Business;
- cross-tenant mapping evidence cannot satisfy the guard;
- stale request/version evidence cannot satisfy the guard;
- replay is idempotent;
- no service-role direct mutation shortcut is introduced.

Mock orchestration tests must additionally prove:

- ambiguous Chatwoot mutation uses GET reconciliation only;
- no blind POST/PATCH/DELETE replay after an ambiguous external boundary;
- canonical demotion is never attempted before successful external verification;
- canonical promotion may precede external promotion.

## Activation gate

External Chatwoot User/AccountUser membership remains disabled until all of these are true:

1. #210 private canonical-role authority design passes real runner-backed exact-head CI;
2. scope mutation obtains a governed, versioned command boundary;
3. the reverse-role interlock above has rollback and orchestration tests;
4. the eventual User/AccountUser writer uses canonical role recomputation rather than declared role authority;
5. review threads are resolved;
6. the stacked dependency CI is green;
7. only then may Candidate external membership be considered.

No Production migration or Chatwoot/provider call is authorized by this audit.
