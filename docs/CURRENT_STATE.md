# Smart Visions Growth OS — Current Production State

**Reconciled:** 2026-09-09 (Oman, UTC+4)

This is the current operational handoff for Growth OS. Current `main`, routed Cloudflare Production and Production Supabase evidence override older planning documents, stale issue text and chat history.

## Production identity

- Repository: `hamed665/smartvisions`
- Branch: `main`
- Primary Production: `https://app.smartvisionsai.com`
- Runtime: Cloudflare Workers Paid
- Production Worker: `smartvisions-growth-os-production`
- Production route: `app.smartvisionsai.com/* -> smartvisions-growth-os-production`
- Production Supabase: `pkypexzpyfbikdnkrzvw`
- Latest runtime-changing merge: PR #157
- Production merge commit: `2ece56d5b09e1d71e9e112a019d9a532d26c4e06`
- PR #157 head verified by CI: `9ca83256550113edb4a474f5eff7bd51d0a14cbd`
- Main CI on merge: #713, green
- Cloudflare Production Deploy on merge: #185, green
- Production Worker version after PR #157: `159ef50a-aa7e-453e-b2f7-bf28b2408cda`
- Production cron: exactly `*/2 * * * *`
- Release candidate: no scheduled trigger
- Old Vercel deployment: frozen rollback/history only; not a Production health source
- Master Tracker: GitHub Issue #18; useful for milestones but not authoritative over runtime/DB evidence

The Smart Visions Website repository and its Supabase project are separate and out of scope. The frozen historical Website paths inside this repository remain out of scope.

## Current controlled-launch state

Growth OS is in **controlled Oman launch operation**, not broad unrestricted outreach.

Production controls verified on 2026-09-09:

- Shadow Mode: **ON**
- Global Kill Switch: OFF
- Email pause: OFF
- WhatsApp AI pause: OFF
- Agents pause: OFF
- Oman market: enabled
- Oman timezone: `Asia/Muscat`
- canonical send window: `09:00-19:00`
- cold Email: enabled
- cold WhatsApp: disabled and not an authorization source
- verified-opt-in WhatsApp lane: enabled
- approved WhatsApp template: `smartvisions_business_intro_om`
- approved WhatsApp template language: `ar`

Do not globally disable Shadow Mode. Narrow, evidence-backed exceptions implemented in the canonical send path are the only supported way to cross the provider boundary.

## Daily Oman target — 2026-09-09

Production had a stale RUNNING daily target for `2026-09-08` and no current target for `2026-09-09`. On 2026-09-09 the stale target was paused and a new canonical daily target was activated using the existing campaign model and the existing owner full-automation authorization.

Current target:

- name: `Daily Controlled Oman Pilot — 2026-09-09`
- country: Oman
- city: Muscat
- target count: 5
- status: RUNNING
- `dailyOutreachTarget=true`
- `targetDate=2026-09-09`
- `outreachMode=CONTROLLED`
- `shadowModeRequired=true`
- `outreachEnabled=true`
- `autoApprovalEnabled=true`
- `automatedSendingEnabled=true`
- `manualReviewOnly=false`
- `automationAuthorization=OWNER_REQUESTED_FULL_AUTOMATION`
- `maxShadowDrafts=5`
- `autoAcquisitionEnabled=false`

The activation is audit-logged. Auto acquisition remains intentionally OFF while existing real Oman leads are available; do not spend provider calls merely to inflate CRM volume.

Immediate post-activation verification showed zero Email outbound rows and zero WhatsApp outbound rows for the Oman day at that check. This is expected until the scheduled evidence pipeline produces an eligible draft.

## Email autopilot truth

PR #156 added the narrow controlled Oman Email autopilot while retaining global Shadow Mode.

The path is allowed only when all canonical checks pass, including:

- current-day RUNNING Oman daily target;
- exact owner automation authorization in campaign config;
- evidence-backed Growth first touch;
- canonical Lead/Conversation/Business linkage;
- DNC/suppression and channel/agent state;
- market scope and `09:00-19:00` Muscat send window;
- mailbox quota and rolling send ledger;
- provider health;
- Cost Guard;
- mailbox health `HEALTHY`;
- explicit mailbox warmup readiness.

Current mailbox evidence on 2026-09-09:

- enabled: true
- health: `HEALTHY`
- warmup: `NOT_STARTED`
- configured daily limit: 5

Therefore automatic Email provider sends must remain held by the existing readiness gate. Do **not** mark the mailbox warmed merely to make automation move. Warmup state must reflect genuine operational readiness.

## WhatsApp first-touch truth

