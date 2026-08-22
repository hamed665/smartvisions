# Smart Visions Growth OS — Integration Inventory Freeze

**Reconciled:** 2026-08-22 (Oman, UTC+4)

This is the canonical operational inventory for the integration/configuration slots tracked by the Production V1 plan. `CONNECTED` means durable production evidence exists. `READY` means the code/config path exists but a live production E2E is not yet proven. `NOT_CONFIGURED` means required production credentials/config are not confirmed. `OPTIONAL` means V1 correctness does not depend on it.

| Slot | Purpose | Current state | Spend risk | Launch rule |
|---|---|---|---|---|
| Supabase browser/auth | Authenticated data plane | CONNECTED | Low | RLS/OWNER controls remain canonical. |
| Supabase server credential | Privileged server operations | CONNECTED | Low | Server-only; never surface secret values. |
| OpenAI API | Agent reasoning | CONNECTED | Yes | Durable production usage already proves connectivity. Do not repeat paid smoke tests without a real need. |
| OpenAI model routing | Cost-aware model selection | CONNECTED | Yes | Reuse Cost Guard + agent settings. |
| Google Places | Discovery/qualification/intelligence | CONNECTED | Yes | IDs-only first; paid Details are journaled/idempotent and Cost Guard protected. |
| Crawl4AI | Optional external website audit | READY in code / NOT_CONFIGURED in production | Potential infra | Production audit endpoint requires integration `CONNECTED`, Cost Guard, cache miss and single-running claim. |
| Email provider identity/config | Outbound email | NOT_CONFIGURED | Yes | Remains fail-closed until real provider + sender/domain verification. |
| Email provider credential | Email send/receive | NOT_CONFIGURED | Yes | One controlled live E2E before marking CONNECTED. |
| Email DNS/domain | SPF/DKIM/DMARC / health | NOT_CONFIGURED | Indirect | External sender setup required before pilot. |
| Meta WhatsApp token | WhatsApp Cloud auth | NOT_CONFIGURED | Yes | Keep provider row disabled until real verification. |
| Meta phone number ID | WhatsApp sender identity | NOT_CONFIGURED | Low | Configure with token. |
| Meta Graph API version | Endpoint contract | READY in code | Low | Verify with WhatsApp E2E. |
| Meta App Secret | Webhook HMAC | NOT_CONFIGURED | Low | Required for live webhook verification. |
| Meta webhook verify token | Subscription handshake | NOT_CONFIGURED | Low | Configure during Meta setup. |
| Internal API key | Protect internal endpoints | READY / secret presence not exposed | Low | Server-only. Internal paid endpoints now also enforce DB runtime controls/idempotency. |
| Redis / runtime queue | Optional async queue | OPTIONAL / NOT_CONFIGURED | Infra | Do not add unless measured V1 reliability requires it. |
| Vercel Production | Hosting/runtime | CONNECTED | Hosting | `main` deploys Production; exact merge SHA must be READY at exit. |
| Global runtime controls | Kill/pause controls | CONNECTED | Prevents spend | DB is source of truth. Global kill is enforced before controlled provider operations. |
| Shadow Mode | Prevent live autonomous outbound | CONNECTED / intentionally SAFE | Prevents spend | Remain ON until live provider E2E + explicit owner launch decision. |

## Production provider rows

- `GOOGLE_PLACES / DISCOVERY` — CONNECTED, enabled.
- `OPENAI / AI` — CONNECTED, enabled.
- `CRAWL4AI / AUDIT` — NOT_CONFIGURED, disabled.
- `EMAIL_PROVIDER / EMAIL` — NOT_CONFIGURED, disabled.
- `META / WHATSAPP` — NOT_CONFIGURED, disabled.
- `META / INSTAGRAM` — NOT_CONFIGURED, disabled.
- `REDIS / QUEUE` — NOT_CONFIGURED, disabled and optional.

## Runtime controls and budget ownership

Production runtime controls currently report:

- global kill switch: OFF
- email pause: OFF
- WhatsApp AI pause: OFF
- agents pause: OFF
- Shadow Mode: ON

Budget is **not** owned by `system_controls.monthly_budget_usd`. That column is a legacy duplicate. Production runtime and Control Center now use `cost_guard_settings` as the canonical budget/quota source. Current total monthly budget is **USD 25**.

## Provider fail-closed rules

Approved Send requires the mapped provider row to be both enabled and production-verified CONNECTED before claiming a message:

- Email → `EMAIL_PROVIDER / EMAIL`
- WhatsApp → `META / WHATSAPP`

Shadow Mode, global kill, channel pause, DNC, human takeover, Agent pause, local send window, Cost Guard and channel-specific policy remain independent earlier gates.

Crawl4AI production business audit likewise requires `CRAWL4AI / AUDIT = CONNECTED + enabled`; credential presence alone is insufficient.

## Idempotency / retry rules at provider boundaries

- Google Place Details: existing `discovery_records` uniquely journals each organization + Place ID request. Completed results replay; PROCESSING/FAILED attempts do not blindly rerun paid Details.
- Website audit: cached evidence is reused; a unique one-RUNNING-per-business index blocks concurrent duplicate crawls.
- Inbound AI: `agent_runs.request_key` claims one logical request and stores final result payload for replay. PROCESSING/FAILED keys are locked against automatic paid rerun.
- Voice: media identity cache + recovery lease.
- Email webhook: provider event replay/idempotency path.
- Approved outbound: pre-provider claim + reconciliation-only post-provider persistence failure. No blind automatic retry after provider acceptance.

## Cost-first verification rule

Before any new smoke test, check durable DB/usage/audit evidence. Do not repeat a paid provider call merely because an integration row or UI badge is stale. Reconcile from durable evidence where safe. Only run a new minimal live test when current credentials/configuration or an end-to-end path is genuinely unproven.

## Current final launch distinction

Code-complete / controlled-pilot readiness can be true while Email and WhatsApp remain NOT_CONFIGURED and Shadow Mode remains ON. `liveAutomationReady` must remain false until real sender credentials/domain/webhooks are verified, one controlled E2E per live channel succeeds, and Shadow Mode is intentionally disabled by the owner.
