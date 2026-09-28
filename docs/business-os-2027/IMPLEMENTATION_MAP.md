# Business OS 2027 — Dependency-Ordered Implementation Map

## Owner phase-map preservation lock

The owner reconfirmed on 2026-09-27 that the full historical Phase 0–12 map remains in scope together with the stable Work Packages and `PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md`. Historical percentages and PR counts are not completion metrics. A provider/API credential that has not arrived may block activation evidence, but does not remove the corresponding internal implementation requirement.

## Current execution and completeness authority

This file preserves historical Phase 0–12 dependencies. Read [NEXT_CHAT_HANDOFF.md](NEXT_CHAT_HANDOFF.md) for the latest cursor and [PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md](PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md) for owner-requested product detail, official customer onboarding, verified integration gaps and acceptance criteria. Historical phase counts/percentages do not measure current completion.


This is not a feature wishlist. It is the dependency history required to avoid rebuilding the same primitive twice.

For future execution, **do not assign or infer projected GitHub PR numbers**. The stable program roadmap is `MASTER_PROGRAM_SECTIONS.md`, which uses semantic Section and Work Package IDs. Historical PR numbers in this file remain implementation evidence only.

Current planned continuation cursor: fresh dependency audit within `SECTION IDENTITY_CRM` across `CRM-CUSTOM-OBJECTS`, `CRM-ACTIVITY-TASK-V2`, `CRM-SUPPORT-CASE` and `CRM-DATA-QUALITY`. PR #314 / Production migration `crm_account_v2_governance` Production-verified canonical external Account hierarchy, ownership and B2B lifecycle on `public.businesses` without reclassifying any of the 19 Production Companies. Reuse existing custom-field/task/deal/identity foundations and select the first verified unresolved dependency; do not create duplicate CRM stores.

## Phase 0 — Architecture contracts

Status: **MERGED** in PR #172. No Production schema change was part of Phase 0.

Deliver before production code expansion:

- domain ownership map;
- source-of-truth map;
- critical state machines;
- event catalog and versioning convention;
- service contract template;
- policy/action boundary;
- usage/billing taxonomy;
- Growth OS reuse matrix.

No production schema changes in this phase.

## Phase 1 — SaaS Control Plane foundation

Status: **MERGED AND PROMOTED TO PRODUCTION** in PR #173 / migration 0068, with post-promotion FK-index cleanup 0069 also live. Production verification passed for schema, RLS, grants, runtime safety, usage classification, audit foundations, and advisor FK coverage. See `CONTROL_PLANE_FOUNDATION.md` for the evidence-backed Gap Map and contract.

Extend the existing organization model toward:

Organization -> Brand -> Business -> Branch -> Department -> Team -> User.

Add/normalize:

- tenant/business scoping contract;
- role and permission model;
- entitlement model;
- subscription/pricing-version model;
- immutable usage classes;
- audit correlation IDs;
- configuration inheritance rules.

Keep current production behavior backward compatible.

## Phase 2 — Omnichannel domain boundary

Status: **COMPLETED AND MERGED**. Semantic adapter/status work merged in PR #175 at `main@5d812eee8a0e15dac658247b254660ae8f09aacd`; provider-identity/reconciliation work merged in PR #176 at `main@a5396156afc58a22cdf78baf7a495fb07ec38b40`. Production verification after PR #176 showed a healthy heartbeat, Shadow Mode ON, acquisition/dispatch SKIPPED, and zero Email/WhatsApp outbound messages after the merge. No Production schema migration was required.

Do not replace canonical provider journals/send gate.

Add a stable Channel Adapter contract:

- inbound normalization;
- outbound capability matrix;
- reply-window/policy metadata;
- native-app coexistence signals where available;
- reconciliation hooks;
- delivery/read status mapping;
- provider identity mapping.

Use the existing WhatsApp/Email paths as first adapters.

## Phase 3 — Customer 360 + CRM normalization

