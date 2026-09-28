# Smart Visions AI Business OS 2027 — Master Program Sections

## Product completeness and customer connection requirements

Read [PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md](PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md) before selecting or closing a Business OS delivery package. It preserves the owner-requested full-product scope, simple official customer connection journey, verified multi-business WhatsApp gaps, detailed acceptance gates and the complete Work Package coverage index. It extends acceptance under this roadmap; it does not replace architecture, renumber Work Packages or authorize provider activation. Keep its requirement dispositions and the canonical handoff traceable to implementation and Production evidence.


## Purpose

This document is the stable execution map for completing Smart Visions AI Business OS 2027.

It deliberately **does not use future GitHub PR numbers as roadmap identifiers**. PR numbers are implementation evidence only. They are not phases, milestones, or sequencing keys.

A work package may require one PR, several PRs, a follow-up hardening PR, or an emergency correction. None of those events renumber the program.

## Continuation rule

Future sessions must continue by:

`SECTION -> WORK PACKAGE ID -> verified runtime gap -> implementation evidence`

Never continue by guessing "the next PR number".

Example:

`SECTION COMMUNICATION -> COMM-CHATWOOT-SOURCE`

may eventually be implemented by PR #194, #195 and #198. The stable program identity remains `COMM-CHATWOOT-SOURCE`.

## Source-of-truth priority

1. current routed Production runtime evidence;
2. Production database/provider state;
3. current `main` code at exact SHA;
4. `docs/CURRENT_STATE.md`;
5. this program map and the architecture contracts;
6. PR numbers and historical chat context.

Runtime evidence always wins over stale documentation.

## Current completed baseline

The following foundations are already Production-verified and are not recreated by this program:

- architecture/service/state/event contracts;
- SaaS Control Plane foundation;
- Omnichannel semantic adapter boundary for current Email/WhatsApp providers;
- CRM Identity Foundation;
- Customer 360 Timeline;
- CRM Task Foundation;
- Deal/Pipeline Foundation;
- Custom Field Governance;
- governed Dynamic Lead Segments.

The current planned continuation cursor is:

`SECTION COMMUNICATION / COMM-TENANT-BRIDGE`

This cursor is a planned dependency target, not permission to skip fresh main/Production verification before coding.

---

# SECTION COMMUNICATION — Source-based communication plane

## Goal

Use Chatwoot Community Edition source code as the operational communication plane and unified inbox while preserving Smart Visions Core as the business/system source of truth.

### COMM-CHATWOOT-SOURCE — Community source foundation

Status: **PRODUCTION SOURCE PLANE DEPLOYED AND RELEASE-VERIFIED; BRIDGE ACTIVATION REMAINS SEPARATELY GATED**

Production-promotion readiness and stop conditions: `CHATWOOT_PRODUCTION_PROMOTION_READINESS_AUDIT.md`.

Approved upstream baseline:

- `v4.18.0`
- commit `9f920b549c14491a4e587687a3eed5d21c6ccc7d`

Approved first provider projection: Chatwoot `Channel::Api`, with provider send authority retained by Smart Core.

Detailed decisions: `CHATWOOT_SOURCE_GAP_AUDIT.md`.

2026-09-25 evidence: pinned v4.18.0 source build, Community/Enterprise license guard, enterprise-tree removal, immutable provenance inspection and GHCR publish all succeeded in Chatwoot Source Image run #17. This does **not** satisfy Production runtime completion: no verified public Chatwoot origin, dedicated Chatwoot PostgreSQL, Redis, durable object storage, web/worker health or backup/rollback evidence exists yet.

2026-09-25 Candidate runtime update: an isolated Railway Candidate now has dedicated Chatwoot PostgreSQL/Redis/private S3-compatible storage plus prepare/web/Sidekiq services on the immutable Community-safe digest. Database prepare/configure, Puma boot, Sidekiq/Redis, storage write/read, logical backup/isolated-restore, TLS-verified public `/health=200` with `{"status":"woot"}`, and public `/app/login=200` evidence are verified. This is Candidate evidence only, not Production completion; Production sizing/backup/public-route promotion remains separately gated.


2026-09-26 Production closeout: a separate Chatwoot Production source plane is live on the OVH VPS at `57.131.156.171` with dedicated PostgreSQL/Redis, OVH S3 attachment storage, Paris 3-AZ off-host DB backup with verified restore, Caddy/Let's Encrypt TLS, and public `https://inbox.smartvisionsai.com` health/login. PR #236 corrected the mobile onboarding layout and exact-head CI/source-image verification passed. The live runtime remains Community-only and provider authority remains Smart Core. Railway is no longer a Production dependency and remains only a temporary Candidate rollback asset pending explicit decommission approval. API Inbox/provider/customer activation remains off and continues under `COMM-TENANT-BRIDGE`.

Deliver:

- an upstream-tracked fork/build of Chatwoot Community Edition source;
- exact upstream version/commit pinning;
- reproducible source build and deployment;
- Smart Visions branding/theme/custom shell where permitted;
- upstream-update/rebase policy;
- source-license inventory and NOTICE preservation;
- health/version evidence;
- environment separation for Development / Candidate / Production;
- no dependency on proprietary `enterprise/` code unless Smart Visions has a valid license for that use.

License boundary:

Upstream references to re-verify at implementation time:

- Community/root license: https://github.com/chatwoot/chatwoot/blob/develop/LICENSE
- Enterprise license: https://github.com/chatwoot/chatwoot/blob/develop/enterprise/LICENSE

Rules:

- Chatwoot code outside the repository's `enterprise/` directory is used under its MIT license;
- proprietary `enterprise/` source is not copied, vendored, redistributed, or used in Production without the required Chatwoot license;
- features needed by Smart Visions that exist only in Chatwoot Enterprise are implemented independently in Smart Core/Community-safe code unless a valid Enterprise subscription/license is intentionally adopted.

Repository topology rule:

- do not dump thousands of Chatwoot upstream files into `hamed665/smartvisions` merely to claim integration;
- maintain Chatwoot as an upstream-trackable source fork/deployable component;
- this repository owns Smart Core contracts, mappings, policies, APIs and evidence;
- exact fork repository/deployment identity becomes canonical only after it actually exists and is verified.

### COMM-TENANT-BRIDGE — Tenant/business/user mapping

Slice C1 status: **MERGED AND PRODUCTION-PROMOTED; VAULT BOUNDARY VERIFIED**

