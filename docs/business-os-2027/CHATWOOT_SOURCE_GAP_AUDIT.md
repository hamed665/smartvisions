# Chatwoot Source Communication Plane — Gap Audit

Program cursor: `SECTION COMMUNICATION / COMM-CHATWOOT-SOURCE`

Audit date: 2026-09-23

Repository baseline at audit start:

- Smart Core repository: `hamed665/smartvisions`
- canonical main: `9086585411879579c50ac7f8fb524d1fedaa0cb5`
- latest Business OS Production migration: `0076_crm_segment_governance` / `20260923093619`
- routed Production Worker at audit start: `018308de-1c58-4ea3-9ee6-9f500d609439`
- latest checked heartbeat: `failed=0`
- Shadow Mode: ON
- no persistent CRM Segment fixture rows
- only stale open PR at audit start: #158

This audit is intentionally read-only with respect to Production provider behavior. It does not install Chatwoot, create a new provider route, send a customer message, change Shadow Mode, or apply a Production database migration.

---

## 1. Decision summary

Smart Visions will use **Chatwoot Community Edition source code as a source-based Communication Plane / Unified Inbox**.

Chatwoot will not become the source of truth for:

- canonical Customer / Person / Account CRM;
- Smart Visions Lead / Deal / Task / Segment;
- tenant hierarchy;
- consent / DNC / suppression;
- product/service pricing;
- booking;
- quotes, orders, invoices or payments;
- Business Brain / Knowledge governance / Memory policy;
- Smart Visions workflow truth;
- provider usage/billing truth;
- Smart Visions audit truth;
- outbound safety decisions.

Smart Core remains authoritative for those facts.

For the existing Smart Visions-controlled Email and WhatsApp providers, the first integration must use **Chatwoot API inboxes as communication projections** rather than transferring provider credentials and send authority into Chatwoot native Email/WhatsApp connectors.

Canonical initial flow:

```text
Provider inbound
  -> Smart Core provider webhook verification
  -> canonical provider journal / CRM resolution
  -> project inbound message to Chatwoot API Inbox
  -> Human sees/replies in Chatwoot
  -> Chatwoot signed API-inbox webhook
  -> Smart Core Chatwoot bridge
  -> Policy / Approval if needed / canonical Send Gate
  -> Provider
  -> Verification / provider journal / reconciliation
  -> project result/status to Chatwoot
  -> Smart Core audit + analytics evidence
```

This preserves the existing safe provider boundary and gives humans the Chatwoot inbox UX.

---

## 2. Current Smart Visions evidence

Before this audit, Smart Visions already has:

- Production-proven Meta Cloud WhatsApp;
- Production-proven Resend Email;
- canonical outbound send gate;
- WhatsApp and Email provider journals;
- provider event reconciliation;
- Human takeover semantics;
- CRM identity registry;
- Customer 360 timeline;
- Task, Deal/Pipeline, Custom Field and Dynamic Lead Segment foundations;
- organization / tenant Business / branch / team / member scope foundations;
- Integration Connection storage at Organization scope.

No current Smart Core runtime file contains a real Chatwoot adapter, Chatwoot webhook receiver, Chatwoot account/inbox mapping, Chatwoot deployment, or Chatwoot source fork.

Therefore the previous Chatwoot references were architecture intent only, not runtime integration.

---

## 3. Upstream source evidence

Latest stable Chatwoot release verified during this audit:

- release: `v4.18.0`
- published: 2026-09-18
- annotated release tag commit: `9f920b549c14491a4e587687a3eed5d21c6ccc7d`

The work package must pin both:

- semantic release tag: `v4.18.0`
- exact source commit: `9f920b549c14491a4e587687a3eed5d21c6ccc7d`

Do not build Production from moving `develop` or an unpinned `latest` image.

### Verified v4.18.0 application stack

Upstream source identifies:

- Ruby 3.4.4;
- Rails 7.2.3.1;
- Node 24.x, Dockerfile pin 24.13.0;
- pnpm 10.x, Dockerfile pin 10.2.0;
- PostgreSQL, official production compose currently uses `pgvector/pgvector:pg16`;
- Redis;
- Sidekiq;
- Rails/Puma web runtime;
- Active Storage;
- Vue 3 frontend built with Vite.

