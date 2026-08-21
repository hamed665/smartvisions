# Smart Visions Growth OS — Final 4-PR Production V1 Plan

This document is the execution lock for Production V1 after PR #35. Its purpose is to prevent duplicate work, parallel subsystems, unnecessary API spend, and roadmap drift across chats or engineers.

## Non-negotiable rule

Before implementing anything in PR #36–#39, inspect the current repository primitive first. Extend existing tables, services, agents, routes and controls. Do **not** create a second CRM, second lead model, second conversation model, second pricing system, second Cost Guard, second preview engine, or second integration-state system.

A feature that already exists is not rebuilt. It is only hardened, connected, production-verified, or completed where a specific gap remains.

## Existing foundations that MUST be reused

The following already exist in the repository and are considered foundations, not tasks to recreate:

- Organization-scoped Supabase Auth/RLS and OWNER controls.
- Existing `businesses`, `leads`, `lead_sources`, `campaigns`, `discovery_records`, `intent_opportunities`, `website_audits`, `growth_opportunities`, conversations/messages and audit logs.
- Services, market pricing, discounts, market settings and runtime controls.
- Cost Guard, provider allocations, usage metering, warning/throttle/critical/hard-stop modes and OpenAI model routing.
- Integration connections/status model and secure environment-secret pattern.
- Google Places IDs-only discovery, dedupe, selective Enterprise qualification, Google Business Intelligence, cache, provenance and controlled batch qualification.
- Deterministic website-audit foundation, SSRF protections, timeout/body limits and cache.
- Growth Opportunity routing: website, Muscat local content, Oman remote AI content, international AI content.
- Existing multi-agent contracts/executor/router/pipeline/OpenAI runtime. Extend it; do not build another agent framework.
- Existing outreach primitives: eligibility, locale, scheduling, follow-ups, variants, pricing, replies and mailbox-health modules.
- Existing conversation intelligence and human-handoff primitives.
- Existing WhatsApp provider/send foundations. Complete Meta production behavior instead of adding a parallel WhatsApp stack.
- Existing preview engine/templates/quality model and preview API. Extend this into the production demo/content engine.
- Existing portfolio primitives.
- Existing Control Center, Cost & Usage, Integrations, Agents, Campaigns, Conversations, Approvals and reporting surfaces.
- Existing security, audit and reliability controls.

## API-spend architecture

All remaining work follows a staged funnel. A later stage may run only when the earlier stage proves value.

### Stage 0 — local/database only — $0 provider spend

Reuse cache, dedupe, suppression, prior audit, prior transcript, prior social evidence, prior business identity and prior agent results before any external call.

### Stage 1 — discovery identity

Use the cheapest official discovery method. For Google Places, keep Text Search IDs Only. Deduplicate Place IDs before details calls.

### Stage 2 — minimum qualification

Request only data required to determine whether the business is operational, where it is, whether it has a standalone website and how it can be contacted. Do not fetch review text here. Reuse same-tier fields only when they do not move the request into a more expensive SKU.

### Stage 3 — deterministic enrichment

Use official website/public-source crawling only for candidates that can change a sales decision. Cache by source/domain. Rule-based analysis before LLM. No repeated crawling inside TTL unless explicitly forced.

### Stage 4 — social/content evidence

Do not buy or scrape social data for every discovered business. First use already-known official/social links and permitted deterministic evidence. Only candidates whose content opportunity can materially change routing enter a controlled social check. Social quality must remain `UNKNOWN/PENDING` when evidence is unavailable rather than fabricated.

### Stage 5 — AI reasoning

Use OpenAI only when deterministic routing is insufficient or a customer-facing artifact is actually needed. Cheap/simple model path first. Specialist agents are conditional, not all-run-by-default. Cache stable business facts and rolling conversation summaries.

### Stage 6 — preview/content generation

No expensive demo/media generation for cold low-score leads. Generate proposal-level concepts first. Full personalized demo/content only after configured score/stage/interest gates.

## Cache/idempotency defaults

- Business identity / Google qualification: reuse durable record; normal recheck no sooner than configured TTL.
- Website audit: 30-day default, editable.
- Social/digital-presence evidence: configurable TTL; default should be long enough to avoid repetitive checking.
- Voice transcript: transcribe once per media identity/hash.
- AI stable-business analysis: keyed by evidence/version; rerun only when inputs materially change.
- Preview/demo: keyed by lead + brief/version; do not regenerate identical output.
- Outbound: idempotency key required; no duplicate send after retry.
- Automatic retry ceiling: existing configured value, currently 1 by default.

