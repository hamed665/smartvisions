# Phase 3 / Slice 6 — Segment Governance Gap Audit

## 1. Evidence and current state

This document records the read-only repository + Production gap audit for Segment Governance before any Slice 6 implementation.

The source-of-truth order used by this audit is the project rule:

1. exact routed/runtime evidence;
2. Production Supabase;
3. current GitHub `main`;
4. current project docs;
5. prior chat/handoff memory.

### Repository, PR and CI baseline

Verified canonical repository state:

- repository: `hamed665/smartvisions`;
- current `main`: `c3a6b14456db60b2f1ea99b688186f49cb964f39`;
- expected checkpoint and current `main` are identical;
- Slice 5 implementation merge remains `b771883b1ba2f4787c6a466aea49f95a9052bd5f`;
- PR #187, #188 and #189 are merged;
- the exact PR heads for #187/#188/#189 all have successful CI;
- push CI on current `main@c3a6b144...` is successful, including lint, typecheck, tests, PostgreSQL 17 Business OS migration verification, both builds and Cloudflare scheduled verification;
- the only open PR is legacy documentation PR #158, created against a 2026-09-09-era base. It is not Slice 6 evidence and must not be merged as current-state truth without fresh reconciliation.

No Slice 6 code, migration, branch-side runtime change or provider action existed before this audit.

### Production database baseline

Production project remains:

- Supabase project: `pkypexzpyfbikdnkrzvw`;
- PostgreSQL: 17;
- health: active/healthy;
- latest migration: `0075_crm_custom_field_governance`;
- Production migration version: `20260923012557`.

Production Slice 5 rows remain intentionally empty:

- Custom Field definitions: 0;
- Custom Field options: 0;
- Custom Field values: 0.

Current CRM/business data relevant to Segment scope:

- `businesses`: 19;
- `leads`: 19;
- `crm_tasks`: 0;
- `crm_pipelines`: 0;
- `crm_pipeline_stages`: 0;
- `crm_deals`: 0;
- `sales_conversations`: 12;
- `growth_opportunities`: 14;
- `intent_opportunities`: 0;
- `automation_rules`: 0;
- `campaigns`: 7, currently 2 RUNNING / 4 PAUSED / 1 COMPLETED;
- `suppression_list`: 1;
- WhatsApp marketing opt-in evidence rows: 0;
- WhatsApp marketing opt-out evidence rows: 0.

Current Lead distribution proves that Lead is an active Production CRM audience primitive:

- statuses currently present: NEW, READY_TO_CONTACT, REPLIED, HUMAN;
- Lead status vocabulary also includes DO_NOT_CONTACT and terminal states;
- Lead agent modes currently include AUTO, PAUSED and HUMAN;
- opportunity scores are populated and already indexed;
- all current outreach/follow-up/provider-send linkage remains Lead-centric.

Current Deal/Pipeline data does **not** prove an immediate Production audience need because all three canonical Pipeline/Stage/Deal tables are empty.

### Production runtime and safety baseline

The closeout handoff's Worker version is no longer the latest routed runtime evidence.

Current exact-head Production deployment evidence for `main@c3a6b144...` shows:

- Cloudflare Production deploy workflow succeeded;
- Production Worker: `smartvisions-growth-os-production`;
- Production route remains attached to `app.smartvisionsai.com`;
- Production cron remains exactly `*/2 * * * *`;
- `workers.dev` exposure remains disabled;
- deployment environment is `production`;
- `SHADOW_MODE=true`;
- safe smoke passed without invoking an outbound provider send.

The deploy step initially reported Worker Version `dbbf73f1-6579-421d-a28f-0e548f09e810`. Production bindings were then re-asserted by the deployment workflow. The newer and therefore authoritative routed heartbeat evidence reports Worker Version:

`bd5193b7-5e30-40c9-841c-36641855d2b9`

Latest verified scheduled RESULT heartbeat:

- cron: `*/2 * * * *`;
- failed: 0;
- processed: 0;
- acquisition: SKIPPED / NO_ACTIVE_DAILY_ACQUISITION_TARGET;
- auto-dispatch: SKIPPED / NO_ACTIVE_AUTOMATED_DAILY_TARGET;
- evidence: SKIPPED / NO_ACTIVE_DAILY_TARGET;
- reconciliation attention: 0.

Runtime controls remain:

- Shadow Mode: ON;
- global kill switch: OFF;
- email paused: OFF;
- WhatsApp AI paused: OFF;
- agents paused: OFF.

From the Slice 5 closeout merge timestamp through this audit:

- Email outbound rows created: 0;
- WhatsApp outbound rows created: 0;
- non-shadow provider outbound rows created: 0.