**Current Production checkpoint — 2026-09-28:** the earlier Slice 1–6 history below remains valid but is no longer the execution cursor. PR #309/#310 Production-verified canonical Person/Contact, PR #311 Production-verified governed Identity Graph resolution, PR #313 Production-verified explicit Person context for current Customer 360 authorities, and PR #314 Production-verified Account v2 over canonical `public.businesses`. Exact-main CI `36370424412` and Cloudflare Production Deploy `36370581976` succeeded on `main@88a6ab7f1b4f4241ea031deda85b5cecd66b7bc1`; Production Worker is `dc6142da-42d9-42f4-9bf0-6d38be7bf358`. Production still has 0 real People and all 19 Businesses remain `UNCLASSIFIED` with no fabricated owner/hierarchy. The next bounded step is a fresh audit of the remaining Identity/CRM Work Packages rather than rebuilding already verified foundations.

Status: **ACTIVE IMPLEMENTATION**. Slice 1 CRM Identity Foundation is Production-verified in PR #178 / migration 0070. Slice 2 Customer 360 Timeline is Production-verified in PR #179 / migration 0071. Slice 3 CRM Task Foundation is Production-verified in PR #181 / migration 0072 with FK-index cleanup 0073. Slice 4 Deal/Pipeline Foundation is Production-verified in PR #184 / migration 0074. Slice 5 Custom Field Governance is Production-verified in PR #188 / migration 0075. Slice 6 governed Dynamic Lead Segments is Production-verified in PR #191 / migration 0076. Existing Growth/Intent Opportunities remain acquisition evidence and are not repurposed as CRM Deals. Slice 6 remains LEAD-only + DYNAMIC-only and does not authorize Snapshot membership or Campaign/Workflow/provider execution. Implementation-runtime Worker checkpoint after PR #191 (before docs-only closeout) is `b6ad6482-11e1-4658-97e8-7f5d1a842318` with `failed=0`, acquisition/evidence/auto-dispatch SKIPPED and zero Email/WhatsApp outbound delta from promotion verification.

Extend the existing Lead/Business/Conversation CRM instead of creating a second CRM.

Add:

- contact identities;
- identity resolution;
- companies/accounts;
- custom fields/objects;
- activities/tasks;
- pipelines/deals;
- segments;
- customer timeline;
- merge/conflict rules.

## Phase 4 — Business Twin + Industry Packs

Add a versioned business configuration model for:

- branches;
- services/products;
- hours;
- staff;
- policies;
- booking/payment/delivery rules;
- tone/languages;
- permissions.

Industry Packs configure schemas, onboarding, default pipelines, workflows, metrics and evaluation scenarios without forking the core.

## Phase 5 — AI control plane

Extend existing multi-agent, prompt versions, knowledge versions, Context Hydrator and Cost Guard.

Introduce explicit:

- Context Compiler;
- Prompt Registry contract;
- Agent/Tool registry;
- Policy Engine;
- Action Gateway;
- confidence/uncertainty policy;
- outcome verification;
- evaluation datasets;
- shadow/canary version promotion.

## Phase 6 — Memory v2

Evolve current conversation memory into typed memory:

- Business Truth;
- Customer;
- Conversation;
- Working;
- Episodic;
- Operational;
- Agent Learning;
- Organizational.

Every memory record carries source, confidence, freshness, sensitivity, validity window, scope and permission.

No raw conversation sentence becomes Business Truth without validation policy.

## Phase 7 — Workflow and operational modules

Build through common state-machine/action contracts:

- booking;
- quote;
- payment;
- order;
- ticket/case;
- field service;
- loyalty;
- notification.

Workflow execution must be durable, idempotent and compensation-aware.

## Phase 8 — Billing and commercial platform

Add customer-facing commercial metering:

- platform subscription;
- setup fees;
- per-channel fees;
- AI billable raw cost × configured multiplier (initial commercial policy: 4x);
- voice;
- Hunter credits;
- seats;
- add-ons;
- API/storage/integrations;
- tax and multi-currency.

