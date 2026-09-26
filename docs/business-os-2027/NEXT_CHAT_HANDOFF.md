# Smart Visions AI Business OS 2027 — Next Chat Handoff

## Delivery model checkpoint — compact vertical slices, full scope

This program does **not** plan or report future work by PR count.

Use `SECTION -> WORK PACKAGE ID -> verified runtime gap -> implementation evidence -> acceptance gate` as the only stable continuation model.

Delivery must follow `DELIVERY_PACKAGING_STANDARD.md`:

- prefer coherent vertical slices over one-Work-Package-per-PR fragmentation;
- combine compatible audit, schema, API/runtime, authorization, tests, required UI, migration/rollback and documentation work when they share one bounded context and one safe promotion boundary;
- split only for a real independent security, migration, provider, financial, rollback or Production-verification gate;
- do not pre-schedule separate audit/hardening/index/docs PRs by habit;
- no approved Work Package may disappear to make delivery look smaller;
- completion is measured by Work Package acceptance criteria and Section exit gates, not PR volume;
- actual PR numbers are evidence only after they exist.

Owner preference is compact, high-throughput delivery, but there is no hard PR cap. Architecture, tenant isolation, safety, rollback, testing, observability and complete product scope remain non-negotiable.

This delivery-policy change was prepared from verified `main@4d1da421c9c0242398926f637bc343285cbe6f7a`; always re-read current main before the next mutation.


## Current continuation checkpoint — 2026-09-26

Use this checkpoint before every older section below, but always re-read runtime/current main first.

- Verified baseline before the current hierarchy/Inbox/Team package: `main@7a1a64d8c658ec8328956d0dd6be8eafb596ab2a` after PR #247.
- PR #247 added the first receipt-backed OWNER Chatwoot User + administrator AccountUser projection. Exact-main CI and Cloudflare Production Deploy are SUCCESS.
- Production Chatwoot remains healthy at `https://inbox.smartvisionsai.com` on the dedicated OVH VPS. Railway remains Candidate/rollback evidence only, not a Production dependency.
- Production Smart Core remains Cloudflare Workers + Supabase. Chatwoot remains only the Communication Plane.
- Production migration head remains `0090_chatwoot_fk_index_hardening`.
- Production still contains zero canonical Brand, tenant Business, Branch, Department, Team and zero Chatwoot mapping/claim rows. Do not fabricate any of these to make the UI look populated.
- Connected canonical EMAIL and WHATSAPP integration connections exist, but no Communication Plane binding has been created because no real tenant Business exists yet.
- `CHATWOOT_PLATFORM_TOKEN` is still absent and `CHATWOOT_PROVISIONING_ENABLED=false`. Keep it false. Do not paste the token into chat, Git, Supabase rows, logs or browser state.
- Shadow Mode remains ON. The latest verified deployment window created zero new outreach, WhatsApp or Email events.
- Governed runtime paths now exist for Brand/Business bootstrap, communication projection preparation, Chatwoot Account projection, OWNER User/AccountUser projection, API Inbox projection and Chatwoot Team projection.
- The current hierarchy/Inbox/Team delivery package adds OWNER-only canonical Branch -> Department -> Team bootstrap, explicit activation and ACTIVE-admin preflights before Inbox/Team mapping claims, and operator controls. It does not activate Production provisioning or create Production tenant data.
- Readiness inventory is OWNER-only and uses privileged server reads only after current OWNER authentication; global User mappings are scoped through tenant memberships rather than a nonexistent organization_id column.
- Continue at `SECTION COMMUNICATION / COMM-TENANT-BRIDGE`.
- Remaining real activation order is: evidence-backed Brand/Business -> real Branch/Department/Team -> projection preparation -> Platform token staging -> explicit activation -> Account -> OWNER User/Membership -> API Inbox/Team -> C5 scoped access closeout -> COMM-UNIFIED-INBOX.

## Superseding continuation checkpoint — 2026-09-26

Use this checkpoint before older historical notes in this file.

- Current canonical repository main: `3c3443389a5d7edfdf3230387cf16b1ec75a3a1e` after PR #236.
- Exact-main CI #1253 and Cloudflare Production Deploy #733 are green.
- Chatwoot Production source plane is live on the dedicated OVH VPS at `57.131.156.171`.
- Public communication-plane URL: `https://inbox.smartvisionsai.com`; Caddy/Let's Encrypt TLS, `/health=200` and `/app/login=200` are verified.
- Dedicated Chatwoot PostgreSQL + authenticated Redis are local to the VPS and separate from Smart Core Supabase.
- Attachments: OVH S3 `smartvisions-chatwoot-prod`, Frankfurt 1-AZ, Versioning enabled, Rails S3 roundtrip verified.
- Off-host database backup: OVH S3 `smartvisions-chatwoot-backups`, Paris 3-AZ, Versioning enabled, daily 02:17 UTC, upload/download checksum and isolated restore verified.
- First owner was provisioned privately. Account signup is disabled and public installation onboarding is blocked.
- PR #236 fixes the mobile onboarding layout and is merged at `main@3c3443389a5d7edfdf3230387cf16b1ec75a3a1e`. Exact-main CI #1253 and Chatwoot Source Image #37 are SUCCESS. Production is canonicalized to `ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-3c3443389a5d7edfdf3230387cf16b1ec75a3a1e@sha256:22cb4663d0369b6d7954b32beb1f124e1699eaa5405239899ddd617be31942d6`; prepare exited 0 and public health/login, Community-only provenance, responsive onboarding source, S3 Active Storage, Puma/Sidekiq/PostgreSQL/Redis all re-verified.
- Production runtime contains no Railway hostname/dependency. Railway `smartvisions-chatwoot-candidate` is temporary rollback evidence only and must not be destroyed without explicit destructive approval.
- Keep native Chatwoot provider channels, API Inbox, real customer/contact projection and provider sends OFF.
- Smart Core remains canonical for tenant/business/customer/CRM/provider credentials/provider send authority/safety.
- Continue at: `SECTION COMMUNICATION / COMM-TENANT-BRIDGE`.
- Never fabricate a tenant Business or Chatwoot Account merely to populate the UI. External provisioning requires evidence-backed real tenant scope.


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

Dependency stack:

1. PR #195 — Chatwoot source foundation.
2. PR #196 — Tenant Bridge audit.
3. PR #197 — Slice A mapping contract.
4. PR #198 — Slice B audit.
5. PR #199 — Slice B mapping contract.
6. PR #200 — Slice C Candidate/Reconciliation audit.
7. Slice C1 implementation branch — `feat/comm-tenant-bridge-slice-c1-vault`; create/verify its Draft PR before C2.

Slice C1 contains:

