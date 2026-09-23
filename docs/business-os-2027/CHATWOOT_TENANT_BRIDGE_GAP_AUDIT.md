# Chatwoot Tenant Bridge — Gap Audit

Program cursor: `SECTION COMMUNICATION / COMM-TENANT-BRIDGE`

Audit date: 2026-09-23

Stack dependency:

- this audit is stacked on `COMM-CHATWOOT-SOURCE`;
- source-foundation PR #195 must merge with real runner-backed CI and source Docker build before Tenant Bridge implementation may merge;
- this document is read-only planning evidence and does not change Production schema, Chatwoot runtime, provider routing or customer messaging.

---

## 1. Audit result

Status: **APPROVED FOR IMPLEMENTATION AFTER COMM-CHATWOOT-SOURCE IS GREEN**

The Tenant Bridge must be a deterministic mapping/reconciliation layer between canonical Smart Core tenancy/IAM and Chatwoot communication-plane resources.

It must not turn Chatwoot into:

- the tenant source of truth;
- the IAM source of truth;
- the CRM/customer source of truth;
- the provider credential source of truth;
- the provider send authority;
- the consent/DNC source of truth.

Canonical direction:

```text
Smart Core canonical tenancy/IAM
        |
        | provision / reconcile
        v
Chatwoot Account / User / Inbox / Team projections
        |
        | operational communication state only
        v
Chatwoot Contact / Conversation projections
```

Provider authority remains:

`SMART_CORE`

Initial Chatwoot provider projection remains:

`Channel::Api`

---

## 2. Production evidence at audit time

Fresh Production evidence during this audit:

- latest Business OS migration: `0076_crm_segment_governance`;
- Shadow Mode: ON;
- global Kill Switch: OFF;
- Email pause: OFF;
- WhatsApp AI pause: OFF;
- Agents pause: OFF;
- latest checked scheduled heartbeat: `failed=0`;
- Chatwoot-specific Smart Core tables: 0;
- Organizations: 1;
- Brands: 0;
- tenant Businesses: 0;
- Branches: 0;
- Departments: 0;
- Teams: 0;
- organization members: 1 OWNER;
- member scope assignments: 0;
- integration connections: 7;
- CRM identities: 47;
- CRM identity links: 47;
- sales conversations: 12;
- conversation messages: 37.

The existing Organization is `Smart Visions`.

Important consequence:

**There is currently no real tenant_business row to provision into Chatwoot.**

Therefore:

- do not fabricate a Production tenant Business merely to demonstrate Chatwoot;
- do not treat the 19 rows in `public.businesses` as tenant Businesses;
- do not persist a Chatwoot Account mapping until a real ACTIVE `tenant_business` exists;
- Production verification of mapping logic must use rollback-only fixtures until an owner-approved real Business hierarchy is created.

---

## 3. Canonical Smart Core boundaries

### Organization

`public.organizations` remains the canonical tenant root.

### Tenant Business

`public.tenant_businesses` is the canonical tenant-owned Business hierarchy entity.

It is deliberately distinct from:

`public.businesses`

The latter remains the current Growth/Hunter CRM Company/Account/prospect entity.

These two tables must never be conflated merely because both contain the word "business".

### Branch / Department / Team

Canonical hierarchy:

```text
Organization
  -> Brand
     -> tenant_business
        -> Branch
           -> Department
              -> Team
```

Composite tenant-consistency foreign keys from migration 0068 already enforce lineage.

### IAM

Canonical sources:

- `organization_members`
- `member_scope_assignments`
- `lib/business-os/control-plane.ts`

The existing `effectiveRoleForScope()` helper is the semantic source for effective scoped role resolution.

Chatwoot membership must project this result. It must never override it.

---

## 4. Chatwoot resource evidence

Verified against Chatwoot Community `v4.18.0`.

### Account

Chatwoot `accounts.id` is an integer/serial resource and is the principal workspace boundary.

Decision:

**one ACTIVE Chatwoot Account per ACTIVE Smart Core tenant_business.**

Not per Organization.

Not per Growth/Hunter `public.businesses` row.

### User

Chatwoot `users.id` is a deployment-global integer/serial resource.

A Chatwoot User may belong to multiple Accounts through `account_users`.

Decision:

**one Chatwoot User projection per Smart Core auth user, with Account membership mapped separately.**

