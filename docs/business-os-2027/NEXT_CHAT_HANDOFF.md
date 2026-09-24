# Smart Visions AI Business OS 2027 — Next Chat Handoff

## Repository truth

Repository: `hamed665/smartvisions`

Business OS status as of 2026-09-23:

- Phase 0 merged in PR #172 at `main@144906c8f72c368851f8c4efb3e85dff8627f863`.
- Phase 1 Control Plane Foundation merged in PR #173 at `main@01d74f7c8d333c017f8f4790d7bc3e4a7d1f6ca4`.
- Migration `0068_business_os_control_plane_foundation` is live in Production as migration version `20260922100907`.
- Production verification passed for schema, RLS, grants, SECURITY INVOKER boundaries, usage classification, audit correlation, runtime safety controls and empty initial Control Plane catalog data.
- Supabase security-advisor findings after 0068 are unchanged from the pre-0068 baseline.
- The 15 post-0068 unindexed-FK findings were cleared by PR #174 / Production migration `0069_business_os_control_plane_fk_indexes` version `20260922101641`.
- Phase 2 semantic adapter/status slice merged in PR #175 at `main@5d812eee8a0e15dac658247b254660ae8f09aacd`.
- Post-merge Production heartbeat was healthy, Shadow Mode remained ON, acquisition/dispatch were SKIPPED, and no Email/WhatsApp outbound send occurred in the verification window.
- Phase 2 reconciliation/provider-identity slice merged in PR #176 at `main@a5396156afc58a22cdf78baf7a495fb07ec38b40`.
- Phase 2 is complete for current Production-proven Email/Resend and WhatsApp/Meta Cloud channels.
- Post-PR #176 Production verification: heartbeat `failed=0`, Shadow Mode ON, acquisition/dispatch SKIPPED, and zero Email/WhatsApp outbound rows after the merge.
- Phase 2 reuses the current canonical Email/WhatsApp send gate, provider implementations, journals, lifecycle/reconciliation evidence and Human takeover semantics.
- Phase 2 closeout merged in PR #177 at `main@e677407bce74818e5d5c8fea4643fb9706acbefb`.
- Phase 3 Slice 1 CRM Identity Foundation merged in PR #178 at `main@27e980e417ec52c64055c029b8ffa6c6c77ab961`.
- Production migration `0070_crm_identity_foundation` is live as version `20260922164110`.
- Production verification after 0070: 47 identities, 47 identity links, zero conflicts, zero cross-tenant mismatches, Shadow Mode ON, heartbeat `failed=0`, and zero Email/WhatsApp outbound rows after the merge.
- Cloudflare runtime after PR #178 is proven by Worker version `562c495f-ceeb-4021-b2d9-122ddc04021b`.
- Phase 3 still reuses `businesses` as canonical Company/Account and `leads` as the existing Lead/Opportunity foundation; it does not create a parallel CRM.
- A Person/Contact row is deliberately not fabricated from provider display names.
- Phase 3 Slice 2 Customer 360 Timeline merged in PR #179 at `main@efcf979ff15d32062b48928672a25128c521987a`.
- Production migration `0071_customer_360_timeline` is live as version `20260922202957`.
- Production Timeline evidence: 85 rows across 9 Businesses; 65 CUSTOMER / 20 INTERNAL; zero duplicate customer provider IDs; zero provider-journal standalone rows; zero customer-visible unsent rows.
- Timeline view/RPC remains SECURITY INVOKER and authenticated-only. Existing service-role restrictions on handoff/reply/operator tables were not widened.
- Cloudflare Production Deploy #332 succeeded on exact merge SHA; Production Worker version is `a78567d8-e4f9-484e-a62b-2bd8e47b8583`.
- Candidate smoke, controlled load, route verification, routed production smoke and safe API/webhook rejection smoke all passed; deployment smoke sent no provider message.
- No customer/provider message was sent for timeline architecture verification.
- Shadow Mode remains ON.
- Phase 3 Slice 3 CRM Task Foundation merged in PR #181 at `main@4c2a4d3bc78a57088f92ba8eae82542d501a37dc` and is live as Production migration `0072_crm_task_foundation` version `20260922214407`.
- Post-0072 FK cleanup merged in PR #182 at `main@1eab75f73a5ae99a973e5616bb30c09325b9a680` and is live as Production migration `0073_crm_task_fk_indexes` version `20260922214843`.
- Activity remains existing immutable evidence and Customer 360 Timeline; `crm_tasks` is only actionable human work.
- Production Task rows remained zero after migration and rollback-only smoke; no historical follow-up/handoff/reply/operator/approval rows were auto-converted to Tasks.
- Task authorization: Organization members read; OWNER/ADMIN/SALES_MANAGER manage; SALES_AGENT self-assigned only; VIEWER read-only.
- Supabase Performance Advisor has zero post-Slice-3 unindexed-FK findings after 0073; Security Advisor is unchanged baseline.
- Cloudflare runtime heartbeat after Slice 3 changed Worker version to `84d19f06-ead7-4abe-b332-ba14309629d8`, with failed=0 and acquisition/dispatch SKIPPED.
- Zero Email/WhatsApp outbound rows were created by Slice 3 verification.
- Phase 3 Slice 4 Deal/Pipeline Foundation merged in PR #184 at `main@d416fcee020bc393a45096ee1330f8378bbd8e38`; Production migration `0074_crm_deal_pipeline_foundation` is live as version `20260922225908`.
- Growth/Intent Opportunities remain acquisition evidence and are not canonical Deals.
- Deal aggregate state is OPEN/WON/LOST; Pipeline stages are configurable labels categorized OPEN/WON/LOST.
- Lead->Deal conversion is explicit/idempotent and does not mutate Lead state or auto-convert acquisition Opportunities.
- Cloudflare runtime after Slice 4 is proven by Worker version `47d22421-109e-4c1e-81e6-20bb273078e1`; latest checked heartbeat had failed=0 with acquisition/dispatch SKIPPED.
- Zero Email/WhatsApp outbound rows were created after the PR #184 merge in the verification window.
- Phase 3 Slice 5 Custom Field Governance is Production-verified: PR #188 / migration `0075_crm_custom_field_governance` version `20260923012557`; 0 definitions / 0 options / 0 values remain intentionally seeded.
- Phase 3 Slice 6 Segment Governance Gap Audit merged in PR #190 at `main@496811c80a550299c3d01d5b23c2ea9b82d491a1`.
- Phase 3 Slice 6 Dynamic Lead Segment implementation merged in PR #191 at `main@a34bfd243d2f95e2ccad9895d5a753ef902a4299`.
- Production migration `0076_crm_segment_governance` is live as version `20260923093619`.
- Segment first slice is LEAD-only + DYNAMIC-only, with immutable semantic versions, typed allowlisted predicates, RLS/RBAC, idempotent/version-checked mutations, deterministic bounded evaluation and minimized canonical audit.
- Snapshot/current-membership persistence, Deal/Business/Task/Conversation/Person Contact Segment entities, Campaign/Workflow execution, arbitrary SQL/JSONPath/PostgREST/metadata predicates and PII/SENSITIVE ordinary Custom Field predicates remain out of scope.
- Production 0076 created zero Segment data. Rollback-only Production smoke passed and left zero Segment/version/audit-fixture residue and no outbound delta.
- Post-0076 Security Advisor is unchanged; no new unindexed-FK finding was introduced.
- Implementation-runtime Cloudflare Worker checkpoint after PR #191 (before docs-only closeout) is `b6ad6482-11e1-4658-97e8-7f5d1a842318`, with failed=0 and acquisition/evidence/auto-dispatch SKIPPED.
- Zero Email/WhatsApp outbound rows were created from 0076 promotion through verification.

