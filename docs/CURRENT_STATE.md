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
- PR #37 production migrations for voice transcription cache, email provider events, and the follow-up voice FK indexes have now been applied.

## Existing Control Center is protected

The current panel is a foundation, not a redesign target. Existing modules must be preserved and extended only where a verified gap exists: Dashboard, CRM/Leads, Hunters/Growth, Campaigns, Conversations, Hot Leads, Services, Pricing, Portfolio, Preview Studio, Markets, Agents, Message Studio, Automations, Approvals, Integrations, Cost & Usage, Audit, DNC/Suppression, System and Reports.

Pricing is already live and owner-editable per service/market with `price`, `minimum_price`, `max_auto_discount_pct`, and `max_discount_with_approval_pct`. Sales logic must consume this source of truth; do not build a second pricing or discount system.

## Production-verified foundations

### Platform / security / controls

- Supabase Auth, organization-scoped RLS and OWNER controls are live.
- Services, Pricing, Markets, Agents, approval settings and runtime controls are live foundations.
- Cost Guard/provider allocations/usage metering are live.
- Production `system_controls` currently has global kill switch OFF and Shadow Mode ON; Shadow Mode stays ON through V1 launch gates.
- Security Advisor has no new PR #37 schema/RLS regression. The remaining leaked-password-protection warning is a Supabase Auth project setting and is not caused by PR #37.

### OpenAI

- OpenAI has successful production usage evidence (`AGENT_INTENT_DISCOVERY`, 394 tokens, recorded cost $0.000575 on 2026-08-20).
- Cost-aware model routing exists and must be reused.
- The previously stale `integration_connections` row was reconciled on 2026-08-22 from that durable usage evidence: `OPENAI / AI` is now `CONNECTED`, enabled, with no repeat paid smoke test.

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
- OpenAI / AI: CONNECTED, enabled; reconciled from existing successful usage evidence.
- Crawl4AI / Audit: NOT_CONFIGURED, disabled; code-ready smoke test exists.
- Email Provider / Email: NOT_CONFIGURED, disabled.
- Meta / WhatsApp: NOT_CONFIGURED, disabled; provider/webhook code exists but live outbound must remain blocked.
- Meta / Instagram: NOT_CONFIGURED, disabled; keep policy-aware/semi-manual where required.
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

PR #37 is the single completion PR for AI Sales, Conversations, Email, WhatsApp and Voice. Work now present on its branch includes:

- zero-cost Growth Opportunity → Sales Context bridge;
- deterministic personalization context reuse;
- selective agent routing tiers (`ZERO_COST`, `LIGHT`, `FULL`) so simple messages do not trigger all agents;
- deterministic language/script detection and safe market fallback;
- commercial price/discount guard built around existing configured price sources;
- stronger follow-up stop conditions;
- WhatsApp 24-hour/free-form vs approved-template policy support on top of the existing Meta provider;
- WhatsApp inbound/status persistence and webhook normalization;
- single-transcription voice cache path;
- Resend email provider/send/webhook lifecycle path and email event persistence;
- Shadow Mode approval queue that persists the complete send context;
- `/api/outreach/approved-send` with APPROVED → PROCESSING claim → provider send → SENT, FAILED on provider-path error, and explicit `NO_AUTOMATIC_RETRY`;
- repeated safety checks for Shadow Mode, kill switch, channel pause, DNC, human takeover, agent pause, local send window, Cost Guard, mailbox health, and WhatsApp 24-hour/template policy;
- provider readiness fail-closed before claim: Email requires `EMAIL_PROVIDER / EMAIL` CONNECTED+enabled and WhatsApp requires `META / WHATSAPP` CONNECTED+enabled.

## PR #37 production exit-gate evidence

- Original approved-send head `bdfbbe808c5ff1701e674abaab45c70ccbc0917c` passed GitHub CI and Vercel Preview was READY.
- Production migrations for voice transcription cache and email events were applied.
- Supabase Performance Advisor then exposed missing covering indexes for the new `voice_transcriptions.lead_id` and `conversation_id` foreign keys.
- Migration `0031_voice_transcription_fk_indexes.sql` was added to the branch and applied to Production; those new unindexed-FK advisor findings are cleared.
- From PR #37 creation time (`2026-08-21T16:43:32Z`) through the production verification, there are zero new `usage_events`, zero `email_events`, zero `whatsapp_events`, zero sent `conversation_messages`, and zero sent `outreach_messages` from this phase. No uncontrolled real provider send is evidenced.
- Production still has `shadow_mode=true`.
- Email and WhatsApp integration rows remain `NOT_CONFIGURED`, disabled, so live approved-send is additionally blocked before provider contact even if an old environment credential were accidentally present.
- Existing Approved Send policy tests cover healthy allow, Shadow Mode block, DNC block, human takeover block, unapproved-message block, and kill-switch/channel-pause block. Final merge still requires the newest branch head CI to be green.

## Remaining locked sequence

- PR #36 — COMPLETE and merged.
- PR #37 — ACTIVE, at final CI/merge gate: AI Sales + Conversations + Email + WhatsApp + Voice.
- PR #38 — Website Demo & Content Production Engine using existing Preview Studio/portfolio.
- PR #39 — Control Center wiring/completeness + reliability + QA + launch. Preserve visual design.

After #39, run the six launch gates from Master Tracker #18: provider smoke tests, Cost Guard proof, policy/safety proof, Shadow Mode E2E scenarios, small Oman pilot, then measured scale decision.

## Exact next action

Do not add more PR #37 features unless final CI exposes a real regression. If the newest #37 head is green and Vercel Preview is READY, merge #37. Do not enable Email or WhatsApp merely to make the Integrations screen look greener; those providers remain intentionally fail-closed until their real credentials/domain/webhook setup and controlled live E2E are completed at launch readiness.

## Handoff sentence

> Production main is `cd66a18b...` from merged PR #36. PR #37 has completed its code/migration/provider-fail-closed work and is at the final CI/merge gate. OpenAI and Google Places are production-evidenced CONNECTED; Email and WhatsApp remain deliberately NOT_CONFIGURED and cannot send through Approved Send until production-verified. Preserve the existing Control Center and continue with PR #38 only after #37 merges.