---

# PR #36 — Complete Growth Intelligence & Integrations

## Goal

Finish acquisition, digital-presence intelligence and provider-readiness using current Hunter/Growth primitives. This PR does **not** rebuild sales agents, outreach, preview generation or the Control Center.

## Reuse

- `businesses`, `leads`, `discovery_records`, `website_audits`, `growth_opportunities`.
- Existing Google Places clients/Cost Guard.
- Existing deterministic audit code.
- Existing Integrations page/status model.
- Existing Campaigns/Hunters UI.

## Required completion work

1. Bring cached-growth backfill and current classification rules into the normal production flow.
2. Make Growth Router the canonical acquisition output, while keeping website-only Leads compatible with the existing CRM.
3. Finalize multi-market routing for Oman, UAE, Saudi, Qatar, UK and USA without duplicating market settings.
4. Finalize deterministic digital-presence evidence model using existing website/social fields and only add schema where evidence/history truly needs persistence.
5. Crawl only when an official standalone website exists and the result can affect the offer. No audit for no-website leads.
6. Add controlled social-presence check queue/status for content opportunities. No false claims about Instagram quality without evidence.
7. Detect first-party website vs directory/booking/social/contact-only URL correctly.
8. Normalize contact readiness: phone, international phone, WhatsApp candidate, Maps, official website, known social URLs.
9. Keep derived `wa.me` links local and free; do not claim WhatsApp account verification unless actually verified.
10. Finalize provider health/smoke-test framework for Google Places and Crawl4AI using the existing `integration_connections` model.
11. If Redis is not required for V1 correctness, do not force it into the architecture. Retain it only if a concrete queue/reliability need remains.
12. Add dry-run / expected-cost view before paid acquisition batches where useful.
13. Enforce per-market and provider quotas from existing Cost Guard settings.
14. Update Hunters/Growth dashboard so operator sees: route, reason, contact path, evidence freshness, next cheapest useful action and whether that action can spend money.
15. Backfill current cached businesses without provider calls and verify no extra `usage_events` are created.

## PR #36 exit test

A small controlled batch must demonstrate:

`IDs-only discovery → cached/dedup check → minimum qualification → Growth routing → optional deterministic website evidence → contact-ready opportunity`

with no review-text fetch, no unnecessary LLM, no outreach and no repeated paid call for cached identities.

---

# PR #37 — Complete AI Sales, Conversations & Outreach

## Goal

Complete the existing AI/outreach/conversation stack end to end. Do not create a new agent framework or new conversation store.

## Reuse

- `lib/agents/*`, OpenAI runtime/model routing.
- Existing conversations/messages/stages and Persian operator brief model.
- Existing outreach eligibility, locale, scheduler, follow-ups, variants, pricing, replies and mailbox health.
- Existing approvals/handoff/DNC/suppression/runtime kill switches.
- Existing WhatsApp provider/send foundation.

## Required completion work

1. Finalize deterministic offer selection from `growth_opportunities` + configured services/prices.
2. Conditional specialist-agent routing: psychology/intent, business analysis, culture/locale, marketing/sales, final secretary. Simple cases use a single cheap path.
3. Language/dialect detection with confidence and Gulf-neutral fallback. Preserve original plus Persian operator view.
4. Finalize locale profiles for Oman/UAE/Saudi/Qatar/UK/USA using existing locale primitives.
5. Complete pricing/floor/discount/approval enforcement so LLM cannot invent commercial terms.
6. Complete action executor for `AUTO_SEND`, `REVIEW`, `HANDOFF` with human hard-lock.
7. Finish reply classification, stage transition and immediate follow-up cancellation on reply/DNC/human/won/lost.
8. Enforce 09:00–19:00 recipient-local windows from market settings, contact-frequency caps and channel quotas.
9. Email provider: connect one production-capable provider through existing outreach/message model, with bounce/complaint/unsubscribe/reply correlation and usage tracking.
10. WhatsApp Cloud API: complete webhook verification/signature validation, idempotent inbound/status ingest, policy/window/template rules, outbound guard and conversation routing.
11. Voice: transcribe each media item once, cache transcript, enforce duration limit, preserve original, Persian brief and confidence. Do not transcribe low-value duplicate media.
12. Instagram/project marketplaces remain policy-aware/semi-manual where automation is restricted. Do not build abusive auto-DM/auto-apply.
13. Keep autonomous outbound in Shadow Mode until PR #39 launch gate passes.