Runtime and Production evidence outrank stale documentation or chat memory.

## Read before changing anything

Read in this order:

1. `AGENTS.md`
2. `docs/CURRENT_STATE.md`
3. `docs/EXECUTION_PLAYBOOK.md`
4. `docs/business-os-2027/README.md`
5. this file
6. `docs/business-os-2027/MASTER_ARCHITECTURE.md`
7. `docs/business-os-2027/MASTER_PROGRAM_SECTIONS.md`
8. `docs/business-os-2027/IMPLEMENTATION_MAP.md`
9. `docs/business-os-2027/SERVICE_CONTRACT_STANDARD.md`
10. `docs/business-os-2027/STATE_EVENT_CATALOG.md`
11. `docs/business-os-2027/MIGRATION_FROM_GROWTH_OS.md`
12. `docs/business-os-2027/CONTROL_PLANE_FOUNDATION.md`
13. `docs/business-os-2027/OMNICHANNEL_ADAPTER_BOUNDARY.md`
14. `docs/business-os-2027/CUSTOMER_360_CRM_NORMALIZATION.md`
15. `docs/business-os-2027/CUSTOM_FIELD_GOVERNANCE_GAP_AUDIT.md`
16. `docs/business-os-2027/SEGMENT_GOVERNANCE_GAP_AUDIT.md`
17. `docs/business-os-2027/CHATWOOT_SOURCE_GAP_AUDIT.md`
18. `docs/business-os-2027/CHATWOOT_TENANT_BRIDGE_GAP_AUDIT.md`
19. current relevant Section/Work Package branch/PR, if any
20. current `main` SHA, Production Cloudflare Worker evidence and Production Supabase migration state

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

