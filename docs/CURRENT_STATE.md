# Smart Visions Growth OS — Current Production State

**Reconciled:** 2026-09-05 (Oman, UTC+4)

This is the current operational handoff for Growth OS. Runtime code, Production Supabase and routed Cloudflare Production override older planning documents and chat history.

## Production identity

- Repository: `hamed665/smartvisions`
- Branch: `main`
- Primary Production: `https://app.smartvisionsai.com`
- Runtime: Cloudflare Workers Paid
- Production Worker: `smartvisions-growth-os-production`
- Production Worker Route: `app.smartvisionsai.com/* -> smartvisions-growth-os-production`
- Production Supabase: `pkypexzpyfbikdnkrzvw`
- Latest runtime-changing Production merge: PR #111, merge commit `a68ad45e473eca8ebec6f0cbbe781f3a2cddc79d`
- Old Vercel deployment: frozen rollback/history only; not a Production health source
- Master Tracker: GitHub Issue #18, historical/stale in places and never authoritative over current runtime/DB evidence

The Smart Visions Website repository and its Supabase project are separate and out of scope. The historical `website/` tree inside this repository is also frozen/out of scope.

## Pre-pilot status

The Growth OS core is **ready for a tiny controlled Oman pilot with Shadow/approval/human gates kept on**. This is not permission for broad autonomous outreach.

Current Production safety snapshot:

- Shadow Mode: **ON**
- Global Kill Switch: OFF
- Email pause: OFF
- WhatsApp AI pause: OFF
- Agents pause: OFF
- outbound `SENT` rows in the last 24 hours at reconciliation: **0**
- failed Agent runs in the last 24 hours: **0**
- enabled Automation Rules: **0**
- pending Follow-ups: **0**
- Telegram notification events: **4 total / 0 failed**

Current Conversation state after verified lifecycle backfill:

- `ACTIVE`: 2 linked real-reply conversations, one Email and one WhatsApp
- `NEW`: 1 deliberately PAUSED/requires-human internal row with no durable inbound; left untouched

## Cloudflare scheduler — VERIFIED CLEAN

PR #107 introduced the operational scheduler and PR #109 made scheduled internal execution Production-viable. Audit later found that both the release candidate and Production Worker inherited the same `*/2 * * * *` Cron.

PR #111 closed that drift and Production deployment logs prove:

- release candidate uses `DEPLOYMENT_ENV=candidate`;
- release candidate has **no scheduled trigger**;
- Production uses `DEPLOYMENT_ENV=production`;
- Production has exactly one Cron: `*/2 * * * *`;
- Worker code also fails closed and refuses scheduled work outside `DEPLOYMENT_ENV=production`;
- routed Production smoke is green;
- deployment smoke invoked no outbound provider send.

Do not restore a Candidate Cron. The release candidate exists for isolated smoke/load validation, not as a second operational executor.

## Canonical outbound safety — CLOSED

PR #106 introduced the provider-boundary canonical send gate over existing safety primitives. Caller input is not allowed to define canonical DNC, agent mode, market/timezone, recipient identity, Shadow state or WhatsApp 24-hour evidence.

The final provider-boundary gate rechecks, where applicable:

- Kill Switch;
- channel/Agent pause;
- Shadow Mode;
- Lead DNC/status/mode;
- Conversation stage/mode/human takeover;
- suppression;
- canonical recipient identity;
- canonical market/local send window;
- durable WhatsApp inbound evidence and exact 24-hour policy;
- Email mailbox health/ledger;
- approval state;
- Cost Guard/provider quota.

DNC or Kill Switch changes after approval still block the provider call. Human takeover and recipient/suppression drift also fail closed.

## Inbound operational loop — CURRENT TRUTH

Provider webhooks follow:

`verify -> persist idempotently -> fast ACK`

They do not synchronously spend paid AI inside provider retry delivery.

Cloudflare scheduled execution discovers durable inbound work and feeds the existing Agent endpoint using stable request keys. Existing `agent_runs.request_key` remains the atomic logical-run boundary; no Redis/new queue is required at current scale.

PR #110 fixed real Meta provider IDs containing unsafe request-key characters by deterministic canonicalization while preserving safe existing Email keys. The previously blocked WhatsApp inbound runs subsequently completed without duplicate paid work.

## Conversation lifecycle — VERIFIED ALIGNED

PR #111 aligned real linked replies with the canonical Conversation lifecycle:

- reply-driven stages `NEW`, `WAITING_CUSTOMER`, `UNANSWERED`, `FOLLOW_UP_DUE` move to `ACTIVE`;
- already `ACTIVE`, higher-intent, HUMAN, PAUSED and terminal stages are preserved;
- terminal Lead states are never reactivated by a later inbound message;
- Email and WhatsApp use the same shared lifecycle rule.

Production backfill updated only the two rows satisfying all of these conditions: `stage=NEW`, Conversation `AUTO`, not requires-human, Lead `REPLIED/AUTO`, and durable matching inbound `RECEIVED` evidence. The PAUSED/requires-human row was not changed.

## Multi-Agent sales intelligence — CURRENT TRUTH

The existing Agent architecture is canonical and must not be rebuilt.

Pipeline:

`Intent Discovery / Psychology / Business Analyst / Culture / Sales & Marketing / Evidence Checker / Preview Director -> Decision Orchestrator -> Secretary -> Relevance Checker`

Context hydration includes:

- authoritative Lead/Business/Conversation;
- recent conversation memory and summary;
- canonical Conversation stage/mode;
- active Knowledge and Prompt versions;
- Agent settings;
- enabled Services;
- canonical market Pricing/floor/discount boundaries;
- locale/tone profile;
- approved Portfolio evidence;
- canonical quote context where relevant.

Selective routing remains `ZERO_COST / LIGHT / FULL`. Deterministic work is preferred before paid model calls. Agent settings with `model=null` intentionally use Router Default.

## Growth Brain / Knowledge — VERIFIED

Canonical storage remains `knowledge_versions`; there is no second Knowledge Base.

Active Production Knowledge keys:

- `smartvisions_brand_positioning` v1
- `smartvisions_customer_journey` **v2**

Active Prompt versions: 0 by design. Hard safety/system behavior lives in code unless measured owner-tunable prompt content is justified.

`smartvisions_customer_journey` v2 was published through the existing OWNER-only atomic `publish_knowledge_version` function. The publisher uses locking/version allocation, deactivates the prior active version, inserts the new version and writes an audit event in one transaction.

v2 explicitly encodes:

- Evidence Before Offer;
- `NO_RECOMMENDATION` when evidence is insufficient;
- Portfolio Before Free Custom Work;
- custom Smart Preview only for an explicit customer request or an approved controlled internal case;
- canonical Pricing/discount rules;
- human escalation for custom terms, exceptional discounts, payment/contract, complaints, explicit human request and low confidence.

v1 remains in history and is inactive; it was not overwritten.

## Market fit / Portfolio / Preview

The existing deterministic service-fit engine is the recommendation foundation. Do not add a parallel recommendation engine.

Rules:

- a missing website alone is not proof of Website fit;
- market/industry/maturity/evidence determine the recommended service;
- `NO_RECOMMENDATION` is valid;
- approved Portfolio matcher is reused for relevant examples;
- custom Preview is not a default cold-sales tactic;
- existing Preview infrastructure remains for explicit customer requests and controlled internal cases.

## Services / Pricing / locale

Current Production counts at reconciliation:

- enabled Services: **7**
- `service_prices` rows: **37**
- pricing remains canonical in existing Pricing tables; Agent/Knowledge must never invent or duplicate prices.

## Cost Guard / paid AI — PRODUCTION

Canonical Production settings:

- monthly total budget: `$25`
- OpenAI: `$10`
- Google Places: `$5`
- Email: `$4`
- WhatsApp: `$3`
- reserve: `$3`
- warning / throttle / critical / hard stop: `70 / 85 / 95 / 100%`
- daily new leads: `50`
- daily website audits: `15`
- daily deep AI runs: `10`
- max AI runs per Lead: `20`
- max voice duration: `180s`
- max automatic retries: `1`
- audit cache: `30 days`
- Router Default low-cost model: `gpt-5.6-luna`
- Router Default high-reasoning model: `gpt-5.6-terra`

Recorded month spend during the pre-pilot audit was only about `$0.004858`, all OpenAI usage. The legacy `system_controls.monthly_budget_usd` is not a second source of truth.

Paid OpenAI Agent and Google Places operations use atomic reservations and later settlement/reconciliation. Ambiguous network/provider failures remain conservatively accounted rather than disappearing.

## Provider state

Production durable state:

- `GOOGLE_PLACES / DISCOVERY`: CONNECTED, enabled
- `OPENAI / AI`: CONNECTED, enabled
- `META / WHATSAPP`: CONNECTED, enabled
- `EMAIL_PROVIDER / EMAIL`: CONNECTED, enabled
- WhatsApp Voice: production-proven
- Preview public delivery: production-proven
- Telegram owner command/control plane: production-proven
- Telegram notification journal: successful events exist, no recorded notification failure at reconciliation
- `CRAWL4AI / AUDIT`: NOT_CONFIGURED, optional while deterministic audit is sufficient
- `META / INSTAGRAM`: NOT_CONFIGURED, intentionally deferred
- `REDIS / QUEUE`: NOT_CONFIGURED, unnecessary at current scale

