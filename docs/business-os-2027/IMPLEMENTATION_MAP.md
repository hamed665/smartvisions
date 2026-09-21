# Business OS 2027 — Dependency-Ordered Implementation Map

This is not a feature wishlist. It is the order required to avoid rebuilding the same primitive twice.

## Phase 0 — Architecture contracts\n\nStatus: **MERGED** in PR #172. No Production schema change was part of Phase 0.

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

## Phase 1 — SaaS Control Plane foundation\n\nStatus: **IMPLEMENTED ON BRANCH, NOT YET PRODUCTION** in `feat/business-os-control-plane-foundation`. See `CONTROL_PLANE_FOUNDATION.md` for the evidence-backed Gap Map and contract.

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
