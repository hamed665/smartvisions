# Smart Visions Growth OS — Current Production State

**Reconciled:** 2026-09-07 (Oman, UTC+4)

This is the current operational handoff for Growth OS. Current `main`, routed Cloudflare Production and Production Supabase evidence override older planning documents, stale issue text and chat history.

## Production identity

- Repository: `hamed665/smartvisions`
- Branch: `main`
- Primary Production: `https://app.smartvisionsai.com`
- Runtime: Cloudflare Workers Paid
- Production Worker: `smartvisions-growth-os-production`
- Production Worker Route: `app.smartvisionsai.com/* -> smartvisions-growth-os-production`
- Production Supabase: `pkypexzpyfbikdnkrzvw`
- Latest runtime-changing Production merge: PR #145, merge commit `fc569a460039afb43eded9ec96f4a9f049d44e47`
- PR #145 runtime Worker version at verification: `18168cc7-170d-4999-94fc-2c7a44bb83f4`
- Main CI: #673, green on the exact merge SHA
- Cloudflare Production Deploy: #145, green on the exact merge SHA
- Production cron: exactly `*/2 * * * *`
- Release candidate: no scheduled trigger
- Old Vercel deployment: frozen rollback/history only; not a Production health source
- Master Tracker: GitHub Issue #18; useful for milestones but not authoritative over runtime/DB evidence

The Smart Visions Website repository and its Supabase project are separate and out of scope. The frozen historical Website paths inside this repository remain out of scope.

## Controlled-launch status

The core system is beyond platform construction and is in **controlled Oman launch validation**. This is not permission for broad autonomous outreach.

Current verified safety state after PR #145 Production deploy:

- Shadow Mode: **ON**
- Global Kill Switch: OFF
- Email pause: OFF
- WhatsApp AI pause: OFF
- Agents pause: OFF
- zero outbound `SENT` outreach rows created from the PR #145 merge through post-deploy verification
- zero Email `SENT` rows in that window
- zero WhatsApp `SENT` rows in that window
- zero WhatsApp outbound events in that window
- zero Conversation `SENT` rows in that window
- zero new Agent runs created by the deploy/smoke process

Do not disable Shadow Mode merely because CI, transport or Production deployment are green. Scale only from measured real pilot evidence and an explicit owner decision.

## Recent Production work packages

### PR #142 — Runtime reliability and operational truth

Closed observed Production drift without a new subsystem:

- Production scheduled cadence remains `*/2`;
- durable runtime evidence carries Worker-version provenance and bounded freshness;
- effective campaign/integration state is derived from real runtime evidence;
- Website Audit provider output is normalized before persistence;
- email quota reconciliation uses the existing outbound/provider event ledgers rather than a stale counter.

### PR #143 — Conversation memory and grounded sales behavior

Extended the existing conversation/handoff/CRM stores:

- conversation-scoped memory uses only real customer `RECEIVED` messages and actually `SENT` Agent/Human replies;
- Draft/Approval Required/Blocked/Failed text is excluded from customer-visible memory;
- durable `sales_state` tracks corrections, rejected services, deliverables, production needs, location/date/budget evidence and human-confirmation requirements;
- repeated-known questions, rejected-service recommendations and fake operational commitments are deterministically blocked;
- HUMAN → AUTO resume clears resolved handoff flags while preserving durable sales facts;
- handoff idempotency reuses `handoff_events`; no parallel task/journal system was created.

Production migrations `0063_conversation_sales_state_and_handoff_idempotency` and `0064_clear_resolved_sales_handoff_on_resume` are applied and verified on Growth OS Supabase.

### PR #144 — Approved catalog integration and conversion attribution

Reconciled the approved seven-item Meta/WhatsApp catalog with the existing Growth OS code without creating a second pricing or analytics system:

