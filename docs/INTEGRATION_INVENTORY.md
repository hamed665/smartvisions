# Smart Visions Growth OS — Integration Inventory

**Reconciled:** 2026-09-03 (Oman, UTC+4)

Production database evidence, current `main`, Cloudflare deployment evidence and provider durability evidence override older provider-status text.

Definitions:

- `CONNECTED` = durable production evidence proves the required provider/channel path.
- `READY` = code/config exists but the required production behavior is not yet proven.
- `NOT_CONFIGURED` = required service/config is absent or intentionally disabled.
- `OPTIONAL` = current V1 correctness does not depend on it.

## Current inventory

| Slot | Purpose | State | Production evidence / remaining boundary |
|---|---|---|---|
| Cloudflare Workers Paid | Primary hosting/runtime | **CONNECTED / PRODUCTION VERIFIED** | `https://app.smartvisionsai.com` routes through `app.smartvisionsai.com/* -> smartvisions-growth-os-production`; permanent main-CI-driven deploy, release-candidate smoke/load and routed Production smoke are green. |
| Supabase browser/auth | Authenticated Control Center | CONNECTED | Existing organization/owner model remains canonical. |
| Supabase server credential | Privileged server operations | CONNECTED | Growth project `pkypexzpyfbikdnkrzvw`; controlled server credential validated read-only during Cloudflare deploy. |
| OpenAI API | Agent reasoning + Voice transcription | **CONNECTED** | Agent usage exists; real WhatsApp Voice transcription and cached replay are production-proven. |
| OpenAI model routing | Cost-aware AI execution | CONNECTED | Existing Cost Guard/model routing remains canonical. |
| Google Places | Hunter discovery / qualification | **CONNECTED** | Controlled production discovery path proven. |
| Meta / WhatsApp | Inbound, Agent approval, Catalog send, status and Voice media | **CONNECTED** | Real Catalog E2E through READ plus real Voice media/transcription proof. |
| Email Provider / Resend | Sending + branded receiving | **CONNECTED** | Outbound sent/delivered and real `hello@smartvisionsai.com` inbound are production-proven. |
| Email mailbox / DNS | `hello@smartvisionsai.com` | **CONNECTED / HEALTHY** | Sending DNS + root Receiving MX verified; real branded inbound persisted exactly once. |
| Preview public surface | Personalized proposal Preview | **CONNECTED / PRODUCTION VERIFIED** | Generate → Approve → internal Share/SENT → public token → VIEWED proven at zero provider cost/outbound. Public auth and shell boundaries fixed in PRs #75–#76. |
| Crawl4AI | Optional external website audit | OPTIONAL / NOT_CONFIGURED | Deterministic audit already exists; configure only for a real V1 need. |
| Meta / Instagram | Restricted social integration | NOT_CONFIGURED / DEFERRED | No production page-monitoring or cold-DM runtime. Any later use must feed existing Hunter/CRM and comply with provider policy. |
| Redis / Queue | Optional async queue | OPTIONAL / NOT_CONFIGURED | Add only if measured load/recovery requirements justify it. |
| Internal API key | Internal server endpoint protection | CONFIGURED / server-only | Existing internal AI/Voice/Approved Send boundaries remain protected. |
| Vercel | Temporary rollback only | **FROZEN ROLLBACK / NOT PRIMARY** | `https://smartvisions.vercel.app` is retained only during the Cloudflare stability window. Automatic Vercel Git deployments are disabled; do not treat Vercel as current Production. |
| Runtime controls | Kill / pause controls | CONNECTED | Database state is canonical. |
| Shadow Mode | Prevent broad autonomous outbound | CONNECTED / intentionally ON | Keep ON until remaining behavior/policy gates and owner launch decision. |

## Cloudflare API/runtime parity

Post-cutover reconciliation against merge commit `b13a1e568b1735148a15584fda8a5edb8bc5eb3a` found exactly 21 repository API route handlers and exactly 21 route handlers in the deployed Vinext Worker bundle. No API route-count drift exists.

Canonical API routes currently deployed through the Growth Worker are:

- `/api/ai/process-inbound`
- `/api/email/send`
- `/api/email/webhook`
- `/api/hunters/business/audit`
- `/api/hunters/business/details`
- `/api/hunters/business/discover`
- `/api/hunters/business/score`
- `/api/hunters/intent/score`
- `/api/outreach/approved-send`
- `/api/outreach/message-plan`
- `/api/outreach/quote`
- `/api/outreach/replies/analyze`
- `/api/outreach/schedule`
- `/api/outreach/shadow-approval`
- `/api/preview/generate`
- `/api/preview/production`
- `/api/telegram/notify`
- `/api/telegram/webhook`
- `/api/whatsapp/send`
- `/api/whatsapp/voice/transcribe`
- `/api/whatsapp/webhook`

Deployment evidence additionally proves the release candidate and routed Production pass safe auth/webhook rejection checks without invoking outbound provider sends. `workers_dev` is disabled on Production and the hard Worker CPU guard remains `100ms`.

## Current production control state

- Global kill switch: OFF
- Email pause: OFF
- WhatsApp AI pause: OFF
- Agents pause: OFF
- Shadow Mode: ON