Do not create duplicate Chatwoot users per tenant Business.

### AccountUser

Chatwoot Community roles are only:

- `agent`
- `administrator`

It does not provide a Community read-only AccountUser role.

This matters for VIEWER.

### Inbox

Chatwoot Inbox belongs to exactly one Account.

For the initial Smart Visions bridge, the Chatwoot channel type must be:

`Channel::Api`

### Team

Chatwoot Team belongs to one Account.

Team membership is separate from Account membership.

### Contact

Chatwoot Contact belongs to one Account.

It is a projection, not the canonical Smart Visions Person/Customer.

### Conversation

Chatwoot Conversation belongs to one Account and one Inbox.

It is operational communication state, not canonical Smart Core CRM/business truth.

---

## 5. First critical gap: no provider-lane -> tenant Business binding

Current `integration_connections` is Organization-scoped.

It has no:

- `tenant_business_id`;
- `branch_id`.

It also currently enforces `UNIQUE (organization_id, provider, channel)`. Therefore the present Growth OS connection model can represent only one row for a lane such as Meta/WhatsApp per Organization. Slice A does not silently weaken that invariant. Its binding references `integration_connection_id` so a later governed multi-instance connection model can add multiple provider accounts/numbers without redesigning the Tenant Bridge mapping contract.

Current Production integrations include connected WhatsApp and Email at Organization scope.

That is sufficient for the existing single-organization Growth OS runtime.

It is **not sufficient** to decide which tenant Business owns an inbound provider lane once the Organization contains multiple tenant Businesses.

Do not hide that assignment inside `integration_connections.config`.

### Required new canonical primitive

Introduce a typed binding such as:

`communication_channel_bindings`

Purpose:

bind one existing Smart Core provider/integration lane to one canonical tenant Business, optionally one Branch.

Minimum facts:

- id;
- organization_id;
- tenant_business_id;
- optional branch_id;
- integration_connection_id;
- channel;
- lifecycle status;
- version;
- request-key/idempotency evidence;
- created/updated actor;
- timestamps;
- last verification evidence.

Rules:

- same-Organization composite validation;
- ACTIVE tenant Business required for activation;
- Branch, if supplied, must belong to that tenant Business;
- one integration connection may have at most one ACTIVE tenant-Business binding in the first version;
- one Business may have multiple bindings, for example multiple WhatsApp numbers;
- safety pause/Kill Switch/Shadow Mode are **not** copied into this table;
- provider credentials are **not** copied into this table;
- binding lifecycle does not imply provider-send permission.

Initial lifecycle:

`ACTIVE <-> ARCHIVED`

A separate generic PAUSED state would duplicate existing runtime safety controls and is therefore not approved.

---

## 6. Chatwoot Account mapping

Required mapping:

`tenant_business -> Chatwoot Account`

Suggested explicit table:

`chatwoot_account_mappings`

Minimum facts:

- id;
- organization_id;
- tenant_business_id;
- chatwoot_account_id;
- status;
- version;
- last_request_key;
- last_verified_at;
- last_error_code;
- created_by_user_id;
- updated_by_user_id;
- created_at;
- updated_at.

First-version runtime assumes one primary Chatwoot installation.

Do not add multi-region/multi-installation sharding until a real scaling/deployment requirement proves it.

Constraints:

- unique ACTIVE mapping per tenant_business;
- unique ACTIVE Chatwoot account ID;
- tenant ownership immutable;
- no destructive DELETE;
- optimistic version checks;
- request-key idempotency;
- material changes audited.

Lifecycle:

`PROVISIONING -> ACTIVE`

`PROVISIONING -> DEGRADED`

`ACTIVE -> DEGRADED`

`DEGRADED -> ACTIVE`

`PROVISIONING|ACTIVE|DEGRADED -> ARCHIVED`

`ARCHIVED` is terminal for the mapping row.

Replacement creates a new mapping row after the old mapping is archived.

---

## 7. Chatwoot Account provisioning semantics

Provisioning is a server-side Smart Core command.

Authenticated browser code must never hold the Chatwoot Platform App token.

Before create:

1. authenticate Smart Visions user;
2. resolve canonical Organization membership;
3. require owner-authorized control-plane mutation;
4. load tenant_business;
5. verify ACTIVE status;
6. verify canonical lineage;
7. check existing mapping;
8. claim request key;
9. call Chatwoot Platform API.

