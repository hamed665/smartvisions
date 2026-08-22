# Smart Visions Growth OS — Current Production State

**Last reconciled:** 2026-08-22 (Oman, UTC+4)

This file is the operational handoff. Production facts win over stale documentation. Before adding work, read this file, `AGENTS.md`, `docs/V1_FINAL_4_PR_PLAN.md`, `docs/INTEGRATION_INVENTORY.md`, `docs/MASTER_PLAN.md` and Master Tracker #18.

## Production

- Repository: `hamed665/smartvisions`
- Production branch: `main`
- Production URL: `https://smartvisions.vercel.app`
- Supabase project ref: `pkypexzpyfbikdnkrzvw`
- Current `main` commit: `cd66a18bd4353819f01f242a58e4348f1592ba72` — merged PR #36.
- Current development PR: #37 `phase5/pr37-complete-ai-sales-outreach`.
- PR #36 is complete and must not be reopened as a new acquisition subsystem.
- Growth migration `0028_zero_cost_personalization.sql` and its production index fix were applied during PR #36 production verification.

## Existing Control Center is protected

The current panel is a foundation, not a redesign target. Existing modules must be preserved and extended only where a verified gap exists: Dashboard, CRM/Leads, Hunters/Growth, Campaigns, Conversations, Hot Leads, Services, Pricing, Portfolio, Preview Studio, Markets, Agents, Message Studio, Automations, Approvals, Integrations, Cost & Usage, Audit, DNC/Suppression, System and Reports.

Pricing is already live and owner-editable per service/market with `price`, `minimum_price`, `max_auto_discount_pct`, and `max_discount_with_approval_pct`. Sales logic must consume this source of truth; do not build a second pricing or discount system.

## Production-verified foundations

### Platform / security / controls

- Supabase Auth, organization-scoped RLS and OWNER controls are live.
- Services, Pricing, Markets, Agents, approval settings and runtime controls are live foundations.
- Cost Guard/provider allocations/usage metering are live.
- Production `system_controls` currently has global kill switch OFF and Shadow Mode ON; Shadow Mode stays ON through V1 launch gates.

### OpenAI

- OpenAI has successful production usage evidence (`AGENT_INTENT_DISCOVERY`, 394-token historical smoke test, recorded cost $0.000575).
- Cost-aware model routing exists and must be reused.
- Current `integration_connections` OpenAI row is stale (`NOT_CONFIGURED`) despite successful production evidence. Treat this as status reconciliation, not a reason to rebuild or repeatedly pay for smoke tests.

### Google Places / Growth acquisition — PR #36 COMPLETE

- Google Places is `CONNECTED` in production.
- IDs-only discovery, durable dedupe, selective minimum qualification and usage metering are implemented.
- Routine hunting avoids review text; deeper Google Business Intelligence is separate/cached.
- Multi-market query/routing uses existing market settings.
- Business fingerprinting, Contactability/Need/Service Fit/Revenue/Priority signals are deterministic and zero-provider-cost.
- Cheapest-next-action routing is implemented: contact-ready, deterministic website evidence, selective social check, or skip.
- Digital/social quality remains unknown/pending when evidence does not exist; the system does not fabricate social weakness.
- Deterministic website evidence is preferred before paid social checks and reuses the existing website-audit subsystem.
- Acquisition dry-run expected-cost planning exists.
- Controlled Crawl4AI smoke-test UI/path exists, but the service is not production configured/verified yet.
- Cached growth rerouting/backfill is idempotent and should create zero provider calls.

### Growth opportunity lanes

- `MUSCAT_LOCAL_GROWTH`: website + on-site filming/reels/photography/content where appropriate.
- `OMAN_REMOTE_GROWTH`: website + remote AI content/creative.
- `INTERNATIONAL_AI_GROWTH`: website + AI content/creative.
- Businesses with standalone websites remain eligible for content opportunity; website ownership is not the sole sales filter.

## Current canonical Integration Inventory

Read `docs/INTEGRATION_INVENTORY.md`. It freezes the 19 operational integration/configuration slots from Master Tracker #18 and distinguishes billed providers from credentials/config controls.

Current provider summary from production `integration_connections`:

- Google Places / Discovery: CONNECTED, enabled.
- Crawl4AI / Audit: NOT_CONFIGURED, disabled; code-ready smoke test exists.
- Email Provider / Email: NOT_CONFIGURED, disabled.
- Meta / WhatsApp: NOT_CONFIGURED, disabled; provider/webhook foundations exist.
- Meta / Instagram: NOT_CONFIGURED, disabled; keep policy-aware/semi-manual where required.
- OpenAI / AI: table status stale NOT_CONFIGURED, but production usage proves prior success.
- Redis / Queue: NOT_CONFIGURED, disabled and optional unless a concrete V1 reliability need proves otherwise.

## Existing modules that MUST be extended, not rebuilt

- `lib/agents/*` contracts/executor/router/pipeline/OpenAI runtime.
- `lib/outreach/*` eligibility/locale/scheduler/followups/variants/pricing/replies/mailbox health.
- Conversation intelligence, Persian operator briefs and human handoff/approval model.
- WhatsApp Meta Cloud provider, webhook signature verification and inbound normalization foundations.
- Preview engine/templates/quality/API and portfolio primitives.
- Cost Guard/runtime controls/usage/audit/reliability primitives.
- Integration connection/status model and server-only environment secret pattern.
- Existing Control Center pages and styling.

## PR #37 — current active completion scope

PR #37 is the single completion PR for AI Sales, Conversations, Email, WhatsApp and Voice. Work already present on its branch includes:

- zero-cost Growth Opportunity → Sales Context bridge;
- deterministic personalization context reuse;
- selective agent routing tiers (`ZERO_COST`, `LIGHT`, `FULL`) so simple messages do not trigger all agents;
- deterministic language/script detection and safe market fallback;
- commercial price/discount guard built around existing configured price sources;
- stronger follow-up stop conditions;
- WhatsApp 24-hour/free-form vs approved-template policy support on top of the existing Meta provider.

Before merge, PR #37 still must complete/verify the actual gaps from Master Tracker: conversation lifecycle wiring, Email production provider path, WhatsApp inbound/status persistence/idempotency, Voice single-transcription cache path, Shadow Mode sales queue/approval behavior, integration health/usage visibility, and controlled E2E tests.

## Remaining locked sequence

- PR #36 — COMPLETE and merged.
- PR #37 — ACTIVE: AI Sales + Conversations + Email + WhatsApp + Voice.
- PR #38 — Website Demo & Content Production Engine using existing Preview Studio/portfolio.
- PR #39 — Control Center wiring/completeness + reliability + QA + launch. Preserve visual design.

After #39, run the six launch gates from Master Tracker #18: provider smoke tests, Cost Guard proof, policy/safety proof, Shadow Mode E2E scenarios, small Oman pilot, then measured scale decision.

## Exact next action

Continue PR #37 only from real gaps. Do not touch PR #36 acquisition work unless a verified regression exists. Use `docs/INTEGRATION_INVENTORY.md` before connecting credentials or adding providers. Do not create duplicate pricing, Control Center, agent, conversation, WhatsApp, Cost Guard, preview or integration-state systems.

## Handoff sentence

> Production main is `cd66a18b...` from merged PR #36. PR #37 is active. Read the frozen Integration Inventory and Master Tracker #18 before coding. Acquisition/Growth Intelligence is complete enough to treat as a foundation; current gaps are Sales/Conversation provider wiring and E2E verification. Preserve the existing Control Center and consume its Services/Pricing/Markets/Agents/Cost/runtime settings as the source of truth.