- migration `0079_chatwoot_vault_boundary.sql`;
- service_role-only SECURITY INVOKER Vault wrappers;
- exact `secretref://supabase-vault/<uuid>` format;
- server-only create/read/update client;
- pure reference parser;
- PostgreSQL 17 synthetic Vault contract bootstrap + rollback smoke;
- zero live Chatwoot calls;
- zero provider sends.

Production Vault evidence:

- `supabase_vault 0.3.1` installed;
- service_role Vault create/update/read privileges verified;
- authenticated has no Vault schema/decrypted-secret access.

External blocker remains GitHub-hosted runner allocation (`runner_id=0`, zero steps). Do not merge around it.

Production remains migration `0076_crm_segment_governance`; no Chatwoot mapping/Vault secret fixture was created for these slices.

Next implementation after C1 review is:

`COMM-TENANT-BRIDGE / Slice C2 — Chatwoot HTTP client`

C2 may be implemented with mocks and provisioning disabled by default; no Candidate/Production side effect until dependencies are green.

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


## Latest Communication Plane checkpoint — 2026-09-23 (C3B audit)

The current stacked Draft order is #195 → #196 → #197 → #198 → #199 → #200 → #201 (C1 Vault) → #202 (C2 HTTP) → #203 (C3A external Account/User/AccountUser adapter) → #204 (C3B governed persistence audit). Verify current heads and Production again at the next turn; old sections above are historical.

C3B audit: `CHATWOOT_TENANT_BRIDGE_C3B_GOVERNED_PERSISTENCE_AUDIT.md`. Slice A Account mapping writes require OWNER-authenticated governed RPCs and command claims. Slice B User/AccountUser/Inbox/Team tables allow service-role INSERT/UPDATE with contract/audit triggers but do not yet have the same command path. Migration 0078 extends claim table CHECK constraints, while the claim function in 0077 still rejects Slice B command types. Do not connect C3A by direct service-role writes or a SECURITY DEFINER shortcut. Implement the narrow governed path with crash/reconciliation evidence first.

The malformed duplicated SQL in the Slice B rollback smoke was fixed on #199 and copied to all dependent Draft branches through #204. CI remains blocked before step 1 on GitHub-hosted jobs (null steps/logs); no PR in this stack was merged and no Chatwoot migration was applied to Production.


## C3B claim catalog alignment — Draft PR #205

PR #205 is stacked on #204. Migration `0080_chatwoot_claim_catalog_alignment.sql` replaces only the existing OWNER-authenticated, SECURITY INVOKER claim function body. It aligns its 12 command and 6 entity types with 0078, enforces the command/entity pair, and rejects replay with a changed applied version. The original claim table, fingerprint, role gate and ACL remain canonical. PostgreSQL 17 rollback smoke is chained after 0079. This does not add any Slice B mapping writer or initiate Chatwoot provisioning.

Before C3B Account orchestration, close the separate concurrency gap: `create_chatwoot_account_mapping` persists a PROVISIONING mapping, but does not reserve exclusive external mutation ownership. Two concurrent requests may both list zero external Accounts and POST duplicates. Do not connect the C3A Account create call until there is a durable single-owner claim/lease and exact-marker reconciliation for crashes. No service-role direct write or SECURITY DEFINER shortcut.

Exact-head runner-backed CI and dependency review remain mandatory. Production still ends at 0076 unless fresh evidence shows otherwise.


## C3B Account external attempt — Draft PR #206

PR #206 is stacked on #205. Migration `0081_chatwoot_account_external_claim.sql` extends the same `chatwoot_bridge_command_claims` ledger with one OWNER-authenticated Account external-create attempt per mapping. The dedicated RPC returns `may_attempt_create=true` only for the first committed claim. Same-key replay returns false; another key fails closed for reconciliation. It does not call Chatwoot. The PostgreSQL 17 rollback smoke is chained after 0080.

Next unit: a Candidate-only Account orchestrator may invoke C3A only after it receives `may_attempt_create=true` from the committed owner claim. If it receives false or a timeout, reconcile by exact marker; never POST again automatically. If the process dies after claim and before HTTP, reconciliation/manual recovery is required. Preserve mapping state through existing OWNER-governed RPCs, including expected version and new request key. No real Chatwoot call or Production migration until runner-backed dependency CI and source-plane Candidate evidence pass.


## 2026-09-24 stack reconciliation — PR #206

PR #205 is merged to `main` at `f8786351d197b85ad0399d2a7b38a540c3da4c2a`. Its exact-head CI, post-merge main CI, and routed Cloudflare Production deployment all passed. Production Supabase migration state remains intentionally unchanged unless separately promoted and verified.

PR #206 is now retargeted directly to current `main` and marked ready for review. GitHub Actions runner allocation is restored. A rerun of the historical failed check reused an obsolete pull-request merge ref, so it is not valid evidence for the current base. This checkpoint commit exists to force a fresh pull-request merge ref and exact-head CI. Do not merge #206 unless that fresh run passes lint, typecheck, tests, PostgreSQL 17 migration smoke, Next build, Vinext build, and scheduled-runtime verification with no unresolved review threads.


## 2026-09-24 stack reconciliation — PR #207

PR #206 is merged to `main` at `e4c122a4e4a7bde26ee80a846b74e23dd224d7b2`. Its fresh exact-head CI, post-merge main CI, and routed Cloudflare Production deployment all passed. Production Supabase migration promotion remains a separate explicit step; no Chatwoot migration is assumed live from a Git merge alone.

PR #207 is retargeted directly to current `main` and marked ready for review. It adds a read-only exact-marker reconciler and a server-only Candidate Account orchestrator. `CHATWOOT_PROVISIONING_ENABLED` remains the fail-closed feature gate; no route or scheduler imports this orchestrator. A new one-shot claim may enter the create path, while replay/ambiguous cases reconcile by GET-only exact marker and never blindly POST again. Confirmed Account identity is persisted only through the existing OWNER-governed expected-version RPC.

The Slice B membership role-integrity finding remains a separate blocker for User/AccountUser writes: declared role is not canonical authority. PR #207 does not implement that membership writer. Do not activate Candidate provisioning or make a live Chatwoot call from this PR validation. Fresh exact-head CI and zero unresolved review threads remain mandatory before merge.


## C3B Business-wide membership role read — Draft PR #208

PR #208 is stacked on #207 and adds only a server-only Candidate read. The caller identity is verified from the authenticated Smart session first; canonical Organization membership, ACTIVE Brand/tenant Business lineage and BRAND/BUSINESS scope assignments are then read through the existing server-only Supabase service client with explicit organization/business/user filters. This avoids weakening `organization_members` RLS. A reviewed attempt to add an OWNER-read policy was reverted because current `is_org_owner` is SECURITY INVOKER and reads `organization_members` itself, making a same-table policy recursive; migration 0017 explicitly hardened that helper away from SECURITY DEFINER.

