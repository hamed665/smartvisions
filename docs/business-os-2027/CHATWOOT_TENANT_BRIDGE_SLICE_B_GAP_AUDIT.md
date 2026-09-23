# Chatwoot Tenant Bridge — Slice B Gap Audit

Program cursor:

`SECTION COMMUNICATION / COMM-TENANT-BRIDGE / Slice B — User, membership, Inbox and Team mapping contract`

Audit date: 2026-09-23

Dependency stack:

1. PR #195 — `COMM-CHATWOOT-SOURCE`
2. PR #196 — Tenant Bridge gap audit
3. PR #197 — Slice A tenant/channel + Account mapping implementation
4. this Slice B audit

This audit is documentation-only.

It does not:

- apply migration 0077;
- create a Production Brand or tenant Business;
- create a Chatwoot User/Account/Inbox/Team;
- read or persist a Chatwoot Platform token;
- activate a provider channel;
- send a customer/provider message;
- change Shadow Mode.

Slice B implementation must not merge before the dependency stack is green in order.

---

## 1. Audit result

Status:

**APPROVED FOR IMPLEMENTATION AFTER SLICE A IS REAL-CI GREEN**

Slice B should add governed projection contracts for:

- Smart Auth User -> Chatwoot User;
- Smart tenant-Business membership -> Chatwoot AccountUser;
- Smart communication channel binding -> Chatwoot API Inbox;
- Smart Team -> Chatwoot Team;
- governed Inbox membership for non-administrator agents.

It must not create a second IAM source.

Canonical identity/access decisions remain in Smart Core.

---

## 2. Current Smart staff identity evidence

Current Production has:

- one Organization;
- one Organization member;
- member role: OWNER;
- zero `member_scope_assignments`;
- no public staff/profile table;
- no public canonical person/staff-name model.

`organization_members` stores:

- `organization_id`;
- `user_id`;
- `role`.

Canonical authentication identity lives in Supabase Auth.

The existing Organization member has:

- a verified/non-empty Auth email;
- no canonical phone;
- no canonical human display-name field in current user metadata;
- only `email_verified` metadata key at the checked Production state.

Therefore Slice B must not fabricate a human name.

---

## 3. Canonical staff identity decision

Canonical Smart staff identity:

```text
auth.users.id
  + organization_members
  + member_scope_assignments
  + control-plane effective-role resolution
```

Chatwoot User is only a projection.

Do not create a new public `staff_users`, `employees` or `profiles` table merely because Chatwoot asks for name/email.

If a later Business OS requirement proves a canonical staff profile is needed independently of Chatwoot, that profile belongs to a separate IAM/profile contract.

### Chatwoot provisioning fields

Chatwoot Community v4.18.0 Platform User create accepts:

- name;
- display_name;
- email;
- password;
- custom_attributes.

Verified upstream User requirements include:

- email present;
- name present;
- Devise password validation on new user creation.

First-version projection rules:

- email = canonical Supabase Auth email;
- name = canonical Smart staff display name if a future trusted profile exists;
- otherwise name = exact canonical email string as a transparent fallback;
- display_name = trusted canonical display name when available, otherwise null;
- no provider display name is used as staff identity;
- no guessed first/last name from email local-part.

Using the email itself as fallback presentation is deliberately less pretty and more honest than inventing a human name.

---

## 4. Password creation boundary

A new Chatwoot Platform User may require a password even though Smart Visions does not want a second user-managed password experience.

Approved behavior:

1. Smart Core server generates a cryptographically strong random password at provisioning time.
2. Password is sent once to Chatwoot Platform API.
3. Password is never:
   - persisted in Smart Core DB;
   - persisted in mapping tables;
   - returned to browser;
   - written to logs;
   - written to audit;
   - stored as a reusable secret.
4. The generated plaintext is discarded after the request completes.
5. Smart users enter Chatwoot through the governed SSO-link flow, not by being shown this password.

Do not derive the Chatwoot password from:

- Smart Visions password;
- user email;
- user UUID;
- Organization ID;
- deterministic hash;
- any reusable secret.

---

## 5. Chatwoot User create/adopt semantics

Upstream Platform User create behaves as:

`User.from_email(email) || User.new(params)`

