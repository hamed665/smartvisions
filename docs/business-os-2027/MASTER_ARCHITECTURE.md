# Smart Visions AI Business OS — Master Production Architecture 2027

## Product definition

A multi-tenant, multi-brand, multi-branch, multi-industry, omnichannel AI Business Operating System for small businesses through enterprise organizations.

The product must unify:

- omnichannel messaging and native-app coexistence;
- Customer 360 and CRM;
- AI agents, business memory and knowledge;
- deterministic policy/action execution;
- workflow automation;
- sales, quotes, booking, commerce and payments;
- marketing, consent and outreach;
- paid Lead Hunter;
- reporting, BI, exports and Google Sheets;
- mobile apps, customer portal, partner portal and super-admin command center;
- subscription, billing, metering, entitlements and marketplace;
- developer APIs, integrations, audit, security, observability and disaster recovery.

## Architectural planes

```text
Experience
  -> Control Plane
  -> Business Plane
  -> AI Plane
  -> Automation Plane
  -> Omnichannel Plane
  -> Data Plane
```

### Experience

Business Web, iOS/Android, PWA, Customer Portal, Partner/Reseller Portal, Developer Portal, Super Admin Web/Mobile.

### Control Plane

Organizations, tenants, brands, businesses, branches, users, IAM, plans, subscriptions, pricing versions, billing, entitlements, feature flags, regions, contracts, audit and marketplace governance.

### Business Plane

CRM, customer identity, sales, support, case management, booking, quotes, commerce, payments, field service, loyalty, customer success, marketing and Hunter.

### AI Plane

Agent supervisor, specialist agents, context compiler, prompt registry, model router, memory, knowledge, policy, evaluation, shadow/canary, red-team and controlled learning.

### Automation Plane

Durable workflows, scheduling, action gateway, approvals, retries, compensation, human tasks, idempotency and outcome verification.

### Omnichannel Plane

WhatsApp, Instagram, Facebook, TikTok, Telegram, Email, Website, Mobile, Voice, SMS, RCS and custom adapters.

### Source-based Chatwoot Communication Plane

Smart Visions will use **Chatwoot Community Edition source code** as the source-based human communication plane / Unified Inbox, not merely as an external SaaS API.

Ownership boundary:

- Chatwoot source owns communication-plane UX and operational inbox state such as inbox/team/agent assignment, internal notes, presence and conversation projection;
- Smart Core remains authoritative for tenant/business/customer CRM truth, identity resolution, consent/DNC/suppression, pricing, sales, booking, commerce, payments, billing, Knowledge/Memory policy, automation/action safety and audit;
- a Chatwoot-composed outbound reply must cross Smart Core Policy -> Approval if required -> Action Gateway -> canonical provider send gate -> Verification/Reconciliation -> Audit;
- Chatwoot must never become a bypass around Shadow Mode, Kill Switch, Human takeover, DNC/suppression, consent/reply-window policy, canonical recipient checks or Cost Guard;
- provider/native-app events are reconciled into both Smart Core evidence and Chatwoot projections without creating a second canonical provider journal.

Source/license boundary:

- use the upstream-trackable Chatwoot Community source available under its MIT license;
- preserve required license/copyright notices;
- do not copy, vendor, redistribute or use Chatwoot `enterprise/` code in Production unless Smart Visions intentionally holds the required valid Enterprise license;
- if a capability is Enterprise-only and no license is adopted, implement the needed Smart Visions capability independently rather than copying proprietary code.

Deployment boundary:

- keep the Chatwoot source fork/upstream history maintainable as its own deployable communication-plane component rather than dumping the upstream tree into the Smart Core repository;
- pin exact upstream source versions/commits and maintain an explicit upgrade/rebase/rollback procedure;
- the concrete fork repository and deployment identity become canonical only after they are actually created and Production-verified.

### Data Plane

PostgreSQL transactional source of truth, Redis/ephemeral state where justified, vector retrieval, object storage, search, event backbone, CDC and analytics warehouse.

## Core invariants

1. Tenant isolation is structural, not optional.
2. Human activity overrides AI sending.
3. AI never owns provider side effects directly.
4. Every AI action crosses Policy -> Approval if needed -> Action Gateway -> Verification -> Audit.
5. Business Truth cannot be silently rewritten from chat or model inference.
6. Billing comes from an immutable usage ledger.
7. Analytics does not run heavy queries against transactional production paths.
8. Every external integration has reconciliation semantics.
9. Every critical entity has a formal state machine.
10. Every provider-bound path is idempotent and fail-closed.
11. Every material mutation is auditable.
12. Cross-tenant intelligence is aggregated/anonymized only.
13. Provider abstractions prevent strategic lock-in.
14. Production behavior beats stale documentation; documentation is reconciled afterward.
15. Chatwoot is a source-based Communication Plane; it never becomes the canonical CRM/business truth or a provider-send safety bypass.

## Core domains

```text
identity
tenant
organization
brand
business
branch
team
iam

billing
subscription
pricing
entitlement
tax
usage

channel
conversation
contact
identity_resolution

crm
sales
support
case
booking
commerce
payment
marketing
hunter
loyalty
field_service
customer_success

knowledge
memory
agent
prompt
context
model
evaluation
policy
action
approval

workflow
scheduler
notification

analytics
metrics
reporting
export

integration
developer
marketplace
partner

security
audit
incident
observability
feature_flags
data_governance
```

## Deployment principle

Do not create a microservice zoo.

Start as a modular monolith plus isolated workers and an event contract. Split only measured hotspots or isolation boundaries such as channel ingestion, AI runtime, workflow workers, analytics, voice, search, notifications and Hunter.

## Source-of-truth principle

Each fact has one owning domain. Examples:

- customer/profile -> CRM/contact;
- canonical service price -> existing services/service_prices lineage until a deliberate pricing-domain migration;
- payment state -> payment domain;
- booking state -> booking domain;
- AI/provider usage -> usage ledger/Cost Guard lineage;
- invoice -> billing;
- memory -> memory domain;
- knowledge -> versioned knowledge domain.

No two domains may independently claim ownership of the same canonical fact.
