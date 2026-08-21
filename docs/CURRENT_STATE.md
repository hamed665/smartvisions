# Smart Visions Growth OS — Current Production State

**Last updated:** 2026-08-21 (Oman, UTC+4)

This file is the operational handoff. Verify production before acting and update this file after every meaningful production change.

## Production

- Repository: `hamed665/smartvisions`
- Production branch: `main`
- Production URL: `https://smartvisions.vercel.app`
- Supabase project ref: `pkypexzpyfbikdnkrzvw`
- Current production commit: `46d1c86f93bca39657554841bf908b9e1cc2029a` (PR #35)
- Vercel deployment for PR #35: `READY / production`.
- Supabase migration `0027_growth_opportunity_routing.sql` is applied.

## Production-verified foundations

### Platform / security / controls

- Supabase Auth and organization-scoped RLS are live.
- OWNER control model is live.
- Control Center, runtime switches, audit primitives, market/service/pricing foundations are present.
- Supabase security advisor has no new schema/RLS issue from Growth routing; separate Auth warning remains: Leaked Password Protection disabled.

### Cost Guard / OpenAI

- Editable Cost Guard and provider usage metering are live.
- OpenAI is production-verified end to end.
- OpenAI auto-reload remains disabled.
- Paid operations are designed to fail closed if Cost Guard cannot be evaluated.

### Google Places / Business Hunter

- Google Places credential is configured and provider is `CONNECTED`.
- IDs-only discovery is production-verified and recorded at zero internal cost.
- Selective/batch Place Details qualification is implemented with durable identity checks, provider budget guard, dedupe and usage metering.
- First-pass qualification deliberately avoids review text and uses the cheaper Enterprise/no-reviews path.
- Google Business Intelligence full review/rating enrichment exists separately and is cached; it is not part of routine hunting.
- Current optimization principle: `IDs only → durable/cache check → minimum qualification → only then deeper evidence if it can change a sales decision`.

### Website/no-website/contact routing

- Business identity persists in existing `businesses`; CRM pipeline identity remains in existing `leads`.
- Standalone website classification distinguishes first-party websites from social/contact/directory links.
- Instagram/Facebook/WhatsApp/link-in-bio and directory/booking profiles such as WhatClinic/Fresha/Booksy do not count as a standalone website.
- Local `wa.me` candidate links are derived from phone numbers without another API call; this is a contact candidate, not proof that WhatsApp is active.
- Deterministic website-audit foundation exists with SSRF/timeout/body limits and cache. No website audit should run for a true no-website lead.

### Growth Opportunity routing

- `growth_opportunities` is live with these lanes:
  - `MUSCAT_LOCAL_GROWTH`
  - `OMAN_REMOTE_GROWTH`
  - `INTERNATIONAL_AI_GROWTH`
- Separate website/local-content/AI-content/overall scores are implemented.
- Muscat can route to on-site filming/reels/photography + website/AI assist.
- Outside Muscat Oman routes to website + remote AI content.
- International routes to website + AI content/creative production.
- Businesses with a standalone website are not discarded; they can remain candidates for later content/social evidence checks.
- PR #35 adds an idempotent Owner-only cached-business routing action that uses existing database data and makes zero Google/OpenAI/social provider calls.

## Existing modules that must be extended, not rebuilt

- `lib/agents/*`: contracts, executor, router, pipeline, OpenAI runtime.
- `lib/outreach/*`: eligibility, locale, scheduler, follow-ups, variants, pricing, replies, mailbox health.
- Existing conversation intelligence and handoff/approval model.
- Existing WhatsApp provider/send foundations.
- Existing preview engine/templates/quality/API.
- Existing portfolio primitives.
- Existing Cost Guard/runtime/reliability primitives.
- Existing integration connection/status model.

## External integrations still not production-verified

- Crawl4AI.
- Email outbound provider.
- WhatsApp Cloud API complete inbound/outbound webhook flow.
- Voice transcription production flow.
- Freelancer/project hunting sources.
- Full preview/demo deployment/content-production flow.
- Redis is optional; do not add/require it unless a concrete queue/reliability need justifies it.

## Final Production V1 execution lock

The remaining product completion is constrained to four major PRs. Read `docs/V1_FINAL_4_PR_PLAN.md` before adding features.

1. **PR #36 — Complete Growth Intelligence & Integrations**
2. **PR #37 — Complete AI Sales, Conversations & Outreach**
3. **PR #38 — Complete Website & Content Production Engine**
4. **PR #39 — Complete Control Center, Reliability & Production Launch**

Do not create duplicate subsystems. Missing work must first be mapped to an existing primitive and one of these four PR scopes.

## Exact next action

Current development branch: `phase5/pr36-complete-growth-integrations`.

For PR #36:

1. Reconcile current Hunter/Growth code against the existing data model and Cost Guard.
2. Use PR #35 cached routing instead of re-querying Google for already-known businesses.
3. Finish digital-presence/social-evidence status without fabricating evidence and without default paid social calls.
4. Finish multi-market Growth routing using existing market settings.
5. Complete/verify Google + Crawl4AI integration-health/smoke-test behavior using the existing `integration_connections` model.
6. Keep review text, deep AI, outreach and heavy preview generation out of acquisition by default.
7. CI must pass lint/typecheck/tests/build before merge.
8. Apply any required migration only after CI and run Supabase advisors.
9. Production-verify with the smallest useful batch and confirm no duplicate paid calls.

## Handoff sentence

> Read `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/MASTER_PLAN.md`, `docs/V1_FINAL_4_PR_PLAN.md` and `docs/EXECUTION_PLAYBOOK.md`. Production is on PR #35 commit `46d1c86f...`; Growth routing and zero-cost cached backfill are deployed. Continue only on PR #36 Growth Intelligence & Integrations, reusing existing Hunters, Cost Guard, integration status, audit and growth-opportunity primitives. Do not rebuild existing agent/outreach/preview/conversation systems and do not add paid calls before cache/deterministic gates.