C1 uses the already-installed Supabase Vault through service-role-only SECURITY INVOKER wrappers. Dynamic API Inbox secrets remain encrypted in Vault and mapping rows keep only `secretref://supabase-vault/<uuid>` references. No live Chatwoot call occurs in C1.


Slice B status: **MERGED; PRODUCTION SCHEMA PROMOTED THROUGH 0089; LIVE EXTERNAL PROVISIONING NOT ACTIVATED**

Slice B adds server-only User/AccountUser/API-Inbox/Team projection contracts. It preserves OWNER as the only first-version Chatwoot administrator; ADMIN and sales roles project to agent, and VIEWER receives no Chatwoot membership. Live Chatwoot provisioning remains deferred to the Candidate adapter slice.


Status: **TENANT BRIDGE IMPLEMENTATION BOUNDARY CLOSED; NATIVE CHATWOOT IS BUSINESS-WIDE ONLY; PRODUCTION ACTIVATION REMAINS DORMANT UNTIL REAL TENANT + TOKEN + EXPLICIT ACTIVATION**

Detailed decisions: `CHATWOOT_TENANT_BRIDGE_GAP_AUDIT.md`.

Production reconciliation on 2026-09-25 supersedes the historical stacked-Draft blocker text. The source foundation and bridge stack were merged with runner-backed exact-head CI; Production Supabase now carries migrations 0077 through 0089, including Vault boundary, governed User/Account membership, reconciliation receipts/interlocks, signed API Inbox webhook journal, governed API Inbox persistence and governed Team persistence. External Chatwoot provisioning remains unactivated until a real Candidate/Production Chatwoot runtime exists and passes the release gates.

Current implementation checkpoint: Smart Core now has fail-closed Production activation contracts, governed Brand/Business bootstrap, OWNER-only canonical Branch/Department/Team hierarchy bootstrap, tenant projection preparation, Account external orchestration, OWNER User/AccountUser projection, guarded API Inbox/Chatwoot Team execution adapters, source-backed Inbox/Team member desired-set reconciliation for verified Business-wide AccountUsers, and verified external-first BRANCH/DEPARTMENT/TEAM authority reduction. Scoped reconciliation and reduction both use GET -> at most one replace-set PATCH -> GET verification; ambiguous PATCH outcomes are GET-reconciliation-only. Production migrations 0091 and 0092 are live. C5 policy is closed: native Chatwoot AccountUser/SSO requires live Business-wide non-VIEWER Smart Core authority. Scoped-only staff are intentionally not projected into native Chatwoot because Community v4.18.0 exposes Account-wide Contact surfaces to ordinary agents; those users move to the Smart Core scope-aware unified inbox instead. None of the external provisioning paths can execute while Production provisioning is disabled or Platform token/real tenant prerequisites are absent. Real tenant activation remains an operational release gate, not a reason to widen the native Chatwoot security boundary.

The audit also closes these key decisions:

- one Chatwoot Account per canonical `tenant_business`;
- never map Growth/Hunter `public.businesses` as tenant Businesses;
- explicit `communication_channel_bindings` are required because current `integration_connections` is Organization-scoped;
- Smart OWNER/ADMIN -> Chatwoot administrator;
- Smart SALES_MANAGER/SALES_AGENT -> Chatwoot agent;
- Smart VIEWER -> no first-version Chatwoot membership because Community has no read-only AccountUser role;
- Contacts remain projections over canonical identity evidence;
- historical Organization-scoped conversations are not assigned to a tenant Business without evidence.

Deliver deterministic mapping between:

- Organization;
- tenant Business;
- Branch where applicable;
- Smart Visions user/staff identity;
- Chatwoot Account;
- Inbox;
- Team;
- Agent;
- Contact projection;
- Conversation projection.

Requirements:

- tenant isolation;
- mapping version/audit evidence;
- no cross-tenant Chatwoot account/inbox reuse;
- fail closed on ambiguous mapping;
- no provider display name fabricated as canonical Person/Customer.

### COMM-UNIFIED-INBOX — Operational inbox

Deliver:

- unified conversation list;
- inbox/team assignment;
- agent assignment;
- internal notes;
- operational labels/tags that remain communication-plane metadata;
- attachments/media;
- search;
- unread state;
- agent presence/availability;
- conversation status;
- transfer/escalation;
- role-aware views.

Chatwoot owns communication-plane UI state only. It does not become the CRM, pricing, payment, booking, billing, memory or consent source of truth.

### COMM-HUMAN-AI — Human/AI coexistence

Deliver:

- Human > AI priority;
- human takeover;
- AI pause/resume;
- explicit hand-back;
- simultaneous Smart Visions and native-provider activity reconciliation;
- conflict prevention when a human is typing/replying;
- attribution of Human vs AI vs native-provider activity;
- audited control transitions.

### COMM-ACTION-BRIDGE — Safe outbound action path

A reply composed in Chatwoot must not create a bypass around Smart Visions safety.

Canonical path:

`Chatwoot UI -> Smart Core Action Request -> Policy -> Approval if required -> Canonical Send Gate -> Provider -> Verification/Reconciliation -> Chatwoot projection -> Audit`

Requirements:

- no direct provider send bypass for Smart Visions-controlled channels;
- idempotent request keys;
- canonical recipient re-read at provider boundary;
- Shadow Mode / Kill Switch / DNC / suppression / consent / reply-window / Cost Guard enforcement;
- ambiguous provider acceptance goes to reconciliation, not blind retry.

### COMM-RECONCILIATION — Message/event reconciliation

Deliver:

- inbound webhook mapping;
- outbound result mapping;
- provider message identity;
- read/delivery/failure states;
- dedupe;
- ordering tolerance;
- late-event handling;
- native-app reply evidence where provider APIs permit it;
- projection repair/replay;
- no second canonical provider journal.

### COMM-OPERATIONS — Chatwoot lifecycle operations

Deliver:

- backups;
- upgrade procedure;
- database migration procedure;
- rollback;
- observability;
- security patch cadence;
- capacity baseline;
- source fork drift reporting;
- deployment/runbook evidence.

## Exit criteria

Communication section is complete when Chatwoot source is truly deployed and used as the unified human communication plane without owning Smart Core business truth or bypassing Smart Core action safety.

---

# SECTION OMNICHANNEL — Channel expansion

## OMNI-META-SOCIAL

- Instagram Direct;
- Facebook Messenger;
- Meta account/page identity mapping;
- webhook verification;
- delivery/read status;
- human/native coexistence;
- canonical send gate.

