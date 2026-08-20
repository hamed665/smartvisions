# Smart Visions Growth OS — Master Completion Plan

This is the canonical product roadmap. It is intentionally detailed so a future chat/engineer can continue without reconstructing decisions from conversation history.

## Product goal

Build an operator-controlled, cost-aware AI growth operating system that can:

- discover businesses and public project opportunities;
- enrich and qualify leads;
- audit websites/digital presence;
- create personalized offers and premium previews/demos;
- conduct localized multilingual sales conversations;
- understand inbound text and voice;
- follow up automatically within policy and local-time constraints;
- hand off only when human judgment is actually needed;
- track pipeline, costs, revenue, conversion, agent behavior and risk from one English-language Control Center;
- show the owner Persian translations, summaries, intent and reports.

The system is not complete until the full controlled path works end to end:

`discover → enrich → qualify → select offer → contact → understand reply → respond/follow-up → demo/proposal → negotiate → human handoff if needed → won/lost → reporting`

---

# Phase 0 — Foundation and production control plane

## Status: substantially implemented

- [x] Separate Smart Visions GitHub repository.
- [x] Next.js control plane on Vercel.
- [x] Supabase database and Auth.
- [x] OWNER operator account.
- [x] Organization-scoped data model and RLS.
- [x] English panel shell and navigation.
- [x] Editable Services/Pricing/Markets/Agents/System surfaces.
- [x] Professional Control Center modules.
- [x] Audit logging primitives.
- [x] Runtime safety controls.
- [x] Cost Guard and editable quotas.
- [x] Conversation intelligence schema/UX foundation.
- [x] Persian operator brief contract.
- [x] OpenAI cost-aware runtime foundation.
- [ ] Production-verify OpenAI health check after PR #17.

**Exit criterion:** OpenAI health check succeeds in production and records tokens/cost/audit with Cost Guard enforced.

---

# Phase 1 — Observability and provider health baseline

Before autonomous acquisition, make external dependencies observable.

- [ ] Add/verify Integration Health states: `NOT_CONFIGURED`, `READY`, `CONNECTED`, `DEGRADED`, `ERROR`, `PAUSED`.
- [ ] Record last successful request, last failure, latency, provider error code, and last health-check time without storing secrets.
- [ ] Add owner-only provider smoke tests for paid integrations.
- [ ] Ensure provider smoke tests themselves pass Cost Guard.
- [ ] Add usage views by provider/day/operation/lead/campaign.
- [ ] Add alerts for 70/85/95/100% budget modes.
- [ ] Add anomaly alert for unusual cost per lead or sudden request spike.
- [ ] Ensure retry ceilings and DLQ/error records are visible.
- [ ] Add a panel banner if any critical integration is degraded.

**Exit criterion:** an operator can tell within one screen whether every provider is configured, healthy, costing money, failing, or paused.

---

# Phase 2 — Business Hunter: Google Places discovery

## Goal

Find real businesses in selected countries/industries without creating an uncontrolled scraping machine.

- [ ] Configure `GOOGLE_PLACES_API_KEY` server-side.
- [ ] Add provider-specific Cost Guard budget/quota checks before every paid Places request.
- [ ] Implement market/industry/search-area jobs.
- [ ] Respect per-market daily lead limits from Cost & Usage.
- [ ] Store durable lead identity and Place ID; avoid duplicate paid lookups.
- [ ] Minimize requested fields/cost.
- [ ] Add deduplication across search queries and markets.
- [ ] Add source metadata: `data_source`, `source_url`, `retrieved_at` where applicable.
- [ ] Separate Google discovery/reference data from durable business enrichment.
- [ ] Store lead provenance and discovery query.
- [ ] Add Hunter panel controls: market, city/area, category, daily quota, minimum score, enabled/paused.
- [ ] Add dry-run mode to show expected queries before paid discovery.
- [ ] Test Oman first with a tiny quota.
- [ ] Verify no duplicate business is repeatedly charged for the same enrichment step.