The resolver reuses `effectiveRoleForScope`, fails closed on incomplete/mismatched rows, excludes narrower branch/team assignments from a Business-wide Account role, and does not accept caller-supplied ABAC attributes. Only a canonical Organization OWNER resolves to Chatwoot administrator. ADMIN and sales roles resolve to agent; VIEWER has no membership. Mock-only tests also assert that no service client is created before caller authentication succeeds.

This remains a read-only Candidate projection, not transactional mutation authority. The same service-role read bypass must not be reused as a writer shortcut. A SECURITY INVOKER User/AccountUser writer cannot currently recompute another member's canonical Organization role through self-read-only `organization_members` RLS without either a source-backed delegation/read primitive or a security-boundary change. Treat that as the explicit C3B writer blocker: do not activate external membership, do not use direct service_role writes, and do not reintroduce SECURITY DEFINER merely to bypass the block. Exact-head runner-backed CI and review remain mandatory; preserve dependency order.

## 2026-09-24 stack reconciliation — PR #208

PR #207 is merged and Production-verified at `f7c8cf8df56abba038ac02b79ec2301800ab0b58`. PR #208 is rebuilt directly on that verified `main` with only its read-only role-resolution implementation, focused tests, and handoff evidence. It does not add AccountUser mutation authority, change RLS, invoke Chatwoot externally, or send provider/customer traffic. Fresh exact-head CI and zero unresolved review threads remain mandatory before merge.


## C3B User / AccountUser writer blocker — Draft PR #209

PR #208 review established that its read-only role resolver may safely use the existing server-only service client for exact canonical reads only after authenticating the caller and verifying current Organization OWNER authority. That does **not** solve mutation authority.

The User/AccountUser writer remains blocked because authenticated `SECURITY INVOKER` cannot read another member's `organization_members.role` under the current self-read RLS boundary. Direct `service_role` writes are forbidden, and a broad `SECURITY DEFINER` bypass would reverse prior hardening. PR #209 therefore contains no writer migration or runtime activation; it records the blocker and required reverse-role contract in `CHATWOOT_C3B_USER_MEMBERSHIP_WRITER_BLOCKER.md`.

Before writer implementation resumes, require a reviewed least-privilege transactional authorization design that recomputes canonical Organization/Brand/Business role at the mutation boundary, reuses the existing claim ledger/version/request semantics, and proves safe OWNER demotion and VIEWER membership removal. Keep external User/AccountUser membership disabled.


## C3B private canonical-role authority proof — Draft PR #210

PR #210 is stacked on #209 and does not implement the User/AccountUser writer. It records and rollback-tests a source-backed least-privilege authority primitive for the exact blocker found in #208/#209.

The proposed shape keeps the eventual mutation writer SECURITY INVOKER. Only the canonical role read primitive is SECURITY DEFINER, isolated in a non-exposed private schema, with empty search_path, fully qualified relations, exact OWNER/Organization/Business/target checks, and narrow grants. This follows current Supabase guidance for breaking RLS recursion without reverting public.is_org_owner to SECURITY DEFINER or using service_role writes.

The PostgreSQL 17 rollback-only smoke proves the intended contract: direct organization_members target-row access remains self-read under RLS; the private primitive returns only the canonical role for a current Organization OWNER; BUSINESS outranks BRAND; conditional attributes do not grant without trusted context; non-OWNER/cross-tenant/archived lineage calls fail closed; anon/service_role lack helper access; public.is_org_owner remains SECURITY INVOKER.

No migration or runtime activation is included. Do not implement or activate external User/AccountUser membership until #210 exact-head CI executes real steps successfully and the security boundary is reviewed.


## C3B reverse-role mutation interlock audit — next stacked Draft

Fresh Production review found two different IAM mutation boundaries.

`organization_members` is currently effectively read-only through normal authenticated runtime: RLS exposes only self-read SELECT, service_role has SELECT only, and no normal member-role mutation RPC exists. Future Organization member management must therefore adopt Chatwoot reverse-role safety before it becomes writable.

`member_scope_assignments` is already OWNER-mutable for SELECT/INSERT/UPDATE/DELETE and service_role has table DML privileges, but the table has no version column and no governed request-key/expected-version mutation RPC. This is the first real pre-activation reverse-role gap.

The required invariant is now explicit: external Chatwoot privilege may be equal to or weaker than Smart Core, never stronger. Promotions may commit Smart Core first and temporarily leave Chatwoot under-privileged. Demotions must be external-first: administrator -> agent must be verified before canonical OWNER demotion; membership -> VIEWER/no membership must be removed and the mapping archived before canonical authority is reduced.

BRAND assignment changes must evaluate every affected ACTIVE tenant Business. Do not perform Chatwoot HTTP inside a DB transaction. Use external claim/reconciliation first for demotions, then permit the canonical mutation only from persisted safe mapping evidence. Ambiguous external outcomes remain reconciliation-only.

Before external User/AccountUser membership activation, add a governed versioned scope-mutation boundary and prove the interlock with PostgreSQL 17 rollback + mock orchestration tests. Direct service-role IAM or Chatwoot mapping writes are not acceptable shortcuts.


## 2026-09-24 stack reconciliation — PR #211

PR #210 is merged to `main` at `563539d77a63629271c42e5d783f8a32c7de137d` after exact-head CI and routed Cloudflare Production verification of its dependency baseline. PR #211 is now retargeted directly to current `main` and contains only its reverse-role audit plus this handoff evidence.

GitHub Actions runner allocation is restored. This reconciliation commit intentionally forces a fresh pull-request CI signal against the new base. Do not merge #211 unless that exact head passes lint, typecheck, tests, PostgreSQL 17 migration smoke, Next build, Vinext build and scheduled-runtime verification with zero unresolved review threads.


## C3B governed member scope mutations — Draft PR #212

PR #212 is stacked on #211 and introduces migration `0082_member_scope_assignment_governance.sql`. It closes the direct Smart Core IAM mutation gap without activating external Chatwoot membership.

The canonical `member_scope_assignments` table now gains optimistic `version`, `last_request_key` and `updated_by_user_id` evidence. CREATE/UPDATE/DELETE use dedicated SECURITY INVOKER RPCs with server-computed payload hashes, transaction-local governed command context, durable immutable request-key claims, FOR UPDATE locking, expected-version checks and bounded audit. Assignment identity/scope is immutable after creation.