### Existing segmentation-like Production primitives

The Production catalog, views and function bodies were searched for Segment/Audience/Cohort/List/filter/qualification/campaign/suppression semantics.

There is no canonical Segment/Audience/Cohort table, materialized view, view or RPC today.

The only Production RPC with reusable custom-field filtering semantics is:

- `find_crm_entities_by_custom_field_exact(...)`, SECURITY INVOKER, typed exact filtering, bounded pagination, and governed Custom Field access.

No hidden Segment view or RPC was found.

Existing selection-like behavior is distributed across current domains:

- `campaigns`: Hunter/acquisition targeting using country/city/industry/target_count plus governed runtime config;
- `growth_opportunities`: acquisition qualification/routing such as tier, qualification score and `should_contact`;
- `leads`: canonical CRM Lead lifecycle + scores;
- `crm_custom_field_definitions/values`: governed tenant field registry and typed values;
- `suppression_list`: channel safety/suppression truth;
- Lead `DO_NOT_CONTACT` status: CRM/contact safety truth;
- `lead_sources` WhatsApp marketing opt-in/out evidence: channel permission evidence;
- `followup_jobs`: execution scheduling state;
- `sales_conversations`: conversation/execution state;
- `automation_rules`: generic automation config, currently zero rows;
- analytics cohort primitive: none.

These are not interchangeable concepts.

## 2. Primitive decisions

| Existing primitive | Decision | Slice 6 meaning |
| --- | --- | --- |
| `leads` | **REUSE** | Initial Segment entity truth. Reuse canonical columns only. |
| `crm_custom_field_definitions/options/values` | **REUSE + EXTEND evaluator** | Reuse Slice 5 governance. Segment evaluator may consume only governed, compatible definitions; it must not create a parallel field system. |
| `find_crm_entities_by_custom_field_exact` | **REUSE semantics, EXTEND query contract** | Preserve its typed/fail-closed rules. Do not compose Segment evaluation by making N HTTP/RPC calls. |
| `campaigns` | **EXTEND later as consumer boundary** | Campaign remains execution/campaign truth, not Segment storage. A later integration may reference an exact Segment version. |
| Hunter country/city/industry targeting | **REUSE only in Hunter acquisition** | It is acquisition targeting, not canonical CRM Segment membership. |
| `growth_opportunities` / `should_contact` / qualification scores | **DEFER as Segment source** | They remain acquisition evidence and must not silently become CRM Segment source-of-truth. |
| `crm_deals` | **DEFER entity support** | Canonical and ready for later extension, but no Production Deal/Pipeline/Stage rows or current audience consumer prove first-slice need. |
| `businesses` | **DEFER entity support** | It remains the Growth/Hunter CRM Account primitive, not tenant hierarchy Business. Lead may use canonical `business_id` association only. |
| `tenant_businesses` | **DEFER** | Control-plane tenant hierarchy; not CRM audience membership. |
| `crm_tasks` | **DEFER** | Human-work truth, currently zero rows; not business audience truth. |
| `sales_conversations` | **DEFER** | Operational/conversation state. It stays in policy/send safety, not first-slice audience membership. |
| Person Contact | **DEFER** | No Person Contact source-of-truth exists. Provider display names or identities must not fabricate one. |
| `suppression_list` | **REUSE at send-policy time** | Do not bake suppression into Segment membership. |
| Lead `DO_NOT_CONTACT` | **REUSE at canonical safety time** | A Segment may describe CRM lifecycle state, but Segment membership never bypasses DNC re-checks. |
| WhatsApp opt-in/out evidence | **REUSE at channel-policy time** | Consent/opt-in is send eligibility, not ordinary Segment membership. |
| `followup_jobs` | **DEFER** | Execution state, not membership. |
| `automation_rules` | **DEFER** | Zero Production rows and JSON config do not justify making it Segment source-of-truth. |
| tags / labels / saved filters / smart lists / dynamic lists | **NEW only where Slice 6 explicitly defines Segment** | No canonical Lead/Deal tag/list primitive exists to reuse. Do not import unrelated `portfolio_items.tags`. |
| analytics cohorts | **DEFER** | Analytics cohorting belongs outside first-slice OLTP Segment evaluation. |

## 3. Entity scope decision

### Initial entity: LEAD only

The first implementation slice should support **LEAD** Segment definitions only.

Evidence:

- 19 canonical Production Leads exist;
- current outbound, follow-up and conversation execution is Lead-linked;
- current acquisition promotion creates/reuses Leads;
- Lead status and score indexes already exist;
- Slice 5 Custom Fields can govern Lead values when tenants begin creating them.

