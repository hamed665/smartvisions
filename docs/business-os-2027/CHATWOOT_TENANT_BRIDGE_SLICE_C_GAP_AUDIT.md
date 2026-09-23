# Chatwoot Tenant Bridge — Slice C Candidate Provisioning & Reconciliation Audit

Program cursor:

`SECTION COMMUNICATION / COMM-TENANT-BRIDGE / Slice C — Candidate provisioning/reconciliation adapter`

Audit date: 2026-09-23

Dependency stack:

1. PR #195 — Chatwoot Community source foundation
2. PR #196 — Tenant Bridge gap audit
3. PR #197 — Slice A tenant/channel + Account mapping
4. PR #198 — Slice B gap audit
5. PR #199 — Slice B User/AccountUser/API-Inbox/Team mapping contract
6. this Slice C audit

This audit does not perform a live Chatwoot call and does not change Production.

---

## 1. Audit result

Status:

**APPROVED FOR IMPLEMENTATION BEHIND A CANDIDATE-ONLY KILL SWITCH**

Slice C owns external Chatwoot provisioning and reconciliation.

It may create/reconcile, in this order:

1. Chatwoot Account;
2. Chatwoot User;
3. AccountUser membership;
4. API Inbox;
5. Team;
6. Inbox/Team membership projections.

It does not own:

- canonical Smart IAM;
- canonical CRM/customer truth;
- provider credentials;
- provider send authority;
- consent/DNC;
- Contact/Conversation projection;
- Human/AI message bridge.

---

## 2. Candidate-only boundary

Until source-plane deployment and exact-head CI are green, all external provisioning remains disabled.

Required runtime switch:

`CHATWOOT_PROVISIONING_ENABLED=false`

Default is false.

Production must remain false until:

- Chatwoot source image is proven;
- Candidate Chatwoot deployment exists;
- Candidate DB/Redis/storage are healthy;
- Candidate Platform App token exists;
- Vault secret storage is verified;
- synthetic Candidate tenant exists;
- provisioning/reconciliation tests pass;
- explicit Production promotion review occurs.

No code path may silently enable provisioning when the variable is absent.

---

## 3. Dynamic secret store decision

Production project evidence:

- `supabase_vault 0.3.1` installed;
- `vault.secrets` exists;
- `vault.decrypted_secrets` exists;
- `service_role` can execute `vault.create_secret`;
- `service_role` can execute `vault.update_secret`;
- `service_role` can select `vault.decrypted_secrets`;
- `authenticated` cannot use the Vault schema or read decrypted secrets.

Decision:

**Supabase Vault is the first-version dynamic Chatwoot per-resource secret store.**

Use it for:

- API Inbox `channel.secret`;
- API Inbox `hmac_token`;
- future dynamically issued Chatwoot secrets that cannot live in static deployment env.

Global deployment secrets such as the Chatwoot Platform App token may remain deployment-environment secrets.

---

## 4. Vault access contract

Do not expose the `vault` schema to browser/Data API consumers.

Use narrowly scoped public SQL wrappers that are:

- `SECURITY INVOKER`;
- callable only by `service_role`;
- fully-qualified to `vault.*`;
- revoked from PUBLIC/anon/authenticated;
- never return secrets to ordinary authenticated clients.

Approved reference format:

`secretref://supabase-vault/<uuid>`

Slice B mapping tables already store secret references, not plaintext.

### Required wrapper responsibilities

- create encrypted Vault secret and return only the reference;
- update a secret by reference;
- resolve decrypted value server-side only;
- reject refs outside the exact `secretref://supabase-vault/` scheme;
- never audit plaintext secret;
- never log plaintext secret.

---

## 5. Platform App token

The Chatwoot Platform App token is server-only infrastructure authority.

It may be used for:

- Account list/create/show/update;
- User create/show/update;
- User SSO login link;
- User access token issuance;
- AccountUser list/create/delete.

Rules:

- static secret store / deployment environment only;
- never DB mapping JSON;
- never browser;
- never audit;
- never response payload;
- bounded HTTP error logging only.

---

## 6. Account-scoped API token

Inbox/Team/Inbox-member/Team-member APIs authenticate as a Chatwoot User.