The official production compose runs at least:

- Rails web;
- Sidekiq;
- PostgreSQL;
- Redis;
- persistent Active Storage volume.

This is not a Cloudflare Workers workload.

Cloudflare may front the Chatwoot origin for DNS/TLS/WAF/proxying, but the Chatwoot Rails/Sidekiq runtime must live on a long-running container/VM platform.

---

## 4. License boundary

Verified upstream root `LICENSE`:

- content outside `enterprise/` is available under the MIT Expat license;
- third-party components retain their original licenses;
- required copyright/license notices must be preserved.

Verified upstream `enterprise/LICENSE`:

- Production use of code under `enterprise/` requires a valid Chatwoot Enterprise subscription/license for the applicable seats;
- development/testing rights do not become unlicensed Production rights.

Smart Visions policy:

1. Community source customization is permitted only under the root/community licensing boundary.
2. Do not copy proprietary Enterprise implementation into Smart Core.
3. Do not enable or depend on Enterprise-only source in Production without an intentional valid license.
4. If Smart Visions needs an Enterprise-only capability but does not license it, implement the capability independently inside Smart Core or Community-safe code.
5. Preserve the upstream license and applicable third-party notices in every distributed/custom image/source package.

This document is an engineering/license boundary, not legal advice.

---

## 5. Repository topology decision

### Approved

Maintain Chatwoot as an **upstream-trackable source component**, separate from the Smart Core source tree.

Planned repository identity:

`hamed665/smartvisions-chatwoot`

This name is planned only. It does not become canonical evidence until the repository actually exists.

Recommended Git remotes:

- `origin` -> Smart Visions Chatwoot fork/source repository;
- `upstream` -> `chatwoot/chatwoot`.

Recommended first Smart Visions baseline:

- upstream release tag `v4.18.0`;
- upstream commit `9f920b549c14491a4e587687a3eed5d21c6ccc7d`;
- Smart Visions integration branch cut from that exact commit.

### Rejected

Do not:

- vendor the complete Chatwoot tree into `hamed665/smartvisions`;
- make Smart Core Git history carry thousands of unrelated upstream Chatwoot files;
- build from `develop`;
- rely on `chatwoot/chatwoot:latest` as a Production identity;
- make an untracked manual server edit the canonical source.

The Smart Core repository owns:

- source pin evidence;
- Smart Core bridge contracts;
- Smart Core mapping schema;
- Chatwoot webhook verification;
- safe action bridge;
- reconciliation;
- Smart Visions audit;
- integration health evidence.

The Chatwoot source repository owns:

- Chatwoot source modifications;
- branding/UI customizations;
- Community-safe communication-plane extensions;
- source-build CI;
- Chatwoot image provenance.

---

## 6. Deployment boundary decision

### Separate runtime

Chatwoot must run as its own deployable service plane.

Do not run Chatwoot inside:

- Smart Core Cloudflare Worker;
- the Smart Core Supabase schema;
- the Smart Core Next.js application process.

### Separate database

Chatwoot gets its own PostgreSQL database.

Do not point Chatwoot at the Smart Core Production Supabase PostgreSQL database as an application schema.

Reasons:

- Chatwoot controls its own Rails migrations;
- Chatwoot schema ownership differs from Smart Core domain ownership;
- lifecycle/upgrade/rollback must be independently reversible;
- direct table coupling would destroy the Communication Plane boundary;
- tenant/customer business truth must not become dependent on Chatwoot table internals.

### Separate Redis

Chatwoot uses its own Redis runtime for Sidekiq/realtime/application needs.

Do not reuse a future Smart Core Redis instance as a shared implicit source of truth.

### Object storage

For a serious Production deployment, prefer durable S3-compatible/object storage for attachments over a single local-volume-only design when high availability or server replacement matters.

Attachment projection must still respect Smart Visions retention/privacy policy.

### Planned public origin

A reasonable planned public surface is:

`inbox.smartvisionsai.com`

This is not considered live until DNS, TLS, origin, health, backup and route evidence exist.

---

## 7. Provider ownership decision

This is the most important compatibility decision in the audit.

