# Smart Visions Growth OS — Current Production State

**Reconciled:** 2026-08-31 (Oman, UTC+4)

This is the operational handoff. Production facts and the current `main` branch win over older planning text. Preserve the existing Control Center and extend only verified gaps.

## Production identity

- Repository: `hamed665/smartvisions`
- Production branch: `main`
- Production URL: `https://smartvisions.vercel.app`
- Supabase project: `pkypexzpyfbikdnkrzvw`
- Current production main: `e07a5801298879133d36d66dcfde33d971ace5c3` (merged PR #56)
- Vercel deployment for that exact commit: `dpl_4fS8RbWTiTXJcDVECJJG2X33HLKR` — READY, target `production`, aliases include `smartvisions.vercel.app`

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

## Current safety defaults

- Global kill switch: OFF unless changed in production runtime state
- Shadow Mode: ON unless explicitly changed by owner after launch evidence
- Email pause: OFF unless changed in runtime state
- WhatsApp AI pause: OFF unless changed in runtime state
- Agents pause: OFF unless changed in runtime state
- Enabled outreach markets require manual review
- Catalog support does not enable autonomous outbound

Do not turn Shadow Mode off just to make a readiness screen greener. Live autonomous outbound still requires explicit owner launch approval after durable provider/policy evidence.

## WhatsApp production continuation

### Existing verified code path

The existing WhatsApp implementation now includes:

- Meta webhook verification and signature validation
- durable inbound/status persistence and idempotency
- controlled production verification from Integrations
- deployed credential aliases (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`) plus supported `META_*` aliases
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

## Provider-state accuracy rule

Do not infer `integration_connections.status='CONNECTED'` merely from credentials, successful builds, or catalog configuration. `CONNECTED` must still come from durable production E2E evidence. The old 2026-08-22 provider snapshot is no longer authoritative for WhatsApp because PRs #49–#54 materially changed that path; query production state before making a current provider-status claim.

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

## Exact next action

Wire the existing `catalogRecommendation` from the agent pipeline into the existing `queueShadowDraft` call site so that a reviewable WhatsApp draft can carry `catalog_content_id` into `/approvals` without any automatic send. Preserve these gates:

1. only one unambiguous allowlisted catalog item;
2. Shadow Mode / human approval remains in force;
3. product send is possible only when the WhatsApp 24-hour customer-service window is open;
4. outside that window the normal template/text policy remains authoritative;
5. no duplicate conversation/catalog/send subsystem;
6. no provider call is made merely because the agent recommended a product.

After that bridge is implemented, validate CI, Vercel review/preview, merge with expected head SHA, verify the exact production deployment, then perform only a controlled end-to-end approval test using real production evidence. Do not disable Shadow Mode as part of this step.
