# Smart Visions Growth OS — Current Production State

**Last updated:** 2026-08-21 (Oman, UTC+4)

This file is the operational handoff for the next engineer/agent/chat. Update it after every meaningful production change.

## Production endpoints and infrastructure

- GitHub repository: `hamed665/smartvisions`
- Production branch: `main`
- Frontend/control plane: Vercel project `smartvisions`
- Production URL: `https://smartvisions.vercel.app`
- Supabase project: `smart visions-growth-os`
- Supabase project ref: `pkypexzpyfbikdnkrzvw`
- Supabase region: `ap-south-1` (Mumbai)
- Auth: Supabase email/password. First operator user exists and is OWNER.
- Current panel login works in production.

## What is implemented and production-deployed

### Foundation / control plane

- Next.js application and Vercel deployment.
- Supabase Auth, organization membership, OWNER role and organization-scoped RLS.
- English Control Center UI.
- Dashboard, navigation and production login.
- CRUD/control surfaces for Services, Pricing, Markets, AI Agents and System settings.
- Expanded Control Center modules including CRM/Leads, Intent Leads, Campaigns, Conversations, Hot Leads, Growth/Outreach, Message Studio, Automations, Approvals, Knowledge, Integrations, DNC/Suppression, Audit, runtime safety, prompt versioning, locale/tone, reports and conversation detail.
- Runtime safety controls and audit logging.

### Conversation intelligence

- Conversation/message storage model.
- Persian operator brief contract.
- Original-message preservation.
- Intent/sentiment/stage metadata.
- Conversation inbox stages/categories.
- Approval vs auto/handoff decision framework.
- Voice message metadata path is modeled.
- Multilingual/dialect-aware contract is modeled.
- Human takeover/handoff primitives exist.

### Cost Guard

- `cost_guard_settings` and `usage_events` are in production.
- Editable Cost & Usage panel.
- Runtime-editable budgets, quotas, retry/cache limits and model routing settings.
- Budget modes: NORMAL, WARNING, THROTTLED, CRITICAL, HARD_STOP.
- Paid operations fail closed if the Cost Guard cannot be evaluated.
- OpenAI runtime is wired to Cost Guard and usage metering.
- Server-side Supabase backend access was corrected using least privilege:
  - `service_role`: SELECT on `cost_guard_settings`
  - `service_role`: SELECT + INSERT on `usage_events`
- This least-privilege fix was shipped through PR #17 and applied to production.

### OpenAI — production verified

- `OPENAI_API_KEY` is configured in Vercel for Production and Preview.
- `SUPABASE_SECRET_KEY` is configured in Vercel for Production and Preview.
- Cost-aware OpenAI runtime exists.
- Low-cost/high-reasoning model routing exists in code/settings.
- Token usage and estimated cost recording exists.
- Owner-only production health-check page exists at `/cost-usage/openai-health-check`.
- OpenAI API billing is active with a **$5 prepaid balance** and **auto-reload disabled**.
- The production health check succeeded end to end on 2026-08-21 (Oman time).
- Verified production run: `AGENT_INTENT_DISCOVERY`, 394 displayed tokens, `$0.000575` recorded estimated cost.
- This confirms `Cost Guard → OpenAI Responses API → intent-discovery agent → usage recording` works in production.

## Google Places / Business Hunter — implementation in progress

A controlled Google Places acquisition gate is now implemented on branch `feat/google-places-controlled-discovery` and must be production-verified before autonomous discovery is enabled.

Implemented in the branch:

- Owner-only `/hunters/google-places` controlled sample page.
- Explicit `READY` vs `CONNECTED` integration semantics.
- Cost Guard preflight before Google Places Text Search and Place Details.
- Google Places provider-cap enforcement.
- IDs-only Text Search (`places.id`) for the first sample.
- Oman-only controlled sample, maximum 3 results.
- Daily new-lead quota enforcement before the sample.
- Place ID persistence into existing `discovery_records` with duplicate checks and provenance.
- Google Places usage metering and audit logging.
- No campaign, outreach, email or WhatsApp side effect from the sample.
- Place Details is protected with a conservative `$0.02` internal provider-budget reserve per request.
- Migration `0022_google_places_connected_status.sql` adds `CONNECTED` to integration health states.
- Detailed gate procedure is documented in `docs/GOOGLE_PLACES_CONTROLLED_GATE.md`.

This code is **not production-verified yet**. Do not call Google Places `CONNECTED` until the migration, secret and one controlled production sample are complete.

## Exact next action — DO THIS FIRST

### 1. Finish and merge the controlled Google Places implementation

Before merge:

1. CI lint/typecheck/tests/build must be green.
2. Vercel Preview must be green.
3. Review that all Google Places call paths go through Cost Guard.
4. Do not add real Google credentials to GitHub.

### 2. Production setup after merge

1. Apply `supabase/migrations/0022_google_places_connected_status.sql` to production.
2. Add `GOOGLE_PLACES_API_KEY` to Vercel Production and Preview only.
3. Keep a small non-zero Google Places provider budget in Cost & Usage.
4. Open `/hunters/google-places`.
5. Review the dry-run preview.
6. Run exactly one first sample: Muscat / dental clinic / max 3.
7. Confirm provider health becomes `CONNECTED`, usage is recorded, Place IDs are persisted/deduplicated, and no outreach occurred.

### 3. Only after the controlled Places sample is verified

Proceed to selective Place Details and website/public-source enrichment. Do not start Crawl4AI, email sending, WhatsApp outreach or autonomous acquisition loops before this gate passes.

## External integrations not yet production-verified

Do not describe these as connected until tested end-to-end:

- Google Places API — controlled runtime implemented but secret/migration/production smoke test still pending.
- Crawl4AI — service/URL still to be provisioned and tested.
- Redis/queue runtime — still to be provisioned/verified if retained by final architecture.
- Email outbound provider — provider/domain/mailbox/reputation setup not production-verified.
- WhatsApp Cloud API — token/phone-number-id/webhook/app-secret flow not production-verified.
- Voice transcription — runtime provider integration and end-to-end voice note test still pending.
- Freelancer/project hunting sources — discovery/runtime adapters not production-verified.
- Preview/demo generation — full automated generation/deployment flow not production-verified.

## Important production decisions already made

- Smart Visions is a separate repository from DrKhaleej.
- Main UI is English; owner/operator summaries and reports are Persian.
- Routine sales actions should become autonomous when confidence/policy allows; owner approval is exception-based.
- Local outbound send window defaults to 09:00–19:00 recipient local time.
- Dialect/tone localization is required for Oman/UAE/Saudi/Qatar and British/American English markets.
- When Arabic dialect confidence is low, use Gulf-neutral Arabic.
- Price tables and service offers are market-specific and editable from panel.
- The system should find both businesses that need agency services and public project/freelancer opportunities, but platform automation must stay within provider/platform policy.
- For a website prospect, the system may offer to generate a modern personalized preview/demo after qualification. It must not deliberately create an ugly/old design merely to manipulate the prospect.
- Google Places is used as discovery/reference with Place ID persistence and minimal fields; website/public sources are preferred for durable enrichment where appropriate.
- Cold email sending infrastructure must be isolated from the primary corporate domain/reputation and implemented with provider-policy/reputation controls.

## Recent important PRs

The exact repository history is authoritative. Key milestones include:

- PR #8 — public login/layout cleanup.
- PR #9/#10 — conversation intelligence, Persian operator brief, voice metadata, approval automation and DB indexes.
- PR #11 — real routes for previously dead navigation items.
- PR #12 — editable Control Center settings.
- PR #13 — professional Control Center v1 expansion.
- PR #14 — Cost Guard, editable quotas, usage metering/model routing foundations.
- PR #15 — cost-aware OpenAI runtime.
- PR #16 — owner-only low-cost OpenAI production health check.
- PR #17 — restore least-privilege backend grants required by Cost Guard after a production 403.
- PR #19 — canonical master plan and cross-chat handoff documentation.
- PR #20 — record successful OpenAI production verification and advance next action to Google Places.

## Known caveats

- Do not confuse credential presence or `READY` configuration status with a completed provider smoke test.
- OpenAI API billing is prepaid with auto-reload disabled; requests stop when the balance is exhausted unless the owner manually adds credit.
- Google Places IDs-only discovery is intentionally separated from richer Place Details to avoid paying for fields before a lead has value.
- Do not switch Shadow Mode/autonomous outreach broadly until acquisition, response, DNC, budget, and handoff behavior are tested with controlled samples.
- Do not increase API budgets simply to make errors disappear.
- Supabase has previously surfaced a Leaked Password Protection auth advisory. Treat platform-level auth advisories separately from application migrations and enable recommended account protection where practical.

## Handoff sentence for a new chat

> Read `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/MASTER_PLAN.md`, `docs/EXECUTION_PLAYBOOK.md`, and `docs/GOOGLE_PLACES_CONTROLLED_GATE.md`. OpenAI is production-verified. Finish the controlled Google Places Business Hunter gate: green CI/Preview, merge, apply migration 0022, configure server-only key, run one Muscat dental-clinic sample of max 3 Place IDs, verify usage/dedupe/CONNECTED status, and keep outreach disabled.
