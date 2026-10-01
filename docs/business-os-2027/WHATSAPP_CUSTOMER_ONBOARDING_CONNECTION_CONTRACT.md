# WhatsApp customer onboarding connection contract

Status: **OWNER-APPROVED SCOPE LOCK — SLICES 1–3 PRODUCTION_VERIFIED; SLICES 4–8 PENDING**

Date: 2026-10-01

## Production checkpoint — Slice 1

Slice 1 is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** as of 2026-10-01.

Evidence:
- implementation PR #375, final head `1c6a47138635037189745615d1f25d387de00897`, exact-head CI `36855801312`, merge `474d7cd72d50a002add2e38a4cff30f7d588f09d`;
- advisor-hardening PR #376, head `d0ba891e4646652fea5ba88391de7dfc5471afef`, exact-head CI `36856807256`, final `main@85774ea16adf20403832771d316e68e56283028d`;
- exact-main CI `36857112993` and Cloudflare Production Deploy `36857447148` succeeded on the final main SHA;
- Production migrations `0163_meta_whatsapp_onboarding_slice1@20261001113758` and `0164_meta_whatsapp_onboarding_fk_index_hardening@20261001114314`;
- Production setup-attempt rows remain 0; no synthetic connection/provider data or customer send was used;
- post-hardening advisor counts returned to the prior baseline.

This checkpoint proves only the internally controlled Slice 1 contract: bounded attempt state, non-destructive mode lock, trusted credential completion boundary, WABA/phone membership validation, stale/replay protection, ACL/RLS hardening and fail-closed unverified Coexistence. It does **not** claim Remote Setup Invitation, actual Coexistence/native activity, message provenance/Human-AI arbitration, or real-tenant Meta E2E.

## Production checkpoint — Slice 2

Slice 2 is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** as of 2026-10-01 for the internally controlled Secure Remote Setup Invitation/session scope.

Evidence:
- implementation PR #378, final head `fb7018647bf8f632bedff678f450564ee200252c`, exact-head CI `36865430981`, merge `ba837577f38c90b390474de1998a2ce84de3c622`;
- exact-main CI `36865851776` and Cloudflare Production Deploy `36866185938` succeeded on that exact merge SHA;
- Production migration `0165_meta_whatsapp_remote_setup_invitation@20261001130718`, merged blob SHA `46ca7d1d3821ed84135013546f64d891cecb8a7a`;
- Production setup-attempt rows and Slice-2 remote audit rows remain 0; no synthetic setup/provider/customer data or send was used;
- post-migration advisor counts remain at the pre-Slice baseline for security, unindexed-FK, auth-RLS-initPlan and multiple-permissive findings.

Slice 2 extends only the existing setup-attempt child state with hashed one-time invitation and short-lived session evidence. It does not create a user/member for the remote Meta admin, does not grant panel authority, and does not create a second IAM or connection authority. Actual Meta authorization/provider provisioning is deliberately left to later slices; same-number Business App Coexistence activation remains fail-closed and non-destructive.

## Production checkpoint — Slice 3

Slice 3 is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** as of 2026-10-01 for the internally controlled mobile wizard / preflight / setup-later / resume / trusted-remote-completion scope.

Evidence:
- implementation PR #380, final head `ad4380caa27ad8928da8568e2b009114850d410e`, exact-head CI `36871208717`, merge `19201aa26ad6176d978ccc6e70b17ac365f1f8aa`;
- exact-main CI `36871735143` and Cloudflare Production Deploy `36872092126` succeeded on that exact merge SHA;
- Production migration `0166_meta_whatsapp_mobile_wizard_completion@20261001135536`, merged blob SHA `887c200e6d1a3f258ad70e95f3795a5dddb3ebce`;
- Production setup-attempt rows and Slice-3 remote completion audit rows remain 0; no synthetic setup/provider/customer data or send was used;
- post-migration advisor counts remain at the prior security/FK/RLS-plan/policy baseline.

