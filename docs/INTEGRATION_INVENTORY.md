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
| OpenAI API | Agent reasoning and voice transcription backend | CONNECTED | Durable production Agent usage exists; do not repeat paid health calls without a new need. |
| OpenAI model routing | Cost-aware model selection | CONNECTED | Existing Agent settings + Cost Guard remain canonical. |
| Google Places | Discovery / qualification / intelligence | CONNECTED | Production-evidenced controlled discovery path. |
| Meta / WhatsApp | Inbound, Agent approval, Catalog send and status webhooks | **CONNECTED** | Full real controlled E2E proven through `PRODUCT_SENT → SENT → DELIVERED → READ` with `SV-WEB-001`. |
| Email Provider / Resend | Outbound email + lifecycle webhook | **CONNECTED** | Existing controlled verification send and signed `email.sent` + `email.delivered` evidence; stale provider row reconciled with zero new provider calls. Inbound-reply sales lifecycle E2E remains the next proof. |
| Email mailbox | `hello@smartvisionsai.com` | CONNECTED / HEALTHY | Mailbox enabled; real Resend delivery evidence exists. Separate SPF/DKIM/DMARC audit was not repeated in this reconciliation. |
| Crawl4AI | Optional external website audit | OPTIONAL / NOT_CONFIGURED | Deterministic website audit already exists. Configure only if the external audit service is actually needed. |
| Meta / Instagram | Restricted social integration | NOT_CONFIGURED / DEFERRED | Do not create autonomous cold-DM behavior; activate only policy-safe use cases. |
| Redis / Queue | Optional async runtime queue | OPTIONAL / NOT_CONFIGURED | Do not add unless measured load/recovery requirements justify it. |
| Internal API key | Protect internal endpoints | CONFIGURED / server-only | Internal AI and Approved Send boundaries use explicit internal authentication where intended. |
| Vercel Production | Hosting/runtime | CONNECTED | `main` production deployment is READY and canonical alias is `smartvisions.vercel.app`. |
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

## WhatsApp verification evidence

The provider is no longer merely credential-ready. A real controlled customer-service-window path is production-verified:

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

Existing durable production evidence from 2026-08-23:

- sender mailbox: `hello@smartvisionsai.com`
- controlled verification provider ID: `a180f18d-0a5f-4bee-9687-5c962bf0610e`
- signed webhook event: `email.sent`
- signed webhook event: `email.delivered`
- audit trail links the same provider ID to the owner-triggered controlled verification

On 2026-08-31 the stale integration state was reconciled from that evidence:

- integration → CONNECTED + enabled
- mailbox health → HEALTHY
- audit → `EMAIL_PROVIDER_RECONCILED_FROM_DURABLE_DELIVERY`
- provider calls during reconciliation → `0`

This is intentionally evidence reconciliation rather than another smoke send.

Still unproven for Email:

- a real `email.received` event through the sales-lifecycle path
- provider-content retrieval for that inbound
- exact Business/Lead correlation
- EMAIL conversation/inbound-message persistence
- Lead → REPLIED + follow-up cancellation
- inbound replay/idempotency in production

Those are the next Email gates. The code already exists; do not build a second email subsystem.

## Runtime controls and budget ownership

Current safety state:

- global kill switch: OFF
- email pause: OFF
- WhatsApp AI pause: OFF
- agents pause: OFF
- Shadow Mode: ON

Canonical monthly Cost Guard remains in `cost_guard_settings`:

- total: $25
- OpenAI: $10
- Google Places: $5
- Email: $4
- WhatsApp: $3
- reserve: $3

`system_controls.monthly_budget_usd` is legacy and is not a second budget source.

## Provider fail-closed rules

Canonical Approved Send still requires, as applicable:

- actual APPROVED state and approval provenance
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

Provider acceptance is not allowed to become blindly retryable because a later persistence step fails. Reconciliation-only semantics remain canonical after provider acceptance.

## Reliability / idempotency boundaries

- Google Details: `discovery_records` claim/replay
- Website audit: TTL cache + daily quota + one-RUNNING guard
- Inbound AI: `agent_runs.request_key/result_payload`
- Voice: media cache + failure/stale-processing recovery
- Preview/content: stable `brief_hash`
- Email webhook: signed provider-event idempotency
- WhatsApp webhook: durable provider-event/message idempotency
- Approved outbound: pre-provider claim + no blind retry after provider acceptance

## Cost-first verification rule

Before any provider smoke test, search durable production evidence first. Do not spend again to refresh a status badge.

A new provider call is justified only when the exact behavior being tested remains genuinely unproven. This rule is why Email connectivity was reconciled from the existing signed delivery evidence rather than sending a fifth verification email for ceremonial purposes.

## Current launch distinction

WhatsApp controlled E2E is production-verified. Email outbound delivery connectivity is production-verified. This still does **not** mean broad autonomous outreach is approved.

Remaining evidence should be gathered in this order:

1. controlled real Email inbound-reply E2E;
2. controlled Voice transcription production test using existing OpenAI;
3. Preview generate → share/send → view E2E;
4. Crawl4AI only if configured/needed;
5. smallest safe bounce/suppression/unsubscribe evidence where still required;
6. full Shadow Mode behavior scenarios: positive reply, no reply, objection, DNC, human takeover;
7. explicit owner decision on a tiny Oman pilot and permitted automation level.

Redis and Instagram are not current launch blockers. Shadow Mode stays ON until an explicit later decision.