## PR #37 exit test

Controlled internal/test contact:

`qualified opportunity → configured offer → localized draft → policy gate → approved/internal send → inbound reply → language/intent analysis → Persian operator brief → follow-up stop → next response/handoff`

with price, DNC, local-time, Cost Guard and idempotency proven.

---

# PR #38 — Complete Website & Content Production Engine

## Goal

Turn qualified opportunities into convincing, low-waste sales assets using the existing preview/portfolio stack.

## Reuse

- Existing preview engine, templates, quality checks and preview API.
- Existing portfolio models.
- Existing growth routing/offer selection.
- Existing OpenAI/Cost Guard.

## Required completion work

1. Add generation eligibility gate based on lead stage, opportunity score and configurable threshold.
2. Website opportunity: build personalized bilingual/market-appropriate concept using business facts and lawful assets/evidence.
3. Stable preview URL/versioning/expiration/cleanup; no duplicate regeneration for unchanged brief.
4. Muscat Local Content opportunity: filming brief, shot list, reel concepts, scripts, photography plan and package proposal.
5. Oman Remote / International opportunity: AI-content brief, AI reel concepts, visual concepts, spokesperson/voiceover options, captions and creative pack.
6. Proposal-level content first. Heavy image/video generation only after configured approval/interest/value gate.
7. Portfolio matching based on industry/service/market instead of generic sample dumping.
8. Track asset generation cost and lead linkage.
9. Owner review/edit when configured; automatic sharing only when outreach policy allows.
10. Never fabricate defects in an existing business or manipulate screenshots to make them look worse.
11. Track preview/content asset sent → opened/engaged where technically available → replied → won/lost.

## PR #38 exit test

One website lead and one content lead each receive a correct, versioned proposal/preview path with cost recorded and no redundant regeneration.

---

# PR #39 — Complete Control Center, Reliability & Production Launch

## Goal

Close all remaining operational gaps, prove full E2E behavior and make every meaningful runtime/business control manageable without code changes.

## Reuse

- Existing Control Center, Cost Guard, Integration Health, audit logs, runtime controls, reports and security primitives.

## Required completion work

1. Finish editable provider, market, channel, model, lead, audit, voice, content-generation and outreach caps using existing settings where possible.
2. Remove remaining hardcoded operational thresholds that should be panel-controlled.
3. Complete health view: provider state, last success/failure, latency/error, budget mode and critical banner.
4. Finish usage analytics by provider/day/operation/lead/campaign plus cost per qualified/contacted/replied/won lead.
5. Add anomaly warnings for spend spikes and unusual cost per lead.
6. Complete visible retry/DLQ/error records only where actual asynchronous jobs require them. Do not invent queue infrastructure for synchronous flows.
7. Confirm idempotency boundaries across discovery, audit, AI, preview and outbound.
8. Confirm suppression/DNC, human takeover, local-time windows, channel pause and global kill switch under simulated failures.
9. Run security/performance advisors after final schema/RLS changes.
10. Complete production provider smoke tests one time each; do not spam paid tests.
11. Execute Shadow Mode E2E with a controlled test lead.
12. Only after the launch checklist passes, enable explicitly approved production automation levels.
13. Update `AGENTS.md`, `CURRENT_STATE.md`, `MASTER_PLAN.md` and execution handoff with exact Production V1 state.

## Final Production V1 acceptance path

`discover → qualify → route service opportunity → evidence → select offer → localized message → policy/cost gate → send/internal pilot → reply ingest → multilingual intelligence → follow-up or handoff → preview/content asset → quote/close → won/lost → reporting`

Every paid boundary must be visible in usage records and every meaningful operator/system action must be auditable.

---

# Explicit exclusions from the four PRs

These are not excuses for missing V1 functionality; they are protections against scope waste:

- No duplicate CRM or lead/conversation store.
- No autonomous Instagram cold-DM bot if platform policy does not safely allow it.
- No uncontrolled marketplace auto-apply.
- No broad web scraping when an official API/public source is available.
- No expensive all-agent run on every message.
- No review-text fetching during basic business hunting.
- No automatic heavy AI media generation for every cold prospect.
- No forced Redis/queue architecture without an actual reliability requirement.
- No provider marked `CONNECTED` until an E2E smoke test has succeeded.

# Change-control rule

If a missing item is discovered while implementing #36–#39, first map it to an existing primitive and one of the four PR scopes. Fix it inside that PR. Do not create a fifth feature PR unless production is blocked by an isolated emergency fix that cannot safely wait.
