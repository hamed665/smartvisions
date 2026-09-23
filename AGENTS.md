# Smart Visions Growth OS — Mandatory Agent Handoff

> **Read this file before changing code, database schema, infrastructure, integrations, outreach policy, AI behavior, pricing, or production settings.**

## Source of truth

Continue from repository and Production state, never from chat memory alone. Read in this order:

1. current `main` runtime code + exact Git SHA;
2. Production Supabase state in `pkypexzpyfbikdnkrzvw`;
3. current Cloudflare Production deployment at `https://app.smartvisionsai.com`;
4. `docs/CURRENT_STATE.md`;
5. this file for non-negotiable engineering/operational rules;
6. `docs/business-os-2027/MASTER_PROGRAM_SECTIONS.md` for stable future program Sections/Work Package IDs;
7. `docs/business-os-2027/NEXT_CHAT_HANDOFF.md` for the current continuation cursor;
8. older plans/Issue #18 only as historical planning context.

If any document conflicts with runtime/Production evidence, runtime and Production win. Reconcile the document after the change is proven.

## Project identity and boundaries

- Repository: `hamed665/smartvisions`.
- Product: **Smart Visions Growth OS**.
- Primary Production: `https://app.smartvisionsai.com` on Cloudflare Workers Paid.
- Production Worker: `smartvisions-growth-os-production`.
- Production Supabase ref: `pkypexzpyfbikdnkrzvw`.
- The Website repository `hamed665/smartvisions-website` is a separate project. Never modify it from Growth OS work.
- The historical `website/` directory and `.github/workflows/website-ci.yml` inside this repository are frozen/out of scope. Do not clean them up as part of Growth OS changes.
- The old Vercel deployment is rollback/history only and must not be used as the Production health baseline.
- Main Control Center language: English. Owner/operator explanations, translations, summaries and handoff context may be Persian.

## Current runtime architecture — do not rebuild

The following are already canonical and must be extended rather than duplicated:

- Lead/Business/Conversation CRM model;
- Google Places Hunter and deterministic qualification/service-fit logic;
- Website Audit and its cache/quota/idempotency controls;
- Multi-Agent pipeline: Intent Discovery, Conversation Psychology, Business Analyst, Culture/Locale, Sales & Marketing, Evidence Checker, Preview Director, Decision Orchestrator, Secretary and Relevance Checker;
- Agent Context Hydrator with conversation memory, active Knowledge/Prompts, Services, Pricing, locale and portfolio evidence;
- `ZERO_COST / LIGHT / FULL` selective routing;
- OpenAI model router and Cost Guard;
- canonical outbound send gate;
- durable Email/WhatsApp webhook journals and idempotency;
- `agent_runs.request_key` claim/replay boundary;
- Follow-up jobs and Automation Rules storage/executor primitives;
- Cloudflare scheduled executor;
- Telegram Owner Assistant/control plane and notification journal;
- versioned `knowledge_versions` / `prompt_versions` publishing;
- approved Portfolio matcher;
- Preview infrastructure for explicit/controlled cases only.

Do not add Redis, a second queue/outbox, a second Knowledge Base, another recommendation engine, another portfolio system, another automation system or another Agent framework unless Production evidence proves the existing primitive cannot meet the requirement.

## Product operating principles

1. **Evidence Before Offer.** Missing evidence is allowed to produce `NO_RECOMMENDATION`.
2. **Portfolio Before Free Custom Work.** Approved relevant Portfolio examples come before custom Preview work. Custom Preview requires an explicit customer request or an approved controlled internal case.
3. **Deterministic Before Paid AI.** Cache/rules/evidence gates run before paid model/provider work where possible.
4. **Market Fit Before Product Push.** A missing website alone is not proof that Website Build should be sold.
5. **Owner Brain Before Generic AI Knowledge.** Reuse versioned `knowledge_versions`; owner-reviewed Knowledge never overrides hard safety/pricing/DNC rules.
6. **LLM suggests; deterministic code has authority.** Models do not own provider side effects.
7. **No uncontrolled API spending.** Every paid boundary uses runtime safety + Cost Guard + durable accounting/reconciliation.
8. **No blind retry across paid or externally visible boundaries.** Provider acceptance and ambiguous failures use existing claims/journals/reconciliation semantics.
9. **Human handoff for high-risk commercial decisions.** Special discounts, contracts, payment, complaints, meetings, explicit human requests, unsupported claims and low-confidence cases remain human-controlled.
10. **No fake prospects.** Hunter must never manufacture businesses/customers to populate CRM.