- approved catalog content IDs and service aliases are mapped to existing Growth services;
- `service_prices` remains the only quote-pricing source;
- automatic product-card recommendation is suppressed on direct price questions where provider-side catalog price could conflict with the canonical quote;
- deterministic Product Sent → Delivered / Read → reply / Human handoff attribution reuses existing WhatsApp, outreach and handoff ledgers;
- no fabricated product click/view metric is shown;
- Reports extends the existing analytics surface rather than creating a new store/UI stack.

### PR #145 — Sales efficiency guardrails and measured learning

Improved reply discipline without claiming unproven conversion lift:

- explicit ready-to-start intent in English, Gulf/Omani Arabic and Persian moves to Human instead of extending qualification;
- unnecessary location/date/budget/decision-maker questions are blocked when canonical sales state does not require them;
- genuinely required operational questions remain allowed for custom production scopes;
- direct price questions use the exact canonical configured service amount/currency when available;
- Secretary fallback may read canonical `serviceKnowledge.marketPrice`; no duplicate pricing table exists;
- existing market `maxReplyWords` is enforced;
- response-efficiency metrics are attached to the existing Agent trace;
- Reports aggregates only explicit new `salesEfficiency` evidence and does not retroactively score historical runs.

Production baseline after deploy: **37 historical Agent runs and 0 `salesEfficiency` samples**. Reports therefore correctly begins at `0 measured drafts`; future learning must come from new real Agent runs.

## Canonical runtime architecture — do not rebuild

The following remain canonical and should be extended rather than duplicated:

- Business / Lead / Campaign / Conversation CRM model;
- Google Places Hunter and deterministic qualification/service-fit logic;
- Website Audit cache/quota/idempotency path;
- Multi-Agent pipeline: Intent Discovery, Conversation Psychology, Business Analyst, Culture/Locale, Sales & Marketing, Evidence Checker, Preview Director, Decision Orchestrator, Secretary and Relevance Checker;
- Context Hydrator with real conversation memory, Knowledge/Prompt versions, Services, Pricing, locale and approved Portfolio evidence;
- `ZERO_COST / LIGHT / FULL` selective routing;
- OpenAI model router and Cost Guard;
- canonical provider-bound outbound send gate;
- Email/WhatsApp webhook journals and idempotency;
- `agent_runs.request_key` logical-run claim/replay boundary;
- existing Follow-up / Automation primitives;
- Cloudflare scheduled executor;
- Telegram Owner Assistant/control plane;
- versioned `knowledge_versions` / `prompt_versions`;
- approved Portfolio matcher and existing Preview infrastructure.

Do not add a second CRM, conversation store, Knowledge Base, pricing store, recommendation engine, analytics/event store, queue/outbox, Agent framework or Preview engine without a concrete Production blocker proving the existing primitive cannot safely meet the requirement.

## Canonical outbound safety

Every provider-bound outbound action must re-read canonical persisted state and fail closed as applicable on:

- global Kill Switch;
- channel / Agent pause;
- Shadow Mode and any narrowly proven exception;
- Lead DNC/status/mode;
- Conversation stage/mode/Human takeover;
- suppression;
- canonical recipient identity;
- market enabled/timezone/local send window;
- WhatsApp durable inbound evidence and exact 24-hour/template policy;
- Email mailbox health/ledger;
- approval state;
- Cost Guard/provider quota.

Approval earlier in the flow never bypasses a later safety-state change.

## Conversation / sales intelligence truth

The Agent stack is collaborative and real:

`Specialists -> Decision Orchestrator -> Secretary -> Relevance Checker`

Runtime context includes authoritative Lead/Business/Conversation state, recent durable memory, current `sales_state`, enabled Services, canonical market pricing/floors/discount boundaries, locale style, active Knowledge/Prompts and approved Portfolio evidence.

Important behavioral rules now enforced deterministically include:

- Evidence Before Offer;
- `NO_RECOMMENDATION` is valid when evidence is insufficient;
- Portfolio Before Free Custom Work;
- no repeated questions for facts already known;
- no invented operational confirmation;
- no recommendation of an explicitly rejected service unless the customer reopens it;
- direct canonical price answer when the relevant configured price is known;
- at most the necessary qualification question, not a generic interrogation script;
- explicit start/payment/contract/meeting/custom-quote/high-risk cases remain Human-controlled.