Direct `service_role` INSERT/UPDATE/DELETE on canonical scope authority is revoked; service_role remains read-only. Authenticated OWNER mutation is permitted only through the governed command context. Delete retains replay evidence in the IAM command ledger even after the assignment row is gone. PostgreSQL 17 rollback smoke covers direct-DML denial, replay, request-key conflicts, stale versions, non-OWNER denial, service-role read-only behavior, delete replay, claim immutability, audit count and parent cascade behavior.

This is deliberately not the reverse-role interlock. Migration 0078 keeps Chatwoot Account membership state service-only, so #212 does not pretend a SECURITY INVOKER IAM RPC can independently verify external projection state. External User/AccountUser membership must remain disabled. The next implementation unit must combine the reviewed private canonical-role authority with persisted Chatwoot reconciliation evidence so external demotion/removal is verified before any BRAND/BUSINESS authority reduction.

Do not promote 0082 to Production while the stacked exact-head GitHub Actions runner still fails before Step 1. No Production migration, live Chatwoot request, provider/customer send, route/scheduler activation or Shadow Mode change has been made.


## 2026-09-24 stack reconciliation — PR #212

PR #211 is merged to `main` at `0ab85137978d89dbfa9180290443fc8b4185ce7c`. PR #212 is now retargeted directly to current `main` with only its governed member-scope mutation boundary, focused PostgreSQL smoke, CI-chain update and handoff evidence.

GitHub Actions runner allocation is restored. This reconciliation commit forces fresh CI on the new base. Do not merge #212 unless this exact head passes lint, typecheck, tests, PostgreSQL 17 migration-chain smoke including 0082, Next build, Vinext build and scheduled-runtime verification, with zero unresolved review threads. External Chatwoot User/AccountUser membership remains disabled and Production migration remains a separate explicit promotion step.


CI refresh note: PR #212 is open directly against current main after PR #211 merge. This documentation-only commit exists solely to force exact-head runner-backed validation on the reconciled base; migration 0082 and runtime behavior are unchanged.


## C3B persistent private canonical-role authority — Draft PR #213

PR #213 is stacked on #212 and converts the reviewed #210 proof into migration `0083_private_chatwoot_role_authority.sql`.

The persistent boundary is intentionally narrow: `private.chatwoot_business_wide_role(org,business,target_user)` is the only SECURITY DEFINER primitive. It has empty search_path, fully qualified canonical reads, current OWNER authentication via auth.uid(), exact ACTIVE Brand/Business lineage checks, target Organization-role lookup and deterministic BUSINESS > BRAND precedence. Conditional scope assignments fail closed without trusted attributes. It returns only the effective role and contains no mutation SQL.

The helper is outside the exposed public schema. authenticated receives only private schema USAGE plus exact function EXECUTE; anon and service_role receive neither. public.is_org_owner remains SECURITY INVOKER.

The PostgreSQL 17 migration smoke runs after 0082 and creates lower-scope evidence only through the governed scope-assignment RPCs. It verifies RLS remains self-read, role precedence, conditional fail-closed behavior, owner preservation, non-owner/cross-tenant/archived-lineage denial, grants, empty search_path and absence of mutation SQL.

External User/AccountUser membership remains disabled. The next implementation unit may use this primitive inside SECURITY INVOKER governed logic, but must still enforce the reverse-role invariant from #211: external Chatwoot privilege can never remain stronger than canonical Smart Core authority.

No Production migration, live Chatwoot request, provider/customer send, route/scheduler activation or Shadow Mode change has been made.


## C3B governed User / Account membership persistence — Draft PR #214

PR #214 is stacked on #213 and introduces migration `0084_chatwoot_user_membership_governance.sql`. It adds governed Smart Core persistence for Chatwoot User and Account membership projections without activating external provisioning.

The mutation boundary remains SECURITY INVOKER and uses the reviewed private canonical-role authority from 0083. User and Account membership mappings use stable request keys, expected versions, bounded audit, canonical tenant lineage and fail-closed role checks. Direct service-role mapping writes are not treated as normal mutation authority.

Canonical Smart Core role remains authoritative. Chatwoot administrator is permitted only from canonical Organization OWNER; agent projection is constrained to supported non-VIEWER roles; VIEWER does not gain Account membership. This PR does not make a live Chatwoot request and does not authorize a caller-declared effective role.

The PostgreSQL 17 smoke verifies governed create/update/replay/version behavior, cross-tenant denial, role projection constraints, direct-DML restrictions and audit evidence.

Reverse-role safety remains a separate required boundary: an external Chatwoot administrator/member must be demoted or removed and reconciled before canonical authority can be reduced. External User/AccountUser membership therefore remains disabled until the subsequent reconciliation interlock is verified.

No Production migration, live Chatwoot request, provider/customer send, route/scheduler activation or Shadow Mode change has been made.


## C3B membership reconciliation + reverse-role interlock — Draft PR #215

PR #215 is stacked on #214 and adds migration `0085_chatwoot_membership_reconciliation_interlock.sql` plus the server-only AccountUser reconciliation runtime.

External AccountUser mutation is now reconciliation-first after ambiguity. The code performs one POST only; an ambiguous mutation is resolved by GET, never a blind second POST. Removal performs exact GET preflight, one DELETE, then GET absence verification. An ambiguous DELETE is not repeated.

Verified external state is persisted as an immutable, short-lived reconciliation receipt bound to the exact Organization, tenant Business, membership ID/version, Smart user/mapping identities, Chatwoot Account/User IDs and prior AccountUser ID. Only service_role may append/read the receipt table directly and execute the receipt-record RPC. Authenticated clients cannot mint receipts.

The #214 generic state RPC that accepted caller-declared verified Chatwoot role has been revoked. ACTIVE membership now requires a fresh server-recorded PRESENT receipt whose observed role matches the canonical 0083 projection. ARCHIVED requires a fresh server-recorded ABSENT receipt bound to the exact prior AccountUser identity. DEGRADED remains a governed non-adoption state.

BRAND/BUSINESS member-scope INSERT, UPDATE and DELETE now run a reverse-role interlock. The helper computes post-mutation Business-wide authority for every affected ACTIVE tenant Business. If any would become VIEWER while a PROVISIONING/ACTIVE/DEGRADED Chatwoot Account membership remains, the Smart Core mutation fails closed. Parent cascades remain preserved. This enforces the external-first removal rule before canonical authority reduction.

Mock tests cover GET-only reconciliation, one-delete removal, bigint identity, drift rejection and server receipt recording. PostgreSQL 17 rollback smoke covers receipt ACLs, receipt-backed activation/archive, stale receipt rejection and INSERT/UPDATE/DELETE authority-reduction blocking.