## Canonical safety boundaries

Every provider-bound outbound path must use canonical persisted state rather than caller-supplied safety claims. The provider-boundary gate must recheck, as applicable:

- global Kill Switch;
- channel/Agent pause;
- Shadow Mode and any narrowly verified exception;
- Lead DNC/status/agent mode;
- Conversation stage/mode/human takeover;
- suppression list;
- canonical recipient identity;
- market enabled/timezone/local send window;
- WhatsApp durable inbound evidence and exact 24-hour rule;
- Email mailbox health/ledger;
- approval state where required;
- Cost Guard/provider quota.

A message approved earlier must still be blocked if DNC, suppression, human takeover, pause, Kill Switch, market window or recipient identity changes before Provider invocation.

## Reliability boundaries

- Business identity: existing Google Place/domain dedupe.
- Google Place Details: durable discovery journal and cache; no blind paid replay.
- Website audit: TTL cache + quota + one-RUNNING-per-business semantics.
- Inbound AI: stable request key + `agent_runs`; COMPLETED replays, PROCESSING races do not duplicate paid work, ambiguous/failed work remains controlled.
- Voice: media/transcription cache and stale-processing recovery semantics.
- Preview/content: stable brief identity and controlled lifecycle.
- Email/WhatsApp send: pre-provider claim + canonical final gate + reconciliation-only behavior after ambiguous/provider-accepted boundaries.
- Provider webhook: verify → persist idempotently → fast ACK; do not synchronously spend paid AI inside provider retry delivery.
- Cloudflare scheduler: Production Worker only. Release Candidate must have no scheduled trigger and runtime code must fail closed unless `DEPLOYMENT_ENV=production`.

## Current safety/cost defaults

These are runtime-editable values in Production, not constants to duplicate in code:

- Shadow Mode: ON.
- Global Kill Switch: OFF.
- Email pause: OFF.
- WhatsApp AI pause: OFF.
- Agents pause: OFF.
- monthly total budget: `$25`;
- OpenAI `$10`, Google Places `$5`, Email `$4`, WhatsApp `$3`, reserve `$3`;
- warning/throttle/critical/hard stop: `70 / 85 / 95 / 100%`;
- daily new leads: `50`;
- daily website audits: `15`;
- daily deep AI runs: `10`;
- max AI runs per Lead: `20`;
- max voice duration: `180s`;
- max automatic retries: `1`;
- website audit cache: `30 days`;
- Router Default low-cost model: `gpt-5.6-luna`;
- Router Default high-reasoning model: `gpt-5.6-terra`.

The legacy `system_controls.monthly_budget_usd` is not the Cost Guard source of truth.

## Provider/runtime state

Current durable Production state is maintained in `docs/CURRENT_STATE.md`. As of the pre-pilot reconciliation:

- Google Places / Discovery: CONNECTED.
- OpenAI / AI: CONNECTED.
- Meta / WhatsApp: CONNECTED.
- Email Provider / Resend: CONNECTED.
- WhatsApp Voice: production-proven.
- Preview public delivery: production-proven.
- Telegram owner command/control plane: production-proven.
- Telegram notification journal contains successful events.
- Crawl4AI: NOT_CONFIGURED and optional.
- Instagram: NOT_CONFIGURED and intentionally deferred.
- Redis: NOT_CONFIGURED and unnecessary at current scale.
- Cloudflare Production scheduler: exactly `*/2 * * * *` on Production only; Release Candidate has no Cron.

`CONNECTED` means durable evidence, not merely a configured secret.

## Agent / Growth Brain current truth

