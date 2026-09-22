# Smart Visions Growth OS — Current Production State

**Reconciled:** 2026-09-23 (Oman, UTC+4)

This is the current operational handoff for Growth OS. Current `main`, routed Cloudflare Production and Production Supabase evidence override older planning documents, stale issue text and chat history.

## Production identity

- Repository: `hamed665/smartvisions`
- Branch: `main`
- Primary Production: `https://app.smartvisionsai.com`
- Runtime: Cloudflare Workers Paid
- Production Worker: `smartvisions-growth-os-production`
- Production Worker Route: `app.smartvisionsai.com/* -> smartvisions-growth-os-production`
- Production Supabase: `pkypexzpyfbikdnkrzvw`
- Latest runtime-changing Production merge: PR #178, merge commit `27e980e417ec52c64055c029b8ffa6c6c77ab961`
- Production Worker version at latest verified heartbeat: `562c495f-ceeb-4021-b2d9-122ddc04021b`
- Latest Business OS Production migration: `0070_crm_identity_foundation`, version `20260922164110`
- Latest Business OS runtime merge: PR #179, merge commit `efcf979ff15d32062b48928672a25128c521987a`
- Latest Business OS Production migration: `0071_customer_360_timeline`, version `20260922202957`
- Latest Cloudflare Production Worker version from deploy #332: `a78567d8-e4f9-484e-a62b-2bd8e47b8583`
- Production cron: exactly `*/2 * * * *`
- Release candidate: no scheduled trigger
- Old Vercel deployment: frozen rollback/history only; not a Production health source
- Master Tracker: GitHub Issue #18; useful for milestones but not authoritative over runtime/DB evidence

The Smart Visions Website repository and its Supabase project are separate and out of scope. The frozen historical Website paths inside this repository remain out of scope.

## Controlled-launch status

The core system is beyond platform construction and is in **controlled Oman launch validation**. This is not permission for broad autonomous outreach.

Current verified safety state after PR #178 Production promotion:

- Shadow Mode: **ON**
- Global Kill Switch: OFF
- Email pause: OFF
- WhatsApp AI pause: OFF
- Agents pause: OFF
- latest heartbeat: `failed=0`, acquisition `SKIPPED`, dispatch `SKIPPED`
- zero Email outbound outreach rows created after the PR #178 merge in the verification window
- zero WhatsApp outbound outreach rows created after the PR #178 merge in the verification window
- CRM Identity backfill: 47 identities, 47 links, zero conflicts and zero cross-tenant mismatches

Do not disable Shadow Mode merely because CI, transport or Production deployment are green. Scale only from measured real pilot evidence and an explicit owner decision.

## Recent Production work packages

### PR #178 — CRM Identity Foundation

Extended the existing CRM without creating a second CRM:

- `businesses` remains the canonical Company/Account;
- `leads` remains the current Lead/Opportunity foundation;
- tenant-scoped `crm_identities` and `crm_identity_links` normalize Email, Phone, WhatsApp and Instagram identity evidence;
- ambiguity fails closed as explicit conflict rather than auto-merging Businesses;
- Email and WhatsApp use identity-registry-first resolution with the exact legacy lookup retained as deployment compatibility fallback;
- audit stores identity fingerprints rather than copying raw normalized identity values;
- migration `0070_crm_identity_foundation` is live in Production as version `20260922164110`;
- Production backfill produced 47 identities and 47 links with zero conflicts;
- Cloudflare runtime evidence after the merge is Worker version `562c495f-ceeb-4021-b2d9-122ddc04021b`.

### PR #179 — Customer 360 Timeline

Production-verified read model over canonical CRM evidence:

- SECURITY INVOKER view + SECURITY INVOKER cursor RPC;
- authenticated-only timeline access; service-role restrictions remain unchanged;
- provider journals enrich delivery status but do not become duplicate timeline rows;
- 85 real timeline rows across 9 Businesses: 65 customer-visible, 20 internal;
- zero duplicate customer provider-ID groups;
- zero provider-journal standalone rows;
- zero customer-visible unsent rows;
- migration `0071_customer_360_timeline` is live as version `20260922202957`;
- Cloudflare Production Deploy #332 promoted exact merge SHA and reported Worker version `a78567d8-e4f9-484e-a62b-2bd8e47b8583`;
- routed Production and safe API/webhook smokes passed without invoking provider sends.


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

The latest verified Production runtime after PR #178 is Worker version `562c495f-ceeb-4021-b2d9-122ddc04021b`; the Production Cron remains exactly `*/2 * * * *`. Vercel Git deployment remains disabled and Vercel is not a Production health source.

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

For Business OS work, continue from the current dependency order without duplicating canonical stores. The active slice is PR #179 Customer 360 Timeline; it is intentionally a read model over existing evidence.

For controlled Oman launch behavior, the next runtime behavior change must still correspond to one of these:

1. a real Production defect;
2. a provider/configuration requirement needed for the controlled pilot;
3. measured pilot evidence showing a specific reply/qualification/handoff/market-allocation weakness.

If a proposal adds another Agent, another CRM/event store, another analytics stack or broader autonomy without a proven dependency, stop rather than adding architecture for decoration.
