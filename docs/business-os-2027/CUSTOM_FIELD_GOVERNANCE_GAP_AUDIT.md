# Phase 3 / Slice 5 — Custom Field Governance Gap Audit

**Audit date:** 2026-09-23  
**Audit base:** `main@21d89da8604cb5b3452811bc07234a6ed246fe15`  
**Production database:** Supabase `pkypexzpyfbikdnkrzvw`, PostgreSQL 17  
**Scope:** Read-only repository, GitHub, and Production schema/control evidence. No code, schema, data, or provider changes were made.

## 1. Evidence and current state

### Repository and CI

- GitHub branch API confirms `main` points to `21d89da8604cb5b3452811bc07234a6ed246fe15`.
- The checkpoint is a documentation-only commit whose parent is `3fc5f884b115b732b675bfadf09ae90db69f15aa`.
- Exact-head GitHub Actions checks for the checkpoint: `validate` = success and `Cloudflare Production Deploy` = success.
- The deployment job checked out the exact green main commit, built the Workers bundle, promoted it, verified the Production Route, ran routed production smoke and safe API/webhook rejection smoke.
- GitHub’s complete open-PR collection returned only PR #158, an old Growth OS documentation reconciliation PR. It is not a Slice 5 change.
- Direct local clone was unavailable because this environment has no GitHub credentials. Consequently this audit is grounded in GitHub file/API and live Production evidence; local PostgreSQL 17 migration-chain execution remains a prerequisite for implementation CI.

### Production database

Latest applied migrations end at:

| Migration | Version |
|---|---:|
| `0070_crm_identity_foundation` | `20260922164110` |
| `0071_customer_360_timeline` | `20260922202957` |
| `0072_crm_task_foundation` | `20260922214407` |
| `0073_crm_task_fk_indexes` | `20260922214843` |
| `0074_crm_deal_pipeline_foundation` | `20260922225908` |

The live public table inventory contains `crm_identities`, `crm_identity_links`, `crm_tasks`, `crm_pipelines`, `crm_pipeline_stages`, and `crm_deals`; it contains no custom-field registry, custom-object registry, segment table, or canonical Person Contact table. The only open PR is unrelated to these domains.

Production safety controls read from `system_controls`:

- Shadow Mode: ON
- Global Kill Switch: OFF
- Email pause: OFF
- WhatsApp AI pause: OFF
- Agents pause: OFF

No provider sends or writes were performed during this audit.

### Current schema facts

Live table inventory was inspected with columns, RLS flags, row counts and FK constraints for these CRM entities and related evidence tables.

| Entity/table | Relevant observed shape | Existing configurable/custom-like behavior |
|---|---|---|
| `businesses` | Organization-scoped company/account; typed company/contact/provider columns including name, country, city, category, website, phone, email, WhatsApp, Instagram, Google rating/count/status/price level. | `google_opening_hours` JSONB object and `google_reviews` JSONB array are provider-specific cached data. They are not tenant custom-field schemas. |
| `leads` | Organization and optional Business linkage; fixed status enum, opportunity/intent scores, agent mode, recommended offer, timestamps. | `score_reasons` JSONB array is qualification evidence, not arbitrary tenant schema. |
| `sales_conversations` | Organization and Lead linkage; fixed channel, stage, priority, awaiting-party and handoff fields; language, intent, sentiment and reason fields. | `sales_state` JSONB object is governed conversation/sales state. It must remain owned by conversation intelligence. |
| `crm_identities` | Organization-scoped normalized identity type/value, lifecycle and timestamps. | `metadata` JSONB object supports identity-specific metadata; it is not custom business data. |
| `crm_identity_links` | Organization + identity + Business composite linkage; source, evidence strength, status and timestamps. | `evidence` JSONB object is link provenance. Do not reuse it for custom fields. |
| `crm_tasks` | Organization plus tenant-consistent optional Business/Lead/Conversation links; task lifecycle, assignment, due date, request key and optimistic `version`. | `metadata` JSONB object has no governed registry/type contract. It must not be treated as a custom-field store. Production row count is 0. |
| `crm_deals` | Organization + Business + optional Lead + Pipeline/Stage; amount/currency, owner, terminal outcome, source, request key and optimistic `version`. | `metadata` JSONB object has no governed registry/type contract. It must not be treated as a custom-field store. Production row count is 0. |
| `growth_opportunities` / `intent_opportunities` | Acquisition/qualification evidence with scoring and source-specific payloads. | Not CRM Deal records and not first-slice custom-field entities. |
| `tenant_businesses` and hierarchy | Separate tenant-owned Control Plane Business with inherited scope/configuration primitives. | Existing scope configuration and feature-flag overrides are control-plane configuration, not CRM custom data. |

