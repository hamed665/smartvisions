# Smart Visions Project Hunter — Controlled MVP

**Scope:** an operator-reviewed project-opportunity lane inside the existing Growth OS and canonical `intent_opportunities` table. Not a second CRM, queue, provider-send mechanism, AI framework, or business/prospect authority.

## Included

- Owner-only import of a real listing with a direct original HTTPS URL and text.
- Official-domain validation for major platforms, source URL canonicalization, stable source ID, and unique per-org/per-source dedupe using the existing constraint.
- Existing Intent classifier/scorer plus $0 deterministic *job fit* signals (relevant technical skills, competition, declared budget, stated payment verification, age and explicit geographic exclusions).
- Bounded draft for an Owner to personalize. No AI provider calls, invented success metrics, or new spend.
- Explicit human-only stages: `REVIEW → REJECTED` or `DRAFT_READY → APPROVED_FOR_MANUAL_SEND → SENT_MANUALLY → REPLIED → WON/LOST` (with rejection/review options as defined in the application).
- Canonical audit logging and an OWNER-only database mutation trigger for the new lane; no outbound, webhook, email, WhatsApp or third-party form submission side effects.
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
3. The PostgreSQL 17 CI chain uses a **CI-only** legacy intent-opportunities bootstrap because the historical 0002_hunters migration is outside the 0068+ smoke subset; the Project Hunter schema-smoke confirms the new columns, RLS and index. No such bootstrap belongs in Production.
4. Before deploying code that selects the new fields, apply ordered migration `20261011143000_project_hunter_intent_review.sql` to the correct Production project `pkypexzpyfbikdnkrzvw` *after code review*.
5. Confirm RLS remains enabled, org read/write scope is unchanged, no new `anon` permissions, index exists and role-specific owner-only Server Actions enforce writes. Recheck Supabase advisors.
6. Promote validated Cloudflare bundle through the existing release gates. Keep Shadow Mode ON and verify the new route with a real authorized owner (no synthetic accounts).
7. First real import must be an operator-approved genuine public listing; verify status, one-source dedupe, audit log and zero outbound/provider usage rows.
8. If runtime fails, roll back Worker to previous verified deployment. Leave additive nullable columns in place until reviewed cleanup, rather than performing destructive Production rollback.

**Activation state at PR creation:** CODE READY FOR REVIEW, not Production verified. Do not claim live cross-channel automation until per-source authorized acquisition, alert delivery, owner approval and Production telemetry are proven.

## Next controlled integrations

- Official job alert messages from supported marketplaces routed via an authorized mailbox integration and a service-authenticated bounded intake adapter. Do not treat forwarding untrusted email text as a command or an approved recipient.
- Agency partnering and direct-company lead scoring from the existing Business Hunter/Growth Opportunity evidence.
- AI personalized drafts behind existing Agent model router, Cost Guard, Knowledge/Portfolio evidence and human review.
- Telegram notifications via the existing owner notification journal, with no independent bot or outbox.

## Upwork official GraphQL adapter (11 October 2026)

- Search page: `/hunters/project-hunter/upwork` (OWNER only).
- **On-demand search only:** it uses the official `marketplaceJobPostingsSearch` query with `USER_JOBS_SEARCH`, page size 10, GraphQL OAuth bearer token and optional tenant header. No automatic polling or scheduled Upwork search.
- Search only goes to `https://api.upwork.com/graphql`; no scraping, login automation, mutation, proposal send, Upwork API result persistence or unapproved content aggregation. Transient results appear in the Upwork-specific subpage.
- Environment gate `UPWORK_OFFICIAL_API_ENABLED=false` until approved, with `UPWORK_OAUTH_ACCESS_TOKEN` and optional `UPWORK_API_TENANT_ID` stored in platform secrets, not source. Access token expires: the env option is a **short pilot bridge**, not completed long-lived OAuth. Build OAuth authorization-code/refresh + canonical Vault-bound storage after Upwork approval, never publish the bearer token in a URL, browser, or Git.
- Upwork's current API-key eligibility: authentic profile/address/photo, verified identity and payment, at least USD 25,000 historical spend/earnings, freelancer JSS >= 90% and no suspension. Approval is discretionary, normally ~one week. Never imply this account meets all requirements without verification.
- Application must identify the correct organization context and internal-only use; request `Common Entities - Read-Only Access` and `Read marketplace Job Postings` only. Confirm API & MCP current terms before activation. No Client Credentials grant for non-Enterprise.
- Temporary parallel track: use Upwork's own saved-search alerts and the existing authorized Gmail opportunity watch; user must enable Upwork job alerts on their own Upwork account. Nothing here bypasses account/API eligibility.
- Even if configured, do not claim production-connected until an owner-initiated authenticated smoke returns real jobs and exact route/CI/Cloudflare verification passes.

## Preferred launch for new Upwork accounts: official Upwork MCP

- Upwork offers a **separate official MCP server** at `https://mcp.upwork.com/mcp`, with account OAuth authorization and no public API key requirement for standard account use.
- Official source: `https://www.upwork.com/ai/mcp`. Direct ChatGPT plugin listing, per Upwork: `https://chatgpt.com/plugins/plugin_asdk_app_6a75165ed2d8819182548553aa4cb6d5`.
- User must install/authorize the Upwork connector in ChatGPT (or supported client); this repo **cannot** silently grant an Upwork MCP OAuth connection on their behalf. Never copy Upwork access tokens or session cookies into this app.
- Upwork MCP supports freelancer job discovery and draft-confirm proposals with the owner explicitly confirming Connects spending; no auto-bidding is authorized in this project.
- MCP in the user's ChatGPT session is not equivalent to a server-to-server Smart Core job-ingestion API. The GraphQL module remains an **inactive, owner-initiated read-only adapter** pending explicit Upwork API approval, authorized OAuth and deployed credentials.