Therefore create may **adopt an existing Chatwoot User by email** instead of always creating a new User.

That behavior is useful, but it has consequences.

### Approved reconciliation behavior

After create/adopt returns a Chatwoot User:

- persist the exact returned Chatwoot User ID in Smart Core mapping;
- then PATCH the Platform User to write/refresh opaque Smart Visions projection metadata because the create path does not update attributes on an already-existing User;
- verify returned email equals canonical Smart Auth email after normalization;
- fail closed if returned identity does not match.

Suggested Chatwoot `custom_attributes` marker:

- `smartvisions_user_id`: opaque Smart Auth UUID;
- `smartvisions_projection`: true;
- optional projection schema version.

Do not store Organization/customer/provider secrets in these attributes.

### Ambiguous create result

A timed-out Platform User create may be retried with the same canonical email because upstream create first resolves `User.from_email`.

Still:

- never assume a returned User belongs to the intended Smart user without email + marker reconciliation;
- if existing marker points to another Smart user, fail closed;
- do not overwrite another Smart user's marker.

---

## 6. Chatwoot User mapping

Suggested canonical mapping table:

`chatwoot_user_mappings`

Purpose:

map one Smart Auth user to one Chatwoot deployment-global User projection.

Minimum facts:

- smart_user_id;
- chatwoot_user_id;
- status;
- version;
- last_request_key / durable command claim;
- last_verified_at;
- last_error_code;
- created_at;
- updated_at.

The current system assumes one primary Chatwoot installation.

Do not add an installation/region dimension until a real multi-installation requirement exists.

### External ID type

Chatwoot v4.18.0 `users.id` is integer/serial.

Use PostgreSQL `integer`.

Do not use bigint/string merely for convenience.

### Uniqueness

First version:

- one live mapping per Smart Auth user;
- one live mapping per Chatwoot User ID.

### Lifecycle

Recommended:

`PROVISIONING -> ACTIVE`

`PROVISIONING -> DEGRADED`

`ACTIVE -> DEGRADED`

`DEGRADED -> ACTIVE`

any live state -> `ARCHIVED`

ARCHIVED terminal.

Do not delete a global Chatwoot User merely because one Business membership is removed.

---

## 7. Chatwoot login / SSO boundary

Upstream Platform API supports:

`GET /platform/api/v1/users/{id}/login`

and returns a generated SSO login URL.

Approved Smart Visions login flow:

```text
Smart user authenticated in Smart Visions
  -> server verifies current canonical Organization/Business access
  -> server resolves ACTIVE Chatwoot User mapping
  -> server resolves ACTIVE Chatwoot Account membership
  -> server calls Chatwoot Platform API login endpoint
  -> server returns short-use SSO URL / redirects
```

Do not expose Platform App token to browser.

Prefer login-link flow over handing the Chatwoot user access token to the browser from Smart Core.

The Platform User token endpoint exists upstream, but it is for trusted server-side account-scoped provisioning calls, not normal browser login.

---

## 8. Platform App token boundary

The Chatwoot Platform App token is a high-privilege infrastructure secret.

It may provision/adopt:

- Accounts;
- Users;
- AccountUsers;
- SSO login links;
- User access tokens.

Rules:

- secret store only;
- server-only;
- never ordinary DB JSON;
- never audit payload;
- never browser;
- never client bundle;
- never Chatwoot Contact/Conversation custom attributes.

Every Platform API call must log only bounded evidence such as:

- operation;
- Smart entity ID;
- Chatwoot external ID;
- response class/status;
- correlation/request key;
- no token.

---

## 9. AccountUser membership projection

Required mapping:

`tenant_business + smart_user -> Chatwoot AccountUser`

Suggested table:

`chatwoot_account_memberships`

Canonical inputs:

- Organization membership;
- effective Smart role for the tenant Business scope;
- ACTIVE Chatwoot Account mapping;
- ACTIVE Chatwoot User mapping.

Minimum mapping facts:

- organization_id;
- tenant_business_id;
- smart_user_id;
- chatwoot_account_mapping_id;
- chatwoot_user_mapping_id;
- Chatwoot AccountUser ID when returned/available;
- projected Chatwoot role;
- effective Smart role used for decision;
- lifecycle/version;
- verification/error evidence;
- timestamps.