## OMNI-TELEGRAM

- customer Telegram messaging where appropriate;
- keep current Owner Assistant/control plane separate from customer conversation identity;
- inbound/outbound reconciliation;
- media support.

### Current evidence checkpoint — 2026-09-27

- **Customer Telegram messaging — IMPLEMENTED / PRODUCTION_VERIFIED (controlled path):** PR #298 extends the existing tenant/business/Branch communication binding, Vault credential, CRM identity and canonical conversation/projection authorities; it does not introduce a second CRM, Conversation store, queue, Chatwoot integration or Owner Bot authority.
- **Owner/customer separation — IMPLEMENTED / PRODUCTION_VERIFIED:** customer routing and provider code use binding-scoped tenant credentials and never reuse the Owner Assistant's global Bot credential, owner authorization or owner command journal.
- **Inbound/replay/reconciliation — IMPLEMENTED / PRODUCTION_VERIFIED (fail-closed path):** binding-scoped secret-token webhook authentication, `update_id` idempotency, canonical identity resolution, Chatwoot projection and explicit reconciliation states are deployed. Unknown/missing binding evidence fails closed.
- **Outbound safety/reconciliation — IMPLEMENTED / PRODUCTION_VERIFIED (controlled path):** Telegram customer outbound is admitted only through the existing canonical approved-send/safety gate and remains subject to system controls; no Production smoke invoked a provider send.
- **Media support — IMPLEMENTED / PRODUCTION_VERIFIED (infrastructure path):** Telegram photo/document/audio/voice/video/video-note/sticker normalization/download boundaries are implemented and bounded. Real tenant media happy-path acceptance is still external-evidence gated.
- Production migrations: `0122_omni_telegram_customer_foundation` version `20260927171724` and `0123_telegram_activation_acceptance_fk_index_hardening` version `20260927172358`.
- Exact-main CI #1452 and Cloudflare Production Deploy #932 succeeded on `6532693d7cc653e6611af0fea3ba4eea432d6feb`; Production Worker version `0c1a6d02-de44-4603-804f-81e807a1f672`.
- Production remains `NOT_CONFIGURED + disabled` for customer Telegram with `telegram_ai_paused=true` and 0 bindings/events/acceptance receipts. No synthetic tenant/Bot evidence exists.
- Post-`0123` advisor evidence has no Telegram activation-receipt unindexed-FK finding.
- Real tenant Bot authorization plus real inbound/outbound/media end-to-end acceptance remains **BLOCKED_EXTERNAL**. This checkpoint does not authorize activation.
- CI migration-chain coverage past `0101` remains a separate repository hardening gap; Production application + post-apply verification are the direct SQL evidence for `0122/0123`.

## OMNI-WEBCHAT

- embeddable website chat;
- tenant/business configuration;
- anonymous-to-known identity transition;
- consent/session rules;
- file/media support;
- Chatwoot inbox projection.

### Current evidence checkpoint — 2026-09-27

- **Embeddable website chat — IMPLEMENTED / PRODUCTION_VERIFIED (runtime path):** the Smart Core widget is deployed on Cloudflare; exact-main CI #1423 and Production Deploy #903 are green.
- **Tenant/business configuration — IMPLEMENTED / PRODUCTION_VERIFIED (schema/runtime boundary):** canonical WEB_CHAT binding and widget configuration use the existing tenant/business/Branch authority. Production contains no fabricated real-tenant activation row.
- **Anonymous-to-known identity transition — IMPLEMENTED / PRODUCTION_VERIFIED (foundation):** anonymous sessions remain anonymous until evidence justifies canonical identity linkage; no fake Lead/Business identity is created for convenience.
- **Consent/session rules — IMPLEMENTED / PRODUCTION_VERIFIED (security path):** raw session token remains browser-only, DB stores SHA-256 hash, token is header-bound for polling/download, expiry/explicit close are enforced, and exact HTTPS Origin/public key are required.
- **File/media support — IMPLEMENTED / PRODUCTION_VERIFIED (infrastructure and fail-closed paths):** customer → Chatwoot media and operator → visitor attachment delivery reuse Chatwoot storage and canonical messages. The visitor never receives Chatwoot storage credentials/URLs. Real tenant media happy-path acceptance remains GAP-09.
- **Chatwoot inbox projection — IMPLEMENTED / PRODUCTION_VERIFIED (projection path):** inbound Web Chat creates actual Chatwoot API-Inbox messages and signed Chatwoot outgoing events reconcile back to canonical Smart Core messages. No second Conversation store or Chatwoot integration exists.
- Production migrations: `0118_web_chat_outbound_attachments_readiness` and `0119_web_chat_acceptance_fk_index_hardening`.
- Real tenant/browser end-to-end acceptance receipt count remains intentionally zero. **Disposition for that acceptance edge: BLOCKED_EXTERNAL / GAP-09.**
- This checkpoint does not mark the whole OMNICHANNEL section complete. `OMNI-CHANNEL-HEALTH` has only a Web Chat-specific canonical slice so far and requires a separate cross-channel audit.


## OMNI-TIKTOK

Implement only against an actually supported and contractually available messaging API.

- no fake TikTok capability;
- capability detection;
- webhook/send/reconciliation contract when available.

## OMNI-SMS-RCS

- provider abstraction;
- consent;
- country/routing policy;
- delivery/failure evidence;
- pricing/usage accounting.

### Current evidence checkpoint — 2026-09-28

- **Capability foundation — IMPLEMENTED / PRODUCTION_VERIFIED:** PR #304 extended the existing canonical channel/binding/control constraints for SMS and RCS without selecting or fabricating a provider. Production migration `0125_omni_sms_rcs_capability_foundation` is live as version `20260927212408`.
- **Readiness/routing policy — IMPLEMENTED / DEPLOYED:** PR #305 added provider-neutral, fail-closed route evaluation for provider connection, canonical permission/suppression, pricing evidence, exact country/channel capability, sender registration and evidence freshness.
- **Fallback — EVIDENCE-GATED:** RCS -> SMS fallback is available only when exact provider capability evidence explicitly declares the fallback and the fallback route independently passes readiness checks.
- **Runtime activation — BLOCKED_EXTERNAL / CONFIGURATION-GATED:** Production currently has zero SMS/RCS bindings, `sms_ai_paused=true` and `rcs_ai_paused=true`. No provider credential, webhook/send adapter, acceptance receipt or fake evidence exists.
- Active channel adapters remain unchanged until a real supported provider contract and country capability are verified. Consent and usage/cost must continue to reuse canonical authorities rather than creating parallel truth.