### Existing Smart Visions WhatsApp and Email

Provider ownership remains in Smart Core.

Do not initially configure the same WhatsApp number or Email provider in a native Chatwoot channel while Smart Core also owns it.

That would risk:

- duplicate provider sends;
- split webhook authority;
- two provider journals;
- inconsistent DNC/consent decisions;
- two retry systems;
- provider acceptance ambiguity;
- human messages bypassing Smart Core safety;
- inconsistent billing/usage evidence.

### Initial Chatwoot channel type

Use `Channel::Api` / API Inbox for each Smart Visions-controlled communication lane.

Upstream source evidence confirms:

- API inboxes have a `webhook_url`;
- API inboxes have their own signing secret;
- incoming messages may be created for API inboxes;
- outgoing messages created by an agent are delivered as API-inbox webhooks;
- API inbox message status may be updated through Chatwoot;
- account webhooks and API inbox webhooks support signed delivery.

This lets Chatwoot act as the UI/operational inbox without taking provider-send authority.

---

## 8. Signed webhook contract

Upstream v4.18.0 signed webhook delivery uses:

- `X-Chatwoot-Delivery`
- `X-Chatwoot-Timestamp`
- `X-Chatwoot-Signature`

Signature shape:

`sha256=HMAC_SHA256(secret, timestamp + "." + raw_body)`

Smart Core receiver requirements:

- verify signature on raw body;
- compare using timing-safe equality;
- require bounded timestamp skew;
- persist/dedupe `X-Chatwoot-Delivery`;
- fail closed on missing/invalid signature for Smart Visions-managed Chatwoot webhooks;
- never trust tenant/account/inbox IDs solely from request body;
- resolve IDs against canonical tenant-bound mapping;
- fast ACK only after durable claim/evidence;
- queue or worker for downstream processing where needed;
- no paid/provider side effect before canonical safety checks.

---

## 9. Chatwoot event surface

Verified upstream account/API-inbox webhook events include:

- `conversation_status_changed`;
- `conversation_updated`;
- `conversation_created`;
- `message_created`;
- `message_updated`;
- `contact_created`;
- `contact_updated`;
- `inbox_created`;
- `inbox_updated`;
- `conversation_typing_on`;
- `conversation_typing_off`;
- `webwidget_triggered`.

The bridge must start with the smallest required subset.

Initial Smart Core consumer scope:

- `message_created`;
- `message_updated`;
- `conversation_status_changed`;
- `conversation_updated`;
- typing events only when needed for Human/AI collision control.

Do not treat every Chatwoot event as a Smart Core command.

---

## 10. Human outbound message contract

When a Human sends a non-private outgoing message in a mapped Chatwoot API inbox:

1. Chatwoot creates its communication-plane Message.
2. Chatwoot emits a signed API-inbox webhook.
3. Smart Core verifies signature/delivery ID/timestamp.
4. Smart Core resolves Chatwoot Account + Inbox + Conversation to canonical tenant/business/conversation/customer recipient.
5. Smart Core creates/reuses an idempotent action claim.
6. Smart Core rechecks:
   - global Kill Switch;
   - channel pause;
   - Shadow Mode;
   - canonical recipient;
   - Lead/customer DNC where applicable;
   - suppression;
   - channel consent;
   - Human/AI mode;
   - market/local send window;
   - WhatsApp 24-hour/template rule;
   - Email health where applicable;
   - Cost Guard/provider quota;
   - required approval.
7. Only then does Smart Core call the provider.
8. Provider response is persisted in the existing provider journal/outreach ledger.
9. Ambiguous provider results enter reconciliation.
10. Smart Core projects verified status/result back to Chatwoot.
11. Material state changes are audited.

A Chatwoot outgoing Message is therefore an **action request/projection**, not proof that the provider has sent anything.

---

## 11. Inbound projection contract

Incoming customer messages continue to enter through Smart Core's provider-specific verified webhook path.

After canonical persistence/resolution:

- create/update the mapped Chatwoot Contact projection;
- create/reuse mapped Chatwoot Conversation;
- create the incoming Chatwoot API-inbox Message;
- store Chatwoot external IDs in tenant-bound mapping/evidence;
- never re-trigger provider work from that projection.