Approved first-version approach:

1. verify initiating Smart user is OWNER;
2. verify ACTIVE Chatwoot User mapping;
3. verify ACTIVE Account membership with Chatwoot role `administrator`;
4. use Platform token to request that Chatwoot User access token;
5. hold access token only in process memory;
6. perform account-scoped provisioning request;
7. discard token immediately.

Do not persist the user access token.

Do not create one global administrator service-user across every tenant Account in first version.

---

## 7. Account provisioning

Input:

- ACTIVE Smart tenant Business;
- Slice A Account mapping in PROVISIONING;
- canonical Business name;
- deterministic opaque Smart marker.

Recommended Chatwoot Account custom attributes:

- `smartvisions_tenant_business_id`;
- `smartvisions_projection=true`;
- `smartvisions_projection_version`.

Do not copy provider/customer secrets into Account custom attributes.

### Success

Persist returned Chatwoot Account integer ID.

Transition mapping:

`PROVISIONING -> ACTIVE`

with fresh verification evidence.

### Timeout / ambiguous result

Never blind retry create.

Reconcile by listing Platform-App-visible Accounts and matching the exact opaque Smart tenant-Business marker.

Outcomes:

- exactly one match: adopt;
- zero matches: create may be retried under the same durable command claim;
- more than one match: mapping DEGRADED, reconciliation required.

---

## 8. User provisioning

Canonical source:

- Supabase Auth User ID;
- canonical Auth email;
- optional trusted future display-name source.

Chatwoot create fields:

- email;
- name;
- ephemeral random password;
- custom attributes.

Name rule:

trusted Smart display name if available, otherwise exact canonical email.

Never infer human name from email local part.

### Ephemeral password

Generate with cryptographically secure randomness.

Password is:

- sent once to Chatwoot create request;
- never persisted;
- never logged;
- never audited;
- never returned to browser;
- immediately discarded.

Normal user login uses SSO link, not this password.

### Existing User adoption

Upstream Platform User create may adopt an existing User by email.

After create/adopt:

- verify returned email matches canonical Auth email;
- PATCH the opaque Smart user marker;
- fail closed if marker conflicts with another Smart user;
- persist returned Chatwoot User integer ID.

---

## 9. AccountUser membership provisioning

Canonical role projection:

- OWNER -> administrator;
- ADMIN -> agent;
- SALES_MANAGER -> agent;
- SALES_AGENT -> agent;
- VIEWER -> no membership.

Slice C must recompute effective Smart scope before every external membership mutation.

Do not trust the stored projection row as the authorization source.

### Reconciliation key

Chatwoot AccountUser is unique by:

`account_id + user_id`

Therefore ambiguous create can reconcile by exact Account + Chatwoot User.

External AccountUser ID is bigint and is stored/transported as decimal string in TypeScript.

---

## 10. API Inbox provisioning

Initial channel type:

`Channel::Api`

Never configure the same Smart provider lane as a native Chatwoot WhatsApp/Email connector.

Required create inputs include:

- deterministic Inbox name;
- Smart Core webhook URL;
- API channel type;
- HMAC configuration;
- canonical timezone.

### Deterministic webhook marker

Webhook URL should contain an opaque Smart mapping identifier so an ambiguous create can be reconciled without guessing by display name.

Example shape:

`https://<smart-core>/api/chatwoot/webhooks/<inbox-mapping-id>`

The mapping UUID is not a secret.

Do not put tenant name, customer PII or provider credential in URL.

### Returned API channel material

Capture from successful create/show response:

- Inbox integer ID;
- Channel identifier;
- `channel.secret`;
- `hmac_token`.

Store:

- ID and identifier in mapping table;
- secret/hmac values in Supabase Vault;
- only `secretref://supabase-vault/<uuid>` references in mapping table.

---

## 11. Inbox secret atomicity

Provisioning is not ACTIVE merely because Chatwoot created the Inbox.

Required sequence:

1. Chatwoot returns external resource;
2. create Vault secret for `channel.secret`;
3. create Vault secret for `hmac_token`;
4. persist secret references + external IDs;
5. verify resource;
6. mapping -> ACTIVE.