## OMNI-VOICE

- voice notes;
- transcription;
- voice reply;
- later telephony/voice-agent boundary;
- recordings/retention/consent;
- call outcome evidence.

### Current evidence checkpoint — 2026-09-28

- **Voice-note/transcription foundation — EXISTING CANONICAL PATH:** reuse the existing voice transcription/cache and media evidence primitives; do not create a second voice store.
- **Controlled WhatsApp audio reply — IMPLEMENTED / PRODUCTION_VERIFIED (fail-closed path):** PR #306 added the policy/synthesis foundation and PR #307 executes AI audio replies only through the existing Shadow artifact + approved-send boundary, Meta tenant provider, OpenAI TTS, Cost Guard/`usage_events` and canonical reconciliation semantics.
- **Safety boundary — VERIFIED:** the path is restricted to `INTERNAL_TEST` businesses; requires Shadow Mode ON, Kill Switch OFF, WhatsApp/OpenAI CONNECTED, open WhatsApp freeform window, no human takeover, disclosure + conservative reserve, approved `gpt-4o-mini-tts*` MP3 output; telephony and voice cloning are disabled.
- Exact-main CI run `36356555098` and Cloudflare Production Deploy run `36356705964` succeeded on `main@70a83c0a94d1a1e6613c222a6688ce3c450a4df0`.
- Production remains intentionally fail-closed: `organization_settings.config.voiceReply` is null and post-merge verification observed zero `VOICE_REPLY_TTS` usage events and zero `AUDIO_SENT` WhatsApp events.
- **Still open:** later telephony/voice-agent provider boundary, recording retention/consent and call outcome evidence. Do not mark the whole `OMNI-VOICE` package complete from the controlled WhatsApp reply slice alone.

## OMNI-CHANNEL-HEALTH

Unified per-channel:

- connection status;
- credential health;
- webhook health;
- provider rate limit/quota;
- last verified evidence;
- supported capabilities;
- incident state.

### Current evidence checkpoint — 2026-09-27

- **Connection status — IMPLEMENTED / PRODUCTION_VERIFIED (read-model path):** derived from canonical integration/binding/readiness evidence; pending/unimplemented channels remain explicitly non-green.
- **Credential health — IMPLEMENTED / PRODUCTION_VERIFIED (boundary):** active/configured rows, tenant bindings and readiness contracts are reused. Built-in Web Chat is explicitly credentialless; inactive Meta channels are not treated as authenticated.
- **Webhook health — IMPLEMENTED / PRODUCTION_VERIFIED (evidence model):** per-channel journal/event evidence is surfaced separately from configuration state.
- **Provider rate limit/quota — IMPLEMENTED / PRODUCTION_VERIFIED (telemetry path):** Resend + Meta provider response evidence is bounded and written to existing audit logs. `EVIDENCE_PRESENT / NEAR_LIMIT / RATE_LIMITED` require observed provider evidence; otherwise health remains `NO_PROVIDER_QUOTA_EVIDENCE`.
- **Last verified evidence — IMPLEMENTED / PRODUCTION_VERIFIED:** existing integration checks, binding verification, events, acceptance receipts and quota observations feed the health surface.
- **Supported capabilities — IMPLEMENTED / PRODUCTION_VERIFIED (declared-evidence path):** active Email/WhatsApp descriptor capabilities plus internally implemented/pending channel states are visible without widening the active adapter registry.
- **Incident state — IMPLEMENTED / PRODUCTION_VERIFIED:** pauses, missing configuration/binding, reconciliation conditions, credential gaps and pending Work Packages remain explicit blockers.
- Production migrations: `0120_omnichannel_health_messenger_bootstrap`, `0121_omnichannel_channel_rate_limit_evidence_index`.
- Exact-main CI #1441 and Production Deploy #921 succeeded on `8e857ae9cc68310e53ce89dac2c39399871f8f1b`.
- Current real provider quota observation count is zero. **Do not interpret an empty evidence stream as healthy provider quota.**
- `CONN-02` remains broader than this Work Package. Reconnect/disconnect, guided provider authorization, retention explanation and real customer acceptance stay open under their existing owners.


---

# SECTION IDENTITY_CRM — Customer identity, CRM and service truth

## CRM-PERSON-CONTACT

Create a governed canonical Person/Contact model only from sufficient identity evidence.

- person/customer profile;
- account/company relationship;
- household/organization relationships where justified;
- no person fabrication from display names.

## CRM-IDENTITY-GRAPH

- Email;
- Phone;
- WhatsApp;
- Instagram;
- Facebook;
- Telegram;
- Web identities;
- provider identifiers;
- merge candidates;
- confidence/evidence;
- manual merge/split;
- deterministic conflict handling.

## CRM-CUSTOMER360-V2

Unify:

- conversations;
- tasks;
- notes;
- deals;
- bookings;
- quotes;
- orders;
- invoices;
- payments;
- support cases;
- documents;
- consent;
- lifecycle;
- relationship history.

**Current evidence checkpoint — PARTIAL / PRODUCTION_VERIFIED for implemented authorities (2026-09-28):**
- PR #313 / Production migration `0129_crm_customer360_v2_person_context` composes canonical People with existing Lead, Conversation, Task and Deal authorities through explicit evidence-backed Person context.
- PR #321 / migration `0135_crm_customer360_support_integration` adds canonical Support Cases only through explicit Case `person_id`; it does not infer Person attribution from Company relationships or weaken immutable Support context.
- Production contains 0 canonical People and 0 Support Cases, so 19 Leads and 12 Conversations remain unlinked by design and no synthetic happy-path evidence is created.
- Person read/link correction is RLS/role governed; Support remains read-only inside 360; sensitive Support prose is not duplicated into the Customer 360 collection.
- Exact-main CI `36403380564` and Cloudflare Production Deploy `36403658680` succeeded on `main@eed2a07b0bda3ec87c57f7ee4c4062d40b351cd7`.
- Scoped Notes linkage remains authorization-gated, and Booking/Quote/Order/Invoice/Payment/Document/Consent remain REQUIRED under their owning Work Packages. Do not mark this whole Work Package complete from the implemented subset.

## CRM-ACCOUNT-V2

- Company/Account;
- contacts;
- account hierarchy;
- ownership;
- branch/business relationship;
- B2B lifecycle.

