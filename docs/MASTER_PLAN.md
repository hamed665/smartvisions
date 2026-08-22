# Smart Visions Growth OS — Master Completion Plan

**Production V1 reconciliation:** 2026-08-22 (Oman, UTC+4)

This is the canonical product-scope map. For exact runtime/deployment status, read `docs/CURRENT_STATE.md` first. Historical implementation checklists are not allowed to override verified production reality.

## Product goal

Build an operator-controlled, cost-aware AI growth operating system that can:

- discover real business opportunities;
- enrich, deduplicate, score and qualify them;
- use deterministic website/digital evidence before expensive reasoning;
- route each opportunity to the right Smart Visions service lane;
- create localized offers, website previews and content proposals;
- conduct multilingual sales conversations safely;
- understand inbound text and voice;
- follow up within local-time/provider/DNC policy;
- hand off only when human judgment is materially required;
- track pipeline, provider health, cost, usage, outcomes and risk from one Control Center;
- preserve original customer context while giving the owner useful Persian summaries/translations.

Canonical controlled path:

`discover → dedupe/qualify → evidence → growth route → offer → localized draft → policy/cost/approval gate → controlled send → reply intelligence → follow-up/handoff → preview/content → close → reporting`

## Production V1 status

The core code/platform closure is implemented through PR #40. The actual sequence is:

- PR #36 ✅ Growth Intelligence & acquisition routing
- PR #37 ✅ AI Sales / Conversations / Outreach foundations
- PR #38 ✅ emergency reliability hardening
- PR #39 ✅ Website Demo & Content Production Engine
- PR #40 🔄 final Control Center / reliability / QA / launch gates

A code-complete V1 is deliberately different from live-autonomous outbound. Email and WhatsApp remain fail-closed until their real production credentials/domain/assets/webhooks are configured and controlled live E2E evidence exists.

---

# 1. Foundation & Control Plane — IMPLEMENTED

Production foundations:

- Next.js Control Center on Vercel.
- Supabase Auth, organization-scoped RLS and OWNER authorization.
- Existing business/lead/campaign/conversation/message/preview/audit/usage data model.
- English Control Center plus Persian operator intelligence where relevant.
- Runtime kill/pause controls.
- Canonical Cost Guard and provider allocations.
- Audit logs for meaningful operator changes.
- Services, market pricing, discount boundaries, markets, agents, approvals, integrations and reports.

No second CRM, pricing system, Cost Guard, preview engine, integration-state store, conversation store or agent framework is allowed without a proven architectural blocker.

---

# 2. Provider Health & Spend Observability — IMPLEMENTED FOR V1

The Control Center distinguishes:

- credential presence;
- `NOT_CONFIGURED` / READY / production-evidenced CONNECTED states;
- last check/error evidence;
- recorded latency where evidence exists;
- current Cost Guard mode;
- provider/operation/day/campaign spend;
- cost per qualified/replied/won lead;
- budget-derived anomaly warnings.

Current provider truth:

- Google Places: CONNECTED.
- OpenAI: CONNECTED.
- Crawl4AI: code-ready but NOT_CONFIGURED and optional.
- Email: NOT_CONFIGURED.
- Meta WhatsApp: NOT_CONFIGURED.
- Meta Instagram: NOT_CONFIGURED / restricted automation remains policy-aware.
- Redis: optional, NOT_CONFIGURED.

Provider status must never be upgraded merely because an environment variable exists.

---

# 3. Business Hunter / Growth Intelligence — IMPLEMENTED

Current acquisition architecture:

- Google Places IDs-only discovery first.
- Selective minimum qualification rather than fetching expensive detail for everything.
- Durable business identity using Google Place/domain dedupe.
- Cached/de-duplicated paid Place Details journal through existing `discovery_records`.
- Deterministic contactability/need/service-fit/revenue/priority signals.
- Multi-market routing through existing market settings.
- Growth Opportunity lanes:
  - `MUSCAT_LOCAL_GROWTH`
  - `OMAN_REMOTE_GROWTH`
  - `INTERNATIONAL_AI_GROWTH`
- Website ownership is not the only opportunity filter; content opportunities remain valid for businesses with websites.
- Cheapest-next-action routing prefers cached/deterministic evidence before provider spend.
- Routine discovery does not fetch Google review text.

Future expansion of acquisition sources must feed the existing lead/intent models rather than creating another CRM.

---

# 4. Website / Digital Evidence — IMPLEMENTED FOR V1

The current deterministic website audit supports:

- safe HTTP(S) target validation and private-host blocking;
- DNS/private-IP checks on controlled routes;
- response/time/redirect/body limits in deterministic auditing;
- structured mobile/SEO/CTA/language/contact evidence;
- 30-day configurable cache default;
- daily audit quota;
- one RUNNING audit per business to prevent concurrent duplication;
- historical success/failure persistence.

Crawl4AI is an optional external auditor. Its production endpoint remains fail-closed unless the integration is enabled + CONNECTED, Cost Guard allows it, cached evidence is absent and no duplicate RUNNING audit exists.

Do not fabricate missing social/website weaknesses. Unknown evidence stays unknown.

---

# 5. Lead Scoring / Opportunity Routing — IMPLEMENTED V1 FOUNDATION

The system uses explainable deterministic opportunity and sales signals, existing Growth Opportunity routing and configurable thresholds. Expensive AI/media work is downstream of score/interest/value gates.

Post-pilot improvement:

- calibrate thresholds from real reply/win outcomes;
- add measured source/market conversion comparisons;
- change thresholds through existing settings, not code forks.

---

# 6. Offer / Pricing Intelligence — IMPLEMENTED V1 FOUNDATION

Canonical commercial controls already exist:

- services and market pricing;
- minimum/floor pricing;
- automatic discount ceiling;
- approval-required discount ceiling;
- server-side guardrails preventing LLM invention of price/discount terms;
- owner-editable settings with audit logging.

Post-V1 catalog work may expand packages/recurring fees/tax notes, but must extend the same pricing source of truth.

---

# 7. Locale / Multilingual Intelligence — IMPLEMENTED V1 FOUNDATION

Current agent/outreach architecture supports market-aware language/tone and conservative dialect behavior. The system must:

- prefer natural neutral Gulf Arabic when dialect confidence is weak;
- preserve original inbound content;
- give the owner Persian translation/summary/intent where useful;
- avoid long generic AI-sounding outreach;
- keep future locale tuning in existing locale/market configuration.

Post-pilot task: review real samples per market and tune existing profiles based on outcomes.

---

# 8. Outreach Policy / Follow-up Engine — IMPLEMENTED CODE PATH

Existing controls include:

- recipient-local send windows;
- business days;
- channel/mailbox daily limits;
- follow-up count and delay schedule;
- DNC/suppression;
- global kill and channel pause;
- human takeover;
- approval requirements;
- follow-up cancellation on terminal/reply states;
- Shadow Mode;
- provider readiness fail-closed.

Live outbound is not enabled merely because this code exists.

---

# 9. Email Production Stack — IMPLEMENTED FOUNDATION, LIVE CONFIG PENDING

Implemented code/reliability foundation:

- provider send path;
- webhook lifecycle/correlation foundation;
- bounce/complaint/reply event persistence foundation;
- mailbox-health gate;
- approved-send safety gates;
- webhook replay/idempotency hardening;
- post-provider reconciliation semantics preventing unsafe resend.

Still required before real email pilot:

1. configure final production provider credential;
2. configure isolated sending domain/subdomain;
3. verify SPF/DKIM/DMARC and sender identity;
4. set conservative mailbox limits;
5. run one controlled internal/test E2E;
6. mark provider CONNECTED only from durable success evidence;
7. keep volume tiny until bounce/reply evidence justifies scaling.

---

# 10. WhatsApp Cloud API — IMPLEMENTED FOUNDATION, LIVE CONFIG PENDING

Implemented foundation:

- Meta Cloud provider/send path;
- inbound/status normalization;
- webhook signature/verification foundations;
- 24-hour vs template policy rules;
- DNC/runtime/channel/Cost Guard gates;
- hardened phone matching;
- approved-send duplicate/reconciliation protection.

Still required before real WhatsApp pilot:

1. Meta Business/WhatsApp assets;
2. access token + phone number ID;
3. Graph version/app secret/webhook verify token;
4. real webhook subscription;
5. one owner/internal-number E2E;
6. provider row upgraded to CONNECTED only after proof;
7. explicit owner approval before Shadow Mode is disabled.

No uncontrolled WhatsApp cold blasting.

---

# 11. Voice / Multilingual Inbound — IMPLEMENTED FOUNDATION

Current reliability path includes:

- single transcription per media identity/cache;
- failed-job recovery;
- stale PROCESSING lease recovery;
- duration guard foundation;
- no blind duplicate transcription;
- conversation/operator-intelligence integration foundation.

Live multilingual quality should be calibrated with real permitted test samples after the corresponding provider/media path is active.

---

# 12. Multi-Agent Sales Reasoning — IMPLEMENTED V1