- Specialist → Orchestrator → Secretary → Relevance Checker collaboration is real.
- Context hydration includes conversation memory, Knowledge/Prompt versions, Services, market Pricing/discount boundaries, locale style and approved portfolio context.
- Secretary receives a small relevant Knowledge subset directly so Knowledge-only facts are not lost through multi-agent compression.
- `agent_settings.model = null` means Router Default. Temperature/Max Token controls that runtime did not honor are not authoritative UI controls.
- Conversation lifecycle uses the canonical Production stage taxonomy. Real linked customer replies move reply-driven stages (`NEW`, `WAITING_CUSTOMER`, `UNANSWERED`, `FOLLOW_UP_DUE`) to `ACTIVE` while HUMAN/PAUSED/high-intent/terminal stages remain preserved.
- Active `smartvisions_customer_journey` v2 enforces Evidence Before Offer, `NO_RECOMMENDATION`, Portfolio Before Free Custom Work and explicit-request custom Preview behavior.

## Engineering rules

- Work through isolated branches and minimal coherent PRs.
- Never modify the Website repo or frozen legacy Website paths while working on Growth OS.
- Never merge with failing install/lint/typecheck/tests/build.
- Runtime-changing Cloudflare work must also pass Vinext build/compatibility and scheduled-bundle invariants where applicable.
- Inspect real PR review threads before merge.
- Merge using the exact expected head SHA.
- Verify the exact merged commit in routed Cloudflare Production after merge.
- Prefer least privilege. Never solve authorization problems with broad grants.
- Before **every** Supabase operation, reread the Supabase skill/instructions.
- Supabase DDL/policy/grant changes use migrations; data reads/verifications use the read/query path and every change must be verified afterward.
- Run Supabase Advisors after relevant schema/security work.
- Never expose or commit tokens, API keys, passwords, webhook secrets, provider credentials or service-role keys.
- Historical failure rows are evidence. Do not delete them just to make dashboards visually clean.
- Do not run paid smoke tests simply to refresh a badge when durable evidence already proves the provider.

## Definition of done

A change is complete only when applicable items are true:

- schema/RLS/permissions are correct;
- runtime/API/UI behavior is real, not decorative;
- failure states fail closed;
- safety, idempotency and retry semantics are explicit;
- meaningful mutations are audited;
- paid boundaries are Cost Guard protected;
- important business/safety logic has tests;
- exact-head lint, typecheck, tests and build are green;
- applicable Cloudflare bundle checks are green;
- review threads are resolved/absent;
- merge uses expected head SHA;
- routed Cloudflare Production is verified on the merge commit;
- Production DB state is verified where relevant;
- `docs/CURRENT_STATE.md` is reconciled after meaningful Production changes.

## Controlled launch rule

Do **not** turn Shadow Mode off merely because transport and tests are green. The first Oman launch is a tiny controlled pilot:

- evidence-qualified real businesses only;
- no fake CRM population;
- low volume;
- Shadow/approval/human gates remain authoritative;
- no blind follow-up sends;
- no free custom Preview as a default sales tactic;
- monitor Cost Guard, DNC/suppression, Agent runs, approval state and provider outcomes;
- scale automation only from measured results and an explicit owner decision.

The pre-pilot safety suite already covers positive interest, price objection/handoff, no-reply follow-up semantics, deterministic DNC, human takeover, provider-boundary Kill Switch/DNC checks, duplicate logical Agent-run replay and the exact WhatsApp 24-hour boundary. Do not replace these tests with live customer sends just to call the system “tested.”

## Immediate continuation rule

At the start of any new session, do not invent another roadmap. Verify current `main`, Cloudflare Production, Production Supabase controls/cost/provider state and `docs/CURRENT_STATE.md`, then read `docs/business-os-2027/MASTER_PROGRAM_SECTIONS.md` and `docs/business-os-2027/NEXT_CHAT_HANDOFF.md`.

Continuation is identified by **Section + Work Package ID**, never by a projected GitHub PR number. A work package may span multiple PRs without renumbering anything downstream. Actual PR numbers are evidence only after they exist.

The owner-approved planned continuation cursor after the Production-verified Segment baseline is `SECTION COMMUNICATION / COMM-CHATWOOT-SOURCE`, subject to fresh runtime evidence before implementation.

For that work, Chatwoot Community Edition source is the planned source-based Communication Plane. Smart Core remains authoritative for CRM/business truth and provider-action safety; Chatwoot must not bypass the canonical send gate. Proprietary Chatwoot `enterprise/` code is out of bounds unless a valid license is intentionally adopted.

Runtime/Production evidence always overrides stale historical handoffs.
