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
- OpenAI prepaid API balance is active with auto-reload disabled.
- Verified OpenAI smoke test: `AGENT_INTENT_DISCOVERY`, 394 tokens displayed, `$0.000575` estimated cost recorded.

### Google Places discovery gate

The controlled Google Places discovery gate is production-verified.

Verified production evidence from 2026-08-21:

- `GOOGLE_PLACES_API_KEY` is configured in Vercel Production and Preview.
- Google key is restricted to Places API (New).
- Provider state is `CONNECTED`, enabled, and `last_error` is clear.
- Controlled query: Oman / Muscat / dental clinic / max 3.
- Google returned exactly 3 Place IDs.
- One `TEXT_SEARCH_IDS_ONLY` usage row exists with `$0.000000` internal cost.
- Exactly 3 Google Places discovery records were persisted with provenance.
- No outreach occurred.
- Migration 0023 added the authenticated org-member audit INSERT policy required by server actions.
- The successful sample was reconciled without rerunning Google after the earlier audit-only 403.

Do not rerun the same discovery sample merely to prove the already-verified provider path.

## Selective Place Details / lead promotion — implementation in progress

Branch: `feat/google-places-selective-enrichment`

Implemented on the branch:

- One-candidate-at-a-time enrichment controls on `/hunters/google-places`.
- Enrichment is available only while Google Places is `CONNECTED`, the credential is present, and provider budget is non-zero.
- Place ID must already exist in organization-scoped Google discovery records; arbitrary IDs are rejected.
- Current gate is Oman-only.
- Existing `businesses.google_place_id` matches are reused before any Place Details request, preventing repeat paid lookups.
- New Place Details calls use the existing controlled runtime, Cost Guard preflight, Google provider cap, usage metering and conservative `$0.02` internal reserve.
- Place Details persist into the existing `businesses` table, including normalized `dedupe_domain`.
- The business is promoted into the existing `leads` table as conservative `NEW / AUTO / score 0`, explicitly pending website audit and qualification.
- Discovery provenance is updated with business/lead IDs and enrichment timestamp.
- No campaign, email, WhatsApp or other outreach side effect exists.
- Migration 0024 adds database-level uniqueness for `(organization_id, google_place_id)` and `(organization_id, business_id)` to close race-condition duplicate paths.
- Helper tests cover Place ID validation, business mapping/domain normalization, and conservative initial lead state.

## Exact next action — DO THIS FIRST

1. Review PR for branch `feat/google-places-selective-enrichment`.
2. Require green lint, typecheck, tests, build and Vercel Preview.
3. Merge only when all checks are green.
4. Apply migration `0024_business_lead_dedupe_guards.sql` to production Supabase.
5. Run Supabase security and performance advisors after the DDL change.
6. Refresh `/hunters/google-places` and confirm the 3 existing IDs appear as unenriched candidates.
7. Enrich **exactly one** candidate first. Do not enrich all 3 at once.
8. Verify one `PLACE_DETAILS_ENTERPRISE` usage row, one business, one lead, discovery provenance update, audit row, and zero outreach.
9. Re-running enrichment for that same Place ID must reuse the existing business/lead and must not add another Google Place Details usage row.
10. Only after this idempotency gate passes should the other candidates be eligible for selective enrichment and Phase 3 website/public-source work begin.

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
- Google Places is discovery/reference first: persist Place IDs/provenance, minimize paid fields, and avoid repeated paid enrichment.
- Durable business data belongs in existing `businesses`; qualified pipeline identity belongs in existing `leads`.
- Credential presence (`READY`) is not the same as a verified end-to-end provider connection (`CONNECTED`).
- Cold outreach stays disabled until enrichment, audit, qualification, DNC, budget, send-window and response-handling gates are verified.
- OpenAI API auto-reload remains disabled.

## Known caveats

- Supabase Auth still reports the Leaked Password Protection advisory; this is separate from Google Places work.
- Unused-index performance notices are informational at this early traffic level; do not remove indexes solely because they have not yet accumulated usage.

## Handoff sentence for a new chat

> Read `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/MASTER_PLAN.md`, and `docs/EXECUTION_PLAYBOOK.md`. Google Places IDs-only discovery is production-verified and CONNECTED with exactly 3 Muscat dental-clinic Place IDs and one free IDs-only usage row. Finish branch `feat/google-places-selective-enrichment`: green checks, merge, apply migration 0024, enrich exactly one existing candidate, verify business + lead + provenance + audit + usage with zero outreach, then re-run that same candidate to prove no duplicate paid Place Details request occurs before moving to website/public-source enrichment.
