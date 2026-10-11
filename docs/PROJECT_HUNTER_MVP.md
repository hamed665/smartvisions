# Smart Visions Project Hunter — Controlled MVP

**Scope:** an operator-reviewed project-opportunity lane inside the existing Growth OS and canonical `intent_opportunities` table. Not a second CRM, queue, provider-send mechanism, AI framework, or business/prospect authority.

## Included

- Owner-only import of a real listing with a direct original HTTPS URL and text.
- Official-domain validation for major platforms, source URL canonicalization, stable source ID, and unique per-org/per-source dedupe using the existing constraint.
- Existing Intent classifier/scorer plus $0 deterministic *job fit* signals (relevant technical skills, competition, declared budget, stated payment verification, age and explicit geographic exclusions).
- Bounded draft for an Owner to personalize. No AI provider calls, invented success metrics, or new spend.
- Explicit human-only stages: `REVIEW → REJECTED` or `DRAFT_READY → APPROVED_FOR_MANUAL_SEND → SENT_MANUALLY → REPLIED → WON/LOST` (with rejection/review options as defined in the application).
- Canonical audit logging for owner mutations; no outbound, webhook, email, WhatsApp or third-party form submission side effects.
- New `/hunters/project-hunter` route linked from existing Hunter center.

## What is deliberately NOT included

- Automatic Upwork/LinkedIn/Fiverr scraping, login, bidding, bulk messaging, browser bots, or email forwarding.
- A guaranteed 50 opportunities/day; the pipeline contains only actual source URLs supplied by an operator.
- A new CRM, business, contact identity, prospect or lead authority.
- Auto-promotion into `leads` from unverified posted demands.
- Paid AI processing, bulk imports, sourcing API credentials, Telegram auto-sends or bypassing Shadow Mode.
- Synthetic job postings, customer records, financial results or demo evidence in Production.

The existing Gmail-connected hourly opportunity watch may notify the owner about official new job alerts, but is **not** an authenticated ingestion connection to this runtime.

## Rollout and rollback

1. Check current `main`, open PRs, CI, Shadow Mode, Cloudflare deployment gate and Supabase advisors.
2. Merge only after lint, typecheck, full tests, PostgreSQL 17 chain, Next, Vinext, and Cloudflare scheduled verification are green, review threads resolved and safe runtime permission evidence exists.
3. Before deploying code that selects the new fields, apply ordered migration `20261011143000_project_hunter_intent_review.sql` to the correct Production project `pkypexzpyfbikdnkrzvw` *after code review*.
4. Confirm RLS remains enabled, org read/write scope is unchanged, no new `anon` permissions, index exists and role-specific owner-only Server Actions enforce writes. Recheck Supabase advisors.
5. Promote validated Cloudflare bundle through the existing release gates. Keep Shadow Mode ON and verify the new route with a real authorized owner (no synthetic accounts).
6. First real import must be an operator-approved genuine public listing; verify status, one-source dedupe, audit log and zero outbound/provider usage rows.
7. If runtime fails, roll back Worker to previous verified deployment. Leave additive nullable columns in place until reviewed cleanup, rather than performing destructive Production rollback.

**Activation state at PR creation:** CODE READY FOR REVIEW, not Production verified. Do not claim live cross-channel automation until per-source authorized acquisition, alert delivery, owner approval and Production telemetry are proven.

## Next controlled integrations

- Official job alert messages from supported marketplaces routed via an authorized mailbox integration and a service-authenticated bounded intake adapter. Do not treat forwarding untrusted email text as a command or an approved recipient.
- Agency partnering and direct-company lead scoring from the existing Business Hunter/Growth Opportunity evidence.
- AI personalized drafts behind existing Agent model router, Cost Guard, Knowledge/Portfolio evidence and human review.
- Telegram notifications via the existing owner notification journal, with no independent bot or outbox.