**Current evidence checkpoint — PRODUCTION_VERIFIED (2026-09-28):**
- PR #314 / Production migration `crm_account_v2_governance` extends canonical `public.businesses`; no second `crm_accounts` store exists.
- `crm_person_business_relationships` remains evidence-backed Contact authority.
- External branch/subsidiary/division hierarchy is Organization-bound and cycle-safe; `tenant_businesses` / `branches` remain the tenant operating hierarchy.
- Account ownership is constrained to assignable Organization members and governed by OWNER/ADMIN/SALES_MANAGER mutation authority.
- B2B lifecycle requires explicit bounded evidence. Production has 19 Businesses, all 19 `UNCLASSIFIED`, 0 owner assignments and 0 external hierarchy links; migration inferred nothing.
- Authenticated Account read is SECURITY INVOKER; trusted mutations are service-role-only SECURITY INVOKER; RLS and governance trigger are live.
- Exact-main CI `36370424412` and Cloudflare Production Deploy `36370581976` succeeded on `main@88a6ab7f1b4f4241ea031deda85b5cecd66b7bc1`.

## CRM-CUSTOM-OBJECTS

Governed Custom Objects only after a real use case proves the schema contract.

Must include:

- typed schema;
- versioning;
- RLS;
- relationships;
- lifecycle;
- audit;
- bounded querying.

No arbitrary JSON/EAV free-for-all.

## CRM-ACTIVITY-TASK-V2

- tasks;
- activities;
- reminders;
- ownership;
- due/overdue;
- recurring human work where justified;
- links to customer/deal/booking/order/case.

**Current evidence checkpoint — PRODUCTION_VERIFIED for current justified scope (2026-09-28):**
- PR #316 / migration `0131_crm_activity_task_v2` extends canonical `crm_tasks`; no second Task or Activity store exists.
- Deal linkage, reminders, reminder acknowledgement, due/overdue reads and immutable audit-derived activity are live.
- Production contains 0 CRM Tasks. Recurrence is `DEFERRED_WITH_REASON`; Booking/Order/Case links remain dependency-gated until those authorities exist.
- Exact-main CI `36371693852` and Cloudflare Production Deploy `36371846971` succeeded on `main@11599810d8ffebd081e3571859c1bc3588a08ebe`.

## CRM-SUPPORT-CASE

- ticket/case;
- priority;
- SLA policy owned by Smart Core unless licensed functionality is intentionally used;
- escalation;
- assignment;
- resolution;
- CSAT;
- linked conversation/customer/order/payment.

**Current evidence checkpoint — PRODUCTION_VERIFIED for currently available dependencies (2026-09-28):**
- PR #317 / migration `0132_crm_support_case` established one canonical Smart Core Support Case + SLA authority; PR #318 / `0133_crm_support_case_fk_index_hardening` closed its FK-index findings.
- Account/Person/Conversation linkage, priority, SLA, assignment, escalation, resolution and CSAT are governed.
- Production has 0 Cases and 0 SLA policies; no synthetic acceptance data exists.
- Order/Payment links remain REQUIRED but dependency-gated until those canonical modules exist.

## CRM-DATA-QUALITY

- duplicate detection;
- merge/split;
- import;
- validation;
- normalization;
- retention;
- audit;
- bulk operations with safety limits.

**Current evidence checkpoint — PRODUCTION_VERIFIED for implemented safe scope (2026-09-28):**
- PR #319 / migration `0134_crm_data_quality_foundation` reuses `CRM-IDENTITY-GRAPH` for exact conflict review and governed MERGE/SPLIT/UNLINK; no second dedupe engine exists.
- Deterministic read-only quality scanning plus bounded atomic verified Contact import are deployed over canonical Business/Identity/Person relationships.
- Import is capped at 100 rows / 256 KiB, validates the whole batch, is idempotent by request key + content hash, ambiguity-fail-closed and PII-minimized in receipt/audit evidence.
- Exact-main CI `36401560832` and Cloudflare Production Deploy `36401836383` succeeded on `main@4a1cf8d0064bf6f35f82987e6b5f78c2ee2f3bc1`; Production has 0 import batches and 0 People, so no synthetic acceptance data exists.
- Destructive retention remains `DEFERRED_WITH_REASON` until an Organization-approved retention contract exists. The Work Package is therefore not globally complete beyond its implemented safe scope.

---

# SECTION SEGMENT_SALES_MARKETING — Audience, sales, growth and retention

## SEGMENT-V2

Extend governed segments to justified entities:

- Customer/Person;
- Deal;
- Account where useful;
- lifecycle/behavioral criteria;
- saved views;
- governed custom-field predicates.

**Current implementation checkpoint — ACTIVE / not yet Production evidence (2026-09-28):**
- Active branch `feat/segment-v2-multi-entity` extends the existing canonical `crm_segments + crm_segment_versions`; it does not create a second Segment/rule/membership store.
- Entity scope is `LEAD | PERSON | DEAL | ACCOUNT` with typed, allowlisted canonical predicates. Person PII/free metadata and arbitrary SQL/JSONPath are rejected.
- Governed Custom Field predicates remain limited to the entities for which the current authority exists: Lead and Deal. Person/Account Custom Field support is not fabricated.
- Dynamic evaluation stays bounded, versioned and side-effect-free apart from bounded audit evidence. `SEGMENT-SNAPSHOT` remains a separate Work Package; SEGMENT-V2 does not persist current membership.
- This checkpoint is implementation evidence only until exact-head CI, merge, Production migration, exact-main deploy, grants/RLS/advisor verification and zero-synthetic-data evidence succeed.

## SEGMENT-SNAPSHOT

- immutable audience snapshot;
- exact Segment semantic version;
- exact entity IDs;
- creation evidence;
- historical reproducibility;
- no silent mutation.

## SALES-SCORING

- lead score;
- fit;
- intent;
- engagement;
- evidence/reasons;
- manual override;
- model-assisted suggestions with deterministic ownership.

## SALES-PIPELINE-V2

- multiple pipelines;
- configurable stages;
- weighted amount;
- probability/forecast fields;
- owner/team;
- expected close;
- stage policies;
- Won/Lost evidence;
- forecasting read models.

## SALES-NEXT-ACTION

- stale lead/deal detection;
- follow-up queue;
- next best action;
- reminders;
- AI suggestions;
- human ownership;
- no blind auto-send.

## MARKETING-CAMPAIGNS

- campaign definition;
- exact audience/Segment version;
- templates/content;
- schedule;
- channel policy;
- consent/suppression;
- frequency caps;
- budget caps;
- approvals;
- A/B experiments;
- response/conversion evidence.