Loop prevention must distinguish:

- provider-origin inbound;
- Smart Core provider result;
- Chatwoot Human-origin outbound request;
- Smart Core-origin AI outbound;
- reconciliation/status projection.

---

## 12. Tenant mapping decision

### Chatwoot Account

Use **one Chatwoot Account per `tenant_business`**.

Do not use one Chatwoot Account for an entire Organization that contains multiple independently operated businesses.

Reasons:

- Chatwoot Account is its principal workspace/data boundary;
- strongest default isolation;
- agency/multi-business organizations naturally map to multiple Chatwoot Accounts;
- users who legitimately work across Businesses may belong to multiple Chatwoot Accounts;
- Business-level deletion/export/operations are cleaner;
- reduces accidental cross-business inbox/contact visibility.

Canonical relation:

```text
Smart Organization
  -> one or more tenant_businesses
      -> exactly one active Chatwoot Account projection per tenant_business
```

### Branch

A Branch does not automatically become a Chatwoot Account.

Branch is represented through mapped Inbox/Team/routing metadata where needed.

### Inbox

A Chatwoot Inbox represents a communication lane such as:

- tenant Business;
- branch if needed;
- channel;
- provider connection.

Examples:

- Almaha / Bosher / WhatsApp;
- Almaha / Bosher / Email;
- Sahra / Maabela / WhatsApp.

### Team

Smart Core Teams may project into Chatwoot Teams when communication assignment needs the mapping.

Chatwoot Team remains communication assignment state, not Smart Core IAM truth.

### User

Smart Core/Supabase user identity remains canonical.

Chatwoot User/Agent is a projection/membership.

A user may be assigned to multiple Chatwoot Accounts when Smart Core scope allows it.

---

## 13. Contact and conversation ownership

### Chatwoot Contact

Projection only.

May carry:

- display name;
- safe contact presentation fields;
- opaque Smart Core identifiers;
- communication metadata needed by agents.

Must not become the authoritative Customer/Person/CRM row.

### Chatwoot Conversation

Operational communication projection.

May own:

- inbox;
- assignee;
- team;
- operational status;
- unread state;
- private notes;
- typing/presence;
- Chatwoot-local UI metadata.

Smart Core remains authoritative for:

- canonical customer identity;
- commercial lifecycle;
- Lead/Deal status;
- DNC/consent;
- bookings/payments;
- AI/Human policy;
- provider delivery truth.

---

## 14. Current Smart Core schema reuse assessment

### Reuse

- `organizations`
- `tenant_businesses`
- `branches`
- `teams`
- `organization_members`
- `member_scope_assignments`
- CRM identity registry
- canonical conversations/provider journals
- audit log
- current outbound send gate

### Do not overload

Current `integration_connections` is Organization-scoped and currently has no `tenant_business_id` or `branch_id`.

Do not hide canonical Chatwoot Business/Account/Inbox mapping solely inside its JSON `config` column.

The bridge needs explicit tenant-consistent durable mapping.

The exact schema is deferred to `COMM-TENANT-BRIDGE`, but expected mapping facts include:

- organization_id;
- tenant_business_id;
- optional branch_id;
- Chatwoot account ID;
- Chatwoot inbox ID;
- channel;
- provider/integration identity;
- mapping status/version;
- last verification evidence;
- no plaintext provider or Chatwoot secrets.

---

## 15. Authentication and secret boundary

### Chatwoot Platform API

Upstream Community source includes Platform App/Platform API support.

Platform API authentication uses `api_access_token` attached to a Platform App and supports account/account-user lifecycle.

Use cases:

- controlled Chatwoot Account provisioning;
- account/user membership automation.

### Account API

Account-scoped operations are used for:

- inboxes;
- webhooks;
- teams/agents where applicable;
- contacts;
- conversations;
- messages.

### Secret handling

Do not put raw secrets/tokens into:

- browser-accessible environment variables;
- `integration_connections.config`;
- Chatwoot Contact custom attributes;
- audit logs;
- Git.

Store secrets in the deployment secret store.

Smart Core database may hold:

- secret reference/key identifier;
- external resource IDs;
- last verification timestamp;
- non-secret capability/health metadata.