PR #157 added a verified-opt-in Oman WhatsApp lane. It does **not** authorize cold WhatsApp.

Canonical rules:

- public/Hunter-discovered WhatsApp numbers are lead/contact evidence only;
- `whatsappColdEnabled=false` remains correct;
- a durable, verified, purpose-bound marketing opt-in is required before first touch;
- allowed evidence types are `CUSTOMER_WHATSAPP_MESSAGE`, `CLICK_TO_WHATSAPP`, `WEBSITE_FORM`, or `SIGNED_OR_VERBAL_PERMISSION`;
- evidence must identify Smart Visions, marketing purpose, canonical recipient, opt-in time, verification time and source reference;
- latest opt-out overrides earlier opt-in;
- owner-recorded opt-in queues the approved Oman introduction in Shadow Approval;
- the approved template is `smartvisions_business_intro_om`, language `ar`, with exactly one business-name body parameter;
- owner approval and explicit controlled send are required for this lane;
- provider boundary rechecks current opt-in, canonical recipient/linkage, DNC/suppression, runtime controls, market window, provider state and Cost Guard;
- opt-out persists durable evidence, marks the Lead DNC and adds phone suppression;
- WhatsApp follow-up templates outside the 24-hour customer-service window also require durable marketing opt-in.

Production evidence at reconciliation:

- verified WhatsApp marketing opt-ins: 0
- WhatsApp opt-in Shadow drafts: 0
- WhatsApp outbound rows today: 0
- WhatsApp `SENT` rows today: 0
- WhatsApp provider usage events today: 0
- existing Oman Leads: 15
- existing Oman Leads in AUTO mode: 13
- existing Oman businesses with WhatsApp or phone contact evidence: 14

Do not fabricate opt-in for these existing businesses. The clean conversion path is permission first, then the controlled WhatsApp lane.

## Recent production work after PR #145

### PR #147 — mailbox quota truth

The evidence pipeline now uses the canonical rolling 24-hour outbound/provider ledger rather than legacy `mailboxes.sent_today` as quota authority.

### PR #148–#150 — sales and email boundary hardening

These fixes tightened current-service quote selection, mixed service rejection/selection parsing, qualification-summary boundaries and read-only email health verification. They did not activate outreach or create a new subsystem.

### PR #151 — daily Shadow cap

A daily evidence target must carry an explicit positive `maxShadowDrafts`; the pipeline clamps this to `target_count` and stops when the Oman-day cap is reached.

### PR #152–#153 — scoped evidence candidate ordering

Evidence candidates are restricted to active campaign city/industry scope, and contact-ready Tier A first-party evidence is prioritized before weaker candidates. No fabricated contact data is allowed.

### PR #154 — September chat-only offer

September 2026 Oman discounts are deterministic and chat-only. They are revealed only on price/discount intent, HOT/CLOSING state or strong buying intent. Meta/WhatsApp catalog pricing is unchanged. The AI Agent service remains the no-discount product.

### PR #155 — Muscat scheduled-agent window

Scheduled Growth OS work is allowed only from `09:00 <= Asia/Muscat < 19:00`. Exact boundary tests cover 08:59, 09:00, 18:59 and 19:00. Canonical provider send windows remain independently authoritative.

### PR #156 — controlled Oman Email autopilot

The existing scheduled pipeline may prepare evidence/drafts continuously, but only a current-day owner-authorized Oman target can auto-approve eligible Email Growth first touches. Provider sending additionally requires canonical market window, healthy provider/mailbox state, explicit warmup readiness, Cost Guard, DNC/suppression and exact linkage checks.

### PR #157 — verified-opt-in Oman WhatsApp lane

Added durable opt-in/opt-out evidence, approved Oman template wiring, Shadow Approval UI/action, provider-boundary rechecks and opt-out suppression. Cold WhatsApp remains disabled.

## Canonical runtime architecture — do not rebuild

Extend these existing primitives rather than duplicating them:

- Business / Lead / Campaign / Conversation CRM model;
- Google Places Hunter and deterministic qualification/service-fit logic;
- deterministic Website Audit cache/quota/idempotency path;
- Multi-Agent pipeline: Intent Discovery, Conversation Psychology, Business Analyst, Culture/Locale, Sales & Marketing, Evidence Checker, Preview Director, Decision Orchestrator, Secretary and Relevance Checker;
- Context Hydrator with real conversation memory, Knowledge/Prompt versions, Services, Pricing, locale and approved Portfolio evidence;
- `ZERO_COST / LIGHT / FULL` selective routing;
- OpenAI model router and Cost Guard;
- canonical provider-bound outbound send gate;
- Email/WhatsApp webhook journals and idempotency;
- `agent_runs.request_key` logical-run claim/replay boundary;
- Follow-up / Automation primitives;
- Cloudflare scheduled executor;
- Telegram Owner Assistant/control plane;
- versioned `knowledge_versions` / `prompt_versions`;
- approved Portfolio matcher and existing Preview infrastructure.

