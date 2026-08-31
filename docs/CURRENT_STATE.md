# Smart Visions Growth OS — Current Production State

**Reconciled:** 2026-08-31 (Oman, UTC+4)

This is the operational handoff. Production facts and the current `main` branch win over older planning text. Preserve the existing Control Center and extend only verified gaps.

## Production identity

- Repository: `hamed665/smartvisions`
- Production branch: `main`
- Production URL: `https://smartvisions.vercel.app`
- Supabase project: `pkypexzpyfbikdnkrzvw`
- Current production main: `732b52fe054a1df9320a668cb10ebcf670096156` (merged PR #58)
- Vercel deployment for that exact commit: `dpl_EjMba5mN48KwJgcM5VXVxLVPRTtK` — READY, target `production`, alias `smartvisions.vercel.app`, no alias error

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

Queried directly from Growth OS Supabase on 2026-08-31:

- `META / WHATSAPP`: enabled = `true`, status = `CONNECTED`, last_error = `null`
- Global kill switch = `false`
- WhatsApp AI pause = `false`
- Agents pause = `false`
- Shadow Mode = `true`
- Linked inbound WhatsApp rows in `outreach_messages`: `0`
- WhatsApp messages currently waiting in Approvals: `1`; that legacy row has no catalog Content ID

Provider `CONNECTED` is now a verified production database fact, not an inference from credentials. Keep the distinction: future status claims must still be queried from production state.

## Current safety posture

- Shadow Mode remains ON.
- Catalog support does not enable autonomous outbound.
- Human approval remains the only path from Agent recommendation to Approved Send.
- No product card can be attached merely because an internal caller claims the WhatsApp 24-hour window is open.
- PR #58 derives the latest customer inbound timestamp from durable linked `outreach_messages` and verifies the conversation belongs to the organization, is WhatsApp, is lead-linked, and matches `context.leadId` when supplied.
- A paid AI result is persisted as `COMPLETED` before Shadow Approval reconciliation. If the queue write fails, replay retries only the idempotent database queue operation and does not call the model again.

Do not turn Shadow Mode off just to make a readiness screen greener. Live autonomous outbound still requires explicit owner launch approval after production pilot evidence.

## WhatsApp production continuation

### Existing verified code path

The production implementation now includes:

- Meta webhook verification and signature validation
- durable webhook event/status persistence and idempotency
- controlled production verification from Integrations
- deployed credential aliases (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) plus supported `META_*` aliases
- Agent pipeline recommendation of one allowlisted catalog item when service intent is unambiguous
- Agent `REVIEW` output → existing `queueShadowDraft` → `/approvals`
- Approved Send safety flow: APPROVED → PROCESSING → provider → SENT
- provider CONNECTED gate, runtime safety, DNC/human takeover, recipient-local window and Cost Guard checks
- no blind retry after provider acceptance
- WhatsApp 24-hour session/template policy enforcement

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

PR #55 extends the existing Meta Cloud provider with single-product interactive messages. Catalog product sends are only allowed through the existing approved-send path and only inside an open 24-hour customer-service window. Unknown Content IDs fail closed. Product sends are journaled as `PRODUCT_SENT` / `SEND_PRODUCT` with the Content ID for audit and reconciliation.

PR #56 adds deterministic agent-to-catalog recommendation without adding provider calls. Existing Growth OS service IDs map to the corresponding catalog item, and explicit English/Arabic/Persian requests can resolve to one catalog item. Ambiguous multi-service requests and vague requests return no recommendation instead of guessing. A blocked agent reply cannot produce a catalog recommendation.

PR #58 completes the review bridge. `/api/ai/process-inbound` can accept an internal WhatsApp delivery context and queue a `REVIEW` result through the existing Shadow Approval primitive. Product Content ID is attached only if durable linked inbound evidence proves the freeform 24-hour window is open. Outside that window an approved template can still be queued without a product attachment; otherwise policy blocks creation of a dead approval row.

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

## Exact next action

Do not disable Shadow Mode. The next production gate is a **controlled linked-inbound → Agent → Approval → catalog send** pilot.

Current blocker: production currently has zero linked WhatsApp inbound rows in `outreach_messages`, so there is no durable lead-linked customer-service-window evidence for a safe catalog product send yet. The Meta integration itself is CONNECTED.

Proceed in this order:

1. confirm the intended test WhatsApp number is represented by exactly one existing Business/Lead in Growth OS so inbound phone matching can link deterministically;
2. receive one real inbound WhatsApp message from that number and verify webhook → `outreach_messages` + conversation linkage;
3. invoke the existing idempotent Agent processing path with that conversation delivery context; verify one Shadow Approval row is created and, for one unambiguous service request, contains the expected allowlisted `catalog_content_id`;
4. owner approves the row in `/approvals`;
5. execute existing `/api/outreach/approved-send` exactly once and verify provider message ID, `PRODUCT_SENT`, `SEND_PRODUCT`, conversation timestamps and usage ledger reconciliation;
6. verify delivery/read status webhook evidence;
7. keep Shadow Mode ON after the pilot. Autonomous launch is a separate explicit owner decision.

Do not fabricate test rows or alter production timestamps to manufacture a 24-hour window. The pilot must use a real inbound webhook event.