---

## 16. API Inbox choice versus native Chatwoot channel choice

### API Inbox is approved for the first production bridge

Advantages:

- preserves provider ownership in Smart Core;
- Human reply still uses Chatwoot UI;
- signed webhook boundary;
- incoming projection supported;
- message status update supported;
- avoids duplicated provider credentials;
- avoids duplicated provider retry/reconciliation systems;
- avoids bypassing Smart Core consent/send gate.

### Native Chatwoot WhatsApp/Email is deferred

It may be reconsidered only if a later evidence-backed migration explicitly transfers provider ownership from Smart Core to Chatwoot.

Such a migration would require:

- one provider webhook authority;
- one send/retry authority;
- canonical safety gate parity;
- billing/usage parity;
- provider result reconciliation;
- controlled cutover/rollback;
- zero duplicate send window.

There is currently no reason to do that.

---

## 17. Chatwoot features that are projection-only

The following may be used for agent productivity but must not replace Smart Core domain truth:

- Contact labels;
- conversation labels;
- canned responses;
- private notes;
- custom views;
- Chatwoot contact segments;
- Chatwoot campaigns;
- Chatwoot automation rules;
- Chatwoot contact custom attributes.

For example:

- Smart Visions governed Segment remains the canonical business audience;
- Chatwoot Segment is not equivalent to Smart Visions Segment;
- Smart Visions Workflow remains the canonical business automation engine;
- Chatwoot automation may only be used for communication-plane UX behavior that cannot cause unsafe provider/business side effects.

---

## 18. Chatwoot AI boundary

Do not allow Chatwoot Captain/AI or another Chatwoot-side AI subsystem to become a second Smart Visions Agent framework.

Smart Visions AI Plane remains:

- model router;
- Context Compiler;
- Knowledge/Memory;
- agents;
- Policy;
- Approval;
- tools;
- Cost Guard;
- evaluation.

If Chatwoot exposes an agent-bot integration, use it only as a communication projection/transport boundary into Smart Visions AI, not as a parallel business brain.

---

## 19. Branding/custom source policy

Allowed source changes should be intentionally small and upstream-friendly.

Initial source modifications may include:

- Smart Visions product branding;
- login/workspace presentation;
- safe navigation links into Smart Visions Business OS;
- hiding Community features Smart Visions intentionally does not expose;
- adding opaque Smart Visions integration metadata/hooks where upstream API/webhook contracts are insufficient.

Prefer configuration/API integration before modifying core Chatwoot behavior.

Every source patch must answer:

- why upstream/config/API is insufficient;
- whether patch touches Community or Enterprise path;
- migration impact;
- upstream rebase conflict risk;
- rollback behavior.

---

## 20. Source-build and supply-chain requirements

A Smart Visions Chatwoot image is acceptable only if build evidence records:

- upstream tag;
- upstream commit;
- Smart Visions source commit;
- Docker image digest;
- build timestamp;
- dependency lockfiles;
- license/NOTICE inventory;
- CI result;
- vulnerability/dependency scan result where available.

Do not deploy an unpinned `:latest` image.

The running Chatwoot health/version endpoint or image metadata must make source provenance observable.

---

## 21. Upgrade policy

For every upstream Chatwoot upgrade:

1. fetch upstream tags;
2. inspect release notes/security changes;
3. compare current pinned upstream commit to candidate;
4. rebase/merge Smart Visions Community-safe source changes;
5. run upstream + Smart Visions integration tests;
6. build immutable candidate image;
7. back up Chatwoot PostgreSQL/object storage as applicable;
8. verify migrations in non-Production;
9. deploy candidate;
10. test signed webhook bridge and Human reply path without live provider side effects where possible;
11. controlled Production rollout;
12. verify DB migration, Sidekiq, web, websocket/realtime, attachment path and bridge;
13. keep previous image + DB restore plan;
14. record new exact source/image identities.

Never auto-upgrade Production from a floating tag.

---

## 22. Backup and disaster recovery boundary

Chatwoot DR must cover:

- Chatwoot PostgreSQL;
- attachment/object storage;
- deployment secrets/config;
- exact image/source version;
- Redis only to the extent required by the selected runtime model; Redis must not be treated as the durable business source of truth.