## Current stacked Chatwoot execution checkpoint — 2026-09-23

Dependency order:

1. PR #195 — `COMM-CHATWOOT-SOURCE` source foundation, Draft.
2. PR #196 — `COMM-TENANT-BRIDGE` gap audit, Draft and stacked on #195.
3. PR #197 — `COMM-TENANT-BRIDGE / Slice A`, Draft and stacked on #196.

Slice A is implemented but **not merged and not applied to Production**.

It currently provides:

- migration `0077_chatwoot_tenant_bridge_slice_a.sql`;
- `communication_channel_bindings`;
- `chatwoot_account_mappings`;
- immutable `chatwoot_bridge_command_claims` with SHA-256 payload fingerprints;
- OWNER-only mutation and OWNER/ADMIN infrastructure read;
- RLS plus explicit Data API grants;
- optimistic versions and formal lifecycle guards;
- hierarchy archive protection;
- PII-minimized canonical audit;
- authenticated Smart Core API/runtime wrapper;
- PostgreSQL 17 rollback-only synthetic smoke wired into CI;
- zero Chatwoot HTTP calls;
- zero provider sends.

Latest implementation design facts to preserve:

- Chatwoot v4.18.0 Account ID is integer/serial, so `chatwoot_account_id` is PostgreSQL `integer`, not bigint/string.
- old request-key replay remains durable across later lifecycle/version changes;
- the same request key with a different canonical payload fails closed;
- failed commands roll back their command claim atomically;
- command claims are idempotency infrastructure only, not a second event store;
- channel binding create/reactivation does not fabricate `last_verified_at` without external verification;
- current `integration_connections` remains Organization-scoped and unique by `(organization_id, provider, channel)`; Slice A does not silently weaken it.

Current external blocker:

GitHub-hosted Actions jobs are still failing before any step executes with `runner_id=0`, blank runner name and zero steps. This affects #195, #196 and #197. Do not weaken CI or merge around it. First verify/fix account/repository Actions allocation/budget/payment/eligibility, then rerun exact-head checks.

Production currently remains:

- migration `0076_crm_segment_governance`;
- Shadow Mode ON;
- 0 Brands;
- 0 tenant Businesses;
- 0 Chatwoot bridge tables/rows;
- no persistent real Chatwoot Account mapping.