### Deferred entities

**DEAL** is deliberately deferred, not rejected.

Deal is the next safest extension because its canonical schema, RLS, Pipeline/Stage contract and Custom Field binding already exist. However Production currently has zero Pipelines, zero Stages and zero Deals, and no active audience consumer depends on Deal segmentation. Adding it now would expand RBAC/evaluation/test surface without a Production requirement.

**Business, Task and Conversation** are deferred because they represent different domain truths and no first-slice consumer proves they must be Segment entities.

**Person Contact** is prohibited until a real person-evidence/source-of-truth contract exists.

## 4. Segment contract decision

Slice 6 must introduce one governed concept, not rename existing Campaign/Hunter filters.

A Segment is:

**stable Segment identity + immutable semantic version + typed predicate tree + evaluation mode + lifecycle**

The initial mode is:

- `DYNAMIC` only.

Dynamic means membership is computed from current canonical Lead truth and current compatible governed Custom Field values at evaluation time.

### Snapshot decision

Snapshot Segment is **DEFERRED**.

A real Snapshot requires persisted, version-bound membership evidence. No current Production consumer proves that frozen pre-send audience membership is required yet. Creating a membership table pre-emptively would add another durable projection before the execution contract needs it.

When Snapshot is later introduced:

- it must freeze exact entity IDs against an exact Segment version;
- membership must be tenant-safe and entity-safe;
- snapshot creation must be audited;
- historical snapshot membership must never silently change when a Segment definition changes.

Dynamic and Snapshot semantics must never be represented by one ambiguous flag or one mutable membership table.

## 5. Versioning and lifecycle

A Segment needs a stable identity and immutable versions.

Recommended first-slice persistence contract:

- stable Segment identity row owns `organization_id`, `entity_type` and current version pointer;
- immutable Segment version rows own name/status/predicate contract and actor/timestamp/request-key evidence;
- changing a material definition creates a new immutable version;
- evaluation references the exact Segment version it evaluated;
- no independent “evaluation version counter” is needed: evaluation evidence references the semantic Segment version;
- Snapshot versioning remains deferred with Snapshot itself.

Initial lifecycle:

- `ACTIVE <-> ARCHIVED`;
- no destructive DELETE;
- archived versions remain historical evidence;
- a new evaluation must not silently use an archived current definition.

Idempotency/replay and optimistic concurrency must follow the same guarded request-key/version discipline already used by current Business OS CRM slices.

## 6. Typed predicate contract

### Storage envelope

The predicate tree may use JSONB as a **strictly validated AST envelope**, not as an arbitrary query language.

That means:

- no arbitrary object keys;
- no arbitrary JSONPath;
- no SQL fragments;
- no PostgREST filter strings;
- no JavaScript expressions;
- no `eval`;
- no model-generated executable query text;
- no database execution of user-supplied query strings.

Unknown node types, fields, operators or value shapes fail closed.

Validation must be enforced at both the authenticated API boundary **and** the database mutation boundary (guard/validated SECURITY INVOKER contract). Direct authenticated table access must not be able to persist an unvalidated predicate AST, and no SECURITY DEFINER bypass is introduced.

The evaluator compiles only server-owned allowlisted predicates.

Tree depth, leaf count, IN-list size and request/page size must be bounded. Exact numeric caps should be locked by PostgreSQL 17 smoke/EXPLAIN evidence rather than guessed in architecture docs.

### First-slice canonical Lead fields

The audit proves these canonical Lead sources are safe candidates:

- `status`;
- `opportunity_score`;
- `intent_score`;
- `business_id` association;
- `created_at`;
- `updated_at`.

Not first-slice canonical Segment fields:

- `score_reasons` JSON;
- arbitrary Business metadata/review JSON;
- arbitrary Deal metadata JSON;
- Campaign config JSON;
- `lead_sources.value` JSON;
- conversation/message metadata JSON.

`source` and `locale` are **not** first-slice Lead predicates because Production does not expose them as canonical scalar Lead columns. Evidence JSON must not be promoted into a pseudo-canonical field merely to make the Segment feature look broader.

Operational fields such as Lead agent mode, conversation state, suppression and channel permission remain policy/execution concerns rather than ordinary audience predicates in the initial slice.

### Canonical operator allowlist

Initial canonical Lead operators:

- enum/status: `EQ`, `NEQ`, `IN`, `NOT_IN`;
- numeric scores: `EQ`, `NEQ`, `GT`, `GTE`, `LT`, `LTE`, `BETWEEN`;
- Business association: `EQ`, `IN`, `NOT_IN`, `IS_SET`, `IS_NOT_SET`;
- timestamps: `BEFORE`, `AFTER`, `BETWEEN`.