All listed exposed CRM tables report RLS enabled. Existing CRM task/deal contracts also use Organization membership, composite tenant lineage, audited mutations and optimistic version checks. New custom data must follow those patterns, not bypass them.

## 2. Primitive decisions

| Primitive | Decision | Reason / boundary |
|---|---|---|
| Existing Business / Lead / Conversation / Task / Deal stores | **REUSE** | Remain canonical CRM entities. No CRM v2 or parallel records. |
| Existing `audit_logs` | **REUSE** | Preserve one audit ledger. New definition/value changes emit minimized audit records here. |
| Existing tenant membership/RBAC and Organization RLS boundary | **REUSE + EXTEND** | Custom records must inherit Organization isolation and entity lineage. |
| Existing entity `metadata`, `sales_state`, `evidence`, provider JSON | **REUSE for their current domain meaning only** | No promotion to custom schema or custom-value persistence. |
| Field Definition Registry | **NEW** | No governed, typed, versioned definition registry exists in live schema. |
| Typed Field Value storage | **NEW** | No persisted values linked to governed definitions exist. One canonical value owner is required. |
| Custom Object definitions/instances | **DEFER** | No proven entity gap; adding them now risks a generic second CRM. |
| Segment engine | **DEFER** | Must query the future governed registry; do not read scattered JSON. |
| Person Contact | **DEFER** | No canonical Person model. Never construct it from provider display names. |
| Business custom fields | **DEFER initially** | Existing Business fields cover observed account/provider facts; no production use case proving first-slice need. Reassess with measured tenant demand. |
| Lead custom fields | **NEW support in the governed registry** | Best first target for tenant-specific qualification fields without altering fixed Lead lifecycle/source facts. |
| Deal custom fields | **NEW support in the governed registry** | New commercial aggregate is an explicit tenant-owned CRM record; custom attributes can extend it without putting sales truth in metadata. |
| Task custom fields | **DEFER** | Task lifecycle is new and empty in Production; no evidenced custom-task requirement. |
| Conversation custom fields | **DEFER** | Conversation has a fixed operational state contract and governed `sales_state`; keep it outside first-slice values. |
| JSON custom data type | **DEFER** | No proven requirement justifies arbitrary nested structures, validation ambiguity, or unbounded query/index semantics. |

### Initial supported entity types

Support only **Lead** and **Deal** in the first field registry version. The binding must point to an existing entity ID and validate the entity’s Organization from canonical rows. It must not create/own copies of either entity.

## 3. Slice 5 design decision

Create a governed field registry and typed values, tenant scoped to `organization_id`, initially binding to existing Leads and Deals. Do not implement Segments, Custom Objects, Person Contacts, Business/Task/Conversation values, migrations of existing JSON metadata, or provider behavior in this slice.

### Field Definition contract

Every definition must carry:

- immutable definition ID and normalized `key` unique within Organization + entity type;
- tenant-owned `organization_id`;
- `label`, `entity_type`, and explicit `data_type`;
- `required`, typed optional default, validation rules, and typed option set where relevant;
- `sensitivity_class` / PII classification;
- `searchable` and `filterable` flags constrained by type and access rules;
- `unique` (default false) with uniqueness scoped to Organization + entity type + definition and defined null semantics;
- lifecycle `ACTIVE | DEPRECATED`; no destructive deletion of used definitions;
- monotonically increasing definition `version`;
- explicit `scope` (Organization + entity type for this slice);
- created/updated actor and timestamps, audited in existing `audit_logs`.

Definitions are not arbitrary JSON schema documents. Validation rules and defaults are a bounded, versioned contract validated by the server/database boundary. Definition changes that invalidate stored values fail closed; no implicit coercion or destructive rewrite.

### Type support and value representation

First-slice types: `TEXT`, `LONG_TEXT`, `NUMBER`, `BOOLEAN`, `DATE`, `DATETIME`, `SINGLE_SELECT`, `MULTI_SELECT`, `EMAIL`, `PHONE`, `URL`, `CURRENCY`.

- Each value must use the canonical typed representation for its definition. Database constraints/RPC validation must ensure only the matching typed slot/value is populated.
- Select values must reference current option identities/keys, not labels. Multi-select has deterministic duplicate elimination and ordering.
- `CURRENCY` is an amount + validated ISO currency code; it is not an untyped string/number pair.
- Text/email/phone/URL and numeric/date values have bounded lengths/ranges and deterministic normalization/validation rules.
- Null/absent is distinct from a default. Defaults are applied only by an explicit, audited create/update contract and do not silently rewrite historical rows.
- No JSON custom values in Slice 5.

### Value binding and isolation

