# Smart Visions Growth OS — Current Production State

**Reconciled:** 2026-08-31 (Oman, UTC+4)

This is the operational handoff. Production facts and the current `main` branch win over older planning text. Preserve the existing Control Center and extend only verified gaps.

## Production identity

- Repository: `hamed665/smartvisions`
- Production branch: `main`
- Production URL: `https://smartvisions.vercel.app`
- Supabase project: `pkypexzpyfbikdnkrzvw`
- Current production main: `96289b6ec19f08a5b488b9973a9e170606514613` (merged PR #63)
- Vercel deployment for that exact commit: `dpl_9SXAtH8qvHkELDb26xwQmDmFmQ8b` — READY, target `production`, alias `smartvisions.vercel.app`, aliasError = null

## Completed sequence

- #36 ✅ Growth Intelligence / acquisition and growth-opportunity routing
- #37 ✅ AI Sales / Conversations / Email / WhatsApp / Voice foundation
- #38 ✅ Reliability hardening for the five PR #37 review failures
- #39 ✅ Website Demo & Content Production Engine
- #40 ✅ Control Center completeness / reliability / launch gates
- #49 ✅ Restore service-role grants required by WhatsApp webhook lifecycle
- #50 ✅ Controlled WhatsApp production verification path
- #51 ✅ Separate Meta WhatsApp readiness from Instagram readiness
- #52 ✅ Allow owner to enter WhatsApp verification test number before credentials are ready
- #53 ✅ Support the actual deployed WhatsApp environment variable names while retaining legacy aliases
- #54 ✅ Restore least-required runtime-safety service-role grants for WhatsApp controlled verification
- #55 ✅ Wire the live Smart Visions WhatsApp Catalog into the existing Approved Send path
- #56 ✅ Bridge explicit agent service intent to one fail-closed WhatsApp catalog recommendation
- #57 ✅ Reconcile the stale production handoff after WhatsApp Catalog work
- #58 ✅ Bridge reviewable Agent output into the existing WhatsApp Shadow Approval queue
- #59 ✅ Record production Agent/Shadow Approval state and controlled pilot fixture
- #60 ✅ Fix real inbound WhatsApp lifecycle idempotency against the existing partial unique index
- #61 ✅ Add OWNER-only Controlled WhatsApp Agent Pilot action in `/approvals`
- #62 ✅ Route that pilot to the Growth OS production hostname instead of generic app URL configuration
- #63 ✅ Fix the actual HTTP 405 root cause by allowing `/api/ai/process-inbound` through the global Supabase session proxy while keeping the endpoint protected by `INTERNAL_API_KEY`

Do not recreate WhatsApp foundations, CRM, pricing, conversations, Cost Guard, provider state, agent framework or catalog storage as parallel systems.

## Existing Control Center is protected

The production panel remains the foundation: Dashboard, Leads/CRM, Hunters/Growth, Campaigns, Conversations, Hot Leads, Services, Pricing, Portfolio, Preview Studio, Markets, Agents, Message Studio, Automations, Approvals, Integrations, Cost & Usage, Audit, Suppression/DNC, System and Reports.

## Canonical runtime sources

- Emergency/runtime flags: `system_controls`
- Budget, quotas, provider allocations and cost thresholds: `cost_guard_settings`
- Market/channel policy: `market_settings.config` plus `outreach_policies`
- Agent model/confidence/runtime config: `agent_settings`
- Prices/discount boundaries: existing service price tables
- Provider health/state: `integration_connections`
- Usage/cost ledger: `usage_events`
- Audit trail: `audit_logs`

`system_controls.monthly_budget_usd` is legacy. The canonical budget remains `cost_guard_settings.monthly_total_budget_usd`.

## Current verified production runtime state

Queried directly from Growth OS Supabase after PR #63:

- `META / WHATSAPP`: enabled = `true`, status = `CONNECTED`, last_error = `null`
- Global kill switch = `false`
- WhatsApp AI pause = `false`
- Agents pause = `false`
- Shadow Mode = `true`
- Linked inbound WhatsApp rows in `outreach_messages`: `2`
- WhatsApp messages currently waiting in Approvals: `1`; it is the older non-catalog row
- Controlled pilot `agent_runs` rows: `0`
- The latest real linked inbound is durable and the failed 405 attempts did not reach the paid Agent endpoint, so one retry after PR #63 is idempotently safe

Provider `CONNECTED` is a verified production database fact, not an inference from credentials.

## Current safety posture

- Shadow Mode remains ON.
- Catalog support does not enable autonomous outbound.
- Human approval remains the only path from Agent recommendation to Approved Send.
- No product card can be attached merely because an internal caller claims the WhatsApp 24-hour window is open.
- `/api/ai/process-inbound` is exempt from browser-session proxy only because the route independently requires the server-only `INTERNAL_API_KEY` before any AI work.
- Other unrelated application/API routes remain behind the existing Supabase session proxy.
- `/api/outreach/approved-send` was not added to this bypass.
- Paid AI still uses caller idempotency + `agent_runs` claim/replay semantics and runtime safety controls.
- No provider call was reached by the failed 405 pilot attempts.

Do not turn Shadow Mode off just to make a readiness screen greener. Live autonomous outbound remains a separate explicit owner decision after controlled E2E proof.

## WhatsApp production continuation

### Existing verified code path

The production implementation includes:

- Meta webhook verification and signature validation
- durable webhook event/status persistence and idempotency
- linked Business/Lead/Conversation inbound lifecycle
- controlled production verification from Integrations
- deployed credential aliases (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) plus supported `META_*` aliases
- Agent pipeline recommendation of one allowlisted catalog item when service intent is unambiguous
- Agent `REVIEW` output → existing `queueShadowDraft` → `/approvals`
- Approved Send safety flow: APPROVED → PROCESSING → provider → SENT
- provider CONNECTED gate, runtime safety, DNC/human takeover, recipient-local window and Cost Guard checks
- no blind retry after provider acceptance
- WhatsApp 24-hour session/template policy enforcement
- OWNER-only Controlled WhatsApp Agent Pilot for one `INTERNAL_TEST` Business

### Production WhatsApp Catalog

Canonical catalog ID:

- `1773319100642340`

Canonical Content IDs:

- `SV-WEB-001` — Website Design & Development
- `SV-IG-CONTENT-001` — Instagram Content Creation
- `SV-WA-001` — WhatsApp Automation
- `SV-SEO-001` — SEO & GEO
- `SV-AI-AGENT-001` — AI Agents
- `SV-SM-001` — Social Media Management

Catalog product sends are only allowed through the existing approved-send path and only inside an open 24-hour customer-service window. Unknown Content IDs fail closed. Product sends are journaled as `PRODUCT_SENT` / `SEND_PRODUCT` with the Content ID for audit and reconciliation.

## Cost Guard

Canonical production budget remains:

- Total monthly: $25
- OpenAI: $10
- Google Places: $5
- Email: $4
- WhatsApp: $3
- Reserve: $3
- Warning / throttle / critical / hard-stop: 70 / 85 / 95 / 100%
- Daily new leads: 50
- Daily website audits: 15
- Daily deep AI runs: 10
- Max AI runs per lead: 20
- Max voice seconds: 180
- Max automatic retries: 1

Large increases require explicit owner confirmation and audit logging.

## Reliability boundaries

- Business persistence uses durable Google Place/domain dedupe.
- Paid Google Place Details claims/replays through `discovery_records`.
- Website audits use cache + daily quota + one-RUNNING guard.
- Paid inbound AI uses caller idempotency plus `agent_runs` replay/lock semantics.
- Preview generation uses stable `brief_hash` uniqueness.
- Voice transcription has failure recovery and a processing lease.
- Email webhook handling is replayable/idempotent.
- Approved Send claims before provider contact; provider acceptance is final for resend safety and later persistence failures are reconciliation-only.
- Global kill and Agent pause remain enforced at runtime boundaries.
- Catalog item selection is allowlisted and ambiguity fails closed.
- WhatsApp session-window evidence used by the Agent approval bridge comes from durable linked inbound rows, not request payload assertions.
- Global Supabase session proxy bypasses only exact routes that have their own independent webhook-signature or internal-key authentication.

## Exact next action

Do not disable Shadow Mode.

The next production gate is one retry of the **Controlled WhatsApp Agent Pilot** against the already-durable latest real inbound. This retry is safe because the prior HTTP 405 attempts created zero `agent_runs` rows and reached neither OpenAI nor Meta.

Proceed in this order:

1. OWNER reloads `/approvals` on `smartvisions.vercel.app` and clicks `Process latest inbound into Approval` exactly once;
2. verify Production creates exactly one `agent_runs` row for the stable inbound-derived request key;
3. verify exactly one Shadow Approval row is created and the unambiguous website request resolves to `SV-WEB-001` with the real 24-hour window evidence;
4. do not approve it until DB/runtime evidence is checked;
5. then owner approves the row and the existing Approved Send path is executed exactly once;
6. verify provider message ID, `PRODUCT_SENT`, `SEND_PRODUCT`, delivery/read webhook evidence and usage reconciliation;
7. keep Shadow Mode ON after the pilot.

Do not fabricate test rows, alter timestamps, broaden auth bypasses, or repeat paid/provider operations to make dashboards look green.