Relative-date expressions are deferred until an actual workflow/reporting requirement proves their timezone and replay semantics.

### Governed Custom Field predicates

A Custom Field predicate may resolve only through the Slice 5 registry and must bind to:

- exact `definition_id`;
- exact definition version;
- entity type `LEAD`;
- compatible data type;
- active/filterable governance state.

If the referenced definition contract changes incompatibly, evaluation fails closed until a new Segment version is created.

First-slice sensitivity policy:

- `INTERNAL`: eligible if the definition is active and filterable;
- `PII`: **DEFER ordinary Segment predicates** in the first slice;
- `SENSITIVE`: prohibited from ordinary Segment predicates.

This is intentionally stricter than merely trusting `filterable=true`. Production has zero tenant Custom Field definitions today, so there is no evidence justifying raw PII predicate storage/display in Slice 6.

Initial Custom Field operator contract:

- TEXT/LONG_TEXT/URL: `EQ`, `NEQ`, `IS_SET`, `IS_NOT_SET`;
- NUMBER: `EQ`, `NEQ`, `GT`, `GTE`, `LT`, `LTE`, `BETWEEN`, `IS_SET`, `IS_NOT_SET`;
- BOOLEAN: `EQ`, `IS_SET`, `IS_NOT_SET`;
- DATE/DATETIME: `EQ`, `BEFORE`, `AFTER`, `BETWEEN`, `IS_SET`, `IS_NOT_SET`;
- SINGLE_SELECT: `EQ`, `IN`, `NOT_IN`, `IS_SET`, `IS_NOT_SET`;
- MULTI_SELECT: `CONTAINS_ANY`, `IS_SET`, `IS_NOT_SET`;
- CURRENCY: numeric comparison operators only with an explicit exact currency code;
- EMAIL/PHONE: unavailable in ordinary first-slice Segment predicates under the PII restriction.

`CONTAINS`, `STARTS_WITH`, `CONTAINS_ALL` and relative-date operators are deferred pending query-plan/use-case evidence.

This intentionally does not turn Slice 5 exact-filter RPC into an unbounded generic query engine.

## 7. Evaluation and membership semantics

### Initial evaluation mode

First-slice evaluation is:

- authenticated;
- on-demand;
- dynamic;
- tenant-bound;
- deterministic in ordering;
- keyset-paginated;
- bounded to the same 1..100 page-size class already used by current CRM APIs;
- side-effect free with respect to Campaign, Workflow and providers.

No scheduled evaluator, event-driven evaluator, realtime stream, incremental membership worker or new microservice is justified in the first slice.

A dynamic page must return explicit evidence such as:

- Segment ID;
- exact Segment semantic version;
- evaluation timestamp;
- entity type;
- ordered Lead IDs;
- next cursor / has-more signal.

Dynamic pagination reflects current truth between requests. It is **not** a frozen snapshot across concurrent mutations. Consumers that require frozen membership must use the future Snapshot contract rather than pretending Dynamic evaluation is historical evidence.

### Persistent membership

Do **not** create a current-membership table in the first slice.

The first slice computes Dynamic membership from canonical current truth.

A durable membership table becomes justified only by Snapshot semantics or a proven incremental-evaluation requirement.

This avoids creating a second event store or an eventually-consistent duplicate CRM truth.

## 8. Campaign, Workflow, consent and suppression boundary

Segment creation/evaluation is audience selection only.

It must never:

- create `outreach_messages`;
- create provider-ready conversation messages;
- approve a message;
- invoke Email;
- invoke WhatsApp;
- schedule a follow-up;
- mutate Campaign execution state;
- execute an automation action.

Future Campaign/Workflow integration must reference exact Segment identity/version and still pass:

`Policy -> Approval -> Action Gateway -> Provider execution -> Verification/Reconciliation -> Audit`

Send eligibility remains a separate, later decision and must re-check current truth including:

- global kill switch;
- channel pause;
- Shadow Mode;
- human takeover;
- Lead DNC;
- suppression;
- canonical recipient identity;
- market window;
- WhatsApp 24-hour rule;
- verified marketing opt-in where required;
- mailbox/provider health;
- approval;
- Cost Guard.

Therefore:

**Segment = business audience truth**

and

**Send eligibility = policy-time execution decision**

A Segment result must never be treated as proof of consent or permission to send.

## 9. RBAC decision

First-slice Segment is organization-wide; personal/private saved filters are deferred.

Organization-wide Segment definition mutations:

- OWNER: create/update/archive/reactivate;
- ADMIN: create/update/archive/reactivate;
- SALES_MANAGER: create/update/archive/reactivate;
- SALES_AGENT: no organization-wide Segment mutation;
- VIEWER: no mutation.

