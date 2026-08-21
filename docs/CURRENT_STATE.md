# Smart Visions Growth OS — Current Production State

**Last updated:** 2026-08-21 (Oman, UTC+4)

This file is the operational handoff for the next engineer/agent/chat. Update it after every meaningful production change.

## Production endpoints and infrastructure

- Repository: `hamed665/smartvisions`
- Production branch: `main`
- Production URL: `https://smartvisions.vercel.app`
- Supabase project ref: `pkypexzpyfbikdnkrzvw`
- Auth: Supabase email/password; OWNER operator exists.

## Production-verified foundations

### Cost Guard / OpenAI

- Editable Cost Guard and usage metering are live.
- OpenAI is production-verified end to end.
- OpenAI prepaid API balance is active with auto-reload disabled.
- Verified OpenAI smoke test: `AGENT_INTENT_DISCOVERY`, 394 tokens displayed, `$0.000575` estimated cost recorded.

### Google Places IDs-only discovery

- `GOOGLE_PLACES_API_KEY` is configured server-side in Vercel Production and Preview and restricted to Places API (New).
- Provider state is `CONNECTED`, enabled, with `last_error = null`.
- Production sample: Oman / Muscat / dental clinic / max 3.
- Google returned exactly 3 Place IDs.
- One `TEXT_SEARCH_IDS_ONLY` usage row exists at `$0.000000` internal cost.
- Exactly 3 discovery records exist with Google Places provenance.
- No outreach occurred.
- Migration 0023 fixed authenticated audit-log inserts and the successful sample was reconciled without another Google request.

Do not rerun the same IDs-only sample merely to prove an already-verified provider path.

## Selective Place Details / lead promotion — deployed, awaiting first production candidate test

PR #24 is merged and Vercel Production is green. Migration 0024 is applied.

Production implementation now provides:

- One-candidate-at-a-time enrichment on `/hunters/google-places`.
- Only Place IDs already present in organization-scoped Google discovery can be enriched.
- Current first gate remains Oman-only.
- Google must be `CONNECTED`, credential must be present, and provider budget must be non-zero.
- Existing `businesses.google_place_id` matches are checked before any paid-capable Place Details call.
- New Place Details requests pass Cost Guard and Google provider-budget checks and record usage with the conservative `$0.02` internal reserve.
- Place Details persist into the existing `businesses` table, including normalized `dedupe_domain`.
- The business is promoted into the existing `leads` table as `NEW / AUTO / opportunity 0 / intent 0`, explicitly pending website audit and qualification.
- Discovery provenance is updated with `businessId`, `leadId`, enrichment time and whether a details lookup was performed.
- No campaign, email, WhatsApp or outreach side effect exists.
- DB-level dedupe protects one business per organization/Google Place ID and one lead per organization/business.

### Post-migration advisor cleanup

PR #25 is merged and migration 0025 is applied.

- The new duplicate business unique index from 0024 was removed because the pre-existing `businesses_place_unique` already provides the same protection.
- The audit INSERT RLS policy now uses `(select auth.uid())::text` to avoid per-row auth function re-evaluation.
- Supabase performance advisor no longer reports the duplicate-index or auth-RLS-initplan warnings from this work.
- Remaining unused-index notices are informational at current traffic levels.
- Supabase Auth still reports the separate Leaked Password Protection warning.

## Exact next action — DO THIS FIRST

1. Refresh `/hunters/google-places`.
2. Confirm `Provider health = CONNECTED` and the 3 existing Place IDs appear under **Selective candidate enrichment**.
3. Click **Enrich one candidate** for exactly one candidate. Do not enrich all 3 yet.
4. Verify in production:
   - exactly one new `PLACE_DETAILS_ENTERPRISE` usage row;
   - one business row with the selected `google_place_id`;
   - one lead linked to that business;
   - discovery provenance contains business/lead IDs and enrichment timestamp;
   - one successful enrichment audit row;
   - zero outreach rows/actions.
5. Click enrichment for the **same candidate again**. It must reuse the existing business/lead and must **not** create another `PLACE_DETAILS_ENTERPRISE` usage row.
6. Only after this idempotency test passes should the remaining two candidates be selectively enriched.
7. Then begin Phase 3: official-website/public-source enrichment and deterministic website audit. Crawl4AI is not production-verified yet.

## External integrations not yet production-verified

- Crawl4AI.
- Redis/queue runtime if retained.
- Email outbound provider.
- WhatsApp Cloud API.
- Voice transcription.
- Freelancer/project hunting sources.
- Full preview/demo generation and deployment flow.

## Important production decisions

- Main UI is English; owner/operator summaries and reports are Persian.
- Paid operations fail closed through editable Cost Guard controls.
- Google Places is discovery/reference first; durable business data belongs in `businesses`, pipeline identity in `leads`.
- Avoid repeat paid enrichment by checking durable identity first.
- Cold outreach stays disabled until enrichment, audit, qualification, DNC, budget, send-window and response-handling gates are verified.
- OpenAI API auto-reload remains disabled.

## Handoff sentence for a new chat

> Read `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/MASTER_PLAN.md`, and `docs/EXECUTION_PLAYBOOK.md`. Google Places IDs-only discovery is production-verified and CONNECTED with 3 Muscat dental-clinic Place IDs. PR #24 selective enrichment and migrations 0024/0025 are production-deployed. Enrich exactly one existing candidate, verify one Place Details usage + one business + one lead + provenance + audit + zero outreach, then enrich the same candidate again to prove no second paid Place Details request occurs before moving to website/public-source enrichment.
