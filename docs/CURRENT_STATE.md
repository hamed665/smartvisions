# Smart Visions Growth OS — Current Production State

**Reconciled:** 2026-08-22 (Oman, UTC+4)

This is the operational handoff. Production facts and the current `main` branch win over stale planning text. Preserve the existing Control Center and extend only verified gaps.

## Production identity

- Repository: `hamed665/smartvisions`
- Production branch: `main`
- Production URL: `https://smartvisions.vercel.app`
- Supabase project: `pkypexzpyfbikdnkrzvw`
- Production `main` entering the final PR: `d392fc98a1c9ec38d2b725bbe57e61b92cb2ff49` (merged PR #39)
- Final development PR: #40 `phase5/pr40-control-center-launch-readiness`

## Completed sequence

- #36 ✅ Growth Intelligence / acquisition and growth-opportunity routing
- #37 ✅ AI Sales / Conversations / Email / WhatsApp / Voice foundation
- #38 ✅ Reliability hardening for the five PR #37 review failures
- #39 ✅ Website Demo & Content Production Engine on existing Preview Studio / Portfolio / Growth Opportunity foundations
- #40 🔄 Final Control Center completeness, reliability, QA and launch gates

The emergency #38 shifted the original four-PR numbering by one. Do not create another Hunter, CRM, pricing, preview, Cost Guard, provider-state or agent subsystem to restore old numbering.

## Existing Control Center is protected

The current panel is the production foundation: Dashboard, Leads/CRM, Hunters/Growth, Campaigns, Conversations, Hot Leads, Services, Pricing, Portfolio, Preview Studio, Markets, Agents, Message Studio, Automations, Approvals, Integrations, Cost & Usage, Audit, Suppression/DNC, System and Reports.

PR #40 preserves the visual design and completes wiring only where a verified gap exists.

## Canonical runtime sources

- Emergency/runtime flags: `system_controls`
- Budget, quotas, provider allocations and cost thresholds: `cost_guard_settings`
- Market/channel policy: `market_settings.config` plus `outreach_policies`
- Agent model/confidence/runtime config: `agent_settings`
- Prices/discount boundaries: existing service price tables
- Provider health/state: `integration_connections`
- Usage/cost ledger: `usage_events`
- Audit trail: `audit_logs`

`system_controls.monthly_budget_usd` is a legacy duplicate and is no longer written or presented as the operational budget. The canonical monthly budget is `cost_guard_settings.monthly_total_budget_usd`, currently USD 25.

## Current production safety state

- Global kill switch: OFF
- Shadow Mode: ON
- Email pause: OFF
- WhatsApp AI pause: OFF
- Agents pause: OFF
- Enabled outreach markets require manual review
- Live outbound remains fail-closed because Email and WhatsApp are not production verified

Do not turn Shadow Mode off merely to make the dashboard greener. Live-autonomous readiness requires verified Email + WhatsApp provider setup and an explicit launch decision.

## Provider state

- Google Places / Discovery: CONNECTED + enabled
- OpenAI / AI: CONNECTED + enabled
- Crawl4AI / Audit: NOT_CONFIGURED + disabled; code-ready controlled verification path exists
- Email Provider / Email: NOT_CONFIGURED + disabled
- Meta / WhatsApp: NOT_CONFIGURED + disabled
- Meta / Instagram: NOT_CONFIGURED + disabled
- Redis / Queue: optional, NOT_CONFIGURED + disabled

Google/OpenAI already have durable production evidence. Do not repeat paid smoke tests simply to refresh a badge.

## Cost Guard

Canonical production budget:

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

PR #40 exposes provider/operation/day/campaign spend, cost per qualified/replied/won lead and budget-derived anomaly warnings without creating a second ledger.

## Reliability boundaries completed through #40

- Business persistence uses durable Google Place/domain dedupe.
- Paid Google Place Details claims/replays through existing `discovery_records`; PROCESSING/FAILED attempts are not blindly retried.
- Website audits use cache + daily quota and a unique one-RUNNING-per-business guard.
- Paid inbound AI requires a caller idempotency key and journals through `agent_runs`; completed results replay, PROCESSING/FAILED requests do not blindly rerun paid AI.
- Preview generation uses stable `brief_hash` plus a unique organization/lead/brief guard.
- Voice transcription has failure recovery and a processing lease.
- Email webhook handling is replayable/idempotent.
- Approved Send claims APPROVED → PROCESSING before Provider contact; after provider acceptance, later persistence failures are reconciliation-only and cannot turn the message into a resendable FAILED state.
- Runtime global kill is enforced before controlled provider operations; Agent pause is enforced before AI execution.

Production migrations added for these final reliability boundaries:

- `0032_preview_generation_idempotency`
- `0033_agent_run_idempotency`
- `0034_website_audit_running_guard`

## Production queue/state evidence before final #40 merge

At the final QA audit:

- `agent_runs`: no stuck rows
- `voice_transcriptions`: no stuck rows
- `email_events`: 0
- `conversation_messages`: no pending/sent rows
- `outreach_messages`: no pending/sent rows
- `previews`: no stuck rows
- `website_audits`: one historical FAILED deterministic audit from 2026-08-21 (`wassandental.com`), not a running job

No uncontrolled outbound is evidenced. Preserve the historical failed audit row as audit history; do not delete evidence for cosmetic cleanliness.

## Advisor state

- Supabase Security Advisor: no new schema/RLS regression from #40. One existing project-level warning remains: Leaked Password Protection is disabled in Supabase Auth.
- Supabase Performance Advisor: no new blocking issue; current notices are INFO-level unused indexes expected in a very low-traffic/new database.

## Final #40 launch distinction

`codeReady` / controlled-pilot readiness and `liveAutomationReady` are intentionally different states.

The system may be code-ready while Shadow Mode remains ON and Email/WhatsApp remain fail-closed. Live autonomous outbound must not be declared ready until the real sender credentials/domain/webhooks are configured, provider rows are production-verified CONNECTED, one controlled E2E per live channel passes, and Shadow Mode is then intentionally disabled.

## Exact next action

Finish PR #40 CI/Vercel/review-thread checks and merge only if the final head is fully green. After merge, verify the exact merge commit is READY in Vercel Production and rerun the production launch evidence query. Do not start another feature PR unless final verification exposes a real defect.