**Exit criterion:** a controlled Oman hunt produces deduplicated businesses in Leads with source/provenance and recorded Places cost.

---

# Phase 3 — Website/public-source enrichment and audit

## Goal

Determine whether a business actually needs a website, redesign, content, automation or video service.

- [ ] Provision Crawl4AI or final selected crawler as an isolated service.
- [ ] Configure `CRAWL4AI_URL` server-side.
- [ ] Enforce crawl timeout, page count, size limit, robots/policy awareness and domain allow/block rules.
- [ ] Fetch official business website/public pages where available.
- [ ] Cache audit results by domain for the configured cache period.
- [ ] Detect website existence, HTTPS, mobile quality, basic performance/UX issues, outdated design signals, missing CTA/contact/WhatsApp, weak localization, stale content and obvious technical problems.
- [ ] Do not use an expensive LLM for deterministic checks that code can perform.
- [ ] Run AI deep analysis only after rule-based qualification and within `daily_deep_ai_runs`.
- [ ] Generate concise business-specific opportunity reasons.
- [ ] Map findings to appropriate Smart Visions services.
- [ ] Add `Website Audit` detail page with source links and evidence.
- [ ] Add manual re-audit/force-refresh action.

**Exit criterion:** a lead has evidence-based audit findings, recommended service(s), score and cached source metadata without unnecessary AI usage.

---

# Phase 4 — Lead scoring and qualification engine

## Goal

Spend attention and API money only where conversion is plausible.

- [ ] Define transparent rule-based baseline score.
- [ ] Include business quality, website need, contactability, market, service fit, intent and freshness.
- [ ] Keep scoring explainable in panel.
- [ ] Add `why this score` display.
- [ ] Add configurable minimum score for contact and minimum score for deep AI/demo generation.
- [ ] Add HOT lead threshold.
- [ ] Add low-quality/spam/duplicate suppression.
- [ ] Track score changes over time.
- [ ] Use AI only as a secondary signal, not sole scoring authority.
- [ ] Measure score vs actual reply/win outcomes once data exists.

**Exit criterion:** the system can rank leads and explain why it will contact, audit deeply, skip, or hand off each one.

---

# Phase 5 — Offer, service and market pricing intelligence

## Goal

Generate realistic offers without inventing prices.

- [x] Services/market pricing tables exist.
- [x] Discount ceilings are modeled/editable.
- [ ] Populate final service catalog and package definitions.
- [ ] Populate realistic prices for Oman, UAE, Saudi, Qatar, UK, USA and future markets.
- [ ] Support setup fee, recurring fee, package bundles, optional extras and custom scope.
- [ ] Add currency formatting and market tax/VAT notes where applicable.
- [ ] Add floor price enforcement server-side.
- [ ] Add auto-discount vs approval-required discount logic.
- [ ] Prevent LLM from quoting a price outside configured rules.
- [ ] Add proposal/offer version history.
- [ ] Add explicit owner override with audit log.

**Exit criterion:** every generated quote is traceable to configured service/market pricing and cannot silently exceed allowed discount rules.

---

# Phase 6 — Locale, culture and message intelligence

## Goal

Sound natural without pretending certainty about dialect/culture.

- [x] Market locale/tone controls exist in foundation.
- [ ] Finalize locale profiles for Oman/UAE/Saudi/Qatar/UK/USA.
- [ ] Implement language/dialect confidence model.
- [ ] Oman: natural Omani Arabic/English.
- [ ] UAE: natural Emirati/Gulf Arabic/English.
- [ ] Saudi: natural Saudi Arabic/English.
- [ ] Qatar: natural Qatari/Gulf Arabic/English.
- [ ] UK: concise natural British business English.
- [ ] USA: concise natural American business English.
- [ ] Fall back to Gulf-neutral Arabic when dialect confidence is low.
- [ ] Avoid long, generic, AI-sounding outreach.
- [ ] Add tone preview in Message Studio.
- [ ] Add editable cultural instructions per market.
- [ ] Preserve operator Persian translation for every outgoing draft/sent message.