A configured secret alone never upgrades an integration to CONNECTED.

## WhatsApp / Email / Voice / Preview durable proofs

Previously verified controlled Production paths remain valid:

- WhatsApp: real inbound -> linked Lead/Conversation -> Agent -> Shadow Approval -> owner approval -> canonical Catalog send -> SENT -> DELIVERED -> READ for INTERNAL_TEST.
- Email: branded outbound delivery and signed custom-domain inbound through Resend Receiving are proven.
- Voice: real WhatsApp voice media -> one logical cached OpenAI transcription -> no duplicate cost on replay.
- Preview: deterministic controlled Preview -> APPROVED -> internal share -> public token view -> VIEWED with no duplicate subsystem.

These historical transport proofs are not permission for broad autonomous outreach.

## Shadow pre-pilot behavior gate — CODE/CI VERIFIED

The full CI suite on PR #111 is green. Existing focused tests cover the agreed pre-pilot behavior set on the real policy/lifecycle primitives:

1. positive interest remains REVIEW while Shadow Mode is enabled;
2. price/discount objection escalates to HUMAN rather than inventing a deal;
3. no-reply follow-up schedule exists, while a customer reply removes follow-up work;
4. explicit English/Arabic/Persian DNC is detected deterministically and approved-send cannot bypass it;
5. human takeover blocks approved send and automation path;
6. provider-boundary Kill Switch flip blocks send;
7. completed logical Agent runs replay instead of paying/running again, while PROCESSING/FAILED work is not blindly duplicated;
8. WhatsApp free-form is allowed just inside 24 hours and blocked at exactly 24 hours.

The canonical-send suite also specifically verifies DNC after approval, suppression, recipient drift and Shadow fail-closed behavior.

Do not manufacture live customer sends simply to re-prove deterministic safety tests. During the first pilot, durable DB/approval/provider evidence should be monitored continuously while Shadow/approval gates remain on.

## Telegram Owner Assistant

Telegram control-plane history includes successful owner command runs. Latest audited command history was healthy and the notification journal contained 4 events with 0 failures.

Historical failed command rows are retained as evidence and must not be deleted for cosmetic reasons.

## Supabase Security Advisor

Current Advisor state contains one real manual hardening warning:

- **Leaked Password Protection Disabled** in Supabase Auth.

It also reports INFO for `telegram_command_runs` and `telegram_notification_events` having RLS enabled with no public policies. These tables are intentionally fail-closed/service-only; do not add broad policies merely to silence the Advisor.

The leaked-password setting is an Auth project setting, not a schema migration. Enable it in the Supabase dashboard if the current plan exposes the control.

## GitHub repository hygiene

`main` is currently reported as unprotected by GitHub. Runtime/CI discipline is good, but repository settings should still protect `main` with PR + required CI and block force-push/delete. This is an account/repository setting rather than an application-code change.

The old Vercel Git status can remain red because the Vercel account/deployment is frozen; it is not the canonical deployment gate. Cloudflare CI/deploy status is authoritative.

## Controlled Oman pilot rule

The first pilot may start only as a **tiny controlled pilot**, not broad autonomy:

- real evidence-qualified Oman businesses only;
- low volume;
- Shadow Mode remains ON;
- approval/human handoff remains authoritative;
- no fake leads;
- no blind follow-up sends;
- no free custom Preview by default;
- no Instagram automation;
- no Redis/queue expansion;
- monitor DNC/suppression, Conversation stage, Agent run idempotency, Cost Guard, approval state, Telegram alerts and provider outcomes;
- scale only after measured outcomes and an explicit owner decision.

## Definition of next clean work

Do not invent another architecture phase. Continue from:

`real business evidence -> deterministic qualification/service fit -> smallest useful recommendation or NO_RECOMMENDATION -> selective Agent reasoning -> Shadow/approval/human gates -> canonical provider-boundary safety -> durable result evidence -> measured learning`

If a future change proposes a second CRM/Knowledge/recommendation/Portfolio/automation/Agent stack, Redis without measured need, Vercel as the primary runtime, free custom Preview as default outreach, or disabling Shadow before controlled pilot evidence, stop and reconcile against current runtime and this document first.
