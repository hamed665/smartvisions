# Smart Visions Growth OS — Final Production V1 Execution Lock

This file preserves the original four-feature-PR plan after PR #35 and records the emergency reliability PR that shifted GitHub numbering. The architectural rule never changed: extend existing primitives; do not create parallel subsystems.

## Non-negotiable architecture rule

Reuse the existing organization/RLS model, businesses/leads/campaigns, Growth Opportunity routing, conversations/messages, pricing, Cost Guard, runtime controls, integration state, agents, outreach, Preview Studio, portfolio, audit logs and Control Center.

Do not create a second CRM, lead model, conversation store, pricing system, Cost Guard, preview engine, provider-state system, queue, or agent framework unless an isolated production defect proves the existing primitive cannot be safely extended.

## Actual PR sequence

The original feature plan was four PRs. A reliability review after #37 required one emergency hardening PR, so GitHub numbering shifted:

1. **PR #36 — Growth Intelligence & Integrations — COMPLETE**
   - IDs-only discovery, durable business dedupe, selective qualification, deterministic evidence, growth routing, multi-market policy, cost planning and Google production verification.

2. **PR #37 — AI Sales, Conversations & Outreach — COMPLETE**
   - Existing agent stack, language/locale, pricing guard, conversations, Email/WhatsApp/Voice foundations, Shadow Approval and Approved Send.

3. **PR #38 — Emergency Reliability Hardening — COMPLETE**
   - Fixed the five real unresolved #37 reviews: WhatsApp phone matching, Voice recovery lease, Email webhook replay, Shadow Approval duplicate handling and post-provider Approved Send reconciliation. This was not a new feature subsystem.

4. **PR #39 — Website Demo & Content Production Engine — COMPLETE**
   - Existing Preview Studio/Portfolio/Growth Opportunity stack extended with eligibility, website/content proposals, versioning, portfolio matching, public preview lifecycle, cost linkage and concurrency-safe `brief_hash` idempotency.

5. **PR #40 — Control Center, Reliability, Final QA & Launch Gates — FINAL ACTIVE PR**
   - Completes panel wiring, launch readiness, health/cost analytics, auditability and remaining reliability boundaries. No visual redesign.

## Cost-first funnel

The production funnel remains:

`local/cache/dedupe → cheapest discovery identity → minimum qualification → deterministic evidence → selective AI → proposal-level preview/content → controlled provider action`

Rules:

- Reuse durable evidence before any provider call.
- Google discovery starts with IDs-only.
- Review text is not fetched for routine hunting.
- Website evidence is cached and deterministic before expensive analysis.
- AI runs only when deterministic routing is insufficient or a customer-facing artifact is needed.
- Heavy image/video generation requires explicit interest/approval/value gate.
- Paid boundaries must be represented in usage/cost evidence.

## Canonical idempotency boundaries

- Business identity: unique organization + Google Place/domain guards.
- Paid Place Details API endpoint: existing `discovery_records` journal prevents blind repeat calls.
- Website audits: TTL cache + daily quota + one RUNNING audit per business.
- Voice: one media transcription cache with failed/stale-processing recovery policy.
- Inbound AI processing: caller idempotency key + `agent_runs` claim/replay journal; PROCESSING/FAILED requests do not blindly rerun paid AI.
- Preview: unique organization + lead + stable `brief_hash`.
- Email/WhatsApp outbound: pre-provider claim; provider acceptance cannot later become a resendable FAILED state.

## PR #40 required exit gate

PR #40 may merge only when all of the following are true:

1. Existing Control Center surfaces expose the meaningful runtime controls without a second settings system.
2. Cost Guard is the single canonical budget source and usage analytics show provider/operation/day/outcome attribution.
3. Provider health distinguishes credential presence, READY and production-verified CONNECTED.
4. Global kill / Agent pause / channel pause / DNC / human takeover / approval boundaries remain fail-closed.
5. Discovery, audit, AI, preview and outbound idempotency boundaries are proven by code/tests/schema evidence.
6. Supabase Security/Performance Advisors show no new blocking regression.
7. GitHub install/lint/typecheck/tests/build are green on the final head.
8. Vercel Preview is READY on the exact final head.
9. Review threads are resolved or absent.
10. Production deploy of the merge commit is READY.
11. Production queues/state show no uncontrolled outbound or stuck work.

## Live-autonomous launch is a separate explicit decision

A code-complete Production V1 is not automatically permission to send real cold outreach.

Email and WhatsApp remain fail-closed until real sender credentials/domain/webhooks are configured and one controlled E2E per live channel succeeds. Shadow Mode stays ON until that evidence exists and the owner explicitly approves the automation level.

Crawl4AI is optional for V1 correctness because deterministic website auditing already exists. Redis remains optional unless a concrete asynchronous reliability requirement appears.

## Explicit exclusions

- No autonomous Instagram cold-DM system that violates platform policy.
- No uncontrolled marketplace auto-apply.
- No broad scraping when official/public sources suffice.
- No all-agent run for every message.
- No forced Redis/queue architecture for synchronous flows.
- No repeated paid smoke tests merely to refresh dashboard status.
- No fabricated business weaknesses or manipulated proof.

## Change-control rule

After #40, do not open another feature PR because a checklist looks aesthetically incomplete. New work must correspond to a real production defect, a provider configuration task, or measured pilot evidence.