## MARKETING-CONSENT

Canonical permission evidence:

- opt-in;
- opt-out;
- channel purpose;
- source;
- timestamp;
- legal/business basis where required;
- suppression;
- preference center.

Segment membership is never equivalent to send permission.

## MARKETING-ATTRIBUTION

- source/campaign;
- conversation;
- lead;
- deal;
- booking;
- order;
- payment/revenue;
- bounded attribution models;
- no fabricated click/view events.

## HUNTER-CUSTOMER-MODULE

Extend existing Hunter:

- tenant-facing targeting;
- prospect discovery;
- enrichment;
- qualification;
- credits;
- dedupe;
- CRM promotion;
- compliance;
- ROI evidence.

Prospects remain acquisition evidence until promoted into canonical CRM entities.

## CUSTOMER-SUCCESS-LOYALTY

- onboarding;
- health/status;
- retention;
- churn risk signals;
- reactivation;
- loyalty/rewards;
- referrals;
- lifecycle campaigns;
- governed customer-success tasks.

---

# SECTION AUTOMATION — Workflow, tools, approvals and execution

## AUTO-WORKFLOW-MODEL

- Trigger;
- Conditions;
- Actions;
- immutable published versions;
- draft/publish;
- ownership;
- enable/disable;
- execution state.

## AUTO-TRIGGER-CATALOG

Triggers for:

- message;
- customer/lead;
- deal;
- task;
- Segment entry/snapshot;
- booking;
- quote;
- order;
- invoice;
- payment;
- case;
- schedule;
- provider webhook;
- custom integration event.

## AUTO-CONDITION-ENGINE

- typed operators;
- tenant-bound facts;
- deterministic evaluation;
- no arbitrary SQL/eval;
- bounded complexity.

## AUTO-TOOL-ACTION-REGISTRY

Every AI/workflow action has:

- typed input/output;
- permission;
- scope;
- idempotency;
- cost class;
- side-effect class;
- approval requirement;
- verifier;
- audit contract.

## AUTO-APPROVAL

- AUTO;
- REVIEW;
- STRICT;
- approval queue;
- expiry;
- escalation;
- delegation;
- reviewer permissions;
- audit;
- denial reason;
- replay-safe execution.

## AUTO-RUNTIME

- durable execution;
- scheduler;
- outbox;
- retry policy;
- DLQ;
- compensation;
- timeout;
- concurrency;
- idempotency;
- outcome verification.

Reuse existing primitives. Do not create duplicate queue/automation systems without evidence.

## AUTO-BUILDER

Business-facing:

- visual builder;
- templates;
- validation;
- test mode;
- draft/publish;
- version comparison;
- execution history;
- error diagnostics.

## AUTO-NOTIFICATIONS

- in-app;
- push;
- email;
- Telegram owner notifications;
- SMS where enabled;
- notification preferences;
- dedupe;
- escalation.

---

# SECTION BOOKING_OPERATIONS — Scheduling and service operations

## BOOKING-CATALOG

- service duration;
- staff eligibility;
- branch/location;
- buffers;
- capacity;
- required resources;
- booking rules.

## BOOKING-AVAILABILITY

- staff calendars;
- business hours;
- holidays;
- timezone;
- capacity;
- conflicts;
- holds;
- deterministic availability.

## BOOKING-LIFECYCLE

- requested;
- held;
- confirmed;
- rescheduled;
- canceled;
- completed;
- no-show;
- audited transitions.

## BOOKING-AI

AI tools for:

- availability;
- booking;
- reschedule;
- cancel;
- reminders;
- escalation;
- deposit requirement.

## FIELD-SERVICE

Where industry packs require it:

- job/work order;
- technician;
- location;
- schedule;
- checklist;
- parts/materials;
- photos;
- status;
- completion evidence;
- customer sign-off.

---

# SECTION COMMERCE_PAYMENTS — Catalog, quotes, orders, invoices and money

## CATALOG-V2

- products;
- services;
- variants;
- media;
- branch availability;
- pricing references;
- warranty;
- inventory/stock where enabled;
- bundles/add-ons.

Canonical pricing ownership must remain explicit.

## QUOTE-ENGINE

- line items;
- canonical prices;
- taxes;
- discounts;
- validity;
- versions;
- approval;
- acceptance/rejection;
- PDF/document;
- conversion evidence.

## ORDER-ENGINE

- Quote -> Order;
- direct order where permitted;
- fulfillment;
- status;
- cancellation;
- returns;
- linked customer/booking/payment.

## INVENTORY-FULFILLMENT

When enabled:

- stock;
- reservation;
- adjustment;
- warehouse/branch;
- fulfillment;
- low-stock evidence;
- audited mutations.

## INVOICE-ENGINE

- invoice numbering;
- lines;
- tax/VAT;
- due dates;
- states;
- balances;
- credit notes;
- documents;
- immutable commercial evidence.

## PAYMENT-CORE

- payment intent;
- payment link;
- immutable transaction ledger;
- authorized/paid/failed/expired/refunded;
- reconciliation;
- idempotency;
- ambiguous-result handling.

## PAYMENT-OMAN

- Tap integration;
- Thawani integration;
- webhook verification;
- payment-link lifecycle;
- refund where provider supports it;
- reconciliation.

## PAYMENT-EXTENSION

Provider abstraction for future countries/gateways without replacing payment truth.

---

# SECTION BUSINESS_INTELLIGENCE_AI — Business Twin, knowledge, memory and agents

## BRAIN-BUSINESS-TWIN

Versioned business truth:

- business identity;
- branches;
- products/services;
- prices/references;
- hours;
- staff;
- policies;
- warranty/refund;
- booking/payment/delivery rules;
- brand tone;
- languages/dialects;
- escalation rules;
- operational constraints.

## BRAIN-INDUSTRY-PACKS

Configurable packs, not core forks, for examples such as:

- dental/medical;
- pet clinic;
- automotive/garage/showroom;
- salon/spa/beauty;
- restaurant/cafe;
- home services;
- real estate;
- education;
- retail/professional services.

Each pack may define onboarding, custom objects, pipelines, workflows, metrics, AI evaluation scenarios and templates.

## KNOWLEDGE-V2

- website ingestion;
- PDFs;
- docs;
- FAQs;
- policies;
- manuals;
- catalogs;
- source provenance;
- versions;
- approval;
- refresh;
- stale detection;
- retrieval permissions.