Chatwoot Platform Account custom attributes may include an opaque Smart Visions tenant Business identifier for reconciliation.

That external metadata is recovery evidence only.

The Smart Core mapping table remains canonical.

### Ambiguous create outcome

A timeout after Chatwoot accepted an Account create must not cause blind create retry.

Reconcile by listing Platform-App-visible Accounts and matching the opaque Smart Visions tenant Business marker.

Outcome:

- exactly one match -> adopt and verify;
- zero matches -> safely retry under the same request claim;
- more than one match -> fail closed, mark DEGRADED, require reconciliation.

---

## 8. Chatwoot User projection

Required mapping:

`auth.users.id -> Chatwoot User`

Suggested explicit table:

`chatwoot_user_mappings`

The Chatwoot User is deployment-global, so do not duplicate it per tenant Business.

Minimum facts:

- smart_user_id;
- chatwoot_user_id;
- status;
- version;
- last_verified_at;
- last_error_code;
- created_at;
- updated_at.

No password or Chatwoot access token is stored in this table.

The table should not become a public staff directory.

Preferred access:

- service-side provisioning/reconciliation;
- authenticated user may read their own mapping if product UX requires it;
- ordinary cross-user direct Data API reads are not required.

### Login

Prefer Smart Visions-authenticated handoff through Chatwoot Platform API login/SSO link instead of maintaining a second user password experience.

Smart Core must verify the user's canonical membership before requesting a Chatwoot login link.

---

## 9. Account membership mapping

Required mapping:

`tenant_business + Smart user -> Chatwoot AccountUser`

Suggested explicit table:

`chatwoot_account_memberships`

Minimum facts:

- organization_id;
- tenant_business_id;
- smart_user_id;
- chatwoot_account_mapping_id;
- chatwoot_user_id;
- chatwoot_role;
- effective_smart_role;
- status;
- version;
- last_verified_at;
- timestamps.

Role derivation must use canonical Smart Core scope resolution.

### Approved role projection

- Smart `OWNER` -> Chatwoot `administrator`
- Smart `ADMIN` -> Chatwoot `administrator`
- Smart `SALES_MANAGER` -> Chatwoot `agent`
- Smart `SALES_AGENT` -> Chatwoot `agent`
- Smart `VIEWER` -> **no Chatwoot membership in the first version**

Reason:

Chatwoot Community has no read-only AccountUser role.

Mapping VIEWER to agent would silently grant reply capability.

That privilege expansion is prohibited.

A future read-only communication UX must be implemented intentionally rather than pretending Chatwoot agent is read-only.

### Destructive Chatwoot admin actions

A Chatwoot administrator deleting/modifying a Chatwoot projection must never delete canonical Smart Core CRM/provider truth.

Projection reconciliation remains authoritative.

---

## 10. Inbox mapping

Required mapping:

`communication_channel_binding -> Chatwoot API Inbox`

Suggested explicit table:

`chatwoot_inbox_mappings`

Minimum facts:

- organization_id;
- tenant_business_id;
- optional branch_id;
- channel_binding_id;
- chatwoot_account_mapping_id;
- chatwoot_inbox_id;
- Chatwoot channel type;
- status;
- version;
- last_verified_at;
- timestamps.

Initial channel type is fixed to:

`Channel::Api`

First-version rules:

- mapped Chatwoot Account must belong to the same tenant Business;
- mapped channel binding must belong to the same tenant Business;
- optional Branch must match the binding lineage;
- one ACTIVE Chatwoot Inbox per active channel binding;
- no native Chatwoot WhatsApp/Email provider connection;
- no provider credential copied into Chatwoot.

The API Inbox webhook secret belongs in the deployment secret store, not this table.

A secret-reference identifier may be persisted later if operationally required, but never the raw secret.

---

## 11. Team mapping

Required mapping:

`Smart Core Team -> Chatwoot Team`

Suggested explicit table:

`chatwoot_team_mappings`

Only Teams whose lineage resolves into the mapped tenant Business may be projected.

Minimum facts:

- organization_id;
- tenant_business_id;
- smart_team_id;
- chatwoot_account_mapping_id;
- chatwoot_team_id;
- projected_name;
- status;
- version;
- last_verified_at;
- timestamps.

