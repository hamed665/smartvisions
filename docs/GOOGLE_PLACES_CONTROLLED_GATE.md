# Google Places Controlled Discovery Gate

This document defines the first production gate for Business Hunter before any autonomous acquisition loop is allowed.

## Safety model

- Server-only credential: `GOOGLE_PLACES_API_KEY`.
- Owner-only production sample UI: `/hunters/google-places`.
- Oman only for the first production gate.
- Maximum 3 Place IDs per controlled sample.
- Text Search requests use the `places.id` field mask only.
- Cost Guard is evaluated before every Google Places request.
- Google Places provider budget must be greater than zero and must have room for the operation.
- IDs-only search is still metered even though the current Google SKU has unlimited free usage.
- Place Details uses a conservative `$0.02` internal budget reserve per request because the current field mask includes Enterprise fields such as phone and website.
- Discovery rows are deduplicated against existing `discovery_records` before insertion.
- No campaign, email, WhatsApp message, outreach schedule or lead contact is triggered by the controlled sample.
- Provider health is `READY` when a credential exists but has not been production-verified and `CONNECTED` only after the controlled production sample succeeds.

## Production verification sequence

1. Merge the implementation PR only with green lint, typecheck, tests, build and Vercel preview.
2. Apply migration `0022_google_places_connected_status.sql` to production Supabase.
3. Configure `GOOGLE_PLACES_API_KEY` in Vercel Production and Preview. Never commit the key.
4. Confirm the Cost & Usage panel has a small non-zero Google Places provider budget.
5. Open `/hunters/google-places` and review the dry-run preview.
6. Run one sample with `Muscat`, `dental clinic`, limit `3`.
7. Confirm:
   - provider health becomes `CONNECTED`;
   - a `GOOGLE_PLACES / TEXT_SEARCH_IDS_ONLY` usage event is recorded;
   - returned Place IDs are persisted in `discovery_records`;
   - duplicates are not reinserted;
   - audit log records `GOOGLE_PLACES_CONTROLLED_SAMPLE`;
   - no outreach is triggered.
8. Do not run Place Details, Crawl4AI or outbound automation until this gate is verified.

## Current Google billing assumptions

The runtime intentionally minimizes the field mask. As of the implementation date, Google documents Places API Text Search Essentials (IDs Only) as unlimited free usage. The system still applies Cost Guard and records a zero-cost usage event because provider requests must remain observable even when the current SKU price is zero.

Place Details is treated more conservatively. The existing field mask requests `websiteUri` and `nationalPhoneNumber`, which are Enterprise fields. Smart Visions reserves `$0.02` against its internal Google Places budget for each such request. This is a safety reserve, not a claim that the provider invoice will always charge exactly that amount.