**Exit criterion:** sample messages are reviewed across all target markets and are short, natural, business-relevant and correctly localized.

---

# Phase 7 — Message Studio and outreach policy engine

## Goal

Build controlled outbound messaging rather than uncontrolled bulk sending.

- [x] Message Studio/control foundations exist.
- [x] DNC/suppression primitives exist.
- [ ] Finalize channel policy engine.
- [ ] Enforce 09:00–19:00 recipient-local send window by default.
- [ ] Enforce daily channel/mailbox limits.
- [ ] Enforce DNC/unsubscribe/suppression before every send.
- [ ] Enforce campaign pause/global kill switch/channel pause.
- [ ] Add contact-frequency caps.
- [ ] Add message dedup/idempotency.
- [ ] Add follow-up sequence editor.
- [ ] Add A/B variants and conversion reporting.
- [ ] Stop sequence immediately on reply/opt-out/human takeover/won/lost.
- [ ] Add safe scheduling queue.
- [ ] Ensure channel adapters cannot bypass policy engine.

**Exit criterion:** a controlled sample campaign can schedule messages but cannot send outside policy, local time, DNC, budget or kill-switch rules.

---

# Phase 8 — Email production stack

## Goal

Enable low-volume, highly personalized B2B email while protecting the primary company domain and reputation.

- [ ] Select final email provider/workflow based on current provider policy.
- [ ] Use a sending domain/subdomain isolated from the primary corporate domain.
- [ ] Configure SPF, DKIM and DMARC.
- [ ] Add mailbox/provider configuration without exposing secrets.
- [ ] Add domain/mailbox health and warm-up/reputation tracking where appropriate.
- [ ] Configure conservative daily limits.
- [ ] Implement bounce handling.
- [ ] Implement complaint handling.
- [ ] Implement unsubscribe/DNC handling.
- [ ] Parse inbound replies into Conversations.
- [ ] Add thread/message correlation.
- [ ] Add provider cost/usage records.
- [ ] Run internal/test-domain smoke tests before external sending.
- [ ] Pilot with very small volume before scaling.

**Exit criterion:** email send, delivery/bounce, reply ingest, DNC and conversation response work end to end with isolated domain reputation.

---

# Phase 9 — WhatsApp Cloud API

## Goal

Support compliant WhatsApp conversations and voice notes without uncontrolled cold blasting.

- [ ] Configure Meta app and WhatsApp Business assets.
- [ ] Configure `META_WHATSAPP_TOKEN`.
- [ ] Configure `META_WHATSAPP_PHONE_NUMBER_ID`.
- [ ] Configure `META_GRAPH_VERSION`.
- [ ] Configure `META_APP_SECRET`.
- [ ] Configure `META_WEBHOOK_VERIFY_TOKEN`.
- [ ] Implement webhook verification and signature validation.
- [ ] Ingest inbound text/media/voice/status events idempotently.
- [ ] Implement 24-hour conversation-window/template rules as required by current Meta policy.
- [ ] Keep cold/business-initiated messaging within approved policy/template/consent constraints.
- [ ] Add send-status/error tracking.
- [ ] Apply Cost Guard and channel pause before sends.
- [ ] Route inbound replies to Conversations.
- [ ] Test owner/internal number before any real prospect traffic.

**Exit criterion:** inbound/outbound test conversation works, status events arrive, policy windows are enforced and voice notes are ingested safely.

---

# Phase 10 — Voice and multilingual inbound pipeline

## Goal

Understand voice messages from Persian, Arabic dialects, Urdu, Hindi, Indian/Pakistani English and mixed-language speakers.

