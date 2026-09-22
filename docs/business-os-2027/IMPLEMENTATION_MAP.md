# Business OS 2027 — Dependency-Ordered Implementation Map

This is not a feature wishlist. It is the order required to avoid rebuilding the same primitive twice.

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

Status: **ACTIVE IMPLEMENTATION**. Slice 1 CRM Identity Foundation is Production-verified in PR #178 / migration 0070. Slice 2 Customer 360 Timeline is Production-verified in PR #179 / migration 0071. Slice 3 CRM Task Foundation is Production-verified in PR #181 / migration 0072 with FK-index cleanup 0073. Slice 4 Deal/Pipeline Foundation is active on `feat/business-os-crm-deal-pipeline` / migration 0074. Existing Growth/Intent Opportunities remain acquisition evidence and are not repurposed as CRM Deals.

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