Remaining pre-activation boundaries are explicit: Organization-role mutation is still not opened; agent-to-agent canonical role changes need projection freshness work; global Chatwoot User identity activation requires final hardening; Inbox/Team governed writers and Contact/Conversation projection still remain.

No Production migration, live Chatwoot request, provider/customer send, route/scheduler activation or Shadow Mode change has been made. Keep #215 Draft until the complete dependency stack gets real runner-backed exact-head CI and review.


## C3B server-recorded Chatwoot User identity — Draft PR #216

PR #216 is stacked on #215 and adds migration `0086_chatwoot_user_reconciliation_receipt.sql` plus the server-only User reconciliation runtime.

Chatwoot User marker PATCH is now single-attempt. If its outcome is ambiguous, the adapter performs GET on the exact known Chatwoot User ID and requires exact ID + canonical email + Smart projection marker before claiming success. It does not blindly repeat PATCH.

The persistent receipt is immutable, short-lived and bound to exact Organization, ACTIVE tenant Business, global User mapping ID/version, Smart user, observed Chatwoot User ID and observed canonical email. Only service_role can append/read the receipt ledger directly and record evidence. Authenticated clients cannot mint User receipts.

The #214 caller-declared User-state RPC is revoked. ACTIVE User mapping now requires a fresh server-recorded receipt and an OWNER-authenticated SECURITY INVOKER activation command. External User ID remains immutable once adopted and the existing Chatwoot command claim ledger supplies request-key/version replay semantics. A separate governed DEGRADED command remains; live Account memberships continue to block weakening an ACTIVE global User mapping.

Runtime helpers `ensureAndRecordChatwootUser` and `reconcileAndRecordChatwootUser` record receipts only after external identity/marker proof. Mock and PostgreSQL 17 rollback tests cover ambiguous PATCH reconciliation, missing marker denial, identity drift, receipt ACL, stale version receipts, verified activation, degradation and reactivation.

No Production migration, live Chatwoot request, provider/customer send, route/scheduler activation or Shadow Mode change has been made. Keep #216 Draft until runner-backed exact-head CI and the full dependency stack are proven.


## C4 ephemeral Account-admin token boundary — Draft PR #217

PR #217 is stacked on #216 and implements the first API Inbox/Team provisioning dependency without creating either resource.

Pinned Chatwoot v4.18.0 source was re-verified: Inbox and Team CRUD are account-scoped Application API routes; Platform User token issuance is POST `/platform/api/v1/users/:id/token`; API Inbox uses Channel::Api.

The new server-only `chatwootAdminAccountRequest` verifies the authenticated caller is the current Smart Organization OWNER before any service client exists. It then performs exact read-only service checks for ACTIVE tenant Business, Account mapping, global User mapping and Account membership. The membership must link the exact mappings and remain OWNER -> Chatwoot administrator with an adopted AccountUser identity.

Only then is an ephemeral Chatwoot User access token issued. The token remains inside the call stack, is immediately consumed by the existing account-scoped HTTP client and is never persisted, logged, audited or returned.

Resource paths are suffix-only and are rejected before auth/service/token issuance if they attempt /api, /platform, scheme-relative, traversal or root-only paths. The Chatwoot Account ID always comes from the exact ACTIVE canonical mapping.

No migration, Production mutation, live Chatwoot call, provider/customer send, route/scheduler activation or Shadow Mode change has been made. Next C4 unit is API Inbox provisioning with immediate Vault capture of Channel::Api secret + hmac_token and exact ambiguous-create reconciliation.


## C4 signed API Inbox webhook receiver — Draft PR #218

PR #218 is stacked on #217 and establishes the real webhook ingress required before creating any Channel::Api Inbox.

Pinned Chatwoot v4.18.0 source was re-verified: API Inbox webhook signing uses the Channel::Api `secret`, not `hmac_token`; Chatwoot emits `X-Chatwoot-Timestamp`, `X-Chatwoot-Signature: sha256=...` over `timestamp.rawBody`, and UUID `X-Chatwoot-Delivery` evidence.

The new `POST /api/chatwoot/webhook/[mappingId]` route is JSON-only, declared- and streaming-body capped at 1 MiB, and uses Web Crypto HMAC-SHA256. The canonical Inbox mapping must be exact ACTIVE/DEGRADED Channel::Api with valid Organization/tenant Business identity. The signing secret is read only from the existing source-backed Supabase Vault reference. Payload external Inbox ID must match the canonical mapped external Inbox ID. Invalid mapping/signature/scope fails with generic 401; malformed input is 400; Vault/journal unavailability is retryable 503; valid verified evidence is journaled then fast-ACKed 200. No paid AI/provider work occurs synchronously in the webhook request.

Migration `0087_chatwoot_webhook_event_journal.sql` adds a service-only Communication Plane journal keyed by exact Inbox mapping + Chatwoot delivery UUID. It stores event type, SHA-256 of the verified body, verified JSON payload and processing lifecycle. RLS is enabled; anon/authenticated have no direct table access or recorder EXECUTE. service_role gets SELECT/INSERT/UPDATE only. Exact replay is idempotent; same delivery ID with changed hash/payload/event/scope fails closed. Signed evidence columns are immutable.

Unit tests cover HMAC/timestamp/body tampering, Vault lookup, exact Inbox binding, replay, bad signature and persistence errors. Route tests cover fast ACK, 415/413/400/401/503, actual streaming body cap and error non-leakage. PostgreSQL 17 rollback smoke covers ACL, insert/replay mismatch, wrong Inbox rejection and evidence immutability.

No Production migration, live Chatwoot call, route deployment, provider/customer send or Shadow Mode change has been made. Next C4 unit may provision Channel::Api only after generating this exact webhook URL, then capture returned `channel.secret` and `hmac_token` immediately into Vault and persist only source-backed secret references.


## C4 governed Channel::Api Inbox provisioning — Draft PR #219

PR #219 is stacked on #218 and implements the actual API Inbox provisioning path while keeping external side effects unactivated.

Pinned Chatwoot v4.18.0 source confirms Channel::Api create accepts webhook_url, hmac_mandatory and additional_attributes, and administrator Inbox responses expose secret, hmac_token, webhook_url, inbox_identifier and additional_attributes.

Provisioning writes an exact Smart projection marker containing the Inbox mapping UUID and tenant Business UUID. Every attempt performs GET marker reconciliation before POST. If absent, only one POST is attempted; ambiguous POST is followed by GET-only reconciliation. Duplicate markers fail closed.

Raw Channel::Api secret and hmac_token are captured immediately into deterministic Supabase Vault entries. They are never stored in mapping/audit/receipt JSON and never returned from the orchestration API. Only source-backed secret references proceed into Smart Core.