- [ ] Select/enable transcription model/provider.
- [ ] Enforce max voice duration from Cost & Usage.
- [ ] Download media securely and temporarily.
- [ ] Transcribe each voice item once and cache transcript.
- [ ] Detect language/mixed-language and dialect confidence.
- [ ] Create Persian translation/summary/intent/sentiment.
- [ ] Preserve original transcript.
- [ ] Feed only relevant transcript/summary into sales reasoning.
- [ ] Reply in customer's appropriate language/style.
- [ ] Handle unsupported/low-confidence audio with human escalation rather than fabricated interpretation.
- [ ] Record voice minutes/cost.
- [ ] Add end-to-end tests with short English, Persian, Urdu/Hindi and Gulf Arabic samples.

**Exit criterion:** a real inbound voice note is transcribed, understood, summarized in Persian and receives a contextually appropriate reply without manual transcription.

---

# Phase 11 — Multi-agent sales reasoning

## Goal

Use multiple specialist viewpoints but prevent wasteful multi-agent theatre.

Target reasoning roles:

- psychology/customer-intent agent;
- business-analysis agent;
- culture/locale agent;
- sales/marketing agent;
- secretary/final-response agent.

Tasks:

- [ ] Define exact input/output contract for each role.
- [ ] Do not run every agent for every trivial message.
- [ ] Route simple intent/translation/classification to low-cost model/path.
- [ ] Use specialist agents only when their signal can change the decision.
- [ ] Aggregate specialist findings into a single decision object.
- [ ] Secretary generates the final customer-facing response.
- [ ] Store agent trace in compact structured form.
- [ ] Show useful reasoning summary to owner without exposing unnecessary internal chain-of-thought.
- [ ] Add confidence threshold and fallback behavior.
- [ ] Add model routing based on complexity, sales stage and budget mode.
- [ ] Use rolling conversation summary + recent messages rather than full transcript on every call.
- [ ] Cache stable business/context facts.

**Exit criterion:** the system produces materially better replies for complex cases while simple messages remain cheap and fast.

---

# Phase 12 — Autonomous conversation lifecycle

## Goal

The owner should not have to approve routine replies.

- [x] Conversation stage model/foundation exists.
- [x] Risk-based approval framework exists.
- [ ] Implement production action executor for `AUTO_SEND`, `REVIEW`, `HANDOFF`.
- [ ] Auto-send only when policy + confidence + pricing + budget allow.
- [ ] Require review for configured high-risk actions.
- [ ] Human takeover hard-locks AI sending until released.
- [ ] Add manual reply editor with translated preview.
- [ ] Add timeout/follow-up state transitions.
- [ ] Auto-update stage based on customer response.
- [ ] Add close/won/lost reasons.
- [ ] Add inactivity/follow-up scheduling.
- [ ] Add escalation notifications for HOT/closing/complaint/low-confidence events.

**Exit criterion:** a normal prospect can move through multiple exchanges automatically while sensitive cases reliably stop for the owner.

---

# Phase 13 — Personalized premium preview/demo generator

## Goal

For qualified website prospects, demonstrate quality visually instead of sending generic claims.

- [ ] Define eligibility threshold for demo generation.
- [ ] Ask/offer preview at an appropriate sales stage rather than generating expensive demos for everyone.
- [ ] Generate a modern, premium, industry-appropriate concept.
- [ ] Use public/business-provided imagery lawfully and safely; avoid unauthorized copying of protected assets.
- [ ] Support selected colors/style/market language.
- [ ] Include business name, realistic sections and appropriate CTA.
- [ ] Generate a stable preview URL.
- [ ] Add preview expiration/cleanup policy.
- [ ] Record generation cost.
- [ ] Allow owner preview/edit before sending when configured.
- [ ] Add conversion tracking from preview sent → response → won.
- [ ] Never deliberately make a business's existing design look worse or fabricate defects to manipulate the prospect.

**Exit criterion:** a qualified test lead can receive a professional personalized preview with tracked cost and engagement.

---

# Phase 14 — Project Hunter / freelancer-opportunity acquisition