System retry/internal/cached/promotional usage must remain separable from billable usage.

## Phase 9 — Analytics / BI / Sheets

Reuse canonical operational evidence and create a dedicated analytics path.

Implement:

- Metrics Registry;
- event/CDC feed;
- analytics warehouse boundary;
- custom reports;
- Ask Your Data over governed metrics;
- CSV/XLSX/PDF/JSON export;
- Google Sheets scheduled/live sync;
- role/branch-aware reporting.

## Phase 10 — Hunter as paid customer module

Extend existing Hunter rather than cloning it.

Add tenant-facing:

- provider gateway;
- customer-configurable targeting;
- enrichment/verification credits;
- AI qualification;
- CRM import;
- intent/audit signals;
- ROI attribution;
- compliance boundary before outreach.

## Phase 11 — Enterprise + ecosystem

- SAML/OIDC/SCIM;
- data residency/cells;
- custom contracts and enterprise billing;
- sandbox;
- migration framework;
- marketplace;
- partner/reseller portal;
- developer SDKs/webhook console.

## Phase 12 — Mobile and customer-facing surfaces

One role-aware mobile app for owner/admin/staff/super-admin functions.

Customer portal for appointments, orders, quotes, invoices, payments, subscriptions, documents and tickets.

## Definition of Done for every phase

Applicable UI + API + persistence + permissions + audit + events + metrics + billing implications + retries/failure states + tests + observability + documentation + migration/rollback must be complete.

A decorative UI is not a completed feature.


### Phase 3 Slice 5 — Custom Field Governance

Status: **PRODUCTION-VERIFIED**.

- Gap audit merged in PR #187.
- Implementation merged in PR #188 at `main@b771883b1ba2f4787c6a466aea49f95a9052bd5f`.
- Production migration `0075_crm_custom_field_governance` version `20260923012557`.
- First slice supports governed Lead + Deal custom fields only.
- No Custom Objects, Segments or Person Contact were introduced.
- Production has 0 definitions / 0 options / 0 values after migration and rollback-only verification.
- Cloudflare runtime is proven by Worker `d42bd9c5-e862-4af6-ae70-787cbf81c5d6` with `failed=0`, acquisition/dispatch SKIPPED and zero Email/WhatsApp outbound rows after merge.
- Next dependency: Segment Governance gap audit. Do not build Segments on arbitrary JSON or ungoverned fields.


### Phase 3 Slice 6 — Governed Dynamic Lead Segments

- Gap audit: PR #190.
- Implementation: PR #191 at `main@a34bfd243d2f95e2ccad9895d5a753ef902a4299`.
- Production migration: `0076_crm_segment_governance` version `20260923093619`.
- Scope is LEAD-only, DYNAMIC-only, organization-wide Segment definitions with immutable semantic versions.
- Predicate AST is typed/allowlisted and enforced at API + database boundaries.
- Governed Custom Field predicates are restricted to compatible ACTIVE/filterable INTERNAL Lead definitions.
- Evaluation is authenticated, on-demand, deterministic and bounded; no persistent current-membership table exists.
- Segment evaluation is audience truth only and never invokes Campaign, Workflow or provider actions.
- Rollback-only Production verification left zero Segment data and zero audit fixture residue.
- Do not infer that Custom Objects are automatically the next implementation. Re-audit the remaining Phase 3 gap against Production evidence first.


## Future execution numbering policy

- Phases above remain useful dependency/history groupings.
- Future completion is tracked by stable Sections/Work Package IDs from `MASTER_PROGRAM_SECTIONS.md`.
- Extra audit, hardening, migration-fix, index-cleanup, hotfix or closeout PRs do not renumber later work.
- Actual PR numbers are recorded only after they exist.
- Chatwoot Community source integration is owned by `SECTION COMMUNICATION`; it is not represented as a guessed future PR number.