Do not make Chatwoot AccountUser the canonical role source.

---

## 10. Community role projection

Verified Chatwoot Community `AccountUser` roles:

- agent;
- administrator.

There is no Community read-only AccountUser role.

Approved projection:

| Smart effective role | Chatwoot Account role |
| --- | --- |
| OWNER | administrator |
| ADMIN | administrator |
| SALES_MANAGER | agent |
| SALES_AGENT | agent |
| VIEWER | no Chatwoot Account membership |

This is fail-closed.

Do not map VIEWER to agent merely so they can open Chatwoot.

That would expand a read-only Smart role into message/reply capability.

---

## 11. Effective role source

Use the existing canonical Smart control-plane logic:

`effectiveRoleForScope()`

Do not duplicate role precedence in a new Chatwoot-specific role engine.

Current semantics:

- Organization role is the base role;
- lower-scope assignment may provide the effective role at Business/Branch/Department/Team;
- OWNER remains OWNER;
- scope lineage must be canonical.

If this general IAM policy later changes, Chatwoot membership reconciliation consumes the new canonical result rather than inventing exceptions.

---

## 12. Membership removal

If Smart user loses access to a tenant Business:

- remove/archive Chatwoot Account membership projection;
- remove related Inbox/Team memberships;
- keep the deployment-global Chatwoot User unless it is separately proven safe to archive/delete;
- do not delete Smart Auth user;
- do not delete CRM/provider/customer data.

A global Chatwoot User may be a member of multiple tenant-Business Accounts.

Account membership removal is not global User deletion.

---

## 13. Account-scoped Chatwoot API authentication gap

Important upstream boundary:

Platform App API handles:

- Accounts;
- Platform Users;
- AccountUsers.

But Inbox and Team APIs are normal account APIs and authenticate as a Chatwoot User.

Therefore provisioning Inbox/Team requires a trusted Chatwoot user access token.

### Approved first approach

Use an already-authorized Smart OWNER/ADMIN projection as the temporary provisioning principal.

Server flow:

1. verify initiating Smart user is currently authorized;
2. verify their ACTIVE Chatwoot User mapping;
3. verify administrator Account membership in the target Chatwoot Account;
4. use Platform token server-side to request that Chatwoot User's access token;
5. hold access token in process memory only;
6. call required account API;
7. discard token immediately after operation;
8. audit Smart initiating actor + system provisioning result.

Do not persist this access token.

### Why not one global service-user token now

A global service user with administrator access to every tenant Account creates a broad cross-tenant blast radius.

Do not introduce it without a proven operational requirement and explicit hardening design.

---

## 14. Identity attribution caveat

When Smart Core obtains an OWNER/ADMIN Chatwoot access token and performs provisioning, Chatwoot may attribute the API action to that Chatwoot user.

Smart Core audit must separately record:

- actual Smart initiating user;
- system provisioning action;
- target tenant Business;
- external resource/result.

Do not treat Chatwoot-side actor display alone as canonical Smart audit truth.

---

## 15. API Inbox mapping

Required relation:

`communication_channel_binding -> Chatwoot Channel::Api Inbox`

Suggested table:

`chatwoot_inbox_mappings`

Minimum facts:

- organization_id;
- tenant_business_id;
- optional branch_id;
- communication_channel_binding_id;
- chatwoot_account_mapping_id;
- chatwoot_inbox_id;
- status;
- version;
- last_verified_at;
- last_error_code;
- webhook secret reference only;
- timestamps.

### External ID type

Chatwoot v4.18.0 `inboxes.id` is integer/serial.

Use PostgreSQL `integer`.

---

## 16. API Inbox creation contract

Create only after:

- tenant Business ACTIVE;
- communication binding ACTIVE;
- Chatwoot Account mapping ACTIVE;
- trusted administrator provisioning principal resolved.

Create with:

- channel type `api`;
- deterministic human-readable Inbox name;
- Smart Core webhook URL;
- HMAC mandatory where applicable;
- timezone derived from canonical Branch/Business configuration;
- no native WhatsApp/Email provider credentials.

Do not enable a native Chatwoot Email/WhatsApp connector for the same Smart Core provider lane.

---

## 17. API Inbox secret semantics

