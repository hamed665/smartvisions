# WhatsApp customer onboarding connection contract

Status: **OWNER-APPROVED SCOPE LOCK — SLICES 1–8 CONTROLLED SCOPE PRODUCTION_VERIFIED; REAL COEXISTENCE / FIRST REAL-TENANT E2E BLOCKED_EXTERNAL**

Date: 2026-10-02

## Production checkpoint — Slice 8

Slice 8 is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** as of 2026-10-02 for the internally controlled reconnect/revoke/disconnect lifecycle, credential/subscription health, fail-closed provider routing, UI, schema and deploy scope.

Evidence:
- implementation PR #391, final head `09697e4127fbd3bb8a8216bc945bd16fbcfa637b`, exact-head CI `36979621813`, merge `5051d6984e1d6413a0077da8da3142f89ef740cd`;
- exact-main CI `36979959886` and Cloudflare Production Deploy `36980189935` succeeded on that exact merge SHA;
- Production migration `0169_whatsapp_reconnect_disconnect_lifecycle@20261002074458`, merged blob SHA `10dd1fd8fdefed603dd8688f92130e70b7348774`;
- reconnect stays on the same canonical `communication_channel_bindings.id`, rotates the existing Vault credential and refuses WABA/phone identity drift;
- inbound/outbound canonical provider resolution is fail-closed for manual disconnect, invalid/revoked credential, unconfirmed credential health and missing WABA app subscription;
- owner health verification performs bounded Meta readback only and sends no test customer message;
- disconnect blocks Smart Core provider actions first, supersedes active setup attempts, degrades active Unified Inbox projections, then reconciles WABA webhook unsubscribe by provider readback with no blind retry after ambiguous mutation;
- lifecycle RPCs are service-role-only;
- exact Production state remains 0 WhatsApp bindings, 0 setup attempts, 37 Conversation Messages, 136 WhatsApp Events and 0 Unified Inbox projections; no synthetic tenant/credential/customer/message/provider operation was introduced for acceptance;
- safety remains Shadow Mode ON, global Kill Switch OFF, WhatsApp AI pause OFF and Agents pause OFF; fresh advisors show no Slice-8-specific new finding.

This checkpoint does **not** claim first real consented tenant Meta ↔ Smart Core ↔ Chatwoot E2E or real same-number Business App Coexistence activation. Those require real tenant/provider/Meta eligibility evidence and remain `BLOCKED_EXTERNAL`. The customer's WhatsApp Business mobile app must never be deleted or uninstalled as a prerequisite.