## Services, catalog and pricing

- enabled Growth OS Services: 7 at the last verified catalog reconciliation;
- approved Meta/WhatsApp Catalog contract: 7 items;
- canonical quote pricing remains `services` + `service_prices`;
- Meta product identity is separate from Growth OS quote-pricing truth;
- flexible/custom production scope may require Human confirmation rather than an invented price;
- no second pricing table or catalog-pricing source is allowed.

## Provider/runtime state

Durable provider state at the latest launch reconciliation:

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

`CONNECTED` is durable evidence, not merely secret presence. Stale provider verification should render as stale operational evidence rather than silently becoming “healthy now.”

## Cloudflare deployment truth

Cloudflare is the Production baseline.

The permanent deploy path proves:

- exact green `main` SHA checkout;
- Growth Supabase read-only credential validation;
- Vinext compatibility/build;
- provider secret binding-name presence without printing values;
- isolated candidate with no Production route or Cron;
- safe candidate smoke and controlled SSR load;
- exact bundle promotion to Production;
- Production Growth Supabase binding re-assertion;
- Production Worker Route attachment;
- routed Production smoke;
- safe API/webhook rejection smoke with no outbound provider send.

The runtime bundle introduced by PR #145 was verified as Production Worker version `18168cc7-170d-4999-94fc-2c7a44bb83f4`; the Production Cron remained exactly `*/2 * * * *` at that verification.

## Cost and paid-boundary rules

Canonical Cost Guard remains the budget source of truth; legacy `system_controls.monthly_budget_usd` is not a second budget authority.

Rules remain:

- deterministic/cache work before paid AI/provider work;
- atomic reservation/accounting at paid boundaries;
- no blind retry after ambiguous provider acceptance;
- deep AI and acquisition remain quota-bound;
- no paid smoke solely to refresh a dashboard badge when durable evidence already proves the path.

## Known manual/account-level hardening items

These are not reasons to create application subsystems:

- Supabase Auth leaked-password protection was previously reported disabled; enable it in the Supabase project setting when the available plan/control permits it.
- GitHub `main` was previously reported unprotected; repository settings should require PR/CI and block force-push/delete when repository permissions allow it.

Do not add broad RLS policies merely to silence INFO-level advisor messages on intentionally service-only tables.

## Controlled Oman pilot rule

The next business-learning phase is a **tiny controlled pilot**, not another architecture phase:

- real evidence-qualified Oman businesses only;
- no fake CRM population;
- low volume;
- Shadow Mode stays ON;
- approvals/Human handoff stay authoritative;
- no blind follow-up sends;
- no free custom Preview as the default opener;
- no Instagram automation expansion;
- no Redis/queue expansion without measured need;
- monitor DNC/suppression, campaign state, Agent run idempotency, response-efficiency trace, approval state, Cost Guard, provider outcomes and replies;
- only after real samples exist should message/locale/industry/service allocation be tuned from measured results.

There is currently **no generic cold-outreach `SENT` cohort large enough to claim a winning script or conversion lift**. Response-discipline telemetry exists specifically so the pilot can create honest evidence instead of retrospective storytelling.

## Definition of next clean work

Do not invent another feature roadmap. Continue from the existing canonical path:

`real business evidence -> deterministic qualification/service fit -> smallest useful recommendation or NO_RECOMMENDATION -> selective Agent reasoning -> Shadow/approval/human gates -> canonical provider-boundary safety -> durable result evidence -> measured learning`

After the PR #145 reconciliation, the next code/config change must correspond to one of these:

1. a real Production defect;
2. a provider/configuration requirement needed for the controlled pilot;
3. measured pilot evidence showing a specific reply/qualification/handoff/market-allocation weakness.

If the proposal is merely another Agent, another CRM/store, another analytics stack or broader autonomy without pilot evidence, stop rather than adding architecture for decoration.