Verified upstream `Channel::Api` has:

- `identifier`;
- `hmac_token`;
- `secret`;
- `webhook_url`;
- `hmac_mandatory`.

Upstream `WebhookListener` sends API Inbox webhooks using:

`secret: inbox.channel.secret`

Therefore:

- `channel.secret` is the signing secret used to verify Chatwoot -> Smart Core API Inbox webhooks;
- `hmac_token` is a separate API-channel HMAC token and must not be confused with webhook signing secret;
- both are sensitive.

Rules:

- both secret values go directly to deployment secret storage;
- mapping DB stores only secret reference(s), never plaintext;
- audit/log never includes either secret;
- if secret-store write fails, Inbox provisioning is not considered complete;
- if Chatwoot resource exists but secret persistence result is ambiguous, mapping becomes DEGRADED and reconciliation owns recovery;
- secret rotation must update secret store atomically enough that previous/current verification overlap can be managed intentionally.

---

## 18. Inbox webhook security baseline

Smart Core receiver must enforce:

- exact expected Chatwoot deployment;
- mapped Account + Inbox;
- delivery UUID dedupe;
- bounded timestamp skew;
- HMAC signature verification over raw body using the mapped secret;
- timing-safe comparison;
- fail closed on unknown/missing mapping;
- fail closed on invalid signature;
- no tenant selection based only on webhook payload IDs;
- no provider side effect before canonical mapping + safety rechecks.

A valid Chatwoot signature proves origin from the configured Chatwoot secret.

It does not by itself prove:

- tenant scope;
- send eligibility;
- consent;
- recipient correctness;
- provider success.

---

## 19. Inbox membership policy

Chatwoot administrators can see all Account inboxes.

Chatwoot agents require explicit Inbox and/or Team access.

Approved first-version projection:

### OWNER / ADMIN

- Chatwoot role administrator;
- no explicit Inbox-member row required for visibility.

### Organization-wide SALES_MANAGER / SALES_AGENT

- Chatwoot role agent;
- member of every active Chatwoot Inbox in each tenant Business they can canonically access.

### Business-scoped SALES_MANAGER / SALES_AGENT

- agent;
- member of active Inboxes for that tenant Business.

### Branch-scoped SALES_MANAGER / SALES_AGENT

- agent;
- member only of Inboxes whose channel binding is either:
  - explicitly that Branch; or
  - intentionally Business-wide and policy says branch agents may access it.

The second case must be explicit policy, not an automatic fallback.

### Department / Team-only assignment

Do not automatically grant all Branch Inbox access.

Prefer Chatwoot Team membership + conversation Team assignment for least privilege.

Until conversation/team routing exists, such a user may have Account membership without broad Inbox access.

---

## 20. Smart Team -> Chatwoot Team mapping

Suggested table:

`chatwoot_team_mappings`

Canonical source:

`public.teams`

Lineage:

`Team -> Department -> Branch -> tenant Business`

Minimum facts:

- organization_id;
- tenant_business_id;
- smart_team_id;
- chatwoot_account_mapping_id;
- chatwoot_team_id;
- projected_name;
- lifecycle/version;
- verification/error;
- timestamps.

### External ID type

Chatwoot v4.18.0 Team primary keys are bigint in the Rails schema.

Use PostgreSQL bigint for external Chatwoot Team ID.

In TypeScript/API surfaces, represent that external bigint as a decimal string to avoid JavaScript precision assumptions.

---

## 21. Team naming

Chatwoot Team name is unique within an Account.

Do not reconcile by display name alone.

Use external ID mapping as canonical.

Projected display name should be deterministic and collision-resistant across Branch/Department structure.

Recommended presentation form:

`<branch-code> / <department-code> / <team-code> — <team-name>`

Exact UX formatting may change without changing mapping identity.

If the final projected name exceeds upstream limits discovered during implementation, truncate presentation safely while preserving stable code prefix.

---

## 22. Team membership

Chatwoot Team membership derives from canonical Smart scope assignments.

Requirements:

- Smart Team belongs to same tenant Business as mapped Chatwoot Account;
- Smart user has ACTIVE Chatwoot Account membership;
- Smart user's effective access includes the Team;
- no cross-Account Chatwoot user/team link;
- removal of Smart Team scope removes Chatwoot Team membership.