Slice 3 reuses the exact setup-attempt and setup-session authorities already created by Slices 1–2. It does not create a second invite/session/IAM or connection record. Remote completion is tied to the same bounded session, validates selected Meta assets before the existing trusted Vault mutation, records truthful remote completion provenance and supports completed-state replay after a lost network response. Actual provider subscription/provisioning, real-customer Meta E2E and same-number Coexistence/native activity are not claimed here.

**Next owner-prioritized contract slice:** Slice 4 — Meta Provisioning / Subscription / Recovery.

This contract is an execution overlay for the existing Business OS 2027 roadmap. It does **not** create a new Work Package, integration source of truth, IAM system, secret store, message store, Chatwoot plane, queue, health system, or WhatsApp provider stack.

It must be read with:

- `MASTER_PROGRAM_SECTIONS.md`
- `PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md`
- `MASTER_ARCHITECTURE.md`
- `SERVICE_CONTRACT_STANDARD.md`
- `STATE_EVENT_CATALOG.md`
- `CURRENT_STATE.md`
- `NEXT_CHAT_HANDOFF.md`

Runtime/Production evidence remains authoritative over this document.

## 1. Canonical authority lock

The logical WhatsApp connection identity remains the existing canonical:

`communication_channel_bindings.id`

No `whatsapp_connection`, second channel binding, second provider connection, or parallel onboarding connection authority may be introduced.

Existing authorities remain:

- `communication_channel_bindings`: tenant Business / Branch / channel binding and provider destination identity;
- `integration_connections`: existing integration connection authority;
- Supabase Vault: provider secret authority;
- existing Meta adapter + webhook journals: provider transport and replay/idempotency authority;
- existing Chatwoot Account/Inbox mappings: communication-plane projection only;
- existing Unified Inbox / CRM conversation authorities: conversation/customer truth;
- existing channel-health evidence: readiness and operational health;
- existing canonical provider send gate: final outbound authority.

Chatwoot remains a communication plane. Meta provider ownership, destination ownership and WhatsApp credentials stay in Smart Core/Vault.

## 2. Binding identity versus setup attempt

A binding is the persistent logical connection. A setup attempt is a temporary attempt to connect, reconnect or recover that binding.

Semantics are frozen as:

- `binding_id`: stable logical connection identity;
- `attempt_id`: one bounded setup/reconnect attempt;
- every attempt is scoped to exactly one Organization, tenant Business and binding;
- every attempt records the binding version it started from;
- stale callbacks from an older attempt must fail closed;
- retry/resume creates or resumes attempt state, not a second logical connection;
- an attempt may fail, expire or be superseded without destroying the binding.

If new persisted attempt state is required, it must be child operational state under the canonical binding and must never become an alternative connection source of truth. The physical schema name is chosen only after the implementation slice performs a fresh schema audit.

## 3. Allowed connection modes

Customer-facing WhatsApp onboarding supports only these semantic modes:

- `BUSINESS_APP_COEXISTENCE`
- `API_NEW_NUMBER`
- `EXISTING_API_RECONNECT`

### Non-destructive WhatsApp Business App policy

For any number currently active in the WhatsApp Business mobile app:

- Smart Visions must **never require or recommend deleting the WhatsApp/WhatsApp Business account**;
- Smart Visions must **never require uninstalling the mobile app**;
- Smart Visions must **never guide the customer through destructive full migration from the Business App**;
- the only allowed path for that same number is official Meta coexistence when the account/number is eligible;
- if coexistence is unavailable, unsupported or fails eligibility, the existing mobile WhatsApp remains untouched and the customer may use a different number for API onboarding.

`FULL_MIGRATION_FROM_BUSINESS_APP` is not a supported Smart Visions customer onboarding mode.

This policy must be enforced server-side where Smart Visions controls the transition. It is not sufficient to hide a destructive option only in UI.

## 4. Limited remote setup authorization

Remote setup must not grant normal Business OS panel authority.

A setup participant receives only a bounded capability equivalent to:

`WHATSAPP_SETUP`

scoped to the intended:

- Organization;
- tenant Business;
- binding;
- purpose;
- validity window/session;
- current setup attempt.

The implementation must reuse canonical authentication/IAM primitives. It must not create a second user directory or a parallel IAM system.

A remote setup participant must not gain access to CRM, billing, organization settings, unrelated integrations, other businesses, other branches, or administrative surfaces merely by possessing the setup link.

