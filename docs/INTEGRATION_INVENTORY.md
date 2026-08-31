# Smart Visions Growth OS — Integration Inventory

**Reconciled:** 2026-08-31 (Oman, UTC+4)

This is the operational provider/configuration inventory. Production database evidence and current `main` take precedence over older status text.

Definitions:

- `CONNECTED` = durable production evidence proves the exact provider/channel path.
- `READY` = code/config exists but the required production behavior is not yet proven.
- `NOT_CONFIGURED` = required production service/config is absent or intentionally disabled.
- `OPTIONAL` = V1 correctness and the current launch path do not depend on it.

## Current provider inventory

| Slot | Purpose | Current state | Evidence / remaining gate |
|---|---|---|---|
| Supabase browser/auth | Authenticated Control Center data plane | CONNECTED | Existing Auth + organization RLS/OWNER model remains canonical. |
| Supabase server credential | Privileged server operations | CONNECTED | Server-only service credential is actively used at controlled runtime boundaries. |
| OpenAI API | Agent reasoning and voice transcription backend | CONNECTED | Durable production Agent usage exists. Voice transcription behavior still needs one real controlled media proof. |
| OpenAI model routing | Cost-aware model selection | CONNECTED | Existing Agent/Cost Guard primitives remain canonical; runtime wiring of DB prompt/settings controls is a separate intelligence improvement. |
| Google Places | Discovery / qualification / intelligence | CONNECTED | Production-evidenced controlled discovery path. |
| Meta / WhatsApp | Inbound, Agent approval, Catalog send and status webhooks | **CONNECTED** | Full real controlled E2E proven through `PRODUCT_SENT → SENT → DELIVERED → READ` with `SV-WEB-001`. |
| Email Provider / Resend | Outbound + custom-domain inbound lifecycle | **CONNECTED** | Outbound send/delivery and real `hello@smartvisionsai.com` inbound Receiving path are production-verified. |
| Email mailbox / DNS | `hello@smartvisionsai.com` | **CONNECTED / HEALTHY** | Sending DKIM/SPF verified; root Receiving MX verified; DMARC exists with `p=none`; real custom-domain inbound persisted exactly once. |
| Crawl4AI | Optional external website audit | OPTIONAL / NOT_CONFIGURED | Deterministic website audit already exists. Configure only if the external audit service is actually needed. |
| Meta / Instagram | Restricted social integration | NOT_CONFIGURED / DEFERRED | No current Instagram monitoring/DM runtime. Do not create autonomous cold-DM behavior; activate only policy-safe use cases feeding the existing Hunter/CRM. |
| Redis / Queue | Optional async runtime queue | OPTIONAL / NOT_CONFIGURED | Do not add unless measured load/recovery requirements justify it. |
| Internal API key | Protect internal endpoints | CONFIGURED / server-only | Internal AI, voice and Approved Send boundaries use explicit internal authentication where intended. |
| Vercel Production | Hosting/runtime | CONNECTED | `main` production is READY and canonical alias is `smartvisions.vercel.app`. |
| Global runtime controls | Kill / pause controls | CONNECTED | Database state is canonical. |
| Shadow Mode | Prevent broad live autonomous outbound | CONNECTED / intentionally ON | Keep ON until remaining launch evidence is complete and owner explicitly chooses an automation level. |

## Production provider rows

Queried directly from Growth OS Supabase on 2026-08-31:

- `GOOGLE_PLACES / DISCOVERY` — CONNECTED, enabled
- `OPENAI / AI` — CONNECTED, enabled
- `META / WHATSAPP` — CONNECTED, enabled
- `EMAIL_PROVIDER / EMAIL` — CONNECTED, enabled
- `CRAWL4AI / AUDIT` — NOT_CONFIGURED, disabled, optional
- `META / INSTAGRAM` — NOT_CONFIGURED, disabled, intentionally deferred
- `REDIS / QUEUE` — NOT_CONFIGURED, disabled, optional

Current runtime controls:

- global kill switch: OFF
- email pause: OFF
- WhatsApp AI pause: OFF
- agents pause: OFF
- Shadow Mode: ON