Chatwoot Team membership remains operational projection only.

---

## 23. Inbox membership vs Team membership

Do not collapse these two concepts.

Inbox membership answers:

"Can this agent broadly access this communication lane?"

Team membership answers:

"Is this agent part of this operational assignment group?"

An agent may:

- have Inbox access without Team membership;
- have Team membership and only see conversations routed to that Team;
- have both.

Projection rules must preserve least privilege rather than making every Account agent a member of every Inbox and every Team.

---

## 24. Mapping table set approved for Slice B

Approved first Slice B schema target:

1. `chatwoot_user_mappings`
2. `chatwoot_account_memberships`
3. `chatwoot_inbox_mappings`
4. `chatwoot_team_mappings`
5. optionally explicit `chatwoot_inbox_memberships` if durable reconciliation evidence proves it is needed
6. optionally explicit `chatwoot_team_memberships` if durable reconciliation evidence proves it is needed

### Membership persistence decision

Do not persist explicit Inbox/Team membership mapping rows merely because Chatwoot has membership tables.

First implementation should determine whether memberships can be deterministically recomputed from:

- Smart canonical scope;
- User mapping;
- Account mapping;
- Inbox mapping;
- Team mapping.

If deterministic reconciliation is sufficient, avoid redundant membership source-of-truth tables.

Persist explicit membership projections only if required for:

- external-ID reconciliation;
- retry/idempotency;
- drift health;
- audit evidence that cannot be derived safely.

---

## 25. Slice B command idempotency

Reuse Slice A's durable `chatwoot_bridge_command_claims`.

Do not create another idempotency table.

Add command types only as needed, for example:

- `CREATE_USER_MAPPING`
- `SET_USER_MAPPING_STATE`
- `CREATE_ACCOUNT_MEMBERSHIP`
- `SET_ACCOUNT_MEMBERSHIP_STATE`
- `CREATE_INBOX_MAPPING`
- `SET_INBOX_MAPPING_STATE`
- `CREATE_TEAM_MAPPING`
- `SET_TEAM_MAPPING_STATE`

Command payload fingerprints remain SHA-256.

Failed external/provider-independent commands must not leave orphan claims.

---

## 26. Lifecycle and replacement behavior

Projection mappings should follow the same pattern as Slice A:

- PROVISIONING;
- ACTIVE;
- DEGRADED;
- ARCHIVED terminal.

External Chatwoot IDs become immutable once adopted.

If an external Chatwoot resource must be replaced:

1. archive old mapping;
2. create a new mapping;
3. reconcile memberships/dependencies;
4. never overwrite external ID in place.

---

## 27. Destructive actions

Do not hard-delete Smart mapping rows during normal lifecycle.

Do not automatically DELETE a global Chatwoot User when:

- one Account membership is removed;
- one Business is archived;
- one Team assignment is removed.

Chatwoot Inbox/Team external deletion policy should be conservative.

First version may archive Smart mapping and disable/remove membership while leaving recoverable external resource cleanup to controlled reconciliation.

---

## 28. RBAC for Slice B mapping infrastructure

Infrastructure mapping visibility:

- OWNER: read/manage
- ADMIN: read; operational management only where explicitly approved
- SALES_MANAGER: no direct infrastructure mapping table read required
- SALES_AGENT: no infrastructure mapping read
- VIEWER: no infrastructure mapping read

Normal users can use Chatwoot SSO/login without receiving infrastructure secrets or raw mapping internals.

---

## 29. Secret references

Slice B may need secret references for API Inbox secrets.

Rules:

- reference must be opaque;
- no secret plaintext;
- no secret value echo in API;
- no provider credential;
- no SSO access token;
- no Platform App token;
- no Chatwoot User access token.

A mapping status must not become ACTIVE until any required secret-store operation is durably successful.

---

## 30. Reconciliation order

Recommended deterministic reconciliation:

1. canonical tenant Business / Account mapping;
2. Smart Auth User -> Chatwoot User;
3. effective role -> AccountUser;
4. communication binding -> API Inbox;
5. Smart Team -> Chatwoot Team;
6. Inbox membership;
7. Team membership.

Removal reconciliation runs in reverse dependency order where practical.

---