Smart Core DR remains separate.

A Chatwoot outage must not corrupt Smart Core customer/provider truth.

Provider inbound processing should remain durable in Smart Core even if Chatwoot projection is temporarily unavailable; projection may reconcile later.

---

## 23. Failure semantics

### Chatwoot unavailable

- provider inbound still lands in Smart Core;
- Smart Core journals remain canonical;
- projection is retried/reconciled;
- no customer message is lost because Chatwoot was down.

### Smart Core unavailable

Chatwoot Human outbound action cannot bypass Smart Core to send directly on Smart Visions-controlled channels.

Fail closed and show/send operational failure state.

### Provider ambiguous

- no blind retry;
- reconciliation owns resolution;
- Chatwoot is updated only from verified/canonical evidence.

### Mapping missing/ambiguous

- no provider send;
- no cross-tenant fallback;
- create operational incident/task/evidence.

---

## 24. Initial observability requirements

Track per Chatwoot bridge:

- webhook received;
- signature failure;
- replay/dedupe;
- mapping failure;
- projection latency;
- Human outbound requested;
- Smart Core action blocked;
- provider accepted;
- provider failed;
- ambiguous/reconciliation;
- Chatwoot status projection success/failure;
- account/inbox health;
- source/image version.

Do not copy message bodies or sensitive customer payloads into operational logs by default.

---

## 25. Explicitly deferred from COMM-CHATWOOT-SOURCE

The source foundation does not yet implement:

- full tenant mapping schema;
- provider message bridge;
- Human takeover state synchronization;
- assignment/team synchronization;
- Customer/Person v2;
- Instagram/Facebook/TikTok channel expansion;
- Chatwoot mobile customization;
- Enterprise-only Chatwoot features;
- Smart Visions workflow/booking/commerce modules.

Those belong to their stable Work Package IDs.

---

## 26. First source-foundation implementation scope

`COMM-CHATWOOT-SOURCE` implementation is approved to deliver only:

1. exact upstream source lock:
   - `v4.18.0`;
   - commit `9f920b549c14491a4e587687a3eed5d21c6ccc7d`;
2. upstream-trackable Smart Visions source repository/fork or equivalent source-build repository boundary;
3. Community/Enterprise license boundary checks;
4. reproducible custom source image build;
5. immutable image provenance;
6. Smart Visions branding baseline;
7. environment template without secrets;
8. web + Sidekiq + PostgreSQL + Redis + storage deployment contract;
9. health/version evidence;
10. Development/Candidate/Production environment separation;
11. upgrade/rebase/rollback runbook;
12. no provider channel activation;
13. no Smart Core schema migration unless a proven source-provenance fact truly requires one;
14. no customer/provider send.

If repository provisioning cannot be executed by the current automation connection, record that as an external provisioning dependency rather than pretending a fork exists.

---

## 27. Next Work Package after source foundation

After `COMM-CHATWOOT-SOURCE` is Production/provisioning verified, continue to:

`COMM-TENANT-BRIDGE`

That package owns the tenant-bound mapping schema and provisioning reconciliation.

Do not jump directly to provider message bridging before the Account/Business/Inbox mapping contract exists.

---

## 28. Exit decision

Audit result: **APPROVED**

Architecture:

```text
Chatwoot Community Source
        |
        | communication UI / inbox / assignment / notes
        v
Signed Smart Core Bridge
        |
        | tenant mapping + policy/action requests
        v
Smart Visions Core
        |
        | canonical provider send gate
        v
WhatsApp / Email / future providers
```

Source baseline:

`Chatwoot v4.18.0 @ 9f920b549c14491a4e587687a3eed5d21c6ccc7d`

Provider ownership baseline:

`Smart Core`

Initial Chatwoot provider projection type:

`Channel::Api`

Chatwoot tenancy projection:

`tenant_business -> Chatwoot Account`

Deployment boundary:

`separate containerized Chatwoot plane + separate Postgres + separate Redis + durable storage`

Next implementation cursor remains:

`SECTION COMMUNICATION / COMM-CHATWOOT-SOURCE`

but the action changes from audit to source foundation implementation.