Do not add a second CRM, conversation store, Knowledge Base, pricing store, recommendation engine, analytics/event store, queue/outbox, Agent framework or Preview engine without a concrete Production blocker proving the existing primitive cannot safely meet the requirement.

## Canonical outbound safety

Every provider-bound outbound action must re-read persisted state and fail closed as applicable on:

- global Kill Switch;
- channel / Agent pause;
- Shadow Mode and the exact narrow exception being used;
- Lead DNC/status/mode;
- Conversation stage/mode/Human takeover;
- suppression;
- canonical recipient identity;
- market enabled/timezone/local send window;
- WhatsApp 24-hour/template and verified marketing opt-in policy;
- Email mailbox health, warmup readiness and rolling quota ledger;
- approval state;
- Cost Guard/provider quota;
- canonical campaign authorization for controlled autopilot paths.

Approval earlier in the flow never bypasses a later safety-state change.

## Services, catalog and pricing

- enabled Growth OS Services: 7 at the last verified catalog reconciliation;
- approved Meta/WhatsApp Catalog contract: 7 items;
- canonical quote pricing remains `services` + `service_prices`;
- Meta product identity is separate from Growth OS quote-pricing truth;
- September discount behavior is chat-only and does not mutate Meta Catalog;
- flexible/custom production scope may require Human confirmation rather than an invented price;
- no second pricing table or catalog-pricing source is allowed.

## Provider/runtime state

Latest durable launch reconciliation retains these provider states unless fresher runtime evidence supersedes them:

- `GOOGLE_PLACES / DISCOVERY`: CONNECTED, enabled
- `OPENAI / AI`: CONNECTED, enabled
- `META / WHATSAPP`: CONNECTED, enabled
- `EMAIL_PROVIDER / EMAIL`: CONNECTED, enabled
- WhatsApp Voice: production-proven
- Preview public delivery: production-proven
- Telegram Owner command/control plane: production-proven
- `CRAWL4AI / AUDIT`: NOT_CONFIGURED and optional
- `META / INSTAGRAM`: NOT_CONFIGURED and intentionally deferred
- `REDIS / QUEUE`: NOT_CONFIGURED and unnecessary at current scale

`CONNECTED` is durable evidence, not a substitute for current provider health. Provider-boundary checks remain authoritative.

## Cost rules

Canonical Cost Guard remains the budget source of truth; legacy `system_controls.monthly_budget_usd` is not a second budget authority.

Rules:

- deterministic/cache work before paid AI/provider work;
- existing real candidates before paid acquisition when useful supply exists;
- atomic reservation/accounting at paid boundaries;
- no blind retry after ambiguous provider acceptance;
- deep AI and acquisition remain quota-bound;
- no paid smoke solely to refresh a dashboard badge when durable evidence already proves the path.

## Manual/account-level hardening

These remain account settings, not excuses to create application subsystems:

- Supabase Auth leaked-password protection was previously reported disabled; enable it when the available plan/control permits it.
- GitHub `main` was previously reported unprotected; repository settings should require PR/CI and block force-push/delete when permissions permit it.

## Next clean work

Do not invent another feature roadmap. Continue only from verified operational evidence:

`real business evidence -> deterministic qualification/service fit -> smallest useful recommendation or NO_RECOMMENDATION -> selective Agent reasoning -> Shadow/approval/human gates -> canonical provider boundary -> durable result evidence -> measured learning`

Immediate operational priorities after this reconciliation:

1. let the current `2026-09-09` target consume existing eligible Oman evidence up to the explicit cap;
2. verify any generated Email draft is evidence-backed and that automatic provider send remains held while mailbox warmup is `NOT_STARTED`;
3. do not create WhatsApp marketing opt-in evidence unless real permission exists;
4. once genuine opt-in exists, exercise the PR #157 Shadow Approval path with the exact approved Meta template and verify durable provider outcome;
5. enable additional Hunter acquisition only after existing useful supply is exhausted and only within Cost Guard/provider quotas;
6. tune copy, industry allocation or service allocation only from real delivery/reply/handoff evidence.

The next code/config change must correspond to a real Production defect, a genuine provider/readiness requirement, or measured pilot evidence. Broader autonomy without evidence is not a reason to add architecture.