**WhatsApp onboarding overlay is internally complete through Slice 8. Stable roadmap execution resumes at `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.**

## Production checkpoint — Slice 7

Slice 7 is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** as of 2026-10-02 for the internally controlled native Business App activity, Human/AI arbitration, canonical provenance/dedupe, durable Chatwoot reconciliation, schema and deploy scope.

Evidence:
- implementation PR #389, final head `75ad62a8bc88fa3b69226208e7b19ce5231fb6ef`, exact-head CI `36943804916`, merge `917913736fe6ac2cf5c87626d8ac92f422541df5`;
- exact-main CI `36944138334` and Cloudflare Production Deploy `36944402017` succeeded on that exact merge SHA;
- Production migration `0168_whatsapp_coexistence_native_arbitration@20261002000822`, merged blob SHA `0f3411fc50599e6241510362125a8f37c83c6e77`;
- exact Production state remains 37 Conversation Messages, 136 WhatsApp Events, 0 Unified Inbox projections and 0 WhatsApp bindings; Slice-7 smoke message/event/handoff residue is 0;
- all three Slice-7 trusted RPCs are `service_role`-only; `anon` and `authenticated` have no EXECUTE;
- safety remains Shadow Mode ON, global Kill Switch OFF, WhatsApp AI pause OFF and Agents pause OFF;
- fresh Supabase advisors report no Slice-7-specific security/performance finding.

Current `smb_message_echoes` provider evidence is normalized through the existing signed webhook/journal authority. The business WhatsApp sender number remains provider/business context; the customer is resolved from the recipient identity against existing canonical CRM scope. No native echo may fabricate a new customer or conversation merely to make onboarding appear complete.

When current native-human evidence resolves an existing canonical WhatsApp conversation, the canonical message uses `HUMAN_NATIVE_WHATSAPP / META_WHATSAPP` source identity and existing dedupe, then atomically moves the existing Lead and Conversation into HUMAN takeover semantics with `stage_reason=WHATSAPP_NATIVE_ACTIVITY`. The existing final send gate re-reads that current state immediately before provider mutation, so stale queued/approved AI work cannot override the newer human action.

Native canonical outbound evidence is projected into Chatwoot only through the existing reconciliation worker using durable `PENDING -> PROCESSING -> ACCEPTED / RECONCILIATION_REQUIRED` semantics. Replay is idempotent and ambiguous external mutation is not blindly retried. Historical synchronization is deliberately not classified as current live native-human takeover evidence.

This checkpoint does **not** claim that Meta has enabled/approved same-number Business App Coexistence for a real customer, that a real customer's mobile-app reply has already produced live `HUMAN_NATIVE_WHATSAPP` evidence in Production, or that first real-tenant Meta ↔ Smart Core ↔ Chatwoot E2E has passed. Same-number activation therefore remains non-destructive and fail-closed until real provider/runtime evidence proves eligibility. The customer's WhatsApp Business app must never be deleted or uninstalled as a prerequisite.

**Next owner-prioritized contract slice:** Slice 8 — reconnect/revoke/disconnect + first real tenant E2E acceptance.

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

## Production checkpoint — Slice 4

Slice 4 is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** as of 2026-10-01 for the internally controlled Meta provisioning / subscription / recovery scope.

Evidence:
- implementation PR #382, final head `d39ca5db89f1661138dc4709cff8ab60a6bea579`, exact-head CI `36880398289`, merge `3e0eb5ec585b1be5d65ba48531c5026d38324178`;
- exact-main CI `36880881774` and Cloudflare Production Deploy `36881305912` succeeded on the exact merge SHA;
- no Slice-4 migration was required; Production remains through `0166_meta_whatsapp_mobile_wizard_completion@20261001135536`;
- read-only Production verification after deploy found Setup Attempts 0, provisioning audit rows 0, provisioning-error bindings 0 and registration-required bindings 0;
- post-deploy security/performance advisor baseline remains unchanged.

Slice 4 reuses the existing Meta adapter, canonical binding/Vault credential authority, webhook receiver, tenant routing and OMNI channel health. It re-reads phone membership from the WABA, reconciles `subscribed_apps` before/after mutation, recovers ambiguous provider outcomes only from provider readback, and provides bounded Cloud API registration for `API_NEW_NUMBER` using an ephemeral six-digit PIN that is never persisted or audited. `EXISTING_API_RECONNECT` does not force re-registration. Same-number `BUSINESS_APP_COEXISTENCE` remains fail-closed and non-destructive.

## Production checkpoint — Slice 5

Slice 5 is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** as of 2026-10-01 for the internally controlled existing-Chatwoot projection/orchestration path.

Evidence:
- implementation PR #385, final head `0e6ec7a73c8b6d715e6914cb99a2a9f3c501624b`, exact-head CI `36883590463`, merge `4463c29be4b3cf91fc80136587f6c253a6597f36`;
- exact-main CI `36884006244` and Cloudflare Production Deploy `36884481705` succeeded on the exact merge SHA;
- no Slice-5 database migration was required; Production remains through `0166_meta_whatsapp_mobile_wizard_completion@20261001135536`;
- read-only Production verification after deploy found tenant Businesses 0, WhatsApp bindings 0, Chatwoot Account/User/Membership/Inbox mappings 0, Inbox receipts 0 and Slice-5 projection audit rows 0;
- post-deploy security/performance advisor baseline and safety controls remain unchanged.

Slice 5 composes the existing Chatwoot Account, OWNER access and `Channel::Api` Inbox provisioning/reconciliation paths onto the verified canonical WhatsApp binding. Projection is permitted only after matching Slice-4 provider evidence and only for the authenticated Smart Visions OWNER. Remote Meta setup capability remains bounded to `WHATSAPP_SETUP` and grants no Chatwoot/panel authority. Business-wide null-branch projection is supported, and retry after Chatwoot failure does not repeat or duplicate Meta authorization.

Real-tenant external Chatwoot resource creation/E2E is not claimed because Production currently has no real tenant Business/binding to exercise it without synthetic data.

## Production checkpoint — Slice 6

Slice 6 is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** as of 2026-10-02 for the internally controlled message/status/media bridge, provenance, cross-plane dedupe and reconciliation scope.

Evidence:
- implementation PR #387, final head `4b6eba7ceb900e1d012d299e3b20816911f9fa51`, exact-head CI `36939463033`, merge `5f7f81c5b279efd92feb6341bdc971fe6e6c012e`;
- exact-main CI `36939774658` and Cloudflare Production Deploy `36940049403` succeeded on the exact merge SHA;
- Production migration `0167_whatsapp_message_bridge_provenance@20261001231837`, merged blob SHA `60c4df822b1429bf77d975089af96a218a1bf81b`;
- Production schema verifies canonical provenance/source identity, WhatsApp-to-Chatwoot durable sync state, service-role-only reconciliation RPCs, cross-plane unique identity and nullable business-wide Unified Inbox branch scope;
- Production backfill preserved truth: 36 existing `SHADOW_MODE` messages became `AI`, one ambiguous old outbound became `SYSTEM`, 37 scoped inbound journal events became Chatwoot-sync `PENDING`, and 12 legacy inbound events with neither Conversation nor Lead scope were left unprojected rather than assigned fabricated scope;
- Production remained side-effect clean at 37 Conversation Messages, 136 WhatsApp Events and 0 Unified Inbox projections, with no controlled-smoke IDs present after migration;
- Production safety remained Shadow Mode ON, global Kill Switch OFF, WhatsApp AI pause OFF and Agents pause OFF.

Slice 6 extends the existing canonical message/journal/reconciliation authorities only. Meta inbound is durably persisted before Chatwoot projection; Chatwoot human outbound must resolve a canonical Smart Visions membership and full human takeover before passing the existing send safety gate; Smart Core Owner/AI outbound is mirrored into Chatwoot with deterministic source identity and echo suppression; statuses are monotonic and recover from out-of-order evidence; media is bounded and validated using the existing provider/Vault authority. Ambiguous provider or Chatwoot mutation outcomes are never blindly retried.

This checkpoint does **not** claim official Business App Coexistence/native activity, `HUMAN_NATIVE_WHATSAPP` live evidence, or a real-customer Meta ↔ Smart Core ↔ Chatwoot E2E. Those require later slices plus real provider/tenant evidence.

**Slice-6 next-slice pointer superseded:** Slice 7 is now closed for the internally controlled scope above; current continuation is Slice 8 — reconnect/revoke/disconnect + first real tenant E2E acceptance.



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