Do not fabricate hierarchy or external Chatwoot IDs merely to demonstrate the bridge.

## Stable program cursor

Future chats must not continue by guessing a future PR number.

Use the stable roadmap in `MASTER_PROGRAM_SECTIONS.md`:

- current planned Section: `SECTION COMMUNICATION`;
- current planned Work Package: `COMM-CHATWOOT-SOURCE`;
- target: source-based Chatwoot Community Edition communication plane;
- Smart Core remains source of truth for CRM/business/customer/consent/pricing/booking/commerce/payment/billing/Knowledge/Memory/action safety;
- Chatwoot owns operational communication-plane UX/projections only;
- outbound actions initiated from Chatwoot must cross Smart Core policy/action/send-gate/reconciliation;
- Chatwoot proprietary `enterprise/` source is prohibited unless a valid license is intentionally adopted.

A work package can require any number of actual PRs. Record those PR numbers as evidence after creation; never renumber later Sections because a PR was added.

## Exact next action

1. Start from the **current canonical `main` at the time of the next session** and re-check its SHA, open PRs, CI, Production Supabase and routed Cloudflare evidence before any change. The last runtime-changing implementation checkpoint for Slice 6 is PR #191 at `a34bfd243d2f95e2ccad9895d5a753ef902a4299`; later closeout commits may be documentation-only.
2. Treat Phase 3 Slice 6 Dynamic Lead Segments as Production-verified:
   - gap audit PR #190;
   - implementation PR #191;
   - migration `0076_crm_segment_governance` -> Production version `20260923093619`;
   - implementation-runtime Worker checkpoint `b6ad6482-11e1-4658-97e8-7f5d1a842318`;
   - current routed Production Worker at latest verified heartbeat `09d84ef6-5928-429a-a926-ef4324ed99ab` (Worker timestamp `2026-09-23T09:50:07.867348Z`, heartbeat `2026-09-23T12:21:16.135625Z`);
   - latest checked heartbeat failed=0 with acquisition/evidence/auto-dispatch SKIPPED;
   - 0 Segment identities / 0 Segment versions intentionally persisted;
   - rollback-only Production smoke left zero fixture residue;
   - zero Email/WhatsApp outbound delta from promotion verification.
3. Preserve Slice 6 boundaries: LEAD-only, DYNAMIC-only, no Snapshot/current-membership table, no Campaign/Workflow/provider execution, no arbitrary query language, no PII/SENSITIVE ordinary predicates.
4. Do **not** automatically extend Segment to Deal, Business, Task, Conversation or Person Contact. Require fresh evidence.
5. `COMM-CHATWOOT-SOURCE` gap audit is complete. Implement the approved source foundation from `CHATWOOT_SOURCE_GAP_AUDIT.md`:
   - pin Chatwoot Community `v4.18.0` / commit `9f920b549c14491a4e587687a3eed5d21c6ccc7d`;
   - use a separate source/deployable Chatwoot component;
   - separate Chatwoot PostgreSQL/Redis/storage from Smart Core;
   - preserve Community/Enterprise license boundary;
   - do not activate provider channels or send customer messages;
   - if external fork/repository provisioning is unavailable through the active GitHub connection, record the dependency honestly and complete every source-lock/build/runbook artifact that can be verified without pretending the fork exists.
6. Keep `businesses` as the existing Growth OS CRM/Hunter Company/Account and `tenant_businesses` as tenant-owned Business hierarchy.
7. Do not fabricate Person Contact from provider display names.
8. Keep Shadow Mode and all canonical provider-boundary safety gates unchanged.
9. Any next implementation must repeat exact-head CI, PostgreSQL 17 migration-chain smoke, technical review, zero unresolved threads, controlled Production migration, advisor verification, rollback-only smoke, zero fabricated data, zero architecture-test provider sends and routed Worker heartbeat verification.

Runtime and Production evidence outrank stale docs or chat memory.
