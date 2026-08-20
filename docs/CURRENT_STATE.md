# Smart Visions Growth OS — Current Production State

**Last updated:** 2026-08-21 (Oman, UTC+4)

This file is the operational handoff for the next engineer/agent/chat. Update it after every meaningful production change.

## Production endpoints and infrastructure

- Repository: `hamed665/smartvisions`
- Production branch: `main`
- Production URL: `https://smartvisions.vercel.app`
- Vercel project: `smartvisions`
- Supabase project ref: `pkypexzpyfbikdnkrzvw` (`ap-south-1`, Mumbai)
- Auth: Supabase email/password; first operator is OWNER.
- Main panel login works in production.

## Production-verified foundations

### Control plane

- Next.js + Vercel production deployment.
- Supabase Auth, organizations, OWNER role and organization-scoped RLS.
- English Control Center with editable business/runtime settings.
- CRM/Leads, Hunters, Intent Leads, Campaigns, Conversations, Hot Leads, Outreach, Message Studio, Automations, Approvals, Knowledge, Integrations, DNC/Suppression, Audit, Cost & Usage and System modules.
- Runtime safety controls, audit logs and exception-based human handoff primitives.

### Conversation intelligence

- Conversation/message storage, inbox stages, original content preservation, Persian operator brief contract, intent/sentiment metadata, approval framework, multilingual/voice metadata path and human takeover primitives.

### Cost Guard

- `cost_guard_settings` and `usage_events` are live.
- Runtime-editable total/provider budgets, daily quotas, retry/cache limits and model routing.
- Modes: `NORMAL`, `WARNING`, `THROTTLED`, `CRITICAL`, `HARD_STOP`.
- Paid operations fail closed when Cost Guard cannot be evaluated.
- Least-privilege service-role access required by Cost Guard is applied in production.

### OpenAI — production verified

- OpenAI server runtime is connected and Cost Guard protected.
- Production health check succeeded on 2026-08-21.
- Verified run: `AGENT_INTENT_DISCOVERY`, 394 displayed tokens, `$0.000575` estimated cost recorded.
- OpenAI API billing currently uses a **$5 prepaid balance** with **auto-reload disabled**.

## Google Places / Business Hunter — code deployed, production smoke test pending

PR #21 (`feat: controlled Google Places discovery gate`) is merged to `main` and Vercel production deployment is green.

Implemented and deployed:

- Owner-only `/hunters/google-places` controlled discovery page.
- Dry-run preview before provider execution.
- `READY` vs `CONNECTED` integration semantics.
- Cost Guard before Google Places Text Search and Place Details.
- Google Places provider-budget enforcement.
- First-gate Text Search requests `places.id` only.
- Oman-only controlled sample, hard limit 3 Place IDs.
- Daily new-lead quota check before the sample.
- Place ID dedupe and provenance persistence into existing `discovery_records`.
- Google Places usage metering and audit logging.
- No campaign, email, WhatsApp, follow-up or outreach side effects from the controlled sample.
- Place Details uses a conservative `$0.02` internal provider-budget reserve per request because the existing field mask includes Enterprise fields (`websiteUri`, `nationalPhoneNumber`).
- `docs/GOOGLE_PLACES_CONTROLLED_GATE.md` documents the production verification sequence.

Production database status:

- Migration `0022_google_places_connected_status.sql` has been applied successfully to production Supabase.
- Supabase security advisor after the migration reports no new schema/RLS issue; the existing account-level warning remains: Leaked Password Protection is disabled.
- Performance advisor reports only existing `unused_index` informational notices; no new blocking performance issue was introduced by migration 0022.
- Current Google Places integration database state: `NOT_CONFIGURED`, disabled, no successful health check yet.
- Google Places provider budget is currently `$5.00`; daily new-lead quota is `50`.

Therefore Google Places is **not production-verified yet**. Do not call it `CONNECTED` until the server key and one controlled sample succeed.

## Exact next action — DO THIS FIRST

1. Configure `GOOGLE_PLACES_API_KEY` in Vercel **Production and Preview** only. Never commit the key.
2. Wait for/redeploy production if Vercel requires a deployment after the environment change.
3. Open `https://smartvisions.vercel.app/hunters/google-places`.
4. Confirm the page shows credential `PRESENT` and provider state `READY` rather than `NOT_CONFIGURED`.
5. Review the dry-run settings and run exactly one first sample:
   - Country: `OM`
   - City: `Muscat`
   - Industry: `dental clinic`
   - Max results: `3`
6. Verify after the run:
   - integration state becomes `CONNECTED`;
   - `GOOGLE_PLACES / TEXT_SEARCH_IDS_ONLY` appears in usage;
   - returned Place IDs appear in `discovery_records`;
   - repeated IDs are not inserted twice;
   - audit log records `GOOGLE_PLACES_CONTROLLED_SAMPLE`;
   - no outreach was triggered.
7. Only after that gate passes, continue to selective Place Details and website/public-source enrichment.

Do **not** start Crawl4AI, email sending, WhatsApp outreach or autonomous discovery loops before the controlled Google Places production sample passes.

## External integrations not yet production-verified

- Google Places — runtime deployed/migration applied; server key + controlled production sample still pending.
- Crawl4AI — not provisioned/tested end to end.
- Redis/queue runtime — not production-verified if retained.
- Email outbound provider/domain/mailbox reputation stack — not production-verified.
- WhatsApp Cloud API — not production-verified.
- Voice transcription — not production-verified end to end.
- Freelancer/project hunting sources — not production-verified.
- Preview/demo generation pipeline — not production-verified end to end.

## Durable product decisions

- Smart Visions is separate from DrKhaleej.
- Main UI is English; owner/operator summaries and reports are Persian.
- Automation by default, human approval by exception.
- Default outbound window is 09:00–19:00 recipient local time.
- Localization is market-specific for Oman/UAE/Saudi/Qatar/UK/USA; Gulf-neutral Arabic is the fallback when dialect confidence is low.
- Prices, provider budgets, quotas and safety controls remain editable in the panel.
- Google Places is discovery/reference only; minimal fields first, then selective enrichment after dedupe/value checks.
- Cold email infrastructure must remain isolated from the primary company-domain reputation.

## Recent important PRs

- PR #14 — Cost Guard and editable API quotas.
- PR #15 — cost-aware OpenAI runtime.
- PR #16 — owner-only OpenAI production health check.
- PR #17 — least-privilege Cost Guard backend grant fix.
- PR #19 — canonical master plan / cross-chat handoff.
- PR #20 — successful OpenAI production verification recorded.
- PR #21 — controlled Google Places discovery gate, merged and deployed.

## Known caveats

- `READY` means credential present/not yet verified. `CONNECTED` requires a successful controlled production test.
- OpenAI prepaid auto-reload remains disabled by design.
- IDs-only Google Text Search is intentionally separated from richer Place Details to minimize spend.
- Do not raise budgets to hide provider/configuration errors.
- Existing Supabase Auth advisory: Leaked Password Protection disabled. Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Handoff sentence for a new chat

> Read `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/MASTER_PLAN.md`, `docs/EXECUTION_PLAYBOOK.md`, and `docs/GOOGLE_PLACES_CONTROLLED_GATE.md`. PR #21 is merged, production Vercel is green, migration 0022 is applied, Google Places budget is $5, but the integration is still NOT_CONFIGURED. Next: add `GOOGLE_PLACES_API_KEY` to Vercel Production/Preview, run exactly one Muscat dental-clinic sample of max 3 Place IDs, verify CONNECTED/usage/dedupe/no-outreach, then continue to selective enrichment.
