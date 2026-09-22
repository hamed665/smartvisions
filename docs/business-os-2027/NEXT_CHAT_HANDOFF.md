# Smart Visions AI Business OS 2027 — Next Chat Handoff

## Repository truth

Repository: `hamed665/smartvisions`

Business OS status as of 2026-09-22:

- Phase 0 merged in PR #172 at `main@144906c8f72c368851f8c4efb3e85dff8627f863`.
- Phase 1 Control Plane Foundation merged in PR #173 at `main@01d74f7c8d333c017f8f4790d7bc3e4a7d1f6ca4`.
- Migration `0068_business_os_control_plane_foundation` is live in Production as migration version `20260922100907`.
- Production verification passed for schema, RLS, grants, SECURITY INVOKER boundaries, usage classification, audit correlation, runtime safety controls and empty initial Control Plane catalog data.
- Supabase security-advisor findings after 0068 are unchanged from the pre-0068 baseline.
- The 15 post-0068 unindexed-FK findings were cleared by PR #174 / Production migration `0069_business_os_control_plane_fk_indexes` version `20260922101641`.
- Phase 2 semantic adapter/status slice merged in PR #175 at `main@5d812eee8a0e15dac658247b254660ae8f09aacd`.
- Post-merge Production heartbeat was healthy, Shadow Mode remained ON, acquisition/dispatch were SKIPPED, and no Email/WhatsApp outbound send occurred in the verification window.
- Phase 2 reconciliation/provider-identity slice is active on `feat/business-os-omnichannel-reconciliation`.
- Phase 2 reuses the current canonical Email/WhatsApp send gate, provider implementations, journals, lifecycle/reconciliation evidence and Human takeover semantics.
- No customer/provider message was sent for Phase 1 verification.
- Shadow Mode remains ON.

Runtime and Production evidence outrank stale documentation or chat memory.

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
12. `docs/business-os-2027/OMNICHANNEL_ADAPTER_BOUNDARY.md`
13. current Phase 2 PR/branch diff, CI, reviews and review threads
14. current `main` SHA, Production deploy evidence and Production Supabase migration state

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
- immutable `organization_id` guards on all new tenant-owned Control Plane entities, preventing cross-tenant row transfer by UPDATE;
- runtime canonical-scope lineage validation for Brand -> Business -> Branch -> Department -> Team;
- lower-scope member assignments attached to existing `organization_members`;
- organization `OWNER` kept organization-wide only;
- lower-scope roles limited to `ADMIN | SALES_MANAGER | SALES_AGENT | VIEWER`;
- runtime scope resolution filtered by tenant, `user_id`, hierarchy scope, and fail-closed scalar ABAC attributes;
- `member_scope_assignments` reads limited to the assigned user or organization OWNER;
- configuration inheritance foundation;
- feature-flag override scopes;
- reserved safety controls excluded from ordinary config/feature override keys;
- Plans, Pricing Versions, Subscriptions and Entitlements foundation;
- ACTIVE pricing uniqueness per Plan + Currency + Billing Period lane;
- one live primary subscription per organization;
- formal catalog/subscription state guards aligned to `STATE_EVENT_CATALOG.md` (`TRIAL -> ACTIVE -> PAST_DUE -> GRACE_PERIOD -> SUSPENDED -> CANCELED | EXPIRED`, with `PAST_DUE -> ACTIVE` recovery);
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
- trusted classification mutation goes through service-role-only `classify_usage_event`, uses SECURITY INVOKER + column-scoped privilege, and writes audit evidence;
- current customer AI billing policy is constrained to exactly 4× and only BILLABLE usage is chargeable;
- audit correlation/causation and hierarchy scope;
- database audit triggers for tenant-scoped important control-plane mutations;
- global Plan/Pricing/Plan-Entitlement runtime DML is revoked until a platform-level audited catalog command exists;
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
- migration reviewed, including service-role grants and absence of new SECURITY DEFINER functions;
- tenant isolation, user-scope isolation and ABAC fail-closed tests green;
- multi-currency pricing lane and one-live-subscription invariants green;
- review threads resolved;
- no duplicate source of truth;
- no Production provider/send behavior change.

A green CI run is necessary, not a substitute for review of a migration.

## Exact next action

1. Complete exact-head CI/review for the Phase 2 reconciliation/provider-identity slice.
2. Verify approved-send still owns all provider side effects; the registry must only resolve integration identity.
3. Verify reconciliation descriptors remain pinned to durable migrations 0004, 0030 and 0067 and to `approvedSendFailureDisposition`.
4. Merge only if existing Email/WhatsApp lifecycle, approved-send, PostgreSQL smoke, Next/Vinext and Cloudflare verification remain green.
5. No Production database migration is required for this slice.
6. After merge, verify Production heartbeat/safety controls and that no architecture test generated a real provider send.
7. Continue Phase 2 with evidence-backed coexistence/reconciliation hooks only; native-provider human activity remains `UNPROVEN`.
8. Do not register future channels until their provider path, webhook verification, durable journal, idempotency and reconciliation semantics exist.

The goal remains production-grade Business OS behavior, not decorative UI or file count.
