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
- Owner-only production health-check page exists at:
  - `/cost-usage/openai-health-check`
- The first production health-check attempt reached OpenAI but failed with HTTP 429 `insufficient_quota` because the OpenAI API billing balance was zero.
- OpenAI API billing was then activated with a **$5 prepaid balance** and **auto-reload disabled**.
- The production health check was re-run once and **succeeded end to end** on 2026-08-21 (Oman time).
- Verified production run:
  - Agent: `AGENT_INTENT_DISCOVERY`
  - Total tokens displayed: `394`
  - Recorded estimated cost: `$0.000575`
  - A usage row appeared in Recent OpenAI usage.
- This confirms the controlled path `Cost Guard → OpenAI Responses API → intent-discovery agent → usage recording` works in production.
- Do not repeatedly run the health check; it is a smoke test, not a workload.

## Exact next action — DO THIS FIRST

### 1. Start the controlled Business Hunter / Google Places milestone

The OpenAI production gate is now passed. Continue with the acquisition runtime in `docs/MASTER_PLAN.md` without enabling autonomous outreach.

Implement/verify in this order:

1. Provider/integration health must distinguish credential presence from a successful end-to-end connection.
2. Configure `GOOGLE_PLACES_API_KEY` server-side only; never expose it to the browser or GitHub.
3. Enforce Cost Guard and the Google Places provider budget/quota **before every paid Places request**.
4. Use the existing Business Hunter primitives rather than creating a second CRM or discovery model.
5. Start with a dry-run/query preview and a tiny Oman-only production sample.
6. Persist Place ID/provenance and deduplicate before doing additional paid lookups.
7. Record provider usage and exact operation metadata after the request.
8. Do not start Crawl4AI, email sending, WhatsApp outreach or autonomous discovery loops until this controlled Places path is production-verified.

Expected first Google Places success criteria:

- Owner can see whether Google Places is NOT_CONFIGURED/READY/CONNECTED/ERROR rather than merely whether a credential string exists.
- A tiny Oman discovery request passes Cost Guard.
- Place IDs are returned and deduplicated.
- Discovery/provenance is persisted in existing tables.
- Google Places usage is recorded.
- No lead is contacted and no campaign outreach is triggered.
- Failure states are visible and fail closed.

### 2. After the first controlled Places sample

Proceed to website/public-source enrichment and audit only after confirming that duplicate discovery does not cause repeated paid enrichment and that Places spending remains within the configured provider cap.

## External integrations not yet production-verified

Do not describe these as connected until tested end-to-end:

- Google Places API — key/runtime still to be configured/tested.
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
- Google Places should be used as discovery/reference, with Place ID persistence and careful handling of Places content; business website/public sources should be used for durable enrichment where appropriate.
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

## Known caveats

- Do not confuse credential presence or `READY` configuration status with a completed provider smoke test.
- OpenAI API billing is prepaid with auto-reload disabled; requests will stop when the balance is exhausted unless the owner manually adds credit.
- Do not switch Shadow Mode/autonomous outreach broadly until acquisition, response, DNC, budget, and handoff behavior are tested with controlled samples.
- Do not increase API budgets simply to make errors disappear.
- Supabase has previously surfaced a Leaked Password Protection auth advisory. Treat platform-level auth advisories separately from application migrations and enable recommended account protection where practical.

## Handoff sentence for a new chat

> Read `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/MASTER_PLAN.md`, and `docs/EXECUTION_PLAYBOOK.md`. OpenAI production health check is verified end to end as of 2026-08-21. Continue with a controlled Google Places Business Hunter milestone: server-only key, provider health, Cost Guard before paid calls, tiny Oman sample, dedupe/provenance/usage recording, and no outreach until acquisition is production-verified.