## 31. User email changes

Supabase Auth email is canonical.

If canonical Smart user email changes:

- do not silently create a second Chatwoot User;
- reconcile existing mapped Chatwoot User via Platform API update;
- verify the mapped external user ID remains the same;
- audit identity projection change without copying email into broad audit payload;
- if upstream email update conflicts with another Chatwoot User, mark mapping DEGRADED and fail closed.

Do not merge two Smart users because their email history overlaps.

---

## 32. Missing canonical display name

Current Production does not expose a trusted staff display name.

First-version rule:

`Chatwoot name = canonical Auth email`

until a separate trusted Smart staff-profile contract exists.

Do not parse:

`john.smith@example.com -> John Smith`

as canonical truth.

A later UX profile feature may safely replace the projection display name.

---

## 33. SSO link security

Chatwoot SSO login URL is sensitive and short-lived/access-bearing.

Rules:

- generate only after Smart user authorization;
- no audit/log full URL;
- no analytics capture of query string;
- response headers should prevent caching;
- browser redirect preferred over persisting link;
- do not include link in email/Slack/log by default;
- never generate for archived/revoked membership.

---

## 34. Candidate-only live provisioning

Slice B schema/runtime contracts may be built without a live Chatwoot call.

Actual User/AccountUser/Inbox/Team provisioning belongs to the Candidate adapter stage and must wait for:

- PR #195 source image green;
- real Candidate Chatwoot origin;
- Candidate Chatwoot PostgreSQL;
- Candidate Redis;
- Candidate object storage;
- Platform App secret;
- secret-store integration;
- non-customer synthetic Candidate tenant hierarchy.

No Production customer/staff resource is created merely to smoke-test API integration.

---

## 35. Required implementation tests

Static/database tests:

- one Smart user -> one live Chatwoot User mapping;
- one external Chatwoot User ID -> one live Smart mapping;
- Chatwoot User ID uses integer;
- Account membership cannot cross tenant Business/Account mapping;
- role projection exact:
  - OWNER/ADMIN administrator;
  - SALES_MANAGER/SALES_AGENT agent;
  - VIEWER no membership;
- Team mapping lineage is same tenant Business;
- Inbox mapping references same Business channel binding and Account mapping;
- Inbox external ID uses integer;
- Team external bigint uses DB bigint / TypeScript decimal string;
- no raw secret columns;
- no password columns;
- no access-token columns;
- no provider send methods;
- durable command claims reused;
- archived mapping terminal;
- external ID immutable;
- cross-tenant rows fail;
- direct mutation bypass fails;
- PostgreSQL 17 rollback-only smoke.

Candidate integration tests later:

- create/adopt User;
- patch opaque Smart marker;
- create/update AccountUser role;
- create API Inbox;
- persist API Inbox secrets only to secret store;
- create Team;
- set Inbox members;
- set Team members;
- remove revoked membership;
- SSO link only for currently authorized user;
- ambiguous outcome reconciliation;
- no customer/provider message.

---

## 36. Explicit non-scope

Slice B does not implement:

- Contact projection;
- Conversation projection;
- Human/AI takeover synchronization;
- message bridge;
- provider send;
- CRM Person/Contact;
- canonical staff profile product;
- native Chatwoot Meta/Email connectors;
- Chatwoot Enterprise custom roles;
- Customer data import;
- Production user/account provisioning.

---

## 37. Exit decision

Audit result:

**APPROVED**

Next implementation after Slice A is green:

`COMM-TENANT-BRIDGE / Slice B — User, membership, API Inbox and Team mapping contract`

Key non-negotiable decisions:

- canonical staff identity remains Smart Auth/IAM;
- Chatwoot User is projection;
- no invented staff name;
- random create password is ephemeral and discarded;
- normal login uses governed Chatwoot SSO link;
- Platform token never leaves server;
- temporary user access token is memory-only for account API provisioning;
- VIEWER receives no Chatwoot membership;
- API Inbox uses `Channel::Api`;
- API Inbox webhook signing uses `channel.secret`;
- `secret` and `hmac_token` are secret-store-only;
- Inbox/Team access follows least-privilege Smart scope;
- Slice A command claims are reused, not duplicated;
- no Production live provisioning before Candidate exists.
