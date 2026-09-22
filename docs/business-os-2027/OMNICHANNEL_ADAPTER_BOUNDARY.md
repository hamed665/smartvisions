# Omnichannel Adapter Boundary — Evidence, Gap Map, and Contract

Status: **Phase 2 active**  
Semantic adapter slice: PR #175 -> `main@5d812eee8a0e15dac658247b254660ae8f09aacd`  
Active reconciliation slice: `feat/business-os-omnichannel-reconciliation`

## 1. Production evidence used

Phase 2 starts from the proven Growth OS channel runtime. It does not introduce a second message bus, send gate, journal, conversation system, or provider runtime.

Current canonical evidence:

- `assertCanonicalSendAllowed` is the final shared outbound safety boundary for Email and WhatsApp;
- canonical sending re-reads runtime controls, DNC/suppression, canonical recipient linkage, market window, conversation/lead Human takeover state, and WhatsApp 24-hour/template policy immediately before a provider call;
- Cost Guard is checked before paid provider work;
- approved-send claims an approved message before provider execution and prevents a second worker from sending the same draft;
- provider acceptance followed by persistence failure is reconciliation-only and must not be blindly retried;
- Email uses `ResendEmailProvider`, provider-side Idempotency-Key, `outreach_messages`, and `email_events`;
- WhatsApp uses `MetaCloudWhatsAppProvider`, application-side approved-send claim/idempotency, `outreach_messages`, and `whatsapp_events`;
- Email webhook signature verification and Resend event normalization already exist;
- WhatsApp Meta signature verification and inbound/status normalization already exist;
- both inbound lifecycles update the existing CRM/Conversation state, cancel pending follow-ups, and preserve DNC/Human rules;
- WhatsApp status evidence includes SENT / DELIVERED / READ / FAILED / DELETED;
- Email status evidence includes QUEUED / SENT / DELIVERED / BOUNCED / COMPLAINED / FAILED / SUPPRESSED;
- native-provider activity proving that a human replied from the original WhatsApp/Email application is **not currently proven** by the existing provider evidence.

## 2. Gap Map

| Capability | CURRENT | TARGET | Decision | Rule |
| --- | --- | --- | --- | --- |
| Canonical outbound safety | `assertCanonicalSendAllowed` | shared Action/Channel boundary | **REUSE** | No adapter may bypass it. |
| Approved send claim | `conversation_messages: APPROVED -> PROCESSING` | outbound command idempotency | **REUSE** | Provider send stays downstream of the claim. |
| Ambiguous provider acceptance | reconciliation-only disposition | channel reconciliation contract | **REUSE** | Never blind-retry accepted/ambiguous sends. |
| Email provider | `ResendEmailProvider` | first Email provider implementation | **REUSE** | No second Email sender. |
| WhatsApp provider | `MetaCloudWhatsAppProvider` | first WhatsApp provider implementation | **REUSE** | No second Meta sender. |
| Email journal | `outreach_messages + email_events` | canonical Email evidence | **REUSE** | Adapter reads/maps semantics only. |
| WhatsApp journal | `outreach_messages + whatsapp_events` | canonical WhatsApp evidence | **REUSE** | Adapter reads/maps semantics only. |
| Provider webhook normalization | channel-specific normalizers | canonical semantic envelope | **ADAPT** | Existing verification remains provider-specific. |
| Delivery/read vocabulary | duplicated lifecycle maps | one canonical status vocabulary | **ADAPT** | Lifecycle persistence consumes shared mapping. |
| Capability discovery | implicit in routes/providers | explicit capability descriptor | **NEW** | Descriptor cannot grant execution permission. |
| Provider identity | implicit constants/integration rows | explicit channel/provider identity | **ADAPT** | `EMAIL_PROVIDER/RESEND`, `META/META_CLOUD`. |
| Reply-window metadata | WhatsApp policy in canonical gate | explicit adapter policy metadata | **ADAPT** | WhatsApp remains 24h-or-template; Email has no equivalent reply window. |
| Native-app coexistence | Human takeover exists; provider-native human activity not proven | explicit evidence state | **EXTEND** | Human always wins; native activity remains `UNPROVEN` until provider evidence exists. |
| Future channels | none in active runtime | extensible semantic contract | **NEW CONTRACT ONLY** | Do not register a channel before a real provider path exists. |

No `REPLACE` decision exists.

## 3. Semantic adapter rule

The Phase 2 adapter is **not an execution gateway**.

It may:

- describe channel capabilities;
- normalize already verified provider inbound events;
- map provider delivery/read states into canonical states;
- expose provider identity and idempotency semantics;
- expose static policy metadata;
- report whether native-app coexistence evidence is proven.

It may **not**:

- call Meta, Resend, or another provider;
- write directly to a provider journal;
- bypass `assertCanonicalSendAllowed`;
- bypass Cost Guard;
- bypass approval/claim rules;
- fabricate provider-native human activity;
- convert an ambiguous provider result into an automatic retry.

Outbound execution remains on the existing canonical route.

## 4. Active channel capability matrix

