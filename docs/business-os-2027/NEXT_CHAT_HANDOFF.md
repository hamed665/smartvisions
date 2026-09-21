# Smart Visions AI Business OS 2027 — Next Chat Handoff

## Repository truth

Repository: `hamed665/smartvisions`

Business OS Phase 0 was stabilized and merged:

- PR #172: `docs: establish AI Business OS 2027 production foundation`
- merged to `main` as `144906c8f72c368851f8c4efb3e85dff8627f863`
- main CI passed;
- Cloudflare Production Deploy #261 passed on that same main SHA;
- PR #172 was documentation-only, so Growth OS execution behavior was not redesigned.

The active implementation work is:

- branch: `feat/business-os-control-plane-foundation`
- PR: **#173**
- scope: Phase 1 Control Plane Foundation
- status: implementation/review branch; **not Production**
- migration: `supabase/migrations/0068_business_os_control_plane_foundation.sql`
- Production Supabase was still applied only through migration 0067 when this work package was created.

Always verify the current PR head and CI before continuing because those are runtime repository facts and can move after this handoff is committed.

## Read before changing anything

Read in this order:

1. `AGENTS.md`
2. `docs/CURRENT_STATE.md`
3. `docs/EXECUTION_PLAYBOOK.md`
4. `docs/business-os-2027/README.md`
5. this file
6. `docs/business-os-2027/MASTER_ARCHITECTURE.md`
7. `docs/business-os-2027/IMPLEMENTATION_MAP.md`
8. `docs/business-os-2027/SERVICE_CONTRACT_STANDARD.md`
9. `docs/business-os-2027/STATE_EVENT_CATALOG.md`
10. `docs/business-os-2027/MIGRATION_FROM_GROWTH_OS.md`
11. `docs/business-os-2027/CONTROL_PLANE_FOUNDATION.md`
12. PR #173 changed files, CI, reviews and review threads
13. current `main` SHA, Production deploy evidence and Production Supabase migration state

Runtime and Production evidence outrank stale documentation or chat memory.

## Control Plane decisions already closed by Production evidence

Do not reopen these without new Production evidence:

- **REUSE** `organizations` as the canonical tenant root.
- **REUSE** Supabase `auth.users` as user identity.
- **EXTEND** `organization_members` as the organization membership/RBAC boundary.
- **REUSE** existing `businesses` as the Growth OS CRM/Hunter external/prospect business table.
- **NEW** `tenant_businesses` as the tenant-owned Business entity in the Business OS hierarchy.
- **EXTEND** existing `usage_events` rather than creating a second cost/usage ledger.
- **EXTEND** existing `audit_logs` rather than creating a second tenant audit ledger.
- No `REPLACE` decision exists in Phase 1.

Canonical hierarchy:

```text
Organization -> Brand -> Business -> Branch -> Department -> Team -> User
```

Storage compatibility note: the Business node above is `tenant_businesses`; the old `businesses` table keeps its current CRM/Hunter meaning.

## PR #173 implemented scope

The implementation branch contains:

- Brand / tenant Business / Branch / Department / Team hierarchy;
- composite `(organization_id, parent_id)` FKs for tenant-consistent hierarchy;
- lower-scope member assignments attached to existing `organization_members`;
- organization `OWNER` kept organization-wide only;
- lower-scope roles limited to `ADMIN | SALES_MANAGER | SALES_AGENT | VIEWER`;
- runtime scope resolution filtered by both tenant and `user_id`;
- configuration inheritance foundation;
- feature-flag override scopes;
- reserved safety controls excluded from ordinary config/feature override keys;
- Plans, Pricing Versions, Subscriptions and Entitlements foundation;
- formal catalog/subscription state guards;
- published pricing commercial-field immutability;
- plan entitlements mutable only while pricing version is DRAFT;
- `usage_events.usage_classification` with:
  - BILLABLE
  - NON_BILLABLE
  - SYSTEM_RETRY
  - CACHED
  - PROMOTIONAL
  - INTERNAL
- default classification `INTERNAL` so billing fails closed;
- tenant clients cannot directly set customer-billing classification;
- trusted classification mutation goes through service-role-only `classify_usage_event` and writes audit evidence;
- customer AI billing multiplier contract defaults to 4 and only BILLABLE usage is chargeable;
- audit correlation/causation and hierarchy scope;
- database audit triggers for important control-plane mutations;
- runtime contract helpers and contract/isolation tests.

## Production primitives that remain untouched

Do not duplicate or redesign these as part of Phase 1:

- CRM Business / Lead / Campaign / Conversation;
- Hunter / Google Places;
- Website Audit;
- existing multi-agent runtime;
- Context Hydrator;
- conversation memory and `sales_state`;
- `knowledge_versions`;
- `prompt_versions`;
- ZERO_COST / LIGHT / FULL routing;
- OpenAI router;
- Cost Guard;
- outbound send gate;
- WhatsApp / Email journals;
- idempotency and `agent_runs.request_key`;
- automation/follow-up primitives;
- Telegram Owner Assistant;
- Portfolio / Preview infrastructure.

## Safety state

PR #173 must not:

- apply migration 0068 to Production while still under review;
- disable Shadow Mode;
- alter the global kill switch or channel send gates;
- send real customer messages;
- change live provider credentials;
- enable broad autonomous outreach;
- add Omnichannel v2, CRM v2, Mobile, Marketplace, Booking or Agent redesign.

AI/customer/provider side effects remain governed by:

```text
Agent -> Context -> Policy -> Approval -> Action Gateway -> Execute -> Verify -> Audit
```

## Verification gate for PR #173

Before merge:

- current head SHA is known;
- lint green;
- typecheck green;
- Vitest green;
- Next build green;
- Vinext build green;
- Cloudflare scheduled-bundle verification green;
- migration reviewed;
- tenant isolation and user-scope isolation tests green;
- review threads resolved;
- no duplicate source of truth;
- no Production provider/send behavior change.

A green CI run is necessary, not a substitute for review of a migration.

## Exact next action

1. Finish CI and migration review on PR #173.
2. Mark PR #173 ready only when its exact head is green.
3. Obtain/complete review; do not merge a substantive database foundation merely because CI is green.
4. After approved merge, promote migration 0068 through the controlled migration path.
5. Verify Production schema, RLS, grants, tenant isolation, audit behavior, security advisors and performance advisors. Do not send provider messages during verification.
6. Reconcile `docs/business-os-2027/` with the proven Production state.
7. Only then start Phase 2: **Omnichannel Adapter Boundary**, reusing current WhatsApp/Email journals and the canonical send gate.

The goal remains production-grade Business OS behavior, not decorative UI or file count.