- Every value stores `organization_id`, entity type, entity ID, field definition ID/version, typed value, and timestamps.
- Composite foreign keys bind Organization + entity ID to the canonical Lead or Deal row; cross-tenant binding must fail even if a caller supplies a valid UUID from another tenant.
- RLS checks Organization membership and existing CRM scope/RBAC. Mutations use authenticated caller identity and explicit CRM management permission; read/query respects entity visibility.
- No service-role browser path, broad grants, or public/anon access.
- No change may transfer `organization_id` on update.

### Mutation, audit, and reads

- Definition and value mutations are idempotent; request keys are scoped to Organization + operation and retried requests return the original result.
- Updates require `expectedVersion` and fail with a version conflict when stale. No last-write-wins overwrite.
- Audit every material definition/value mutation using existing `audit_logs`; include actor, tenant, entity/definition IDs, operation, versions, and correlation IDs. Minimize or redact PII values according to sensitivity class; never place secrets or unnecessary raw sensitive values in audit JSON.
- AI may propose a value only as an explicit suggestion/approval input. It cannot silently mutate Business/Lead/Deal truth.
- Reads and filters have a deterministic contract: explicit Organization/entity/definition filters, stable ordering/cursor, typed comparison semantics, and no unbounded arbitrary SQL/JSON path input.
- Index only the proven access path (tenant + entity + definition for entity reads; add type-specific query indexes only when the query contract/tests demonstrate them). Do not index every value slot speculatively.

### Lifecycle and schema evolution

- Deprecating a definition prevents new writes by default while preserving historical reads and values.
- Existing values remain addressable under the definition version that validated them.
- Option removal, type change, key reuse, or constraint tightening that makes any stored value invalid must fail closed until a reviewed explicit migration resolves the values.
- Definition deletion is prohibited once referenced; retirement/deprecation preserves history.
- Re-enable/deprecation transitions and option-set evolution are audited and versioned.

## 4. Audit outcome / implementation gate

The Production schema confirms a real gap: there is no governed custom-field registry or typed value contract, while several existing JSONB columns have narrower domain ownership and must not be repurposed. This confirms the proposed narrow Slice 5 scope: **Lead + Deal definitions/values only; no Custom Objects or Segments**.

Before implementation PR is considered complete, the normal project workflow still requires:

1. clean local branch from current exact main;
2. tests for field typing, validation, idempotency, optimistic conflicts, tenant/FK isolation, RLS/RBAC, audit redaction, definition evolution and deterministic reads;
3. PostgreSQL 17 migration-chain CI and exact-head application CI;
4. Draft PR, zero unresolved review threads, then exact-head green review/merge;
5. controlled Production migration, exact blob comparison, RLS/grants/FK/advisor verification and zero fabricated CRM data;
6. runtime/API smoke using authenticated read/write paths without provider sends; if runtime code changes, exact Cloudflare Production version/heartbeat verification;
7. reconcile `docs/CURRENT_STATE.md` and `NEXT_CHAT_HANDOFF.md` only after production evidence is proven.

## 5. Audit limitations

- GitHub API confirmed current main, open PR collection, exact-head checks and the Production deployment job’s route/smoke steps.
- Supabase live schema, latest migrations, production controls and advisors were read-only inspected.
- This execution workspace has no authenticated local checkout of the private repository. No local migration-chain, runtime, or application test was run as part of the audit.
- The available Cloudflare evidence is the successful exact-SHA deployment workflow and its completed steps. A separate post-deploy Worker version/heartbeat endpoint was not available here; obtain that evidence before claiming runtime promotion for any new runtime change.


## 6. Production closeout

Slice 5 implementation merged in PR #188 at:

`main@b771883b1ba2f4787c6a466aea49f95a9052bd5f`

Production migration:

- `0075_crm_custom_field_governance`
- version `20260923012557`

Verified Production evidence:

- RLS enabled on definitions, options and values;
- authenticated has SELECT/INSERT/UPDATE only; no DELETE grant;
- no service-role direct table SELECT for the new custom-field tables;
- query/filter functions are SECURITY INVOKER;
- 0 definitions / 0 options / 0 values were fabricated by migration;
- rollback-only Production smoke verified create -> exact filter -> clear -> minimized audit and left 0 fixture/audit residue;
- security advisor showed no Slice 5 regression;
- no new unindexed-FK regression was reported;
- Cloudflare Worker promoted to `d42bd9c5-e862-4af6-ae70-787cbf81c5d6`;
- latest checked heartbeat had `failed=0`, acquisition `SKIPPED`, dispatch `SKIPPED`;
- zero Email/WhatsApp outbound rows were created after the Slice 5 merge in the verification window.

Slice 5 is therefore Production-verified across schema, runtime and safety evidence.

The next Phase 3 step is a read-only Segment Governance gap audit. Segment implementation must not begin by adding arbitrary JSON predicates, raw SQL/JSONPath expressions or campaign side effects.