Read/evaluate access may follow current organization member read visibility, while still being constrained by underlying RLS and Segment-source restrictions.

This does not manufacture a new SALES_AGENT permission model. Current Lead RLS remains organization-member readable, while the new Segment mutation boundary is deliberately stricter than the legacy `campaigns` ALL policy.

Lower-scope ABAC integration may be added only when current scope assignments are actually used by the CRM/Segment consumer; it is not invented in this slice.

## 10. Audit contract

Reuse canonical `audit_logs`. Do not create a Segment event store.

Material Segment events:

- `CRM_SEGMENT_CREATED`;
- `CRM_SEGMENT_DEFINITION_UPDATED`;
- `CRM_SEGMENT_ARCHIVED`;
- `CRM_SEGMENT_REACTIVATED`;
- `CRM_SEGMENT_EVALUATED`.

Audit payloads should contain minimized structural evidence:

- Segment ID;
- Segment version;
- entity type;
- lifecycle state;
- predicate hash / leaf count;
- evaluation time;
- returned count / has-more where applicable;
- actor and request key through canonical audit fields.

Do not copy raw Custom Field values, PII, sensitive predicate values, message bodies or provider payloads into audit rows.

Snapshot audit events remain deferred with Snapshot implementation.

## 11. Performance/index decision

No speculative Slice 6 index is approved by this audit.

Existing useful Production indexes already include:

- Lead tenant/status index;
- Lead tenant opportunity/intent score index;
- Lead Business association indexes;
- Custom Field definition/list indexes;
- Custom Field value definition/entity read indexes.

Supabase Performance Advisor currently reports many recently created CRM indexes as unused, including current Custom Field and Deal indexes. That is positive evidence **against** index-by-imagination.

Before adding any Segment-specific index:

1. lock the actual evaluator query;
2. seed representative non-Production PostgreSQL 17 fixtures;
3. run `EXPLAIN (ANALYZE, BUFFERS)`;
4. add only the index justified by the proven query;
5. rerun migration-chain smoke and query-plan tests.

Production currently has zero Custom Field values, so Production cannot honestly justify typed-value search indexes yet.

## 12. Security and advisor baseline

Current Supabase security advisor baseline remains unchanged:

- two INFO findings for RLS-enabled Telegram runtime tables with no policy;
- leaked-password protection warning remains;
- no Segment-specific security finding exists because Slice 6 is not implemented.

Slice 6 must preserve:

- RLS on every new tenant table;
- tenant-safe composite references where applicable;
- SECURITY INVOKER reads/evaluation;
- no browser service-role path;
- explicit authenticated grants;
- no destructive lifecycle;
- no provider/customer side effects.

## 13. Audit outcome / implementation gate

The audit supports a **narrow Slice 6 implementation**, but implementation must not start in this documentation PR.

Approved first implementation scope:

- governed organization-wide **Dynamic Lead Segment**;
- stable Segment identity + immutable semantic versions;
- strict typed/allowlisted predicate AST;
- canonical Lead scalar predicates only;
- governed INTERNAL Lead Custom Fields only;
- ACTIVE/ARCHIVED lifecycle;
- RLS + explicit RBAC;
- idempotent/version-checked mutations;
- on-demand deterministic ordered evaluation;
- bounded keyset pagination;
- exact evaluation/version evidence;
- minimized canonical audit;
- PostgreSQL 17 migration-chain + Segment smoke;
- authenticated API/runtime contract.

Explicitly out of scope:

- Deal Segment support;
- Business/Task/Conversation Segment entities;
- Person Contact;
- Snapshot membership;
- current-membership persistence;
- scheduled/event-driven/incremental/realtime evaluator;
- Campaign send;
- Workflow action execution;
- provider send;
- arbitrary SQL;
- arbitrary JSONPath;
- raw PostgREST filters;
- model-generated executable queries;
- Custom Objects;
- PII/SENSITIVE ordinary Custom Field predicates;
- arbitrary metadata JSON predicates;
- Segment UI beyond what is necessary to prove authenticated runtime contract.

## 14. Audit limitations

This audit intentionally did not:

- create Segment schema/data;
- change Production;
- send Email or WhatsApp;
- invoke the heartbeat POST endpoint;
- seed fake customer/business data;
- create a Person Contact;
- alter Shadow Mode;
- alter Campaigns;
- alter safety controls;
- add indexes.

The exact first implementation migration/API contract must be checked again against current `main`, open PRs, CI and Production immediately before implementation, because runtime evidence outranks this document if the system changes after this audit.