If the person opening the setup link is not the actual Meta Business administrator, the setup can be safely handed to the correct administrator without granting that administrator wider Smart Visions product access.

## 5. Trusted credential completion boundary

The final credential mutation path must be server-trusted and scope-authorized.

Required order:

`setup authorization`
→ `Organization / Business / binding / attempt / version / purpose validation`
→ `Meta authorization-code exchange`
→ `Meta asset ownership/access readback`
→ `provider destination validation`
→ `trusted Vault mutation`
→ `canonical binding update`
→ `audit evidence`

Rules:

- browser/client code never receives or stores the final provider secret;
- customer passwords are never collected by Smart Visions;
- ordinary authenticated access must not become a generic Vault mutation capability;
- service privilege is an execution mechanism, not authorization;
- credential changes must be audited without logging secret values;
- stale version/attempt callbacks fail closed;
- duplicate completion must be idempotent or reconcile to the exact existing result.

The existing Meta Embedded Signup server-side code exchange and WABA/phone readback are reused and hardened rather than replaced.

## 6. Readiness and health model

Do not collapse connection readiness into one giant status enum.

Readiness must be derived from existing/canonical evidence dimensions, including at minimum where applicable:

- Meta/provider authorized;
- credential valid;
- provider destination validated;
- webhook/subscription ready;
- Chatwoot projection ready;
- inbound verified;
- outbound verified;
- coexistence eligible/active;
- AI send currently allowed.

A connection may be authorized but not inbound-verified, or inbound-ready but AI-disabled. Those are valid states.

Reuse `OMNI-CHANNEL-HEALTH` and existing health evidence. Do not create a second WhatsApp health truth merely for onboarding.

## 7. Chatwoot projection contract

The existing architecture remains:

`Meta ↔ Smart Core ↔ Chatwoot Channel::Api`

Rules:

- Meta access tokens do not move into Chatwoot as provider ownership;
- Smart Core remains provider-action authority;
- existing `chatwoot_inbox_mappings` stays the Inbox projection authority;
- existing governed Chatwoot Account/API Inbox provisioning and reconciliation are reused;
- provisioning/recovery must reconcile ambiguous external results rather than blindly create duplicate Chatwoot resources;
- replacing Chatwoot in the future must not destroy or redefine the customer's Meta/WhatsApp connection.

## 8. Message provenance and Human/AI arbitration

The canonical message/conversation path must be able to distinguish semantic provenance for:

- `CUSTOMER`
- `HUMAN_SMARTVISIONS`
- `HUMAN_NATIVE_WHATSAPP`
- `AI`
- `SYSTEM`

Implementation must extend the existing canonical message/conversation evidence model after a fresh audit. It must not create a parallel message store just to carry provenance.

For official coexistence/native activity:

- a current human reply from the WhatsApp Business app has priority over AI;
- the conversation must enter the existing human-owned/takeover semantics where appropriate;
- the final provider send gate must re-read current binding, conversation, human-takeover and AI policy immediately before external send;
- queued/previously approved AI work does not override a newer human reply;
- historical synchronization is evidence/history and must not be misclassified as a current live human takeover;
- echoed, duplicated and out-of-order provider/native events remain subject to canonical dedupe/journal semantics.

## 9. Recovery, reconnect, revoke and disconnect

Setup must be resumable and recoverable.

At minimum, the contract must handle:

- customer closes/cancels Meta flow;
- popup/mobile return fails;
- internet interruption;
- duplicate callback;
- stale callback;
- repeated button clicks;
- authorization succeeds but later provisioning fails;
- Chatwoot provisioning is ambiguous;
- credential becomes invalid/revoked;
- reconnect on the same binding;
- safe disconnect.

Reconnect operates on the existing binding and creates/reuses bounded attempt state. It must not create a new logical connection merely because credentials changed.

Disconnect/revoke must:

- stop new automated/provider actions safely;
- make AI send fail closed;
- preserve required audit/reconciliation evidence;
- follow the documented retention/export/deletion policy;
- never delete the customer's WhatsApp Business mobile account.

## 10. Customer setup journey