## WhatsApp Catalog verification

Verified controlled path:

`real inbound → Agent → Catalog recommendation → Shadow Approval → owner approval → canonical Approved Send → Meta product → SENT → DELIVERED → READ`

Catalog ID: `1773319100642340`.

Verified Content ID: `SV-WEB-001`.

No duplicate provider send occurred.

## WhatsApp Voice verification

A real WhatsApp voice message on the linked INTERNAL_TEST Lead was downloaded from Meta and transcribed through OpenAI.

Transcript:

`I need a website for my clinic. Can you show me your website services?`

Production evidence:

- `voice_transcriptions`: one logical SUCCEEDED row
- model: `gpt-4o-mini-transcribe`
- first logical request: one OpenAI provider call / one Voice usage event
- controlled accounting estimate: `$0.009`
- second identical logical request: cached result, `openAiCalls=0`
- no second paid usage event
- no outbound send
- Shadow Mode remained ON

Voice is no longer a remaining integration smoke test.

## Email / Resend verification

### Outbound

- mailbox: `hello@smartvisionsai.com`
- signed `email.sent` and `email.delivered` evidence exists
- provider row is CONNECTED + enabled

### Branded receiving

- domain: `smartvisionsai.com`
- DNS: Cloudflare
- Resend Receiving region: `ap-northeast-1`
- Receiving MX: `@ → inbound-smtp.ap-northeast-1.amazonaws.com`, priority `10`
- Receiving state: Verified
- real Gmail → `hello@smartvisionsai.com` → Resend → signed `email.received` → content retrieval → exact Lead match → EMAIL conversation → inbound message → Lead REPLIED
- provider event/message persisted exactly once

Email transport is green. Automatic Agent reasoning directly from provider webhook retries is intentionally not claimed and must not be added without idempotent paid-AI boundaries.

## Preview verification

Controlled Preview:

- ID: `9f962982-a25d-4d66-8f80-3fc4c9791948`
- public token: `dcf27c1b-cffe-4e0d-affe-df234ce0bb6d`
- Quality: `100/100`
- provider generation/share cost: `0`
- outbound triggered: `false`

Lifecycle counts are exactly one each:

- `GENERATED`: 1
- `APPROVED`: 1
- `SENT`: 1
- `VIEWED`: 1

Repeated public reads keep `VIEWED` idempotent.

Two production-only public-surface gaps were fixed before declaring success:

- PR #75: `/p/[token]` no longer requires an operator session.
- PR #76: `/p/[token]` no longer renders internal Control Center sidebar/navigation.

Unauthenticated production fetch now returns the Preview content with HTTP 200 while the internal Control Center remains protected.

## Hunter / Instagram distinction

Business Hunter remains canonical and should not be rebuilt. It continues to use Google Places, deterministic website/contact evidence and existing Growth/CRM primitives.

Instagram remains NOT_CONFIGURED. There is no current production Instagram monitoring/cold-DM engine. If activated later, permitted Instagram evidence/actions must enter the existing Hunter/Lead/Conversation/Cost Guard model.

## Agent / Knowledge distinction

Provider integrations are not the same as autonomous sales intelligence.

Current runtime already hydrates conversation/history, active Knowledge, canonical Services/Pricing/Locale and existing Agent settings before paid reasoning. Do not create a second intelligence framework or duplicate commercial sources of truth.

## Cost Guard ownership

Canonical monthly budget remains:

- total `$25`
- OpenAI `$10`
- Google Places `$5`
- Email `$4`
- WhatsApp `$3`
- reserve `$3`

Cost thresholds remain `70 / 85 / 95 / 100%` for warning / throttle / critical / hard stop.

## Reliability boundaries

- Google Details: durable discovery claim/replay
- Website audit: cache/quota/one-RUNNING guard
- Inbound AI: `agent_runs.request_key/result_payload`
- Voice: provider/media identity cache plus no-blind-paid-retry semantics
- Preview: stable `brief_hash`, expiry and lifecycle transitions
- Email: signed provider-event idempotency plus inbound-message identity
- WhatsApp: durable provider-event/message idempotency
- Approved outbound: pre-provider claim; provider acceptance is not blindly retryable
- Cloudflare deploy: successful main CI → isolated candidate → safe smoke/load → exact production promotion → existing Worker Route verification → routed smoke

## Remaining launch evidence

Do not re-smoke-test Google Places, OpenAI connectivity, WhatsApp Catalog transport, Email transport, Voice transcription, Preview public rendering or Cloudflare route parity merely to refresh UI badges.

Remaining work is now primarily behavior/policy proof:

1. verify V1 Project Hunter sources are public/official/licensed/permitted and feed the existing pipeline;
2. controlled Shadow Mode scenarios: positive reply, no reply/follow-up, objection, DNC/unsubscribe, human takeover;
3. prove cancellation against an actual pending follow-up;
4. verify fail-closed local-time, DNC, takeover, kill-switch and commercial-price boundaries in the full path;
5. prove the real Telegram owner-alert send/journal path without manufacturing a fake customer event;
6. only then make an explicit owner decision on a tiny Oman pilot and automation level.

Crawl4AI, Redis and Instagram remain optional/deferred unless a concrete V1 requirement changes that decision.