## WhatsApp verification evidence

A real controlled customer-service-window path is production-verified:

`real inbound → linked Lead/Conversation → Agent → one Shadow Approval → owner approval → canonical Approved Send → Catalog product → Meta accepted → SENT → DELIVERED → READ`

Durable evidence includes:

- Catalog Content ID: `SV-WEB-001`
- provider message ID: `wamid.HBgLOTY4Nzc1MTEwNTMVAgARGBIxOThBNjM4MURFQzYwM0RGNzUA`
- `PRODUCT_SENT` event with the Content ID
- status webhooks `SENT`, `DELIVERED`, `READ`
- exactly one `WHATSAPP / SEND_PRODUCT` usage event
- no duplicate provider send for the logical controlled message

Global Shadow Mode remained ON. PR #67 permits only the evidence-backed INTERNAL_TEST exception and still reuses canonical Approved Send. It does not grant broad live-autonomous permission.

## Email verification evidence

The Email Provider uses Resend.

### Outbound

Durable production evidence from 2026-08-23:

- sender mailbox: `hello@smartvisionsai.com`
- controlled verification provider ID: `a180f18d-0a5f-4bee-9687-5c962bf0610e`
- signed webhook: `email.sent`
- signed webhook: `email.delivered`
- audit trail links the same provider ID to the owner-triggered controlled verification

The provider integration was reconciled to CONNECTED + enabled and mailbox health HEALTHY from that evidence with zero ceremonial resend.

### Receiving configuration

Receiving on the actual company domain is now configured and verified:

- domain: `smartvisionsai.com`
- DNS: Cloudflare
- Resend Receiving region: `ap-northeast-1`
- Receiving MX: `@ → inbound-smtp.ap-northeast-1.amazonaws.com`
- MX priority: `10`
- Resend Receiving state: Verified
- webhook: `https://smartvisions.vercel.app/api/email/webhook`
- subscribed event: `email.received`
- Resend server credential used by `EMAIL_PROVIDER_API_KEY`: Full Access, stored only in Vercel
- sending DKIM remains Verified
- sending SPF/Return-Path remains Verified
- DMARC exists: `v=DMARC1; p=none;`

### Real custom-domain inbound proof

A real Gmail message was sent to the real mailbox rather than the provider's test receiving address:

- from: `capcutproazivibe@gmail.com`
- to: `hello@smartvisionsai.com`
- subject: `Website service inquiry`
- provider message ID / Resend received email ID: `e7a8b6d1-0db9-4634-b802-c7d7c0d35cb7`
- webhook event ID: `msg_3IghZHR1eyuRFv4lAgzVgp2Igfv`
- linked EMAIL conversation: `438b12c3-5ec7-4d92-a175-09b105894d89`
- linked INTERNAL_TEST Lead: `2e4a14bd-6f87-474d-81c1-db1fb3c5ef1a`

Verified lifecycle:

`external Gmail → hello@smartvisionsai.com → Resend Receiving → signed email.received → provider content retrieval → exact Business/Lead correlation → EMAIL conversation → inbound outreach_messages → Lead REPLIED`

Idempotency evidence:

- exactly one durable `email_events` row for this provider event
- exactly one inbound `outreach_messages` row for the provider identity
- stable inbound key `resend:inbound:e7a8b6d1-0db9-4634-b802-c7d7c0d35cb7`
- no duplicate inbound lifecycle row

No `PENDING` follow-up job existed for this dedicated test Lead, so this proof does **not** claim a real pending job was cancelled. Follow-up cancellation remains an implemented behavior that should be verified later in the no-reply/reply Shadow scenario.

### Email intelligence distinction

Email transport and sales-lifecycle persistence are verified, but automatic Agent intelligence on the inbound webhook is intentionally not claimed.

Current `email-lifecycle` persists the real inbound and updates the Lead, but does not invoke paid `/api/ai/process-inbound` from provider webhook retries. The resulting conversation still shows intelligence fields such as stage/intent/Persian brief as not yet processed. This is a known Agent launch gap, not an Email provider failure.

