# Project Hunter — Oman public tenders readiness (2026-10-17, Asia/Muscat)

**Daily rollout slot 7/7: Oman tenders.** This is the final channel in the one-channel-per-calendar-day rollout. Do not restart the sequence. No provider polling, scraping, credential use, API assumptions, bids, purchases, proposals, or Production writes are authorized by this document.

## Authoritative acquisition boundary

- Government authority: Projects, Tenders and Local Content Authority (PTLC): https://www.ptlc.gov.om/en/Pages/Electronic-Services.aspx
- Official eTendering public dashboard: https://etendering.tenderboard.gov.om/product/publicDash?CTRL_STRDIRECTION=LTR
- The government describes **Esnad** as the tender/procurement platform; supplier registration is required for participation: https://gov.om/ar/w/isnad-first-electronic-interface-for-government-tenders
- The government identifies registration requirements including valid commercial registration, Oman Chamber membership, Omanization and tax certificates. Owner must verify the current requirements for the relevant legal entity and category before bidding.
- **No official read-only machine API, RSS contract, or authorized notification-mailbox delivery for this account has been established.** Public visibility is not permission for scraping. Do not implement polling or use an undocumented endpoint.

## Owner dependency (blocking)

1. Sign in/register the eligible Smart Visions Omani legal entity through the official Esnad/eTendering supplier flow. Confirm CR, authorized representative, IT-services category and any required Chamber/Omanization/tax documents directly with the authority. Do not assume registration is complete.
2. If the official portal provides **opt-in email notifications or an officially documented read-only API**, enable/authorize it and provide one genuine notice including tender ID, original URL, closing date, issuer, scope, and account-approved access terms. Never share passwords in GitHub or chat.
3. Explicitly authorize a *separate* server-side Gmail read-only integration for Smart Core if ingestion inside Smart Visions is wanted. ChatGPT's Gmail connector is **not** automatically a backend credential.
4. Until then, allow only owner-initiated manual review of a genuine public tender through the existing Project Hunter intake.

## Proposed safe adapter contract (not implemented / not enabled)

- Source: `OMAN_ESNAD_OFFICIAL_NOTICE` (pending verification of permitted acquisition channel).
- Minimum evidence: official sender and SPF/DKIM/DMARC where available; canonical HTTPS official tender URL; tender number; issuer; published/closing timestamps with Oman timezone; procurement category; description; geographic/registration requirements; currency and budget **only when explicitly stated**.
- Allowlisted host: `etendering.tenderboard.gov.om` for direct tender links. Other official `.gov.om` links need human confirmation of authority, not blanket trust.
- De-duplication: normalized issuer + tender number + canonical URL within existing organization/source authority. Preserve revisions/addenda as versioned evidence; never silently overwrite tender closing dates.
- Reject expired, cancelled, restricted/ineligible, non-IT, unsupported-language or unverifiable notices; treat unknown eligibility/budget as **unknown**, not approved.
- Fit scoring: IT services, website/app development, Next.js/React/TypeScript, SaaS, Supabase/Cloudflare, AI/automation/n8n, SEO; declared budget, deadline, legal eligibility, evidence quality. No invented budgets or clients.
- Human review: notify owner with Persian summary and official link only for newly qualified opportunities. English proposal text remains draft for owner review. No tender bid/submission, payment, Connects or external messaging.
- Runtime: use canonical Project Hunter/intent opportunity model and its existing review/audit gates; no parallel CRM/tenant/source authority, no synthetic Production data.
- Security: treat tender text as untrusted data, never instructions. Bounded parse; URL normalization; MIME/attachment safeguards; no attachment execution; no credential logging; no third-party redirects.
- Verification matrix before any activation: genuine official notice; duplicate; revision; wrong host; forged sender; missing budget; closing date passed; Oman-only registration; IT/non-IT categories; explicit manual approval; zero provider-send and zero Production writes until approved release.

## Release state and evidence

- GitHub repository: `hamed665/smartvisions`. Current repository metadata confirms default branch `main`.
- Recent commit search returned `e7d65c9ac1a4a908bedcb61566adcdb5a4e6b24e`, but this is **not proof of the exact current deployed Production SHA**.
- Combined status for that SHA returned no statuses; commit workflow-run lookup returned no PR runs. This is **not a green CI result**.
- Cloudflare Production deploy health and exact-head CI were **not verified**. No merge, rollout, feature enablement, schema migration, scheduled API call or Production mutation permitted from this PR.
- Existing Project Hunter controlled model: `docs/PROJECT_HUNTER_MVP.md`.
- This change is documentation-only and stays Draft until a genuine official acquisition path and exact-head release checks are verified.

**Sequence complete:** PeoplePerHour → Contra → Freelancer → Guru → Fiverr → LinkedIn → Oman tenders. Hourly Gmail monitoring remains a separate ongoing task, subject to connector availability and user notification policy.