Migration `0088_chatwoot_api_inbox_governance.sql` adds the governed Inbox mapping command path, command-context RLS, read-only service-role mapping access, immutable service-only reconciliation receipts, receipt-backed activation and governed DEGRADED state. It reuses the existing Chatwoot command claim ledger and optimistic version/request-key semantics. Its sole SECURITY DEFINER primitive is the private owner-authenticated receipt reader.

Runtime order is: validate explicit HTTPS webhook origin -> claim/replay PROVISIONING mapping -> derive exact #218 webhook URL -> GET reconcile -> one POST if absent -> GET after ambiguous create -> Vault capture -> server receipt -> OWNER receipt-backed activation. An already complete ACTIVE mapping replays without external or Vault work.

Mock tests cover create/adopt/ambiguous reconciliation, duplicate marker denial, Vault capture, no plaintext secret leakage, Vault failure, ACTIVE replay and config failure before DB claim. PostgreSQL 17 rollback smoke covers mapping governance, receipt ACL, authenticated receipt denial, source-backed refs, receipt activation, stale receipt denial, service-role read-only mapping ACL, degradation and fresh reactivation.

`CHATWOOT_WEBHOOK_PUBLIC_ORIGIN` is declared as required configuration but is intentionally not activated in Production from this Draft.

No Production migration, live Chatwoot call, provider/customer send, route invocation or Shadow Mode change has been made.


## C4 governed Team projection — Draft PR #220

PR #220 is stacked on #219 and closes the governed Smart Team -> Chatwoot Team projection boundary.

Pinned Chatwoot v4.18.0 source confirms Team CRUD is account-scoped, Team IDs are bigint, Team names are normalized/lowercased and unique per Account, and there is no custom-attributes marker field. The projection therefore uses a deterministic collision-safe name from canonical Smart Team name plus the first 8 Smart Team UUID characters, while the exact Smart marker lives in Team description: `smartvisions:team:<team-uuid>;business:<business-uuid>;v=1`.

Migration `0089_chatwoot_team_governance.sql` adds command-context RLS/guarding for `chatwoot_team_mappings`, exact ACTIVE Team->Department->Branch->Business lineage validation, ACTIVE Account mapping requirement, immutable service-only short-lived reconciliation receipts, receipt-backed activation and governed DEGRADED transition. service_role mapping access is SELECT-only. The existing Chatwoot claim ledger supplies request-key/version replay. The only SECURITY DEFINER helper is private, OWNER-authenticated and uses empty search_path.

Server runtime performs GET /teams before every create; exact description marker is adopted, absent marker causes exactly one POST, ambiguous POST is followed by GET-only reconciliation and duplicate markers fail closed. No external Team ID is accepted from caller input. External Team bigint IDs stay lossless decimal strings and unsafe JavaScript numeric IDs fail closed.

Mock tests cover create/adopt/ambiguous reconciliation, one-POST semantics, receipt/activation arguments, duplicate marker denial, bigint safety, ACTIVE replay and scope drift. PostgreSQL 17 rollback smoke covers deterministic projected naming, direct authenticated mutation denial, service-role read-only mapping ACL, service-only receipt ACL, marker/identity conflict, receipt-backed activation, stale receipt denial, direct service mutation denial, degradation and fresh receipt reactivation.

No Production migration, live Chatwoot call, provider/customer send, route activation or Shadow Mode change has been made. Keep #220 Draft until exact-head CI is runner-backed and the stacked dependency chain is proven.


## C5 governed Chatwoot SSO login — Draft PR #221

PR #221 is stacked on #220 and implements the permissioned Chatwoot SSO boundary without adding schema.

Pinned Chatwoot v4.18.0 source confirms GET /platform/api/v1/users/:id/login returns a five-minute SSO URL at FRONTEND_URL/app/login containing canonical email and a 64-hex sso_auth_token.

The server-only adapter requires an authenticated Smart user, exact current Organization membership via self-read RLS, ACTIVE tenant Business, ACTIVE global User mapping, ACTIVE exact Account mapping and ACTIVE AccountUser membership linking those mappings. OWNER must still project to administrator; ADMIN/SALES_MANAGER/SALES_AGENT must project to agent; VIEWER and stale/cross-scope projections fail before the Platform login endpoint.

The returned URL is treated as untrusted and must match the exact configured Chatwoot origin, exact /app/login path, authenticated user's canonical email, exactly one 64-hex token and no extra query parameters/credentials/fragment.

The route GET /api/chatwoot/sso/[organizationId]/[tenantBusinessId] returns a 302 only after validation and sets private no-store/no-cache plus no-referrer. The SSO URL/token is never persisted, audited or logged. Bounded failures map to 400/401/403/503 without leaking internal details.

Mock tests cover session/org authorization ordering, VIEWER/cross-scope/inactive denial, OWNER/admin role projection, exact upstream redirect confinement and no-store redirect behavior.

No Production mutation, live Chatwoot request, provider/customer send, Shadow Mode change or CI bypass has been made. Remaining C5 work is Inbox/Team membership desired-set reconciliation from canonical Smart Core scope semantics.


## 2026-09-25 Production closeout — Chatwoot bridge through 0089

Fresh runtime evidence now supersedes the older “not Production” notes above.

Git/runtime baseline:

- main: `d1766e6b12b1784359289e0244c777b23fcd0fca`;
- main CI #1222: SUCCESS;
- Cloudflare Production deploy #702: SUCCESS, including routed Production smoke and safe webhook rejection smoke;
- Chatwoot Source Image run #17: SUCCESS on source-changing main `d336a03c231bb66de8959510e57ce775dbfb7f52`;
- pinned upstream remains Chatwoot CE v4.18.0 @ `9f920b549c14491a4e587687a3eed5d21c6ccc7d`;
- PRs #215 through #223 are merged; only stale unrelated PR #158 remains open.

Production Supabase `pkypexzpyfbikdnkrzvw` was promoted sequentially from 0076 through:

- 0077 Chatwoot Tenant Bridge Slice A;
- 0078 Tenant Bridge Slice B;
- 0079 Vault boundary;
- 0080 claim catalog alignment;
- 0081 Account external claim;
- 0082 governed member-scope assignments;
- 0083 private canonical Chatwoot role authority;
- 0084 governed User/Account membership persistence;
- 0085 membership reconciliation + reverse-role interlock;
- 0086 User reconciliation receipts;
- 0087 signed webhook event journal;
- 0088 governed API Inbox persistence;
- 0089 governed Team persistence.

Post-promotion verification:

- relevant mapping, receipt and webhook tables have RLS enabled;
- mapping tables keep service_role read-only;
- reconciliation receipts are service-only SELECT/INSERT;
- webhook journal is service-only SELECT/INSERT/UPDATE;
- anon/authenticated have no direct service-only table privileges;
- private role/receipt evidence helpers are the narrow SECURITY DEFINER boundary;
- public mutation/activation commands remain SECURITY INVOKER;
- Shadow Mode=true;
- global_kill_switch=false;
- email_paused=false;
- whatsapp_ai_paused=false;
- agents_paused=false;
- Cost Guard remains USD 25 total (OpenAI 10 / Places 5 / Email 4 / WhatsApp 3 / reserve 3; 70/85/95/100 thresholds);
- no outreach send, WhatsApp event or email event occurred during the promotion window.

Supabase advisor interpretation:

- RLS-enabled/no-policy INFO findings on Chatwoot receipt/webhook tables are intentional service-only isolation, not a request to add broad client policies;
- leaked-password protection remains a pre-existing manual Auth setting warning;
- unindexed-FK INFO findings require targeted performance hardening, not automatic blanket index creation.

Critical runtime truth:

The Chatwoot Community-safe immutable image is built/published, but Chatwoot itself is **not yet deployed as a Production communication plane**. There is no verified `inbox.smartvisionsai.com` runtime, dedicated Chatwoot PostgreSQL, Redis, object storage, Rails/Puma web, Sidekiq worker, backup/restore evidence or running-image provenance evidence.

Next cursor:

1. close this documentation reconciliation through exact-head CI;
2. provision an isolated Candidate Chatwoot runtime from the immutable source image with dedicated PostgreSQL, Redis and S3-compatible storage;
3. run `db:chatwoot_prepare` and `SMARTVISIONS_CONFIGURE.rb`;
4. prove web/login, Sidekiq/Redis, object storage and source provenance;
5. only then plan controlled Production Chatwoot runtime promotion;
6. keep provider credentials, live customer data, API Inbox provisioning and live sends disabled until the bridge/runtime release gates are explicitly satisfied;
7. keep C5 scoped-only Inbox/Team membership blocked until the source-backed mixed-Inbox access-policy problem has a coherent scope-aware solution.

Do not turn Shadow Mode off as part of runtime deployment.


## Chatwoot FK index hardening — Draft after Production 0089

Fresh Production Supabase performance advisor evidence after the 0077-0089 promotion reports 27 unindexed foreign-key paths limited to the new Chatwoot/communication tables.

This unit adds `0090_chatwoot_fk_index_hardening.sql` with only the 27 missing covering indexes reported by Production evidence. It does not alter table data, RLS, grants, provider behavior, runtime routes or Shadow Mode.

The PostgreSQL 17 smoke does not merely count index names. It walks every public foreign key on `chatwoot_%` plus `communication_channel_bindings` and fails unless a valid/ready index covers the FK columns in order.

Do not promote 0090 until exact-head CI and the prior main Production baseline are green.


## 2026-09-25 Production closeout — 0090 Chatwoot FK index hardening

PR #226 is merged. Canonical main is now `30cfaf481bc44e9aa08bc34ef75ebead2c3360c6`.

Verified gates:

- exact-main CI #1226: SUCCESS;
- Cloudflare Production deploy #706: SUCCESS, including routed Production and webhook rejection smoke;
- Production Supabase migration `0090_chatwoot_fk_index_hardening` applied successfully as version `20260924203449`;
- all 27 Production-advisor-reported Chatwoot/communication FK gaps received targeted covering indexes;
- generic catalog verification now reports `unindexed_count=0`;
- Supabase performance advisor filtered to `chatwoot_%` + `communication_channel_bindings` reports no remaining unindexed-FK findings;
- Shadow Mode=true;
- global_kill_switch=false;
- email_paused=false;
- whatsapp_ai_paused=false;
- agents_paused=false;
- no outreach send, WhatsApp event or email event occurred during promotion.

The next semantic cursor remains Chatwoot runtime deployment, not more schema invention. Source image build is verified; real Candidate/Production Chatwoot web + Sidekiq + dedicated PostgreSQL + Redis + durable object storage are still absent. Keep live API Inbox provisioning, customer imports, native Chatwoot provider connectors and provider sends disabled until the runtime release gates are proven. C5 scoped-only shared-Inbox membership remains blocked.


## Chatwoot Candidate runtime safety gate — implementation branch

The next runtime dependency is now machine-checkable before any hosting mutation.

This branch adds:

- a fail-closed Candidate environment verifier;
- an isolated non-secret Candidate env template;
- Candidate Compose with one-shot `db:chatwoot_prepare` + `SMARTVISIONS_CONFIGURE.rb`;
- web/worker startup dependency on successful prepare;
- local Rails web healthcheck;
- unit tests for Production-hostname reuse, Smart Core database reuse, floating/fake images, unresolved secrets and native provider/SMTP credentials;
- source-image workflow validation of the env template and Compose model.

The verifier requires an immutable Smart Visions GHCR digest, isolated Candidate HTTPS hostname, dedicated PostgreSQL/Redis/S3-compatible storage and no provider/Webhook activation. It does not create hosting resources, DNS, databases, Redis, buckets or secrets.

Actual Candidate runtime remains blocked on long-running host resources. A fresh read-only Railway audit confirmed the account/workspace is accessible but currently has zero projects and no Candidate runtime. No Railway resources have been created. Do not substitute Smart Core Cloudflare Workers, Smart Core Supabase schema or Vercel for the Rails + Sidekiq runtime.

After exact-head CI/source-image verification, deploy only to isolated Candidate resources. Keep Production customer data, Production provider credentials, API Inbox activation, native Chatwoot Email/WhatsApp and outbound sends disabled.


## Chatwoot Candidate image publication — verified 2026-09-25

The Candidate runtime safety-gate PR #228 is merged at `main@6d86ad068c941be8ecf73c22d14205f9254ada41`.

The exact-main Chatwoot Source Image workflow run #21 completed successfully on that SHA:

- upstream Chatwoot: `v4.18.0@9f920b549c14491a4e587687a3eed5d21c6ccc7d`;
- Smart Visions image tag: `ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-6d86ad068c941be8ecf73c22d14205f9254ada41`;
- immutable digest: `sha256:942f4e4404dac52c83a938ca5f984186d47c4fecf85f65a6064c2db0a3a92e1e`;
- provenance inspection passed; Enterprise source is absent; runtime Enterprise is disabled; provider authority remains Smart Core.

The non-secret Candidate env template now pins that exact immutable image. It remains a template: hostname, secret-store values, dedicated Candidate PostgreSQL, Redis and S3-compatible storage must be resolved before deployment. No Candidate or Production Chatwoot runtime has been created. Keep API Inbox activation, customer data, native provider credentials and outbound sends disabled; keep Shadow Mode ON. The next gate is Candidate hosting-resource provisioning and runtime verification, not another source build.