Chatwoot Team is communication assignment state only.

Smart Core Team remains canonical IAM/organizational truth.

Because Chatwoot Team names are unique per Account, projected naming must be deterministic enough to avoid collisions across Branch/Department Teams with the same human-facing name.

Do not depend on display name alone for canonical reconciliation.

---

## 12. Contact projection mapping

Do **not** create a canonical Person model in this work package.

`CRM-PERSON-CONTACT` remains a later governed Work Package.

The existing canonical identity evidence is:

- `crm_identities`;
- `crm_identity_links`.

Therefore first communication-plane Contact projection should anchor to identity evidence rather than inventing a Person.

Suggested later mapping:

`chatwoot_contact_identity_mappings`

Minimum facts:

- organization_id;
- tenant_business_id;
- crm_identity_id;
- optional current CRM business evidence;
- chatwoot_account_mapping_id;
- chatwoot_contact_id;
- status;
- last_verified_at.

Rules:

- same identity may project into separate Chatwoot Accounts for separate tenant Businesses;
- multiple canonical identities may later reconcile to the same Chatwoot Contact only when Smart Core identity evidence supports that;
- provider display name alone never creates/merges a canonical person;
- Chatwoot email/phone/name fields are projection data;
- Smart Core remains canonical.

This mapping is **not approved for implementation until a real tenant Business + channel binding exists**.

---

## 13. Conversation projection mapping

Current `sales_conversations` is Organization-scoped and does not contain `tenant_business_id`.

That is a real gap.

Existing 12 Production conversations therefore have no evidence-backed tenant Business owner today.

They must not be bulk-assigned to a fabricated Business.

Suggested later mapping:

`chatwoot_conversation_mappings`

Minimum facts:

- organization_id;
- tenant_business_id;
- channel_binding_id;
- sales_conversation_id;
- chatwoot_account_mapping_id;
- chatwoot_inbox_mapping_id;
- chatwoot_conversation_id;
- chatwoot_conversation_uuid where useful;
- status;
- last_verified_at.

Rules:

- one Smart Core sales conversation may have at most one ACTIVE tenant-Business communication mapping;
- mapping requires an ACTIVE channel binding;
- Conversation channel must match the binding channel;
- no mapping from provider/display metadata alone;
- no cross-Business fallback.

### Canonical conversation scope

Before live Chatwoot conversation projection is enabled, Smart Core must decide and implement one canonical way to persist tenant Business scope for newly routed conversations.

Preferred direction:

add nullable tenant-business/channel-binding scope to the canonical Smart Core conversation path for new Business-OS traffic.

Do not backfill historical conversations without evidence.

This is implementation work inside the same stable `COMM-TENANT-BRIDGE` Work Package or the immediately dependent reconciliation slice; it must not become a Chatwoot-only hidden ownership fact.

---

## 14. Existing integration_connections

Current Production has seven Organization-level integration rows.

This table remains canonical integration/provider connection truth.

Tenant Bridge does not replace it.

Approved relationship:

```text
integration_connections
        |
        v
communication_channel_bindings
        |
        v
chatwoot_inbox_mappings
```

Do not:

- add Chatwoot external IDs into `integration_connections.config` as canonical mapping;
- clone provider credentials into new mapping tables;
- interpret an Organization-level provider connection as permission to expose it to every tenant Business.

---

## 15. Security and RLS

All public mapping tables must have RLS.

Tenant-owned rows must carry `organization_id` and use composite tenant-consistency constraints.

Authenticated direct table mutation should be minimized.

Preferred mutation pattern:

- authenticated API boundary;
- typed payload validation;
- SECURITY INVOKER database RPC or tightly scoped RLS mutation;
- request key;
- optimistic version;
- canonical audit.

Do not add SECURITY DEFINER merely to bypass RLS.

Service-side Chatwoot HTTP calls may use server-only credentials, but a service credential does not waive tenant validation.

Before every external mutation:

- re-read canonical Organization;
- re-read tenant Business status;
- re-read effective user role;
- re-read current mapping/version.

---

## 16. Secret handling

Never persist raw:

- Platform App token;
- Account API token;
- User token;
- API Inbox webhook signing secret;
- provider credentials;
- SMTP password;
- Redis password;
- database password.