Existing agent stack is canonical:

- intent discovery;
- conversation psychology without sensitive-trait diagnosis;
- business analyst;
- culture/locale;
- sales/marketing;
- evidence checker;
- preview director;
- decision orchestrator;
- secretary/customer-facing composer;
- relevance checker.

Selective routing avoids all-agent theatre for simple cases. OpenAI runtime is Cost Guard protected and runtime Agent Pause is enforced from DB state.

Inbound AI processing now requires an idempotency key and journals through `agent_runs`; completed requests replay, PROCESSING/FAILED logical requests do not blindly rerun paid AI.

---

# 13. Conversation Lifecycle / Handoff — IMPLEMENTED V1 FOUNDATION

Existing conversation model supports stages, human takeover, approval queue, Persian operator briefs, relevance/safety gates and follow-up state.

Autonomous customer-facing behavior remains bounded by provider readiness, Shadow Mode, DNC, human takeover, local time, pricing and Cost Guard.

Post-pilot work should be driven by observed false handoffs, missed intent or reply quality, not by adding more agents.

---

# 14. Website Preview & Content Production Engine — IMPLEMENTED

PR #39 extended the existing Preview Studio / Portfolio / Growth Opportunity stack with:

- score/interest generation eligibility;
- Website preview lane;
- Muscat local filming/content proposal lane;
- Oman remote/international AI-content proposal lanes;
- deterministic proposal-first behavior;
- heavy-media value/approval gate;
- portfolio matching by service/industry/market;
- stable version/fingerprint metadata;
- concurrency-safe `brief_hash` reuse;
- approval/share/public-view lifecycle;
- public token/expiration support;
- usage/cost linkage;
- no fabricated business defects.

Do not create a second preview or content engine.

---

# 15. Control Center / Reliability / Final QA — PR #40

PR #40 closes the remaining Production V1 operational gaps:

- one canonical budget source (`cost_guard_settings`);
- launch-readiness panel separating controlled-pilot from live-autonomous readiness;
- audited Service/Pricing/Market/Agent/Approval writes;
- editable Preview Director generation thresholds;
- editable existing market cold-channel flags;
- complete outreach business-day/follow-up-delay controls;
- provider health/error/latency/budget visibility;
- spend/outcome attribution and anomaly warnings;
- runtime global-kill enforcement at controlled provider boundaries;
- DB-enforced Agent Pause before AI;
- paid Google Details idempotency through `discovery_records`;
- inbound AI idempotency through `agent_runs`;
- website audit concurrency guard;
- final schema/security/performance/queue/deployment verification.

Exit requirements are defined in `docs/V1_FINAL_4_PR_PLAN.md`.

---

# 16. Project / Marketplace Hunter — POST-V1 MEASURED EXPANSION

This remains a legitimate future acquisition lane, but it is **not** a reason to delay Production V1 closure.

When pursued:

- use allowed/official APIs, feeds, alerts, public notifications or policy-compliant discovery;
- ingest opportunities into existing intent/lead models;
- deduplicate reposts;
- score freshness/service fit;
- generate tailored drafts;
- keep auto-apply/auto-DM semi-manual where source rules require it;
- track source ROI before scaling.

No second CRM.

---

# 17. Post-V1 Pilot / Optimization Backlog

After #40 merges, priority is evidence, not architecture tourism:

1. Configure Email sender/domain and run one controlled E2E.
2. Configure WhatsApp assets/webhooks and run one controlled E2E.
3. Keep Shadow Mode ON until both the desired channel and safety evidence are ready.
4. Run a tiny Oman pilot within the existing $25 Cost Guard.
5. Measure discovery cost, qualified rate, reply rate, preview engagement and won/lost outcomes.
6. Tune thresholds/templates/locale profiles/prices using existing controls.
7. Activate only the minimum automation level justified by evidence.
8. Consider Project Hunter / additional markets only after the primary flow is operationally useful.
9. Enable Supabase leaked-password protection when the Auth project setting is available to the operator/tooling.
10. Add Redis/queue infrastructure only if measured asynchronous load/recovery needs prove it necessary.

## Production V1 success definition

Production V1 is code-complete when the final #40 exit gate passes. It is **live-autonomous** only when explicitly approved provider channels are production-verified, controlled E2E succeeds, no safety/Cost Guard blockers remain, and Shadow Mode is intentionally disabled for the approved scope.

The system should prefer a boring, measurable, fail-closed pilot over a spectacular architecture that has never sold anything. This is a sales operating system, not a distributed-systems cosplay convention.