| Capability | Email / Resend | WhatsApp / Meta Cloud |
| --- | --- | --- |
| Inbound | Yes | Yes |
| Plain text | Yes | Yes |
| HTML | Yes | No |
| Subject | Yes | No |
| Templates | No | Yes |
| Catalog product | No | Yes |
| Delivery receipt | Yes | Yes |
| Read receipt | Not proven/currently unavailable | Yes |
| Provider thread identity | Yes | Yes |
| Provider idempotency | Yes, Resend Idempotency-Key | No equivalent proven in current provider call |
| Canonical application idempotency | Yes | Yes, approved-send claim |
| Reply-window policy | None | 24-hour freeform or approved template |
| Human takeover blocks automation | Yes | Yes |
| Native-app human activity signal | UNPROVEN | UNPROVEN |

The absence of a capability is not filled with a fake abstraction. Future providers can extend the matrix when their real evidence path exists.

## 5. Canonical semantic envelopes

Inbound:

```text
channel
provider
provider_message_id
provider_thread_id?
occurred_at?
from
to?
content_type
text?
subject?
metadata
```

Delivery/status:

```text
channel
provider
provider_message_id
canonical_status
occurred_at?
detail?
metadata
```

These are semantic application envelopes. Durable source-of-truth remains the existing channel journals and CRM/conversation tables.

## 6. Canonical delivery vocabulary

```text
QUEUED
SENT
DELIVERED
READ
BOUNCED
COMPLAINED
FAILED
SUPPRESSED
DELETED
UNKNOWN
```

Provider-specific statuses are mapped only when evidence exists. Unknown provider states remain `UNKNOWN`; they are not guessed into a success state. Missing provider timestamps/content types remain absent/`UNKNOWN`; the adapter does not fabricate evidence.

## 7. Native-app coexistence

The Business OS target requires staff to keep using original channel applications where providers permit it.

Current proven behavior:

- a Human takeover in Smart Visions blocks AI automation;
- inbound customer events from provider webhooks are durable;
- outbound provider receipts are durable.

Current unproven behavior:

- a reliable provider event saying “a staff member replied from the native WhatsApp/Email app”;
- a provider-native activity stream sufficient to reconcile every external human action.

Therefore Phase 2 exposes coexistence as evidence, not as a boolean marketing claim:

`UNPROVEN | PROVIDER_EVENT | CANONICAL_HUMAN_TAKEOVER`

The active Email and WhatsApp adapters remain `UNPROVEN` for native-provider activity until a verified integration supplies that evidence.

## 8. Failure and reconciliation contract

The channel descriptor now carries a reconciliation contract backed by the existing durable schema.

Shared outbound evidence:

- message ledger: `outreach_messages`;
- provider-message uniqueness: `organization_id + provider_message_id` from migration 0067;
- provider acceptance followed by local persistence failure: `RECONCILIATION_ONLY`;
- pre-acceptance provider failure: `NO_AUTOMATIC_RETRY`;
- ambiguous provider result: `NO_BLIND_RETRY`;
- status authority: provider webhook journal.

Email evidence:

- provider event journal: `email_events`;
- event dedupe: `organization_id + provider + provider_event_id`;
- integration identity: `EMAIL_PROVIDER / EMAIL`;
- provider implementation identity: `RESEND`.

WhatsApp evidence:

- provider event journal: `whatsapp_events`;
- event dedupe: `organization_id + provider_message_id + direction + event_type`;
- integration identity: `META / WHATSAPP`;
- provider implementation identity: `META_CLOUD`.

The approved-send route resolves integration identity through the shared channel registry, but execution ownership remains unchanged. Provider calls, message claim, canonical safety recheck, Cost Guard and provider-accepted reconciliation remain in the existing approved-send/runtime paths.

Additional invariants:

- webhook signatures fail closed;
- status `UNKNOWN` never becomes a success signal;
- adapter normalization is side-effect free;
- the registry maps identity only; it cannot execute a send.

## 9. Data and migration impact

This initial Phase 2 slice requires **no Production schema migration**.

It reuses:

- `integration_connections`;
- `outreach_messages`;
- `email_events`;
- `whatsapp_events`;
- `conversation_messages`;
- `sales_conversations`;
- current suppression/DNC state;
- current Cost Guard and runtime controls.

A future migration is allowed only if a later adapter needs durable facts that cannot be represented safely by these canonical sources.

## 10. Test contract

Required for the semantic + reconciliation slices:

- active registry contains only proven Email and WhatsApp adapters;
- adapter layer contains no provider-send method;
- Email/WhatsApp capability differences remain explicit;
- provider idempotency differences remain explicit;
- Human priority remains explicit;
- native-provider activity remains UNPROVEN;
- Email inbound/status normalization;
- WhatsApp inbound/referral/status normalization;
- existing lifecycle tests remain green after consuming shared status mapping;
- integration registry rejects unproven channels;
- approved-send provider lookup uses the shared registry;
- reconciliation descriptors match migrations 0004, 0030 and 0067;
- reconciliation retry semantics match `approvedSendFailureDisposition`;
- lint, typecheck, full Vitest, Next build, Vinext build, Cloudflare scheduled verification.

## 11. Explicit non-scope

This slice does not:

- reroute provider sends;
- add Instagram/Facebook/TikTok/Telegram/SMS/RCS/Voice adapters;
- add a second Unified Inbox;
- change CRM source of truth;
- change Human takeover semantics;
- modify Production RLS;
- send a real customer message;
- claim native-app activity synchronization that is not evidenced.
