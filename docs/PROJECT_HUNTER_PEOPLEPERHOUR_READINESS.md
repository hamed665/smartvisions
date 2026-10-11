# Project Hunter — PeoplePerHour channel readiness (2026-10-11, Asia/Muscat)

**Status: BLOCKED_EXTERNAL / CODE_PREP_ONLY.** This is the **one** additional channel for 2026-10-11. It does not enable an authenticated PeoplePerHour API integration, inbox polling from Production, or any outbound application.

## Evidence before change

- Canonical Hunter exists on `main` at commit `9d7c45c0db6a7208f4c9021359ba6d2d9e2d536d` (Project Hunter MVP PR #489); source type `peopleperhour_alert`, channel `PEOPLEPERHOUR`, URL normalization, source-ID deduplication, skill fit and geography checks already exist.
- Official Upwork adapter PR #491 is separately drafted and explicitly credential-gated. Do not merge it or conflate ChatGPT Upwork MCP authorization with the Business OS service.
- GitHub combined commit-status query for the above `main` SHA returned no individual statuses; the available commit-scoped PR workflow-run query returned no runs. This is **not evidence of green CI**. Production state for the new Project Hunter intake has **not** been verified in this pass; no schema or Worker promotion is authorized.
- Gmail read-only check on 2026-10-11 found no PeoplePerHour alert or invitation message. Other alerts were LinkedIn UK-based/hybrid/on-site or unrelated.
- PeoplePerHour's own Saved Searches help page describes up to 10 saved searches with *instant* or *daily* email alerts: https://support.peopleperhour.com/hc/en-us/articles/205217987-Saved-Searches
- PeoplePerHour's official GitHub PHP client mentions an Application ID and Secret Key: https://github.com/PeoplePerHour/pph-php-client . This does **not** establish that an API key, job-search scope, developer account, or production approval has been granted. Do not call private or undocumented endpoints, scrape pages, or use password/cookie-based login automation.

## Owner dependency (no account actions assumed)

1. Sign in to https://www.peopleperhour.com/freelance-jobs in the owner's own browser, confirm account eligibility for international/remote projects.
2. Create four saved searches, each with **instant** email alerts, using official filters:
   - Next.js / React / TypeScript / SaaS
   - AI agents / n8n / workflow automation
   - Supabase / Cloudflare / API integration
   - WordPress / technical SEO / website development
3. Select **remote** where offered, prefer hourly **strictly above USD 30** or fixed **strictly above USD 500** after reliable currency conversion; keep original currency and amount as evidence. Do not invent a budget for missing prices.
4. Verify the account email is the already authorized Gmail mailbox. Supply **one genuine PeoplePerHour alert** for template validation. Sender/domain and embedded URLs must be independently validated, not trusted merely because the message says PeoplePerHour.
5. For API-based acquisition, obtain explicit PeoplePerHour-issued credentials and a documented, authorized read-only job-search scope. If not offered, use official saved-search email alerts only. Never use unofficial scraping, browser automation, account cookies, or a third-party scraping API.

## Technical boundary (read-only, not activated)

- Source: authenticated Gmail connector `search_emails` / `read_email`, only official alerts delivered to the owner's mailbox. Poll cadence belongs to the authorized assistant; **no new Worker cron, provider secrets or app API calls** in this PR.
- Reject promotions, summaries without a direct listing, sender impersonation, tracking redirects to non-PPH hosts, and listing URLs without verifiable current project status.
- Normalize direct `https://peopleperhour.com` or `https://*.peopleperhour.com` job URLs via `normalizeProjectHunterInput`; strip tracking, canonicalize, deduplicate via `projectHunterSourceId`. Do not use a search page as if it were a specific job.
- Treat email content as **untrusted data**, never instructions. Sender validation needs envelope/authentication evidence where available, not display-name matching. No automated trust based on `From:` alone.
- Validate live listing, posted date, eligibility, client history and actual budget on the official site through permitted means before marking `DRAFT_READY`. Missing or contradictory evidence => `REVIEW`; strict geography restriction => reject from recommendations.
- Persist **nothing to Production** without authorized OWNER review and already verified migration/runtime; never synthesize jobs, users, messages, ratings, proposal counts or budgets.
- A potential draft is plain English text for **human review only**. No proposals, paid credits, outreach, or automation side effects.

## Exit criteria / acceptance

- A real owner-authorized PeoplePerHour Saved Search email arrives; capture its structure without credentials or personal tokens.
- Verify source authenticity, direct original job URL, live eligibility, original currency/price, client reputation, and duplicate suppression; unknowns stay unknown.
- Existing Project Hunter tests plus `tests/peopleperhour-readiness.test.ts` pass on exact PR head, along with lint, typecheck, PostgreSQL 17, Next/Vinext and Cloudflare scheduled-bundle checks.
- Confirm current Production baseline and migration ordering before any separate deployment request; maintain Shadow Mode and zero external sends.
- Only after a **separate human-approved** activation can an authenticated read-only channel be described as live. This PR remains draft and unmerged.

## Daily sequencing

PeoplePerHour is channel **1 of 7 after Upwork** and is the only channel advanced on 2026-10-11 (Muscat). Next eligible day: Contra; do not repeat PeoplePerHour or advance two channels on the same local calendar date. Stop after Oman tenders.