Secrets live in deployment secret storage.

Database mapping rows may contain:

- opaque secret reference;
- external resource ID;
- last verification timestamp;
- capability/health metadata;
- non-sensitive error code.

Audit logs must not contain raw tokens or message bodies.

---

## 17. Idempotency and optimistic concurrency

Every provision/reconcile mutation requires:

- non-empty request key;
- bounded request-key length;
- durable duplicate detection;
- expected version on mutable mapping state;
- idempotent adoption after ambiguous external outcomes.

Do not use a second event store merely for Chatwoot.

Reuse canonical `audit_logs` for material evidence.

If a dedicated short command-claim table is proven necessary for external create ambiguity, it must remain a command/idempotency primitive, not a parallel business event journal.

---

## 18. Audit events

Use the existing audit log.

Minimum event catalog:

- `CHATWOOT_ACCOUNT_MAPPING_CREATED`
- `CHATWOOT_ACCOUNT_MAPPING_ACTIVATED`
- `CHATWOOT_ACCOUNT_MAPPING_DEGRADED`
- `CHATWOOT_ACCOUNT_MAPPING_ARCHIVED`
- `CHATWOOT_USER_LINKED`
- `CHATWOOT_MEMBERSHIP_RECONCILED`
- `CHATWOOT_INBOX_MAPPING_CREATED`
- `CHATWOOT_INBOX_MAPPING_VERIFIED`
- `CHATWOOT_TEAM_MAPPING_RECONCILED`
- `CHATWOOT_MAPPING_RECONCILIATION_REQUIRED`

Audit payload should contain IDs, versions, lifecycle, request/correlation evidence and bounded error codes.

Do not duplicate email/phone/message content into mapping audit.

---

## 19. Reconciliation contract

Mappings are not assumed correct forever.

Reconciliation checks:

### Account

- external Account still exists;
- mapping custom marker matches expected tenant Business;
- account not suspended unexpectedly;
- no duplicate account marker.

### User

- external User exists;
- expected Smart user link still matches;
- no duplicate ambiguous external user.

### Membership

- Chatwoot AccountUser exists;
- role equals projected canonical Smart effective role;
- removed Smart access results in Chatwoot membership removal.

### Inbox

- Inbox exists under expected Account;
- channel type remains API;
- binding is still ACTIVE;
- no native provider credential was attached.

### Team

- Team exists under expected Account;
- mapped Smart Team lineage still resolves to the same tenant Business.

Unknown/ambiguous state:

- mark mapping DEGRADED;
- fail closed for new provider action paths depending on that mapping;
- create operational evidence;
- do not silently recreate duplicates.

---

## 20. Provisioning order

Deterministic order:

1. real Smart Core Brand exists;
2. real ACTIVE tenant Business exists;
3. optional Branch/Department/Team exists;
4. communication channel binding exists;
5. Chatwoot Account mapping;
6. Chatwoot User mapping;
7. Account membership;
8. Chatwoot API Inbox mapping;
9. Team mapping;
10. only then Contact/Conversation projections.

No lower resource may be provisioned before its parent mapping is ACTIVE.

---

## 21. Production rollout rule

Current Production has 0 Brands and 0 tenant Businesses.

Therefore the initial implementation can safely create schema/contracts with zero rows.

Production smoke must be rollback-only:

- create fixture Brand;
- create fixture tenant Business;
- create fixture Branch/Department/Team as needed;
- create mapping fixtures using synthetic Chatwoot external IDs only at pure DB-contract stage;
- verify cross-tenant failures;
- verify role projection contract in tests;
- verify lifecycle/version/idempotency;
- rollback;
- leave zero tenant hierarchy/mapping fixture residue.

Do not call a real Chatwoot Production API merely to prove database constraints.

Actual Chatwoot provisioning smoke waits for:

- PR #195 source build green;
- real Chatwoot Candidate deployment;
- Candidate PostgreSQL/Redis/storage;
- Platform App secret;
- explicit non-customer Candidate test account.

---

## 22. Initial implementation slicing inside COMM-TENANT-BRIDGE

The stable Work Package may span several actual PRs.

Do not rename or renumber it if that happens.

### Slice A — Tenant/channel + Account mapping contract

Implement:

