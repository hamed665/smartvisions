# Smart Visions Growth OS — Current Production State

**Last updated:** 2026-08-20 (Oman, UTC+4)

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

### OpenAI

- `OPENAI_API_KEY` is configured in Vercel for Production and Preview.
- `SUPABASE_SECRET_KEY` is configured in Vercel for Production and Preview.
- Cost-aware OpenAI runtime exists.
- Low-cost/high-reasoning model routing exists in code/settings.
- Token usage and estimated cost recording exists.
- Owner-only production health-check page exists at:
  - `/cost-usage/openai-health-check`
- The first production health-check attempt failed **before reaching OpenAI** because Supabase backend grants returned 403.
- Root cause was identified from Supabase API logs and fixed via PR #17.

## Exact next action — DO THIS FIRST

### 1. Re-run the OpenAI production health check after PR #17

Open:

`https://smartvisions.vercel.app/cost-usage/openai-health-check`

Run **Run low-cost OpenAI test** once.

Expected success criteria:

- Page does not crash.
- OpenAI request succeeds.
- Result is returned by the intent-discovery agent.
- A new OPENAI row appears in `usage_events`.
- Input/output tokens are non-zero/reasonable.
- Estimated cost is very small and appears in Cost & Usage.
- `OPENAI_HEALTH_CHECK` appears in audit logs.

If it fails:

1. Do not repeatedly click the button.
2. Inspect Vercel function/server logs and Supabase API logs for the exact timestamp.
3. Determine whether the failure is Cost Guard, OpenAI auth/billing/model access, response parsing, or usage insert.
4. Fix using a PR, CI, and least-privilege approach.
5. Update this file with the result.

### 2. Only after OpenAI smoke test is production-verified

Proceed to the first acquisition runtime milestone in `docs/MASTER_PLAN.md`: Google Places Business Hunter + crawl/audit pipeline, with paid-request Cost Guard enforced before enabling any autonomous discovery loop.

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

## Known caveats

- Do not confuse `READY` configuration status with a completed provider smoke test.
- Do not switch Shadow Mode/autonomous outreach broadly until acquisition, response, DNC, budget, and handoff behavior are tested with controlled samples.
- Do not increase API budgets simply to make errors disappear.
- Supabase has previously surfaced a Leaked Password Protection auth advisory. Treat platform-level auth advisories separately from application migrations and enable recommended account protection where practical.

## Handoff sentence for a new chat

> Read `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/MASTER_PLAN.md`, and `docs/EXECUTION_PLAYBOOK.md`. Verify production. The first pending task as of 2026-08-20 is to re-run and verify the owner-only OpenAI production health check after PR #17; do not jump to Google Places or outreach until that succeeds.