If Chatwoot resource exists but Vault storage fails:

- mapping -> DEGRADED;
- no plaintext secret written elsewhere;
- reconciliation owns recovery;
- do not recreate Inbox blindly.

---

## 12. API Inbox ambiguous create reconciliation

Preferred reconciliation evidence:

- expected Chatwoot Account;
- `Channel::Api`;
- deterministic Smart webhook URL;
- deterministic projected Inbox name as secondary evidence.

Do not match by name alone.

Outcomes:

- exactly one exact webhook-url/API-channel match -> adopt;
- zero -> safe retry under same command claim;
- multiple -> DEGRADED/reconciliation incident.

---

## 13. Team provisioning

Chatwoot Team name is unique within Account and upstream normalizes with trim/downcase.

Slice B stores normalized projected name.

Ambiguous create reconciliation:

- exact Account;
- exact normalized projected name.

Because upstream enforces unique name per Account, one exact match can be adopted.

Team bigint ID is transported as decimal string in TypeScript.

---

## 14. Inbox and Team members

Do not persist redundant membership tables until external reconciliation proves they are required.

Desired membership set is recomputed from:

- canonical Smart role/scope;
- active AccountUser projection;
- active Inbox mapping;
- active Team mapping.

Provisioning calls set/replace membership to match the desired set.

Do not treat current Chatwoot membership as canonical.

---

## 15. HTTP client

One Chatwoot HTTP client owns:

- base URL validation;
- Platform token header;
- user access-token header;
- JSON parsing;
- timeouts;
- bounded response-size handling;
- bounded error messages;
- correlation/request IDs;
- retry classification;
- no-secret logging.

Do not scatter `fetch()` calls through route handlers.

---

## 16. Timeout policy

Suggested defaults:

- connect/overall request timeout: bounded, e.g. 10 seconds;
- no unbounded retry;
- GET/list may retry on transient network/5xx with bounded exponential backoff;
- create/update/delete never blindly retry after an ambiguous transport timeout.

Mutation retry requires reconciliation first.

---

## 17. HTTP status handling

Classify:

- 2xx -> parse/verify;
- 401/403 -> credential/authorization failure, no retry loop;
- 404 -> missing external resource/reconciliation;
- 409/422 -> deterministic conflict/validation, reconcile or fail;
- 429 -> bounded retry using server guidance when present;
- 5xx -> transient candidate for bounded retry only when operation is safe.

Never log response body if it may contain tokens/secrets.

---

## 18. Durable command claims

Reuse Slice A:

`chatwoot_bridge_command_claims`

Slice B expanded the command/entity catalog.

Provisioning adapter uses claims for mutation intent.

Required behavior:

- claim created before external mutation intent;
- canonical payload SHA-256 fingerprint;
- same key/different payload fails closed;
- successful external adoption records mapping state/version;
- failed pre-side-effect attempts roll back claim where appropriate;
- ambiguous side-effect outcomes keep enough evidence for reconciliation instead of blindly reissuing.

Do not add a second idempotency/event table.

---

## 19. Reconciliation state

Each mapping already has:

- status;
- version;
- last_verified_at;
- last_error_code.

Candidate adapter may additionally need bounded reconciliation evidence in audit, not arbitrary response JSON.

Recommended error codes:

- `CHATWOOT_TIMEOUT`;
- `CHATWOOT_AUTH_FAILED`;
- `CHATWOOT_NOT_FOUND`;
- `CHATWOOT_DUPLICATE_MATCH`;
- `CHATWOOT_VALIDATION_FAILED`;
- `VAULT_WRITE_FAILED`;
- `VAULT_READ_FAILED`;
- `ROLE_DRIFT`;
- `MEMBERSHIP_DRIFT`;
- `INBOX_DRIFT`;
- `TEAM_DRIFT`.

No raw upstream response body in `last_error_code`.

---

## 20. Reconciliation loop

Candidate-only scheduled/manual reconciliation order:

1. Account;
2. User;
3. AccountUser;
4. Inbox;
5. Team;
6. Inbox membership;
7. Team membership.

For every resource:

- resolve canonical desired state;
- fetch external state;
- compare exact identifiers/markers;
- repair safe drift;
- mark DEGRADED on ambiguity;
- write bounded audit evidence.

No provider/customer send.

---

## 21. SSO login adapter

Normal user entry:

1. Smart session authenticated;
2. re-read Smart tenant-Business access;
3. re-read active Chatwoot User mapping;
4. re-read active Account membership;
5. reject VIEWER/no-membership;
6. Platform API returns SSO login URL;
7. server redirects or returns it with `Cache-Control: no-store`.

Do not:

- persist SSO URL;
- log SSO URL;
- place URL into analytics;
- send it to unrelated channels.

---

## 22. Vault wrapper design

Approved SQL wrapper names for implementation:

- `chatwoot_vault_create_secret`;
- `chatwoot_vault_update_secret`;
- `chatwoot_vault_read_secret`.

Requirements:

- SECURITY INVOKER;
- service_role EXECUTE only;
- exact reference parser;
- Vault UUID returned as `secretref://supabase-vault/<uuid>`;
- plaintext argument/return never audited;
- no anonymous/authenticated grants.

The read wrapper may return plaintext only to service_role for immediate outbound Chatwoot verification/use.

---

## 23. Candidate configuration

Required server environment:

- `CHATWOOT_BASE_URL`;
- `CHATWOOT_PLATFORM_TOKEN`;
- `CHATWOOT_PROVISIONING_ENABLED=false` default;
- Smart Core public webhook origin.

Do not put per-Inbox secrets in env.

---

## 24. Candidate resource isolation

Candidate Chatwoot must not share:

- Production Chatwoot DB;
- Production Chatwoot Redis;
- Production attachment namespace;
- Production Platform token;
- Production webhook secret namespace.

Candidate Smart test tenant must be synthetic/non-customer.

---

## 25. No provider sends

Slice C creates communication-plane infrastructure only.

It must not:

- create provider-ready customer messages;
- call Meta;
- call Resend;
- call WhatsApp provider send;
- change Shadow Mode;
- mark a Segment send-eligible;
- run a Campaign.

Even after API Inbox creation, provider authority remains Smart Core.

---

## 26. Observability

Bounded operational metrics:

- provisioning attempts;
- provisioning success;
- reconciliation adoption;
- ambiguous result;
- Vault write/read failure;
- auth failure;
- mapping DEGRADED count;
- resource drift count;
- SSO link generation success/failure.

No secret values, SSO URLs, user access tokens or message bodies in metrics/logs.

---

## 27. Slice C implementation decomposition

### C1 — Secret/Vault boundary

- Vault wrappers;
- secret-ref parser;
- server-only secret store module;
- tests.

### C2 — Chatwoot HTTP client

- Platform/account auth;
- timeout/error classification;
- response redaction;
- tests with mocks only.

### C3 — Account/User/AccountUser provisioning

- exact command claims;
- marker reconciliation;
- no live test outside Candidate.

### C4 — API Inbox/Team provisioning

- Vault secret capture;
- ambiguous create reconciliation;
- Team deterministic name reconciliation.

### C5 — Membership reconciliation + SSO

- desired-set computation;
- Inbox/Team membership sync;
- SSO link endpoint;
- no secret/token persistence.

### C6 — Candidate E2E

- synthetic tenant only;
- real Candidate Chatwoot;
- no provider/customer send.

---

## 28. Exit criteria

Slice C is complete only when Candidate evidence proves:

- Account provisioning/adoption;
- User create/adopt + marker verification;
- AccountUser role projection;
- API Inbox creation;
- both API-channel secrets encrypted in Vault;
- Team creation;
- membership reconciliation;
- SSO login for authorized user;
- VIEWER denied;
- ambiguous creates reconcile without duplicate resource;
- no plaintext secret in DB/audit/log;
- no provider send;
- zero cross-tenant resource visibility.

---

## 29. Decision

Audit result:

**APPROVED**

Next implementation target:

`COMM-TENANT-BRIDGE / Slice C1 — Vault secret boundary`

It can be implemented now as code/schema with no live Chatwoot call.

Actual Candidate provisioning stays disabled until the source/deployment dependency stack is green.