The intended customer experience is:

`Remote Setup Link`
→ `Preflight`
→ `Identify existing Business App / new API number / reconnect`
→ `Meta hosted authorization`
→ `Business/WABA/number selection`
→ `Coexistence eligibility when Business App is active`
→ `Trusted credential completion`
→ `Meta provisioning/subscription verification`
→ `existing Chatwoot projection provisioning`
→ `health verification`
→ `ready / action-required result`

If the existing Business App number cannot use coexistence, Smart Visions stops that same-number path without destructive migration and offers a separate API number path.

Customer-facing errors must explain the corrective action without exposing raw provider errors, credentials or internal infrastructure. Use a safe support correlation identifier for support escalation.

## 11. Execution slices mapped to existing Work Packages

These are execution slices only. They are **not new Work Packages** and must not renumber the roadmap.

1. **Connection contract + attempt/mode + trusted completion + asset validation**  
   Existing owners: `COMM-TENANT-BRIDGE`, `ENT-SECURITY`, `DEV-INTEGRATIONS`.

2. **Secure remote setup invitation**  
   Existing owners: `UX-BUSINESS-WEB`, `ENT-IAM`, `DEV-INTEGRATIONS`.

3. **Mobile-first wizard + preflight + setup-later + resume**  
   Existing owners: `UX-BUSINESS-WEB`, `UX-MOBILE`, `UX-PWA`.

4. **Meta provisioning / subscription / recovery**  
   Existing owners: `DEV-INTEGRATIONS`, `OMNI-META-SOCIAL`, `COMM-TENANT-BRIDGE`.

5. **Existing Chatwoot provisioning integration**  
   Existing owner: `COMM-TENANT-BRIDGE`.

6. **Message/status/media bridge + provenance + dedupe**  
   Existing owners: `COMM-ACTION-BRIDGE`, `COMM-RECONCILIATION`.

7. **Official coexistence + native activity + Human/AI arbitration**  
   Existing owners: `COMM-HUMAN-AI`, `OMNI-META-SOCIAL`.

8. **Reconnect/revoke/disconnect + first real tenant E2E acceptance**  
   Existing owners: `OMNI-CHANNEL-HEALTH`, `FINAL-E2E`, with security/operations acceptance as applicable.

Execution order may follow dependency evidence, but a slice may not silently create a duplicate authority to make another slice easier.

## 12. Acceptance lock

This onboarding scope is not complete merely because Embedded Signup returns a code or a token exists.

Applicable completion evidence includes:

- canonical binding preserved;
- setup attempt/version replay behavior verified;
- least-privilege remote setup authorization verified;
- Meta asset validation verified;
- Vault mutation reachable only through the trusted authorized boundary;
- no secret exposure;
- coexistence path does not delete/disable the customer's mobile WhatsApp account;
- coexistence-unavailable path leaves the existing number untouched;
- Chatwoot projection is reconciled onto the existing binding;
- readiness dimensions are evidence-backed;
- native-human versus AI race behavior is tested;
- duplicate/stale callbacks and ambiguous provisioning are recoverable;
- reconnect/revoke/disconnect are tested;
- no accidental provider send is used merely to prove setup;
- first real consented tenant E2E is recorded separately when external Meta eligibility/approval permits it.

External Meta review, Tech Provider/access approval, business verification, account eligibility, coexistence eligibility or provider availability may be `BLOCKED_EXTERNAL`. Those external blockers do not excuse unfinished internal security, state, UI, recovery or reconciliation work.

## 13. Explicit non-goals

This contract does not authorize or require:

- Evolution API;
- WAHA;
- a second WhatsApp provider stack;
- a second Chatwoot instance/plane;
- a second CRM;
- a second IAM/user directory;
- a second Vault/secret store;
- a second webhook journal/queue/outbox;
- a second conversation/message store;
- a second channel-health authority;
- destructive migration from an active WhatsApp Business mobile account;
- customer password collection;
- synthetic Production tenants/credentials/messages merely for acceptance.

The current roadmap continuation cursor remains authoritative. Registering this scope does not by itself reorder unrelated Work Packages or activate Meta/Chatwoot/provider side effects.
