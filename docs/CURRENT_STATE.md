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

## Production-verified foundations

### Cost Guard / OpenAI

- Editable Cost Guard and usage metering are live.
- OpenAI is production-verified end to end.
- OpenAI prepaid API balance was activated with auto-reload disabled.
- Verified OpenAI smoke test: `AGENT_INTENT_DISCOVERY`, 394 tokens displayed, `$0.000575` estimated cost recorded.

### Google Places / Business Hunter

PR #21 shipped the controlled Google Places gate and migration 0022 was applied to production.

Current controlled-sample evidence from 2026-08-21:

- `GOOGLE_PLACES_API_KEY` is configured in Vercel Production and Preview.
- Google key is restricted to Places API (New).
- Controlled sample query: Oman / Muscat / dental clinic / max 3.
- Google Places request succeeded and returned 3 Place IDs.
- `TEXT_SEARCH_IDS_ONLY` usage event was recorded with `$0.000000` internal cost and 1 request.
- All 3 Place IDs were persisted in `discovery_records` with Google Places provenance.
- No outreach was triggered.
- The provider briefly transitioned through the success path, but the action then failed while appending its audit row because `audit_logs` only had a SELECT RLS policy. Supabase API logs show HTTP 403 on `POST /rest/v1/audit_logs`.
- The catch path therefore marked Google Places `ERROR` even though the actual provider call, usage metering and persistence all succeeded.
- Migration `0023_audit_log_insert_policy.sql` fixes this by allowing authenticated organization members to append audit rows while retaining append-only RLS behavior. USER audit rows must use the current authenticated user ID.

Do **not** rerun the paid/provider request merely to work around the audit failure. After migration 0023 is applied, reconcile the already-successful sample by setting Google Places to `CONNECTED` and inserting a reconciliation audit event.

## Exact next action — DO THIS FIRST

1. Merge the audit-policy fix with green CI and Vercel.
2. Apply migration `0023_audit_log_insert_policy.sql` to production Supabase.
3. Insert one reconciliation audit event for the already successful Google Places controlled sample.
4. Set the `GOOGLE_PLACES / DISCOVERY` integration to `CONNECTED`, enabled, with `last_error = null`.
5. Verify the panel shows CONNECTED and the existing 3 persisted Place IDs / usage row remain unchanged.
6. Do not rerun the Google request just to prove the same result twice.
7. Only after that proceed to selective Place Details / website enrichment. Keep autonomous outreach disabled.

## External integrations not yet production-verified

- Crawl4AI — not production-verified.
- Redis/queue runtime — not production-verified if retained by final architecture.
- Email outbound provider — not production-verified.
- WhatsApp Cloud API — not production-verified.
- Voice transcription — not production-verified.
- Freelancer/project hunting sources — not production-verified.
- Preview/demo generation — full automated generation/deployment flow not production-verified.

## Important production decisions

- Main UI is English; owner/operator summaries and reports are Persian.
- Cost controls remain editable from the panel and paid operations fail closed.
- Google Places is discovery/reference only; persist Place IDs and provenance, minimize paid fields, and prefer public business sources for durable enrichment.
- Credential presence (`READY`) is not the same as a verified end-to-end provider connection (`CONNECTED`).
- Cold outreach stays disabled until discovery, enrichment, DNC, budget, send-window and response handling gates are verified.
- OpenAI API auto-reload remains disabled.

## Known caveats

- Supabase Auth still reports the Leaked Password Protection advisory; this is separate from the Google Places work.
- Unused-index performance notices are informational at this early traffic level; do not remove indexes solely because they have not yet accumulated usage.

## Handoff sentence for a new chat

> Read `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/MASTER_PLAN.md`, `docs/EXECUTION_PLAYBOOK.md`, and `docs/GOOGLE_PLACES_CONTROLLED_GATE.md`. The first Google Places Muscat dental-clinic sample already succeeded at the provider/usage/persistence layers and returned 3 Place IDs. The remaining issue is an audit-log RLS 403. Merge/apply migration 0023, reconcile the successful sample to CONNECTED without rerunning Google, then continue to selective enrichment with outreach still disabled.