## Goal

Find public opportunities where someone is actively asking for programming, websites, apps, automation or video/content work, regardless of country when appropriate.

- [ ] Define allowed sources and access method for each source.
- [ ] Prefer official APIs, alerts, RSS, public email notifications or policy-compliant discovery.
- [ ] Ingest opportunities into `intent_opportunities`/existing intent model rather than building a second CRM.
- [ ] Extract service need, budget, deadline, location, platform, contact method and source URL.
- [ ] Score opportunity freshness and fit.
- [ ] Deduplicate reposts.
- [ ] Add Project Hunter panel filters.
- [ ] Generate tailored proposal/draft.
- [ ] Keep auto-apply/auto-DM semi-manual where platform rules require it.
- [ ] Track submitted/contacted/replied/won/lost.
- [ ] Measure source ROI.

**Exit criterion:** at least one allowed source produces qualified opportunities in the panel with tailored drafts and source attribution.

---

# Phase 15 — CRM, pipeline and operator productivity

- [x] CRM/control foundations exist.
- [ ] Finalize drag/drop or equivalent pipeline controls.
- [ ] Bulk actions with safety confirmation.
- [ ] Notes and owner annotations.
- [ ] Assignments/team support if more operators are added.
- [ ] Search/filter by country, service, stage, channel, score, source and last activity.
- [ ] Saved views.
- [ ] Quick actions: find leads, create campaign, generate preview, pause outreach, review approvals, take over conversation.
- [ ] Surface stale leads and overdue follow-ups.
- [ ] Add customer/company timeline.
- [ ] Add attachments/proposal/preview links.

**Exit criterion:** the operator can run daily sales operations from the panel without database/admin-console work.

---

# Phase 16 — Reports, Persian executive brief and notifications

## Goal

The owner receives useful Persian information without needing to inspect every conversation.

- [ ] Persian daily/weekly executive summary.
- [ ] New leads, contacted, replies, qualified, demos, closing, won/lost.
- [ ] Revenue/pipeline value by market/service/source.
- [ ] Reply and conversion rates.
- [ ] Cost by provider, campaign, lead and won customer.
- [ ] Cost per qualified lead and cost per win.
- [ ] HOT/Needs Human/Unanswered counts.
- [ ] Explain notable changes/anomalies in Persian.
- [ ] Notify only when actionable; avoid noisy alerts.
- [ ] Add downloadable/exportable reports if needed.

**Exit criterion:** the owner can understand business performance in Persian in minutes without reading raw logs.

---

# Phase 17 — Reliability, queues and background runtime

- [ ] Decide final queue/runtime architecture based on real load; do not add Redis merely for fashion.
- [ ] If needed, configure `REDIS_URL` and durable job queues.
- [ ] Idempotency keys for discovery, audit, send and webhook jobs.
- [ ] Retry classification: transient vs permanent.
- [ ] DLQ for failed jobs.
- [ ] Concurrency limits per provider/channel.
- [ ] Backpressure when budget/throttle/provider health degrades.
- [ ] Job visibility in panel.
- [ ] Scheduled follow-ups and market-local send scheduler.
- [ ] Recovery after Vercel/server restart.
- [ ] No duplicate sends after retry/replay.

**Exit criterion:** background work survives retries/restarts without duplicate paid work or duplicate customer messages.

---

# Phase 18 — Security, privacy and compliance hardening

- [x] RLS foundation and owner-only control policies exist.
- [x] Secrets are kept outside GitHub.
- [ ] Review all RLS policies against actual role model.
- [ ] Review all grants for least privilege.
- [ ] Enable/resolve Supabase auth security recommendations where practical, including leaked-password protection.
- [ ] Rotate/test secret-management process.
- [ ] Webhook signature validation for every provider.
- [ ] Rate-limit sensitive endpoints and smoke tests.
- [ ] CSRF/session protection where applicable.
- [ ] Validate URLs to reduce SSRF risk in crawler/audit flows.
- [ ] Sanitize untrusted crawled/user content before prompts/rendering.
- [ ] Prompt-injection resistance for crawled websites/messages.
- [ ] Data retention/deletion controls.
- [ ] Export/delete business/contact data where legally/operationally required.
- [ ] Audit access to privileged operations.
- [ ] Backup/restore runbook.