- `communication_channel_bindings`;
- `chatwoot_account_mappings`;
- lifecycle/version/idempotency;
- RLS/RBAC;
- audit;
- pure DB/runtime validation;
- zero live Chatwoot call.

### Slice B — User/membership/inbox/team mapping contract

Implement:

- `chatwoot_user_mappings`;
- `chatwoot_account_memberships`;
- `chatwoot_inbox_mappings`;
- `chatwoot_team_mappings`;
- canonical Smart role projection;
- VIEWER fail-closed;
- secret references only;
- zero provider send.

### Slice C — Candidate provisioning/reconciliation adapter

Only after source plane Candidate exists:

- Platform Account provisioning;
- User provisioning/link;
- AccountUser reconciliation;
- API Inbox provisioning;
- Team provisioning;
- signed/typed Chatwoot client;
- ambiguous-outcome reconciliation;
- Candidate-only smoke.

### Slice D — Contact/conversation projection mapping

Only after:

- real tenant Business scope exists;
- active channel binding exists;
- canonical new-conversation tenant scope is implemented.

Then add Contact identity and Conversation projection mappings.

---

## 23. Explicit non-scope of the first implementation slice

Slice A does not:

- create a real Production Brand/tenant Business;
- activate Chatwoot provider channels;
- send Email/WhatsApp;
- create Chatwoot Contacts;
- create Chatwoot Conversations;
- synchronize Human/AI takeover;
- enable native Meta/Email connectors in Chatwoot;
- create Person/Contact v2;
- backfill historical conversations to a guessed tenant Business;
- move provider credentials;
- disable Shadow Mode.

---

## 24. Required tests

At minimum:

- composite tenant lineage rejects cross-Organization Business/Branch references;
- one active provider lane cannot bind to two tenant Businesses;
- one tenant Business has at most one active Chatwoot Account mapping;
- external Chatwoot Account ID cannot be active in two tenant mappings;
- organization_id immutable;
- archived mapping cannot reactivate in place if contract chooses terminal archive;
- request-key replay returns the same logical result;
- stale expected version fails;
- OWNER/ADMIN -> administrator;
- SALES_MANAGER/SALES_AGENT -> agent;
- VIEWER -> no Chatwoot membership;
- no Enterprise/Provider credentials in mapping payloads;
- no provider send method in mapping module;
- no Chatwoot external call in pure schema smoke;
- audit PII minimization;
- rollback-only PostgreSQL 17 smoke;
- current migration chain remains green.

---

## 24A. Slice A implementation hardening recorded after audit

The stacked Slice A implementation uses a small immutable `chatwoot_bridge_command_claims` table strictly as a command/idempotency primitive, not as a business event store.

The claim contract records:

- Organization + request key;
- command type;
- entity type/id;
- applied semantic row version;
- SHA-256 canonical payload fingerprint;
- creating Smart user;
- timestamp.

Properties:

- request keys remain durable even after target rows later change lifecycle/version;
- replay of an old create key resolves to the same current entity rather than creating a replacement;
- reuse of the same key with a different canonical payload fails closed;
- failed commands roll back their claim atomically;
- claims are immutable and are not separately audited as business events;
- provider credentials, message bodies and customer PII are absent from claim payload evidence.

Channel binding `last_verified_at` is not fabricated during create/reactivation because no external provider/Chatwoot verification occurs in Slice A.

## 25. Exit criteria

`COMM-TENANT-BRIDGE` is complete only when:

- source Chatwoot plane is deployed and version-proven;
- a real Smart Core tenant Business can deterministically map to one Chatwoot Account;
- authorized Smart users deterministically map to Chatwoot users/memberships;
- API Inbox and Team mappings are tenant-safe;
- ambiguous external outcomes reconcile rather than duplicate;
- mapping health is observable;
- Contact/Conversation projections use explicit tenant/channel evidence;
- no cross-tenant leakage exists;
- no provider-send bypass exists;
- no raw secrets are stored in ordinary mapping data;
- no historical conversation is assigned to a tenant Business without evidence.

Until those conditions are met, the Work Package remains partial.

---

## 26. Decision

Audit result:

**APPROVED**

First implementation target after PR #195 is truly green:

`COMM-TENANT-BRIDGE / Slice A — Tenant/channel + Account mapping contract`

No Production schema implementation is authorized by this audit while the source-foundation dependency remains runner-blocked.