## MEMORY-V2

Typed memory:

- Conversation;
- Customer;
- Relationship;
- Business;
- Working;
- Episodic;
- Operational;
- Agent learning.

Every memory item needs source, confidence, freshness, sensitivity, validity and correction/expiry semantics.

## AI-CONTEXT-COMPILER

Deterministically composes:

- customer;
- conversation;
- CRM;
- Business Twin;
- knowledge;
- memory;
- pricing;
- policy;
- locale;
- permissions;
- tool availability.

## AI-AGENT-RUNTIME

Specialist roles may include:

- Router/Supervisor;
- Sales;
- Support;
- Booking;
- CRM;
- Quote/Commerce;
- Knowledge;
- Memory;
- Follow-up;
- Quality;
- Analytics.

Agents never own provider or financial side effects directly.

## AI-MODEL-PROMPT-CONTROL

- Prompt Registry;
- model routing;
- fallback;
- Cost Guard;
- versioning;
- shadow/canary;
- evaluation;
- rollback.

## AI-QUALITY-SAFETY

- evaluation datasets;
- regression suites;
- hallucination/evidence checks;
- red-team;
- policy testing;
- confidence/uncertainty;
- PII/sensitive-data handling;
- tool/action safety.

## AI-VOICE-VISION

- voice-note understanding;
- transcription;
- image/document understanding;
- media evidence;
- voice response where permitted;
- later phone agent with explicit consent/recording policy.

## AI-OWNER-COPILOT

Owner/Admin can ask and, when authorized, act on:

- leads;
- customers;
- deals;
- tasks;
- bookings;
- quotes;
- orders;
- invoices;
- payments;
- team performance;
- follow-ups;
- reports;
- campaigns;
- automations.

Copilot actions still cross Tool Registry -> Policy -> Approval -> Action Gateway -> Verify -> Audit.

---

# SECTION ANALYTICS_REPORTING — Metrics, attribution and decision support

## DATA-EVENT-METRICS

- canonical event feed;
- Metrics Registry;
- metric definitions;
- dimensions;
- tenant/business/branch scope;
- versioned definitions.

## DATA-WAREHOUSE

- CDC/event ingestion;
- analytics store/warehouse boundary;
- no heavy BI queries against OLTP paths;
- freshness and backfill contracts.

## DATA-DASHBOARDS

- leads;
- customers;
- conversations;
- response time;
- sales;
- pipeline;
- bookings;
- quotes;
- orders;
- revenue;
- payments;
- retention;
- staff;
- channel;
- AI;
- workflow;
- campaign.

## DATA-ATTRIBUTION

Governed marketing/sales attribution connected to real evidence.

## DATA-ASK

Ask Your Data through governed metrics and semantic definitions, not arbitrary production SQL.

## DATA-EXPORTS

- CSV;
- XLSX;
- PDF;
- JSON;
- Google Sheets;
- scheduled delivery;
- branch/role-aware data.

## DATA-REPORTING

- daily;
- weekly;
- monthly;
- custom;
- multilingual summaries;
- owner executive briefing;
- anomaly alerts.

---

# SECTION SAAS_PLATFORM — Monetization, admin, agency and marketplace

## SAAS-PLANS-ENTITLEMENTS

Plans:

- Starter;
- Growth;
- Pro;
- Business;
- Agency;
- Enterprise.

Govern:

- feature entitlements;
- limits;
- seats;
- channels;
- add-ons;
- API/storage allowances.

## SAAS-BILLING

Customer-facing formula supports:

`Setup + Platform + Features + Channels + Seats + AI Usage + Third-party Usage + Overage - Discounts + Tax`

Current commercial AI usage policy starts at 4x eligible raw AI cost, with billing from governed usage evidence only.

## SAAS-COUPONS

- fixed;
- percentage;
- setup discount/free setup;
- trial;
- channel/add-on discounts;
- validity;
- redemption caps;
- tenant/customer constraints.

## SAAS-AGENCY

- multiple subaccounts/businesses;
- delegated admin;
- reseller;
- white label;
- custom domain;
- agency usage/revenue;
- client access;
- permission boundaries.

## SAAS-SUPER-ADMIN

Smart Visions command center:

- tenants;
- businesses;
- users;
- plans;
- subscriptions;
- revenue;
- usage;
- AI/provider cost;
- channels;
- integrations;
- incidents;
- health;
- feature flags;
- coupons;
- invoices;
- support;
- audit;
- Shadow Mode;
- Kill Switch;
- controlled tenant impersonation with audit.

## SAAS-MARKETPLACE

- apps;
- skills;
- integrations;
- industry packs;
- paid add-ons;
- installation;
- entitlement;
- versioning;
- permissions;
- billing.

---

# SECTION DEVELOPER_ECOSYSTEM — APIs, integrations and partners

## DEV-PUBLIC-API

- versioned API;
- scoped API keys/OAuth;
- rate limits;
- tenant scoping;
- idempotency;
- audit;
- usage/billing.

## DEV-WEBHOOKS

- subscription;
- signing;
- retries;
- replay;
- delivery journal;
- endpoint health;
- secret rotation.

## DEV-SDK

Supported SDK/typed contracts where justified.

## DEV-INTEGRATIONS

Connector framework for:

- websites;
- ecommerce;
- accounting;
- calendars;
- ERP;
- external CRM;
- delivery;
- storage;
- productivity tools.

## DEV-SANDBOX

- test tenant;
- test credentials;
- synthetic/non-customer fixtures;
- no accidental Production provider sends.

## DEV-MIGRATION

- import/export;
- schema/version compatibility;
- customer onboarding/migration tools;
- safe rollback.

## DEV-PARTNER

- partner/reseller integration;
- delegated operations;
- API/portal access;
- commercial attribution.

---

# SECTION EXPERIENCE — Web, mobile and portals

## UX-BUSINESS-WEB

Complete role-aware Business dashboard for:

- Inbox;
- CRM;
- Sales;
- Tasks;
- Booking;
- Catalog;
- Quotes;
- Orders;
- Invoices;
- Payments;
- Knowledge;
- Automations;
- Analytics;
- Copilot;
- team/settings;
- billing.

## UX-MOBILE

iOS/Android role-aware app:

- Inbox;
- notifications;
- CRM;
- deals;
- tasks;
- booking;
- quotes;
- payments;
- analytics;
- owner Copilot;
- human takeover.

## UX-PWA

Responsive/PWA experience where valuable.

## UX-CUSTOMER-PORTAL