**Exit criterion:** security review finds no high-risk path that allows a browser/user/message/crawled page to bypass policy, spend limits, secrets or tenant isolation.

---

# Phase 19 — QA and controlled pilot

## Do not skip this phase.

- [ ] Unit tests for scoring, routing, budget modes, locale rules, approval rules and send windows.
- [ ] Integration tests for Supabase RLS and provider adapters.
- [ ] E2E login/control panel tests.
- [ ] E2E controlled lead discovery test.
- [ ] E2E audit/qualification test.
- [ ] E2E email test.
- [ ] E2E WhatsApp text test.
- [ ] E2E voice test.
- [ ] E2E multi-turn conversation test.
- [ ] E2E human takeover test.
- [ ] E2E DNC/opt-out test.
- [ ] E2E local-time scheduling test.
- [ ] E2E hard-stop budget test.
- [ ] E2E preview generation test.
- [ ] Simulate provider outage and retries.
- [ ] Pilot with a tiny Oman lead cohort first.
- [ ] Review every message during early Shadow Mode.
- [ ] Measure reply quality and false-positive qualification.
- [ ] Tune rules from real data before scaling.

**Exit criterion:** controlled pilot completes without policy breaches, duplicate sends, runaway costs, broken handoffs or embarrassing localization errors.

---

# Phase 20 — Production activation and scaling

- [ ] Explicit owner sign-off after pilot.
- [ ] Keep global kill switch available.
- [ ] Gradually raise daily lead/contact quotas.
- [ ] Gradually raise API budgets only when ROI supports it.
- [ ] Turn off Shadow Mode by capability/channel, not blindly for the entire system.
- [ ] Scale Oman first, then UAE/Saudi/Qatar based on results.
- [ ] Expand UK/USA/email-led markets after deliverability and message fit are proven.
- [ ] Add additional countries through market profiles rather than hardcoded branches.
- [ ] Add new acquisition sources based on measured ROI.
- [ ] Revisit models/providers as pricing and quality change.

**Final completion criterion:** Smart Visions can continuously source, qualify, contact, converse, follow up and close suitable opportunities with bounded cost, localized communication, reliable human escalation and operator-level visibility, without the owner supervising routine actions all day.

---

# Explicit non-goals / anti-patterns

Do not accidentally turn the roadmap into these:

- A second CRM/database alongside the existing one.
- A giant agent swarm running five expensive models on every message.
- Bulk cold WhatsApp/Instagram automation that ignores platform rules.
- Upwork/platform auto-apply bots where automation is prohibited or account-risky.
- Google Places used as an unrestricted permanent copied database of provider content.
- Full conversation history sent to an LLM on every turn.
- API calls without cost records.
- Unlimited retries.
- Prices invented by an LLM.
- A dashboard full of statistics with no operational controls.
- Human approval required for every routine customer reply.
- Fake `CONNECTED` badges before end-to-end verification.

---

# Priority order from the current state

1. Re-run and production-verify OpenAI health check after PR #17.
2. Provider health/observability baseline.
3. Google Places Business Hunter with Cost Guard.
4. Website/public-source enrichment + Crawl4AI audit.
5. Qualification/scoring and final service/market pricing data.
6. Locale/message policy engine.
7. Email production stack and/or policy-compliant WhatsApp integration, tested independently.
8. Voice/multilingual pipeline.
9. Multi-agent production reasoning and autonomous conversation executor.
10. Personalized preview/demo generation.
11. Project Hunter sources.
12. Reliability/queues, full QA pilot, then controlled scaling.