## Current Chatwoot Candidate checkpoint — 2026-09-25

- Current `main`: `4987088dc4ba2e9212e196304ccebd69073ba536`, merge commit for PR #229.
- Exact-main CI run #1234: SUCCESS.
- Cloudflare Production deploy run #714: SUCCESS on this SHA. Growth OS Release Candidate and Production Worker deploys, route verification, safe API/webhook checks, and routed smoke all passed. Production Worker version: `eda99066-ed51-4ee7-a0d7-96102152f513`; smoke returned `/login=200`, `/=307`, unknown path `=404`, each through Cloudflare. No provider send was invoked.
- Production Supabase `pkypexzpyfbikdnkrzvw`: migration head remains `0090_chatwoot_fk_index_hardening`. Fresh read-only verification: Shadow Mode ON; global Kill Switch OFF; email, WhatsApp AI, and Agent pauses OFF. Cost Guard remains $25 monthly ($10 OpenAI, $5 Google Places, $4 Email, $3 WhatsApp, $3 reserve), thresholds 70/85/95/100. Month-to-date recorded usage was $0.219241 (OpenAI $0.039241, Google Places $0.18, Email $0, WhatsApp $0). Outbound outreach and WhatsApp events in the last hour were 0; email events in the last hour were 0.
- Chatwoot Source Image run #23 succeeded on this main SHA. Image: `ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-4987088dc4ba2e9212e196304ccebd69073ba536@sha256:c6e759a89867b41eae2230f5afcad75c7a54f421225d2e46c3e865bd401058ff`. Upstream remains Chatwoot `v4.18.0@9f920b549c14491a4e587687a3eed5d21c6ccc7d`; provenance inspection passed, Enterprise source was absent, runtime Enterprise disabled, provider authority Smart Core.
- The Candidate env template remains pinned to the previously verified immutable image from Source Image run #21. No Candidate or Production Chatwoot runtime exists yet.
- A fresh Railway read-only audit confirmed account `hamed665` can read its Personal workspace; the workspace currently has 0 projects and no Chatwoot Candidate project, service, or deployment. No Railway resources were created. Keep this as a read-only checkpoint; resource provisioning requires an explicitly authorized next step.
- Continue at `SECTION COMMUNICATION / COMM-CHATWOOT-SOURCE`: isolated Candidate hosting/resource provisioning and runtime verification. Keep Shadow Mode ON and provider activity disabled.

## 2026-09-25 Chatwoot Candidate runtime handoff — superseding Railway-zero-resource notes

Semantic cursor remains:

`SECTION COMMUNICATION / COMM-CHATWOOT-SOURCE`

Current main before this docs branch is `a90961e8b329b425bf5935174432f21029e11fd6`. The older notes in this file that say Railway has no project/Candidate runtime are superseded by the runtime evidence below.

Candidate project `smartvisions-chatwoot-candidate` now contains exactly five intended services/resources lanes: dedicated PostgreSQL, dedicated Redis, one-shot prepare, Rails web and Sidekiq worker, plus one private S3-compatible Candidate bucket. The accidental duplicate prepare service created during provisioning was deleted through Railway's required 2FA gate.

All Chatwoot app services use the same immutable image digest:

`ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-4987088dc4ba2e9212e196304ccebd69073ba536@sha256:c6e759a89867b41eae2230f5afcad75c7a54f421225d2e46c3e865bd401058ff`

Verified evidence now includes:

- `db:chatwoot_prepare` + `SMARTVISIONS_CONFIGURE.rb` success;
- Puma production boot on port 3000;
- Sidekiq/Redis authenticated runtime and SidekiqAlive registration;
- Candidate S3 write/read success;
- logical DB backup to Candidate S3 and successful isolated restore verification;
- rollback-capable immutable deployment snapshots;
- no native provider credentials, API Inbox activation, customer import or outbound send.

Operational findings to preserve:

- Candidate PostgreSQL `PGDATA` must be below the volume root;
- Redis password-bearing command requires explicit shell expansion;
- do not disable `FORCE_SSL` to satisfy Railway's internal HTTP healthcheck; Railway's healthcheck was removed because it does not follow the SSL redirect;
- The current Railway Candidate account tier is not Production-sized and has no native volume backup. The verified Candidate recovery path is logical PostgreSQL backup in private S3-compatible storage.

Candidate release-gate closeout evidence now also includes a real post-deploy HTTPS smoke with TLS peer verification: `GET /health` returned 200/`{"status":"woot"}` and `GET /app/login` returned 200; Railway HTTP logs independently recorded both responses. The canonical `chatwoot-prepare` command was restored after the one-shot check.

Remaining work for this checkpoint:

1. reconcile this runtime checkpoint through exact-head CI/review/merge;
2. after merge, re-verify exact-main CI, Cloudflare Production and Production Supabase/safety controls;
3. do not create or activate Production Chatwoot without a separate explicit promotion gate.

Production provider/customer traffic remains out of scope. Shadow Mode stays ON.

## 2026-09-25 Production-promotion readiness checkpoint

Current canonical main before this documentation branch:

`9805c7dc6453d8179b4d2efcae9e5e0c2bdd3f6d`

Verified current evidence:

- exact-main CI is green;
- Cloudflare Production Deploy #727 succeeded on that exact SHA with release-candidate smoke, exact-bundle promotion, route verification, routed Production smoke and safe API/webhook rejection smoke;
- Production Supabase migration head remains `0090_chatwoot_fk_index_hardening`;
- Shadow Mode remains ON and the latest checked one-hour Email/WhatsApp/Outreach outbound counts are zero;
- Railway contains only the isolated `smartvisions-chatwoot-candidate` project; no separate Production Chatwoot project exists;
- the Candidate's five intended services remain SUCCESS;
- Production still contains zero Brands, zero tenant Businesses, zero Chatwoot mappings, zero channel bindings and zero Chatwoot webhook/reconciliation evidence.

The isolated Candidate runtime gate is complete. The next mutating action is **not** API Inbox activation or provider wiring. It is a separately authorized Production source-plane promotion governed by `CHATWOOT_PRODUCTION_PROMOTION_READINESS_AUDIT.md`.

Do not provision Production Chatwoot, attach `inbox.smartvisionsai.com`, create a real Chatwoot Account/API Inbox, move provider credentials, create customer data or weaken Shadow Mode without that separate explicit promotion authorization.

When the Production-promotion gate is authorized, first re-check current main/PRs/CI/Cloudflare/Supabase/Railway and then follow the audit sequence. Never reuse Candidate PostgreSQL/Redis/storage for Production.

