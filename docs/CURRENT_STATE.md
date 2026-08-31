# Smart Visions Growth OS — Current Production State

**Reconciled:** 2026-08-31 (Oman, UTC+4)

This is the operational handoff. Production facts and current `main` win over older planning text. Preserve the existing Control Center and extend only verified gaps.

## Production identity

- Repository: `hamed665/smartvisions`
- Production branch: `main`
- Production URL: `https://smartvisions.vercel.app`
- Supabase project: `pkypexzpyfbikdnkrzvw`
- Current production main: `a43fc27a68ffb1ecff85833517c5ac2350b9f826` — merged PR #67
- Vercel production deployment for that exact commit: `dpl_9acb7C33gGKfBHhdAEMSAbzJbSt8` — READY, target `production`, alias `smartvisions.vercel.app`, no alias error

## Completed implementation / hardening sequence

- #36 ✅ Growth Intelligence / acquisition and growth-opportunity routing
- #37 ✅ AI Sales / Conversations / Email / WhatsApp / Voice foundation
- #38 ✅ Reliability hardening for the five PR #37 review failures
- #39 ✅ Website Demo & Content Production Engine
- #40 ✅ Control Center completeness / reliability / launch gates
- #49–#54 ✅ WhatsApp production webhook, verification, environment-name and least-privilege hardening
- #55 ✅ Live Smart Visions WhatsApp Catalog wired into canonical Approved Send
- #56 ✅ Deterministic Agent service intent → allowlisted Catalog recommendation
- #57 ✅ Catalog-era handoff reconciliation
- #58 ✅ Agent REVIEW → existing Shadow Approval bridge with durable 24-hour evidence
- #59 ✅ Pilot-state reconciliation
- #60 ✅ WhatsApp inbound lifecycle idempotency fix for partial unique-index conflict handling
- #61 ✅ Owner-only Controlled WhatsApp Agent Pilot surface
- #62 ✅ Pilot routing hardening attempt; superseded by later root-cause fixes
- #63 ✅ Internal AI route session-proxy boundary fixed; request now reaches `/api/ai/process-inbound`
- #64 ⛔ Closed without merge because its documentation became stale after new production evidence
- #65 ✅ WhatsApp pilot idempotency uses durable internal inbound UUID rather than raw Meta message ID
- #66 ✅ Least-required service-role grants restored for Agent → Shadow Approval runtime
- #67 ✅ Owner-controlled Catalog send gate through canonical Approved Send while global Shadow Mode remains ON

Do not recreate WhatsApp foundations, CRM, pricing, conversations, Cost Guard, provider state, agent framework, preview engine or catalog storage as parallel systems.

## Existing Control Center is protected

The current production panel remains the foundation: Dashboard, Leads/CRM, Hunters/Growth, Campaigns, Conversations, Hot Leads, Services, Pricing, Portfolio, Preview Studio, Markets, Agents, Message Studio, Automations, Approvals, Integrations, Cost & Usage, Audit, Suppression/DNC, System and Reports.

No redesign or replacement subsystem is justified by the current production state.

## Canonical runtime sources

- Emergency/runtime flags: `system_controls`
- Budget, quotas, provider allocations and thresholds: `cost_guard_settings`
- Market/channel policy: `market_settings.config` plus `outreach_policies`
- Agent runtime/model/confidence settings: `agent_settings`
- Pricing: existing service price tables
- Provider health/state: `integration_connections`
- Usage/cost ledger: `usage_events`
- Audit trail: `audit_logs`

`system_controls.monthly_budget_usd` remains legacy. The canonical budget is `cost_guard_settings.monthly_total_budget_usd`.

## Current verified production runtime state

Queried directly from Growth OS Supabase on 2026-08-31 after the controlled pilots:

- `GOOGLE_PLACES / DISCOVERY`: CONNECTED, enabled
- `OPENAI / AI`: CONNECTED, enabled
- `META / WHATSAPP`: CONNECTED, enabled
- `EMAIL_PROVIDER / EMAIL`: CONNECTED, enabled after reconciliation from existing durable Resend delivery evidence
- `CRAWL4AI / AUDIT`: NOT_CONFIGURED, disabled; optional for V1 because deterministic audit exists
- `META / INSTAGRAM`: NOT_CONFIGURED, disabled; restricted automation remains intentionally deferred/policy-aware
- `REDIS / QUEUE`: NOT_CONFIGURED, disabled; optional until measured queue/recovery load justifies it
- Global kill switch: OFF
- Email pause: OFF
- WhatsApp AI pause: OFF
- Agents pause: OFF
- Shadow Mode: ON

## WhatsApp controlled E2E — PRODUCTION VERIFIED

The WhatsApp controlled Catalog path is now proven with real production evidence, not inferred readiness.

Real customer/test inbound:

`Can you show me your website service?`

Verified path:

`real linked WhatsApp inbound → /api/ai/process-inbound → exactly one Agent run → deterministic Catalog recommendation → exactly one Shadow Approval → owner approval → controlled canonical Approved Send → Meta product message → SENT → DELIVERED → READ`

Evidence:

- Recommended/approved Catalog Content ID: `SV-WEB-001` — Website Design & Development
- `conversation_messages` final status: `SENT`
- Real Meta provider message ID: `wamid.HBgLOTY4Nzc1MTEwNTMVAgARGBIxOThBNjM4MURFQzYwM0RGNzUA`
- `whatsapp_events`: `PRODUCT_SENT` with `catalog_content_id = SV-WEB-001`
- Provider status webhooks persisted: `SENT`, `DELIVERED`, `READ`
- `usage_events`: exactly one `WHATSAPP / SEND_PRODUCT`, one unit, Content ID persisted
- Duplicate/idempotency verification: one logical message row and one provider message identity for the controlled send
- Global Shadow Mode remained ON before, during and after the pilot

PR #67 did not create a parallel sender. Its owner-only exception verifies durable INTERNAL_TEST evidence and then reuses the existing Approved Send / MetaCloudWhatsAppProvider path. Kill/pause, DNC, human takeover, provider CONNECTED, local send window, WhatsApp 24-hour policy, Cost Guard, claim/idempotency and no-blind-retry semantics remain active.

### Production WhatsApp Catalog

Canonical Catalog ID:

- `1773319100642340`

Canonical Content IDs:

- `SV-WEB-001` — Website Design & Development
- `SV-IG-CONTENT-001` — Instagram Content Creation
- `SV-WA-001` — WhatsApp Automation
- `SV-SEO-001` — SEO & GEO
- `SV-AI-AGENT-001` — AI Agents
- `SV-SM-001` — Social Media Management

No further paid WhatsApp smoke test is required merely to refresh a badge. New WhatsApp tests must correspond to a new unproven behavior.

## Email provider — CONNECTED from existing durable evidence

The existing Email Provider implementation is Resend and already has a real production send + signed webhook delivery trail.

Verified durable evidence from 2026-08-23:

- Mailbox: `hello@smartvisionsai.com`
- Provider: `RESEND`
- Controlled verification provider message ID: `a180f18d-0a5f-4bee-9687-5c962bf0610e`
- Signed webhook event persisted: `email.sent`
- Signed webhook event persisted: `email.delivered`
- The same provider message ID appears in the controlled verification audit and both provider lifecycle events

On 2026-08-31 Production was reconciled from that durable evidence with **zero new provider calls**:

- `EMAIL_PROVIDER / EMAIL` → CONNECTED + enabled
- mailbox health → `HEALTHY`
- audit action → `EMAIL_PROVIDER_RECONCILED_FROM_DURABLE_DELIVERY`
- audit records `providerCalls = 0` and the exact prior delivery evidence

This follows the cost-first rule: do not spend again merely because an integration row was stale.

The Email provider connection is production-verified for outbound delivery and signed delivery-webhook ingestion. The **sales-lifecycle inbound reply E2E is still unproven**. Existing code supports `email.received`, provider-content retrieval, exact email-to-Business/Lead matching, EMAIL conversation creation/reuse, inbound `outreach_messages`, Lead → REPLIED and follow-up cancellation, but a real controlled inbound reply still needs to prove that path.

SPF/DKIM/DMARC were not independently re-audited during this reconciliation; do not claim a separate DNS audit from the delivery evidence alone.

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

Large budget/quota increases require explicit owner confirmation and audit logging.

## Reliability boundaries that remain canonical

- Business identity: existing Google Place/domain dedupe
- Paid Google Details: `discovery_records` claim/replay journal
- Website audit: cache + quota + unique RUNNING guard
- Inbound AI: `agent_runs.request_key/result_payload` claim/replay semantics
- Voice: media cache + FAILED recovery + stale PROCESSING lease
- Preview/content: stable `brief_hash` idempotency
- Email webhook: signed, replay-safe provider event persistence
- WhatsApp webhook: signed/durable/idempotent event and lifecycle persistence
- Approved outbound: pre-provider claim; provider acceptance is final for resend safety; later persistence failures are reconciliation-only
- Global kill / Agent pause / channel pause / DNC / human takeover remain hard gates

## Exact next action

Do **not** disable Shadow Mode and do **not** repeat the WhatsApp E2E.

The next real production gap is a controlled **Email inbound-reply E2E**:

1. use one real test sender that can be mapped to exactly one dedicated INTERNAL_TEST Business/Lead;
2. do not fabricate `email.received`, timestamps or message rows;
3. send/reply through the real provider flow once;
4. verify signed `email.received` webhook persistence;
5. verify Resend receiving-content retrieval;
6. verify exactly one inbound EMAIL `outreach_messages` row and one linked EMAIL conversation;
7. verify Lead becomes `REPLIED` and pending follow-ups are cancelled;
8. verify replay/idempotency does not duplicate the inbound lifecycle;
9. keep Shadow Mode ON.

After Email inbound-reply proof, continue with production verification rather than feature development:

- Voice transcription controlled production test using the existing OpenAI connection; no new API architecture
- Preview generate → share/send → public view E2E
- Crawl4AI only if its external service is actually configured and useful; one smallest controlled smoke test
- bounce/suppression/unsubscribe evidence only with the smallest safe controlled test needed
- full Shadow Mode scenarios: positive reply, no reply, objection, DNC, human takeover
- only then consider a tiny Oman pilot and a separate explicit automation-level decision

Instagram cold automation and Redis are not launch blockers. Project Hunter should only use permitted sources/APIs if activated later.