Customer-facing:

- appointments;
- quotes;
- orders;
- invoices;
- payments;
- documents;
- tickets/cases;
- preferences/consent.

## UX-PARTNER-PORTAL

Agency/reseller/partner controls.

## UX-DEVELOPER-PORTAL

API keys, docs, webhooks, usage and sandbox.

## UX-SUPERADMIN-MOBILE

Mobile operational control for Smart Visions owner/admin where safe.

## UX-LOCALIZATION

- English;
- Arabic;
- Persian;
- Hindi/Urdu where required;
- RTL;
- Omani/UAE/Saudi/Qatar locale behavior;
- timezone/currency/number/date correctness.

## UX-ACCESSIBILITY

- keyboard;
- screen-reader semantics;
- contrast;
- responsive behavior;
- error clarity;
- accessible forms/navigation.

---

# SECTION ENTERPRISE_OPERATIONS — Security, governance, reliability and scale

## ENT-IAM

- SAML;
- OIDC;
- SCIM;
- MFA/session policy;
- enterprise role policy;
- device/session controls where justified.

## ENT-DATA-GOVERNANCE

- classification;
- retention;
- deletion;
- export;
- legal hold where required;
- data lineage;
- residency;
- tenant/cell boundaries;
- PII controls.

## ENT-SECURITY

- secrets;
- encryption;
- least privilege;
- RLS;
- threat modeling;
- dependency/supply chain;
- vulnerability response;
- abuse/rate limiting;
- security audit.

## ENT-INCIDENT

- incident states;
- severity;
- response runbooks;
- evidence;
- communication;
- postmortem.

## ENT-OBSERVABILITY

- logs;
- traces;
- metrics;
- SLO/SLI;
- alerts;
- per-tenant/provider/workflow diagnostics;
- cost visibility.

## ENT-PERFORMANCE

- load tests;
- concurrency;
- queue pressure;
- DB/query plans;
- caching only where measured;
- capacity planning.

## ENT-BACKUP-DR

- backups;
- restore drills;
- RPO/RTO;
- regional/cell recovery;
- disaster runbooks.

## ENT-RELEASE

- candidate isolation;
- migration safety;
- feature flags;
- canary;
- rollback;
- schema compatibility;
- app/mobile release controls.

## ENT-CONTRACTS

- enterprise plan/contracts;
- custom limits;
- data residency options;
- support/SLA product contract;
- negotiated billing without violating canonical ledger rules.

---

# SECTION FINAL_ACCEPTANCE — Full product completion gate

## FINAL-E2E

Prove representative end-to-end flows:

`Message -> Chatwoot -> Identity -> Customer 360 -> Business Brain/Memory -> Agent/Human -> Tool/Approval -> CRM/Booking/Quote/Order/Payment -> Provider Verification -> Audit -> Analytics -> Owner Copilot`

Across representative industries and channels.

## FINAL-COMMERCIAL

Verify:

- subscriptions;
- entitlements;
- billing;
- AI markup;
- provider usage;
- overages;
- discounts;
- tax;
- agency/reseller accounting.

## FINAL-SAFETY

Verify:

- tenant isolation;
- Human > AI;
- Shadow/canary;
- Kill Switch;
- consent/DNC/suppression;
- financial approvals;
- provider idempotency/reconciliation;
- PII controls.

## FINAL-OPERATIONS

Verify:

- dashboards;
- alerts;
- runbooks;
- backup/restore;
- incident response;
- upgrade/rollback;
- support workflow.

## FINAL-LAUNCH

Release criteria:

- no known unresolved P0/P1 product/security/data-integrity defects;
- production migration chain verified;
- representative load/capacity verified;
- mobile/web release gates verified;
- controlled pilots completed;
- owner/admin operational readiness documented;
- Production evidence reconciled into current-state docs.

---

# Definition of Done for every work package

A work package is not complete merely because a PR merged.

Where applicable it requires:

- current-state/gap audit;
- explicit source-of-truth ownership;
- schema and RLS;
- API/runtime behavior;
- UI where user-facing;
- formal lifecycle/state machine;
- RBAC/ABAC;
- idempotency;
- retries/reconciliation;
- failure behavior;
- audit;
- events;
- metrics/observability;
- usage/billing implications;
- security review;
- static/unit/integration tests;
- PostgreSQL migration-chain verification;
- exact-head CI;
- technical review;
- zero unresolved review threads;
- controlled Production promotion;
- Production verification;
- rollback/recovery evidence;
- documentation/handoff reconciliation.

# Delivery packaging and pull-request policy

The stable roadmap is Section/Work-Package based. Pull Requests are implementation evidence only.

Detailed packaging rules are defined in `DELIVERY_PACKAGING_STANDARD.md`.

Rules:

1. Never pre-assign GitHub PR numbers or a fixed PR count to future work.
2. Never renumber Sections or Work Package IDs because implementation packaging changes.
3. Prefer complete vertical slices that combine compatible audit, schema, API/runtime, authorization, tests, UI, migration/rollback and documentation work when they share one bounded context and one safe promotion boundary.
4. Do not create separate audit, implementation, hardening, index-cleanup or documentation PRs by habit. Split only when a real independent security, migration, provider, financial, rollback or Production-verification gate requires it.
5. Multiple adjacent Work Packages may share one delivery package when ownership, failure model, test story and rollback boundary remain clear.
6. Never reduce approved product scope, architecture quality, safety, observability, rollback evidence or test coverage merely to minimize PR volume.
7. Record actual PR numbers only after they exist.
8. The continuation cursor advances only when the Work Package Definition of Done is satisfied by real evidence.
9. Emergency/hotfix work does not change roadmap numbering.
10. Runtime/Production evidence may reorder execution inside a Section when a real blocker exists, but semantic IDs remain stable.

# Non-negotiable architecture rules

- Chatwoot is the source-based Communication Plane, not Smart Core.
- Smart Core owns CRM/customer/business truth, consent, pricing, booking, commerce, payments, billing, knowledge/memory policy and action safety.
- Human activity overrides AI.
- AI never directly owns provider/financial side effects.
- Provider actions are idempotent and fail closed.
- No blind retry after ambiguous provider acceptance.
- No parallel CRM, Knowledge Base, pricing truth, audit ledger, Agent framework, workflow engine or provider journal without a proven blocker.
- Analytics is separated from heavy OLTP workloads.
- Material mutations are audited.
- Tenant isolation is structural.
- Production evidence outranks plans and chat memory.