Do not fix this by calling paid AI directly inside the Resend retry path. Reuse the existing `agent_runs` idempotency, conversation intelligence and Shadow Approval primitives through a controlled boundary.

## Agent / Knowledge runtime inventory

Existing Control Center surfaces and schemas already include Agent settings/prompt versioning and Knowledge Base versioning. They are foundations, not permission to build another agent framework.

Current verified gaps:

- active Knowledge Base service corpus is not yet populated for production advisory behavior;
- current OpenAI runtime does not yet consume active `knowledge_versions` as service knowledge;
- current runtime does not yet fully hydrate conversation history/recent turns by itself;
- prompt/settings Control Center state is not yet the full runtime source for the code-level Agent instructions;
- structured Services/Pricing and the WhatsApp Catalog need future source-of-truth reconciliation for all sellable services.

These are intelligence-completion tasks before broad autonomous conversations, not provider-integration blockers for the already-proven WhatsApp/Email transport paths.

## Hunter / Instagram distinction

Business Hunter remains production foundation and continues to use Google Places, deterministic website/contact evidence and the existing CRM/Growth routing.

`META / INSTAGRAM` is NOT_CONFIGURED. There is currently no production Instagram page-monitoring or cold-DM runtime. Known Instagram links may be retained as evidence with unknown social quality; no weakness should be fabricated.

If Instagram is activated later, permitted data/actions must feed the existing Hunter/Lead/Conversation/Cost Guard primitives. Do not create a second CRM or uncontrolled DM bot.

## Runtime controls and budget ownership

Canonical monthly Cost Guard remains in `cost_guard_settings`:

- total: $25
- OpenAI: $10
- Google Places: $5
- Email: $4
- WhatsApp: $3
- reserve: $3

`system_controls.monthly_budget_usd` is legacy and is not a second budget source.

## Provider fail-closed rules

Canonical controlled outbound still requires, as applicable:

- actual approval provenance where required
- provider `CONNECTED + enabled`
- global kill OFF
- channel pause OFF
- Agent pause OFF
- not DNC/suppressed
- no human takeover lock
- recipient-local send window
- Cost Guard allowance
- channel-specific provider policy
- idempotent pre-provider claim

For WhatsApp, the 24-hour/template policy remains independent. Catalog product messages require a real open customer-service window.

Provider acceptance must not become blindly retryable because a later persistence step fails. Reconciliation-only semantics remain canonical after provider acceptance.

## Reliability / idempotency boundaries

- Google Details: `discovery_records` claim/replay
- Website audit: TTL cache + daily quota + one-RUNNING guard
- Inbound AI: `agent_runs.request_key/result_payload`
- Voice: media cache + FAILED/stale-PROCESSING recovery
- Preview/content: stable `brief_hash`
- Email webhook: signed provider-event idempotency + stable inbound-message identity
- WhatsApp webhook: durable provider-event/message idempotency
- Approved outbound: pre-provider claim + no blind retry after provider acceptance

## Cost-first verification rule

Before any provider smoke test, search durable production evidence first. Do not spend again to refresh a status badge.

A new provider call is justified only when the exact behavior being tested remains genuinely unproven.

## Current launch distinction

WhatsApp controlled Catalog E2E and Email outbound + real custom-domain inbound transport are production-verified. This still does **not** mean broad autonomous outreach is approved.

Remaining evidence should be gathered in this order:

1. controlled real WhatsApp Voice transcription using the existing OpenAI + media-cache path;
2. Preview generate → share/send → public view E2E;
3. Crawl4AI only if configured/needed;
4. smallest safe bounce/suppression/unsubscribe evidence where still required;
5. full Shadow Mode behavior scenarios: positive reply, no reply, objection, DNC, human takeover;
6. close the existing Agent intelligence gaps needed for safe multi-turn autonomous advice: conversation hydration, Knowledge Base runtime wiring, owner prompt/settings runtime wiring and service source-of-truth reconciliation;
7. explicit owner decision on a tiny Oman pilot and permitted automation level.

Redis and Instagram are not current launch blockers. Shadow Mode stays ON until an explicit later decision.
