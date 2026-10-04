## FOUNDER-OS Production closeout — 2026-10-03

- Disposition: **100% IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the current Founder OS scope.
- Canonical Production main after the functional closeout is `303e56eb7b967845e4d41a90e6d66d7e2333c4f8`. Exact-main CI `37146743847` and Cloudflare Production Deploy `37146958456` both succeeded on that exact SHA.
- PRs #433-#445 now provide one governed OWNER-only Founder experience across web and Telegram without a second Founder Brain, Investor Brain, CRM, Memory, Knowledge, Tool Registry, IAM, queue/outbox, billing, payment or Telegram authority.
- Founder Status and Founder Intelligence remain evidence-first and read-only. Model-returned facts must map to verified canonical evidence authorities; missing or unverified claims are discarded rather than promoted to business truth.
- Founder Finance includes OWNER-confirmed company snapshots, derived runway/unit economics, governed scenarios and canonical commercial evidence boundaries. Cost Guard remains provider/AI spend evidence and is never relabeled as company burn.
- Founder Investor Workspace includes governed fundraising rounds, persistent external investor research, explicit OWNER confirmation into canonical CRM, canonical FUNDRAISING pipeline/deals and evidence-based Investor Readiness. External discovery never means investor interest, commitment or probability of raising.
- Founder Capital & Diligence includes cap-table evidence, derived recorded ownership, dilution scenarios, term-sheet lifecycle/comparison and data-room/due-diligence readiness. Scenario dilution is never presented as current ownership; accepted terms do not equal funded cash.
- Founder Command Center includes OWNER-governed Strategic Goals, Key Results, persistent sourced Market Research and Board Reports. Goal/KR status is explicit OWNER evidence; PUBLISHED board reports do not imply external board approval.
- Investor Discovery uses the canonical paid owner-model gateway and live web research. Results must be backed by URLs returned by web search, remain external research, and are persisted only through an explicit OWNER action as `DISCOVERED_EXTERNAL`.
- Telegram `/founder` and `/investor` reuse the same Founder Intelligence and existing Telegram OWNER identity/journal. They do not create a Telegram-specific Founder brain or mutation authority.
- Production migration authorities through `0193_founder_strategy_market_v1` are present. Founder strategy/market tables have RLS enabled, authenticated OWNER-governed writes, no anon access, service_role read-only access, SECURITY INVOKER guards/audit functions and zero synthetic rows at closeout verification.
- No synthetic revenue, customer traction, market size, investor interest, ownership, valuation, term-sheet, board approval, strategic progress or fundraising commitment evidence was created.
- Current Founder capability coverage: Status/Evidence, Copilot, Telegram, Finance/Unit Economics, Investor Readiness, Fundraising Workspace, Investor Discovery, Cap Table, Dilution, Term Sheets, Data Room/Diligence, Strategy/Goals/OKR, persistent Market Research and Board Reporting are all in the Production-verified scope.
- Founder OS continuation is no longer a completeness gap. Any future Founder work is an enhancement/versioned expansion and must extend these canonical authorities rather than introduce parallel architecture.

**Founder OS completion state:** `PRODUCTION_VERIFIED / COMPLETE`.

---

## AI-AGENT-RUNTIME Production closeout — 2026-10-03

- Work Package: `SECTION BUSINESS_INTELLIGENCE_AI -> AI-AGENT-RUNTIME`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.
- PR #431 final head `d487c8f4155091eaa6eeda487ea9c90e0f549963` passed exact-head CI `37116073028` across lint, typecheck, full tests, the complete PostgreSQL 17 migration chain plus AI Agent Runtime smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #431 squash-merged to canonical `main@506e6d8176c7aebdd87889aeacd137d29728146e`. Exact-main CI `37116637759` and Cloudflare Production Deploy `37116816918` both succeeded on that exact SHA.
- Production migration `0186_ai_agent_runtime` is applied exactly once as version `20261003102633`; the final migration blob is `391349a211baaeb9e9790df9b0ebb6784f4ec3da`.
- The implementation extends the existing canonical Agent pipeline, Context Compiler, `agent_runs`, Tool Action Registry, IAM, Booking runtime, Cost Guard, approval/policy boundaries and audit authority. It did not introduce a second Agent framework, Context Compiler, Tool Registry, policy engine, approval engine, action gateway, provider-send path, payment truth, CRM, Memory, Knowledge, queue/outbox or audit authority.
- Configured provider execution is bounded to one attempt with zero automatic retries and a maximum 60-second timeout. Provider failure/timeout may fall back once to the deterministic local runtime; specialist failures remain isolated and fail closed.
- HUMAN takeover, PAUSED Agent mode and global Agents pause stop before Agent execution. Tool proposals remain proposals: only actions explicitly registered for the AI execution surface are considered, unavailable/provider-send/financial/approval-missing/Shadow-Mode mutation proposals fail closed, and even eligible proposals keep `executionAuthorized=false` until the canonical domain gateway authorizes and verifies them.
- Booking proposals reuse the existing Booking AI/domain runtime rather than creating a second Booking mutation path.
- Migration 0186 adds tenant-safe composite Agent output/reply provenance, replay-safe persistence and service-role-only SECURITY INVOKER completion/failure RPCs. `authenticated` and `anon` cannot execute trusted persistence; `service_role` has only the table privileges required by the invoker path.
- PostgreSQL 17 CI now reconstructs the canonical legacy `agent_outputs` / `reply_decisions` authority through a test-only bootstrap before modern migrations. That bootstrap is not a Production migration and does not create a second runtime authority.
- Production remained side-effect clean through verification: `agent_runs=37`, `agent_outputs=0`, `reply_decisions=0`. No synthetic tenant, customer, conversation, Agent output, reply decision, Booking mutation, provider send or payment evidence was created.
- Runtime verification confirms the real Production OWNER resolves correctly under the trusted actor-role evaluator. Shadow Mode remains ON, global Kill Switch OFF and Agents pause OFF.
- Routed Production smoke after the exact-main deploy resolves both `/agents` and `/founder` through the deployed Cloudflare Worker to the authenticated login boundary when unauthenticated.
- Fresh post-0186 advisor comparison shows no tracked regression: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. Generic `unused_index=447` remains INFO and includes zero-workload indexes.

## AI-MODEL-PROMPT-CONTROL Production closeout — 2026-10-03

- Work Package: `SECTION BUSINESS_INTELLIGENCE_AI -> AI-MODEL-PROMPT-CONTROL`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.
- PR #437 final head `326a2962673e5ca461f133fb635fc23185535a25` passed exact-head CI `37121570338` across lint, typecheck, full tests, the PostgreSQL 17 migration chain plus prompt-control smoke, Next build, Vinext and scheduled-runtime verification.
- PR #437 squash-merged to canonical `main@b2f332c32cae1c7c0415c459868dd0705378c29c`. Exact-main CI `37121940243` and Cloudflare Production Deploy `37122123877` both succeeded on that exact SHA.
- Current `main@326ccab806fdf5473911ca37d6d82ee01d786158` still contains that lineage and is independently green: exact-main CI `37147661631` and Cloudflare Production Deploy `37147864963` both succeeded.
- Production migration `0187_ai_model_prompt_control` is applied exactly once as version `20261003120749`.
- Prompt control extends the canonical `prompt_versions`, `agent_settings`, model router, Cost Guard, Agent Runtime and `audit_logs` authorities. It did not add a second Prompt Registry, rollout database, model router, Cost Guard, Agent framework or provider path.
- Candidate prompts are staged inactive; governed rollout supports deterministic `OFF / SHADOW / CANARY` selection, bounded canary percentages, explicit promotion/rollback and built-in-baseline reset. Hard runtime policy remains non-overridable.
- Production RPCs `stage_prompt_version`, `configure_prompt_rollout` and `set_active_prompt_version` are SECURITY INVOKER. `authenticated` can execute them subject to their OWNER checks; `anon` and `service_role` cannot execute them.
- Production remained synthetic-data clean at closeout verification: `prompt_versions=0`, `agent_settings=10`, `promptControl configs=0`. No fake prompt, rollout, canary traffic or provider evidence was created.
- Model-quality datasets, regression/red-team evaluation, confidence/uncertainty, sensitive-data testing and tool/action safety were intentionally left outside Prompt Control and are now closed by the canonical `AI-QUALITY-SAFETY` package below.

## AI-QUALITY-SAFETY Production closeout — 2026-10-03

- Work Package: `SECTION BUSINESS_INTELLIGENCE_AI -> AI-QUALITY-SAFETY`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.
- PR #449 final head `34676c3bf81bd171728365a4a6ed7a9c7c3c99d9` passed exact-head CI `37151742701`, including lint, typecheck, full tests, the complete PostgreSQL 17 migration chain, Next build, Vinext and scheduled-runtime verification.
- PR #449 squash-merged to canonical `main@d09017f7e629e149d8a9a024f0554d0d63bab988`. Exact-main CI `37151998948` and Cloudflare Production Deploy `37152212083` both succeeded on that exact SHA.
- The package extends the existing canonical Agent Runtime, Evidence Checker, Prompt Control, sales-policy checks, Context Compiler projections and Tool Registry/action gates. It did not create a second Agent framework, policy engine, evaluation runtime, safety gateway, Tool Registry, provider path, Memory, Knowledge or business-truth store.
- `AI_QUALITY_SAFETY_V1` adds deterministic PASS / REVIEW / BLOCK trace evidence before customer delivery. Confidential Knowledge/Memory leakage, known internal identifiers, system/owner prompt leakage, provider-secret material, unverified provider commitments, unsupported monetary claims, sensitive-trait inference and critical evidence failures block delivery. Unsupported absolute guarantees, confidence gaps and rejected tool proposals force review rather than silently auto-send.
- Provider-bound Agent context is minimized before paid model calls: internal IDs are removed from customer/permission projections and secret-like keys/values are redacted. Prompt Control also blocks candidate prompts containing provider-secret-like material.
- A versioned controlled red-team/evaluation dataset covers prompt injection, confidentiality, internal identifiers, system-prompt leakage, overclaiming, confidence/evidence gaps and tool/action safety across English, Arabic and Persian cases. Local verification passed 34/34 targeted tests and the full suite passed 250 files / 1656 tests with 0 lint errors and the existing 13 warnings.
- Quality/Safety evaluation remains non-authoritative for business mutation. It can only block or require review; it never turns a model proposal into execution permission. Canonical permission -> policy -> approval -> domain runtime -> verification -> audit remains unchanged.
- No schema migration, Production fixture, synthetic customer/conversation/Agent result, provider send, payment execution or Booking mutation was required or created for this package.
- Cloudflare Production deployment verified the exact merged bundle through release-candidate smoke, controlled SSR load, Worker promotion, route attachment, routed Production smoke and safe API/webhook rejection smoke.

## AI-VOICE-VISION Production closeout — 2026-10-04

- Work Package: `SECTION BUSINESS_INTELLIGENCE_AI -> AI-VOICE-VISION`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled voice-note, transcription reconciliation, bounded image/document understanding, media-evidence and governed voice-response scope. Real inbound provider-media E2E remains **BLOCKED_EXTERNAL** until legitimate canonical customer media exists; the later phone-agent capability remains **DEFERRED_WITH_REASON** until an explicit consent/recording policy and real telephony provider evidence are in scope.
- PR #451 final head `f689886a8cdd2f24bae73e890b98fe66016721cb` passed exact-head CI `37158512759`, including lint, typecheck, the full test suite, the complete PostgreSQL 17 migration chain plus AI-VOICE-VISION smoke, Next build, Vinext and Cloudflare scheduled-runtime verification.
- PR #451 squash-merged to canonical `main@022633cc1c0f286d3409455242226215d06d24f4`. Exact-main CI `37158685448` and Cloudflare Production Deploy `37158895073` both succeeded on that exact SHA; the deploy passed exact-green checkout, release-candidate smoke, controlled SSR load, Production promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration source `supabase/migrations/20261003212542_ai_voice_vision.sql` (merged blob `8bb8b11265a68c033e796ef073faf90346431175`) is applied in Supabase Production as `ai_voice_vision@20261003223505`.
- The package extends the canonical `conversation_messages`, bounded `voice_transcriptions` cache/evidence, existing Meta WhatsApp media authority, Agent Context Compiler, Cost Guard/usage ledger, AI Quality/Safety and the existing approved-send/voice-response path. It did not create a second media store, transcript authority, conversation/message store, Agent framework, Context Compiler, Tool Registry, Policy/Approval engine, provider-send path, billing ledger, queue/outbox, CRM, Knowledge or Memory authority.
- Fresh and cached successful WhatsApp voice transcription can now reconcile into the exact canonical inbound Voice/Audio `conversation_messages.transcript` without buying a second transcription. Conflicting/wrong-org/wrong-conversation/non-voice targets fail closed.
- WhatsApp IMAGE and supported PDF/DOCUMENT understanding uses replay-safe claim -> provider-start -> finalize semantics on bounded `conversation_messages.metadata.media_analysis`. Stale pre-provider work may be reclaimed; once a provider side effect may have occurred, ambiguous/finalization/accounting failure becomes `RECONCILIATION_REQUIRED` and never triggers a blind paid retry. Full-video reasoning is explicitly unsupported rather than fabricated.
- Media summaries, extracted text/OCR and transcripts are bounded untrusted customer evidence. Provider URLs, raw payloads, file bytes, tenant/binding IDs, provider message IDs and secrets are excluded from provider-bound Agent context; embedded media prompt injection cannot override system policy, permissions, Tool Registry, approvals, pricing truth, DNC, Cost Guard or Shadow Mode.
- Production RPCs `claim_conversation_media_analysis`, `mark_conversation_media_analysis_provider_started`, `finalize_conversation_media_analysis` and `persist_conversation_voice_transcript` are SECURITY INVOKER and executable only by `service_role`; `anon` and `authenticated` cannot execute them. The `conversation_messages_ai_media_evidence_guard` trigger is enabled and protects trusted inbound transcript/media-analysis evidence from browser mutation.
- Production verification remained side-effect clean: `voice_transcriptions=1` with `1 SUCCEEDED`, but that historical cache row has `0` matching canonical inbound Voice/Audio messages; current canonical WhatsApp Voice/Audio/Image/Video/Document counts are empty and `media_analysis` rows are `0`. No synthetic tenant, customer, conversation, message, Voice, Vision, media analysis, provider event or Agent output was created, and no unsafe backfill was attempted.
- Post-migration advisor categories remain on the existing baseline: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. No AI-VOICE-VISION-specific advisor regression was introduced.

## AI-OWNER-COPILOT Production closeout — 2026-10-04

- Work Package: `SECTION BUSINESS_INTELLIGENCE_AI -> AI-OWNER-COPILOT`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled OWNER/ADMIN read, planning, signed Preview/Confirm and governed-action surface. Confirmed Production mutations remain intentionally blocked while canonical `system_controls.shadow_mode=true`; no runtime safety control was relaxed to manufacture an E2E mutation.
- PR #453 final head `122df233ad93a5cfa472541630dae16053782e97` passed exact-head CI `37162651405`, including lint, typecheck, the full test suite, the complete PostgreSQL 17 migration chain plus AI-OWNER-COPILOT smoke, Next build, Vinext and Cloudflare scheduled-runtime verification.
- PR #453 squash-merged to canonical `main@bfdebe34e9663406c94bf4c12aad6d583a77c757`. Exact-main CI `37162845953` and Cloudflare Production Deploy `37163061552` both succeeded on that exact SHA; deployment passed exact-green checkout, release-candidate smoke, controlled SSR load, Production promotion, route attachment, routed Production smoke and safe API/webhook rejection smoke.
- Production migration source `supabase/migrations/20261003225641_ai_owner_copilot.sql` (merged blob `5addb622dc2b35564ffebb3a1d50582e05542176`) is applied in Supabase Production as `ai_owner_copilot@20261003234721`.
- The package reuses the existing Telegram/panel-parity action adapter, canonical domain Server Actions/RPCs, Tool Action Registry, IAM/domain permissions, lifecycle/version gates, runtime controls and Audit Log. It did not create a second Founder/Owner brain, CRM, task/deal authority, action gateway, approval engine, financial authority, analytics truth, queue/outbox, provider-send path, Knowledge or Memory store.
- OWNER/ADMIN now have a real `/copilot` web surface and `/api/owner-copilot` planner/confirm route. The model can only propose currently AVAILABLE `OWNER_COPILOT` Tool Registry actions and never receives execution authority. Missing IDs/versions/evidence/amounts/dates/statuses must clarify rather than be invented.
- Mutation requires an HMAC-signed Preview token bound to organization, user, OWNER/ADMIN role, canonical pre-state and a one-time confirmation ID. Execution re-checks Tool Registry availability, explicit confirmation, canonical state, Global Kill Switch, Agents pause and Shadow Mode, then invokes the existing domain action, verifies canonical post-state and records correlated audit evidence.
- Production Tool Registry verification shows `20` OWNER_COPILOT contracts, `0` malformed/unsafe contracts, `0` provider-money-execution contracts and `0` Owner Copilot tables. Payment actions can only manage internal Payment Intent/refund-request state; Quote SENT remains state evidence only; direct provider send, charge or refund execution is outside this surface.
- The bounded operational read model covers canonical leads/customers/deals/tasks/bookings/quotes/orders/invoices/payment intents/campaigns/automations, team workload, follow-ups and operational reporting evidence without creating an analytics warehouse or causal-attribution truth. Founder-only board-report authorities were explicitly excluded from the ADMIN-capable context after privilege-boundary review.
- Production runtime controls remain `shadow_mode=true`, `global_kill_switch=false`, `agents_paused=false`. Routed unauthenticated checks for `/copilot` and `/api/owner-copilot` both redirect to `/login`, verifying the deployed auth boundary without creating a synthetic OWNER/ADMIN session or action.
- Production verification remained side-effect clean: no synthetic tenant, customer, Lead, Deal, Task, Booking, Quote, Order, Invoice, Payment Intent, refund, Campaign, Automation or Owner Copilot action was created.
- Post-migration advisor categories remain on the existing baseline: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. No AI-OWNER-COPILOT-specific advisor regression was introduced.

## DATA-EVENT-METRICS Production closeout — 2026-10-04

- Work Package: `SECTION ANALYTICS_REPORTING -> DATA-EVENT-METRICS`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.
- Implementation PR #455 final head `1e6e0061b0757bb8f37552b2f2ef3428c8cd0fe5` passed exact-head CI `37165627723`, including lint, typecheck, the full test suite, the complete PostgreSQL 17 migration chain plus DATA-EVENT-METRICS smoke, Next build, Vinext and Cloudflare scheduled-runtime verification.
- PR #455 squash-merged to canonical `main@a4d6f3a93a25912a819df37c0c1c66b5bdc03d4b`. Exact-main CI `37165996727` and Cloudflare Production Deploy `37166123590` both succeeded on that exact SHA; the deploy passed exact-green checkout, release-candidate smoke, controlled SSR load, Production promotion, Worker Route verification, routed Production smoke and safe API/webhook rejection smoke.
- Migration source `supabase/migrations/20261004001135_data_event_metrics.sql` (merged blob `b40aee1cb41147fac19b718c4202c704f2eead9b`) is applied in Supabase Production as `data_event_metrics@20261004005145`.
- DATA-EVENT-METRICS deliberately does **not** create a second business-event ledger, event bus, warehouse or analytics truth store. `analytics_event_feed_v1` is a read-only `security_invoker` projection over existing canonical OLTP evidence authorities such as Audit, Booking, Quote, Order, Invoice, Payment, Usage, WhatsApp, Email, Reply, Handoff and Preview evidence.
- The only new analytics-like table is `metric_definitions`, a versioned release-controlled Metrics Registry. Production currently has `18` ACTIVE metric definitions, `0` malformed definitions and `0` unsafe MONEY definitions.
- `metric_registry_current_v1` and `analytics_event_feed_v1` are both `security_invoker=true`. Authenticated users may read metric metadata but cannot mutate it. `anon` cannot read the Registry. Browser roles cannot directly read the tenant event feed or execute the bounded reader; `service_role` has read/execute access through the trusted path.
- `read_analytics_event_feed_v1` is SECURITY INVOKER, service-only, requires Organization plus a bounded time window, rejects windows over 31 days, caps event-name filters at 64 and caps each read at 5,000 rows.
- The feed exposes normalized identifiers, proven Organization/Business/Branch scope, event semantics, evidence class, bounded dimensions and optional numeric evidence. It excludes raw provider payloads, lifecycle evidence blobs, request hashes and Audit before/after bodies. Production verification found `0` raw-evidence columns.
- Business/Branch scope is projected only where canonical parent evidence proves it. Sources without proven lower-level scope remain Organization-scoped rather than receiving invented hierarchy.
- Financial SUM metrics require `currency` as a dimension and set `crossCurrencyAggregation=false`; provider-captured/refunded metrics require provider-verified evidence. No OMR/USD/AED cross-currency total is manufactured.
- Every seeded metric definition explicitly records `causal=false`. Existing Marketing Attribution remains a separate governed observational evidence authority; DATA-EVENT-METRICS does not silently turn association into causal attribution.
- Production read-only verification observed `9,398` projected real events at closeout: `audit_logs=9,132`, `whatsapp_events=136`, `usage_events=115`, `email_events=9`, `preview_events=6`; currently-empty lifecycle authorities remain valid feed sources without synthetic rows being added to make charts look busier.
- Production verification remained side-effect clean: no synthetic customer, conversation, Booking, Quote, Order, Invoice, Payment, usage, channel event or metric fact was created.
- Post-migration advisor categories remain on the existing baseline: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. No DATA-EVENT-METRICS-specific advisor regression was introduced.

## DATA-WAREHOUSE Production closeout — 2026-10-04

- Work Package: `SECTION ANALYTICS_REPORTING -> DATA-WAREHOUSE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the current-scale logical warehouse boundary.
- Fresh Production evidence before implementation showed a database of approximately `49 MB`, about `9.4k` canonical analytics events, one Organization, no Business/Branch rows and no active query older than 10 seconds. On that evidence, a separate BigQuery/ClickHouse/WAL-CDC stack was intentionally **DEFERRED_WITH_REASON** rather than creating a second operational system without load justification.
- Implementation PR #457 final head `8e7e37b68fa043ebd2d496fd01b2ca8e0bfa83d1` passed exact-head CI `37182035797`, including lint, typecheck, full tests, the complete PostgreSQL 17 migration chain plus DATA-WAREHOUSE smoke, Next build, Vinext and Cloudflare scheduled-runtime verification.
- PR #457 squash-merged to canonical `main@32d32de820a083264af1232ce4f6ffbafda62cc5`. Exact-main CI `37182273103` and Cloudflare Production Deploy `37182452304` both succeeded on that exact SHA.
- Migration source `supabase/migrations/20261004055417_data_warehouse.sql` (merged blob `26af8d2479e5b20e4634664d05e20d59c4e19fcc`) is applied in Supabase Production as `data_warehouse@20261004062128`.
- `analytics_warehouse_facts` is a **rebuildable, non-authoritative projection** over `analytics_event_feed_v1`; canonical OLTP/event authorities remain business truth.
- `analytics_warehouse_checkpoints` stores only projection watermark/freshness/backfill metadata. It is not a second queue, scheduler, event ledger or business-fact authority.
- `sync_analytics_warehouse_v1` is SECURITY INVOKER and trusted-only. Incremental windows advance at most 7 days, apply a 2-day late-event lookback, cap new facts at 5,000 per sync, use per-Organization advisory locking and support explicit backfills capped at 31 days.
- `read_analytics_warehouse_v1` is SECURITY INVOKER and service-only; reads are bounded to 366 days, 10,000 rows and 64 event names. It does not expose arbitrary Production SQL.
- `analytics_warehouse_health_v1` is `security_invoker=true` and service-only.
- Warehouse facts exclude raw provider payloads, lifecycle evidence blobs, Audit before/after bodies and request hashes. Production verification found no raw-evidence columns.
- Both warehouse tables have RLS enabled. Browser roles cannot read facts/checkpoints or execute sync/read functions; `service_role` has the trusted access path.
- Existing Cloudflare Cron drives warehouse projection through `/api/operations/analytics-warehouse` and the existing internal operations boundary. No `pg_cron`, `pgmq`, second scheduler or second CDC/event authority was introduced.
- Controlled Production initialization used only real canonical events and initially projected `9,464/9,464` feed/fact rows with `0` duplicate key groups. The independently verified post-fix scheduled RESULT heartbeat at `2026-10-04T06:51:07Z` recorded `analyticsWarehouseStatus=200`, `organizations=1`, `inserted=1`, `caughtUp=1`, `failed=0`; the checkpoint recorded `last_inserted_count=1`. Immediately after that RESULT heartbeat persisted its own Audit row, Production read `analytics_event_feed_v1=9,470`, `analytics_warehouse_facts=9,469`, `duplicate_key_groups=0`. That one-row difference is the newly written heartbeat event itself and is an expected one-tick observer lag, not data loss or duplication. No synthetic business/channel/payment/customer fact was created.
- A post-closeout runtime check exposed one scheduled-path defect: the warehouse route was missing from the exact session-proxy bypass allowlist, so Cloudflare Cron reached the application boundary as HTTP `307` before the internal-key gate. PR #459 fixed only that exact path, preserved subpath/session protection and kept the existing `INTERNAL_API_KEY` authorization authority.
- PR #459 head `e31cee0ce90df71252843786805dc1c8f90b1a14` passed full CI `37183186684` and merged to `main@5126f54aedd42cfb665b4b33222c60074f362c74`. Exact-main CI `37183333053` and Cloudflare Production Deploy `37183506208` succeeded. Production verification returns HTTP `401 {"error":"Unauthorized"}` for an unauthenticated warehouse POST with no redirect, proving the request reaches the route-level internal-key gate. The subsequent natural scheduled heartbeat returned warehouse status `200`, caught up the single Organization and reported zero warehouse failures, closing the end-to-end Cron path.
- Post-migration advisor categories remain on the prior baseline: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. No DATA-WAREHOUSE-specific advisor regression was introduced.

## DATA-DASHBOARDS Production closeout — 2026-10-04

- Work Package: `SECTION ANALYTICS_REPORTING -> DATA-DASHBOARDS`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the governed dashboard/data-source boundary.
- The pre-change `/reports` surface was still an OLTP-heavy reporting path: it issued multiple direct table scans and read raw WhatsApp `payload` evidence for report construction. DATA-DASHBOARDS replaced that historical-reporting path with a server-only governed dashboard composer.
- Historical metrics now resolve only through the versioned Metrics Registry plus the rebuildable Analytics Warehouse. The dashboard does not introduce a new dashboard fact/event/snapshot table, arbitrary Production SQL surface or second analytics truth.
- Live current-state gauges are explicitly marked `LIVE` and use bounded count-only reads from canonical business authorities. Historical and current-state semantics are not mixed.
- Organization / Business / Branch filters are validated from the authenticated user's RLS-visible hierarchy. Unsupported lower-level metrics do not silently widen to Organization scope.
- Historical windows are bounded to 7 / 30 / 90 days and the warehouse read remains capped at 10,000 rows. Warehouse freshness, last complete watermark and truncation state are surfaced to the UI.
- MONEY metrics remain grouped by currency; no OMR/USD/AED cross-currency total is fabricated.
- Response Time and Retention remain explicitly `Unavailable` because the current Metrics Registry does not yet define governed response-time or retention/churn semantics. The dashboard does not derive them from ad hoc message scans or present zero as if it were evidence.
- Dashboard coverage includes Leads, Customers/People, Conversations, Sales/Pipeline, Bookings, Quotes, Orders, Invoices, Revenue/Payments, Staff/Tasks, Channels, AI, Workflows, Campaigns and recent warehouse activity. Attribution remains outside this package.
- Implementation PR #461 final head `72ce8f46ad7b66a11ba1e982fae96c2e336fe235` passed exact-head CI `37186870968`, including lint, typecheck, full tests, PostgreSQL 17 migration-chain verification, Next build, Vinext and Cloudflare scheduled-runtime verification.
- PR #461 squash-merged to `main@741e0decdd761769d5053ac15af0b7aa98dbe7a0`. Exact-main CI `37187060713` and Cloudflare Production Deploy `37187253345` both succeeded on that exact SHA.
- Local controlled verification recorded DATA-DASHBOARDS targeted `8/8` PASS and full suite `255 files / 1,698 tests` PASS; lint had `0` errors with the existing `13` baseline warnings; typecheck and Production Next build passed.
- Production backing evidence after deploy: Metrics Registry `18` ACTIVE definitions, `0` malformed; Analytics Warehouse `9,482` facts, freshness lag approximately `37s`, successful checkpoint and `last_inserted_count=0`; canonical hierarchy currently has `tenant_businesses=0`, `branches=0`.
- Production live authorities remained real, not synthesized: Leads `19`, Sales Conversations `12`, Campaigns `7`, Agent Runs `37`; CRM People/Deals/Tasks, Bookings, Quotes, Orders, Invoices, Payment Intents and Automation Rules were currently `0`.
- Unauthenticated Production `/reports` returns the login shell and does not expose dashboard markers, KPI content or the Organization identifier. No synthetic customer, business, branch, conversation, commerce, payment, metric or dashboard row was created for verification.
- DATA-DASHBOARDS required **no schema migration**.

## DATA-ATTRIBUTION Production closeout — 2026-10-04

- Work Package: `SECTION ANALYTICS_REPORTING -> DATA-ATTRIBUTION`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled observational attribution contract, Production schema/runtime and deployed `/marketing-attribution` surface. **Real Production outcome-credit E2E is not claimed** because there is currently no eligible real Production outcome evidence.
- Implementation PR #463 final head `31cb6e3413d965f0ec2c42c75716db43b1a1efba` passed exact-head CI `37193975571` and merged to canonical `main@ec6be08f33a5087c982002ac090994e16c5135ec`.
- Exact-main CI `37194222409` was freshly re-read and its `validate` job is `success`. Cloudflare Production Deploy `37194373534` was freshly re-read and its `deploy` job is `success`; the deploy log contains the built `ƒ /marketing-attribution` route and the production Worker-route/routed-smoke steps completed successfully.
- Production migration `data_attribution_v2` is live as version `20261004103053`, applied from the exact current-main migration blob `f9c3ded8f453b05be0d2825174d6adc3266715ec` (`supabase/migrations/20261004094009_data_attribution_v2.sql`).
- `public.get_observational_attribution_v2(uuid,text,text,integer,integer)` exists as **SECURITY INVOKER**. `anon` has no EXECUTE; `authenticated` and `service_role` do. V1 `public.get_marketing_attribution(...)` remains present.
- The V2 output contract includes `outcome_type`, `outcome_value_class`, `collected_money_evidence`, `causal_claim` and `evidence_basis`. The runtime contract continues to return `causal_claim=false`.
- All five bounded indexes are present: Deal WON, Booking COMPLETED, Quote ACCEPTED, Order FULFILLED and Payment CAPTURED. No public attribution table or materialized view exists, so the package did not create a second attribution truth store.
- Fresh Production counts are Campaigns `7`, Outreach Messages `43`, CRM Deals `0`, Bookings `0`, Quotes `0`, Orders `0`, Payment Intents `0`, Payment Transactions `0`. The eligible Organization intersection is empty, so no real V2 outcome-credit row can currently be verified end-to-end without fabricating Production data.
- No synthetic tenant, credential, customer, commerce/payment object, attribution row or provider message was created for verification.
- Post-migration Security Advisor has **no DATA-ATTRIBUTION-specific finding**. Performance Advisor reports only the five newly created bounded indexes as `unused_index` INFO, which is expected with zero eligible Production outcomes and is not treated as a schema regression.
- Attribution remains observational only: Sales/Quote/Order value is not revenue; only CAPTURED payment carries collected-money evidence; exact canonical Lead linkage is mandatory; fuzzy identity, guessed campaign revenue, invented UTM history and arbitrary cross-channel matching remain prohibited.
- A direct unauthenticated GET to the route was not re-probed from the current tool network, so no separate redirect-status claim is added. No fake authenticated browser session was created.

## DATA-ASK Production closeout — 2026-10-04

- Work Package: `SECTION ANALYTICS_REPORTING -> DATA-ASK`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled governed semantic-query boundary and deployed `/reports` + `/api/data/ask` surfaces. A separately authenticated live semantic-answer request was **NOT_REPROBED** because the current tool network has no safe existing user session; no fake authenticated session was created.
- Implementation PR #465 final head `fd4b084a33a173957118b543f0a8499efbf2197f` passed exact-head CI `37196822893` and merged to canonical `main@bbe8a2135c49c957ae8e8c7c562f51517e5f87ce`.
- Exact-main CI `37197046011` succeeded on the merge SHA. Cloudflare Production Deploy `37197235278` also succeeded on that exact SHA; the deploy job built both `λ /api/data/ask` and `ƒ /reports`, preserved the Production Worker route and passed the routed Production smoke.
- DATA-ASK adds **no migration, table, RPC, metric store, warehouse, query engine or analytics authority**. Production migration history therefore remains unchanged after `data_attribution_v2@20261004103053`.
- The model is semantic resolution only. It receives governed metric definitions and may select only current allowlisted metric keys plus a bounded 7/30/90-day window. It never receives warehouse values/customer rows/provider payloads and cannot generate SQL, joins, formulas, IDs, arbitrary filters or mutation instructions.
- Numeric answers are composed deterministically from the existing `metric_registry_current_v1` + Analytics Warehouse path. Unsupported or ambiguous questions fail closed as `UNSUPPORTED` / `CLARIFY`; there is no SQL fallback and no guessed metric.
- Scope reuse is authenticated and bounded: the route resolves `getCurrentOrganization()`, then reuses the existing dashboard Organization/Business/Branch validation instead of creating a second IAM/scope path.
- Cross-currency handling and evidence availability inherit the governed dashboard contract. The answer evidence explicitly records `arbitrarySql=false` and `causalClaim=false`; model output never becomes numeric/execution authority.
- Fresh Production backing evidence: `18` ACTIVE Metric Definitions, `18` current Metrics Registry rows, `9,531` Analytics Warehouse facts, `0` malformed/blank event names, latest source event `2026-10-04T12:00:49.121715Z`, latest projection `2026-10-04T12:01:05.581066Z`.
- Controlled tests cover bounded windows, metric allowlisting, arbitrary-SQL prohibition, existing authenticated scope reuse, unavailable evidence, causal-claim prohibition and reports integration. No synthetic Production customer, metric, warehouse fact or query result was created.
- Direct public HTTP reprobe from the current tool network failed at DNS resolution, so no additional unauthenticated response-code claim is invented beyond the successful exact Production deploy/routed smoke evidence.

## DATA-EXPORTS Production closeout — 2026-10-04

- Work Package: `SECTION ANALYTICS_REPORTING -> DATA-EXPORTS`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled governed interactive export boundary and deployed `/reports` + `/api/data/export` surfaces. Google Sheets direct publishing is **BLOCKED_EXTERNAL** because no canonical Google Sheets connection exists. Scheduled delivery executor is implemented but activation remains **DEPENDENCY_PENDING -> DATA-REPORTING** until the canonical recurring schedule producer exists and is verified.
- Implementation PR #467 final head `add10bd62e17253f79d0f6d1742f36734e9dd00a` passed exact-head CI `37202082363` and merged to canonical `main@11c5ffeb763f799dd335a32fedfa130d119a5e50`.
- Exact-main CI `37202301397` succeeded on the merge SHA. Cloudflare Production Deploy `37202512872` succeeded on that exact SHA; the deploy built `λ /api/data/export` and `ƒ /reports`, preserved the Production Worker route and passed the routed Production smoke.
- Production migration `data_exports@20261004123515` is applied. Exact migration blob on the merge commit: `1da700e72e50599549945d71e9ba4a15214f8e5e`.
- Interactive exports support governed `CSV`, `JSON`, `XLSX` and `PDF` downloads. They reuse the authenticated dashboard scope validator plus the existing Metrics Registry + Analytics Warehouse path; no arbitrary SQL, raw provider-payload export, wider-scope fallback or copied analytics truth is introduced.
- Cross-currency values remain separated. XLSX/PDF generation is internal and does not add a third-party export authority.
- Production registry contract is present as `DELIVER_DATA_EXPORT` / `ANALYTICS_EXPORT_COMPOSER`, with `availability=DEPENDENCY_PENDING`, `required_work_packages=[DATA-REPORTING]`, `scheduleAuthority=SCHEDULE_DUE`, and `scheduleProducer=DEPENDENCY_PENDING_DATA_REPORTING`.
- Scheduled delivery reuses the existing Tool/Action Registry, Automation Runtime, Cloudflare Cron and EMAIL_PROVIDER. It does **not** add a second scheduler, queue, export-fact store, recipient store or provider credential authority.
- Production has one connected `EMAIL_PROVIDER`, but Organization notification email destinations = `0` and notification mailbox bindings = `0`; therefore no real scheduled provider delivery is claimed and no synthetic destination/mailbox was created.
- Production Google Sheets connections = `0`. The existing connected `GOOGLE_PLACES` discovery integration is unrelated and was not misused as Sheets credentials. CSV/XLSX remain the safe Sheets-compatible fallbacks.
- No forbidden parallel export relation exists: `data_exports`, `analytics_exports`, `report_exports`, `export_queue`, `export_jobs` and `export_facts` are absent.
- Post-migration advisors show no DATA-EXPORTS-specific security/performance regression. Existing advisor counts remain unrelated legacy findings.
- A direct unauthenticated HTTP reprobe of `/api/data/export` was not available from the current web tool, so no separate response-code claim is invented beyond the exact Production deploy/routed-smoke evidence. No fake authenticated session was created.

## DATA-REPORTING Production closeout — 2026-10-04

- Work Package: `SECTION ANALYTICS_REPORTING -> DATA-REPORTING`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled recurring cadence producer, schedule/runtime contract, deterministic multilingual reporting, governed anomaly evidence, Automation Builder surface and deployed Cloudflare scheduled integration. **Real scheduled provider-delivery E2E is UNAVAILABLE_NO_REAL_RULE_OR_DESTINATION_CONFIG** because Production currently has zero real reporting rules and zero Organization notification email/mailbox bindings; no synthetic rule, recipient, mailbox or provider message was created.
- Implementation PR #469 final head `141495464191e01929e15d6310b48d7eb71ed815` passed exact-head CI `37209260472` and merged to canonical `main@b10910c56359e57aea85b05ccf60a43b24404252`.
- Exact-main CI `37209489009` succeeded on the merge SHA. Cloudflare Production Deploy `37209692476` succeeded on that exact SHA; deploy job `111458159386` built `λ /api/operations/data-reporting-schedules` and `ƒ /automations`, preserved the Production Worker route and passed the routed Production smoke.
- Production migration `data_reporting@20261004143401` is applied from exact merge migration blob `508e95c47b5bc0cbe8c497bbe00003dcdb021162` (`supabase/migrations/20261004125500_data_reporting.sql`).
- Existing `DELIVER_DATA_EXPORT` is now contract version `2`, `AVAILABLE`, with no unresolved work packages. Its metadata records `scheduleAuthority=SCHEDULE_DUE`, `scheduleProducer=DATA_REPORTING_RECONCILER`, cadences `DAILY/WEEKLY/MONTHLY/CUSTOM`, languages `AUTO/EN/AR/FA`, summary modes `STANDARD/EXECUTIVE`, and governed anomaly evidence enabled.
- Cloudflare Cron remains the only scheduler. DATA-REPORTING reconciles published `SCHEDULE_DUE` automation rules into the existing `enqueue_automation_runtime_event` + AUTO-RUNTIME path. Deterministic source-event keys preserve idempotency; trusted `automationRuleId` targeting is accepted only for `SCHEDULE_DUE`.
- Cadence config is bounded by IANA timezone + local HH:MM; Weekly uses weekday 1..7, Monthly uses day 1..28, and Custom uses unique weekdays 1..7. A published-version activation boundary prevents newly published rules from backfilling an occurrence that predates that version.
- Report summaries are deterministic from the existing governed Dashboard / Metrics Registry / Analytics Warehouse evidence; no model becomes numeric/reporting authority. EN/AR/FA plus AUTO language resolution and STANDARD/EXECUTIVE modes are supported. Multi-currency values stay separated.
- Governed anomaly sections compare complete current 7-day versus previous 7-day warehouse projections for communication, commerce, booking and AI activity. Incomplete 14-day evidence fails closed; this is report anomaly evidence, **not** a separate real-time anomaly notification engine.
- `validate_automation_reporting_schedule` and the targeted `enqueue_automation_runtime_event` remain **SECURITY INVOKER**. `anon` and `authenticated` have no EXECUTE; `service_role` does.
- No parallel reporting authority exists: `report_schedules`, `report_queue`, `report_jobs`, `report_facts`, `reporting_schedules`, `reporting_queue`, `reporting_jobs` and `reporting_facts` are absent. No second scheduler, reporting warehouse, notification stack, recipient store or provider credential store was introduced.
- Fresh Production state after migration: `SCHEDULE_DUE rules=0`, `reporting rules=0`, Organization notification emails `0`, notification mailbox bindings `0`; the existing EMAIL_PROVIDER connection remains available. Therefore no real provider send is claimed.
- Post-migration advisors show no DATA-REPORTING-specific security/performance regression. Existing advisor debt remains separate: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`, plus generic unused-index INFO.
- No synthetic Production tenant, workflow, report schedule, recipient, mailbox, report, anomaly, export or provider message was created for verification.

## SAAS-PLANS-ENTITLEMENTS Production closeout — 2026-10-04

- Work Package: `SECTION SAAS_PLATFORM -> SAAS-PLANS-ENTITLEMENTS`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical plan identity, typed entitlement contract, effective entitlement resolution and authenticated read surface. Commercial pricing activation is intentionally **DEPENDENCY_PENDING -> SAAS-BILLING**; no price, subscription or customer entitlement was fabricated.
- Implementation PR #471 final head `01cb9b1f58e0c36d45526eaaa18ab9838d72a04e` passed exact-head CI `37211125515` and merged to canonical `main@d63c979b07f9063d40d8da485d8ed39c9d16bb9d`.
- Exact-main CI `37211391288` succeeded on the merge SHA. Cloudflare Production Deploy `37211637822` / job `111463846066` succeeded on that exact SHA and the deployed bundle contains `λ /api/saas/entitlements`; Production Worker routing and routed smoke remained healthy.
- Production migration `saas_plans_entitlements@20261004150621` is applied from exact merge migration blob `46edf603a8196a51d63a4ef0bfd6259764c44a4c` (`supabase/migrations/20261004145500_saas_plans_entitlements.sql`).
- The existing canonical Control Plane remains the only authority: `plans`, `pricing_versions`, `plan_entitlements`, `subscriptions`, `organization_entitlement_overrides`. No second plan, entitlement, subscription, feature, usage, billing or tenant authority was introduced.
- Canonical plan identities now exist for Starter, Growth, Pro, Business, Agency and Enterprise. All six remain `DRAFT` with `commercialActivation=PENDING_SAAS_BILLING`. Production has `0` canonical pricing versions, `0` total pricing versions, `0` subscriptions, `0` plan entitlements and `0` organization entitlement overrides.
- Entitlement values are now typed and fail closed across `FEATURE`, `LIMIT`, `SEATS`, `CHANNELS`, `ADDON`, `API` and `STORAGE`. Production has both shape constraints and both mutation guards live.
- `get_effective_saas_entitlements` preserves canonical precedence: active Organization override first, then the subscribed immutable pricing-version entitlement; absent subscription/override returns no grant. The resolver is executable by authenticated Organization members and `service_role`, not `anon`; the validator is not browser-executable.
- A trusted Production resolver call against an existing real Organization returned `0` effective rows, exactly matching the absence of real subscription/override evidence. No synthetic plan price, pricing version, subscription, tenant entitlement, add-on or allowance was created.
- No forbidden parallel SaaS/billing relations were found. Post-migration advisor categories remain the existing baseline: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`, plus generic unused-index INFO. No SAAS-PLANS-ENTITLEMENTS-specific advisor regression was introduced.

## SAAS-BILLING Production closeout — 2026-10-04

- Work Package: `SECTION SAAS_PLATFORM -> SAAS-BILLING`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Smart Visions platform-billing schema, deterministic calculation, immutable statement evidence, governed command boundary and OWNER/ADMIN read surface. A real tenant billing-cycle E2E remains **DEPENDENCY_PENDING** because Production intentionally has no active pricing version, subscription or billing profile; no commercial fixture was fabricated to manufacture an E2E pass.
- Implementation PR #473 final head `4d5d993d556c3320b7069c9d27bea9c493b5da4b` passed exact-head CI `37216200460`, including lint, typecheck, unit tests, PostgreSQL 17 migration/smoke, Next build, Vinext and Cloudflare scheduled verification. PR #473 merged to `main@bb6e7fb23f0acaf1ed99d6e983aa782c52910fa9`.
- Production-advisor FK hardening PR #474 final head `e92859ea7bf3c6c789d27b9861485e1d1b8726d5` passed CI `37216927762` and merged to functional `main@433e9fb83a4862d95b0b759d95c209413d91618d`. Exact-main CI `37217209249` and Cloudflare Production Deploy `37217441810` both succeeded on that exact SHA.
- Production migration history contains `saas_billing@20261004162558` and `saas_billing_fk_index_hardening@20261004163801`; neither migration was replayed during closeout verification.
- The package reuses canonical `plans`, `pricing_versions`, `subscriptions`, `plan_entitlements`, `organization_entitlement_overrides`, `organization_members`, `communication_channel_bindings`, `usage_events` / `usage_classification` and `audit_logs`. It does not replace tenant-facing `INVOICE-ENGINE` / `PAYMENT-CORE` and introduces no second tenant, IAM, subscription, plan, entitlement, usage, payment, invoice, credential or audit authority.
- The platform formula is explicit: `Setup + Platform + Features + Channels + Seats + AI Usage + Third-party Usage + Overage - Discounts + Tax`. Discount authority remains pending `SAAS-COUPONS`; payment collection remains explicitly false / not activated.
- Usage billing is fail-closed. AI charges use only `BILLABLE` OPENAI `usage_events`, preserve raw provider cost and use the canonical `pricing_versions.ai_cost_multiplier`. Generic metered usage excludes OPENAI, while third-party raw-cost billing excludes events carrying a `billingUnitKey`; this prevents the audited raw-cost/metered-unit double-count paths. INTERNAL / NON_BILLABLE / SYSTEM_RETRY / CACHED / PROMOTIONAL classifications are not customer-billable.
- Billing profiles require explicit evidence: USD conversion rate must equal 1; non-USD conversion requires a non-empty `rate_source`; positive tax requires a non-empty `tax_source`. No live FX or tax provider was invented.
- `saas_billing_statements` finalized rows are immutable and `saas_billing_line_items` are mutable only while their statement is DRAFT. Direct table mutation is guarded by the governed service command boundary. `put_saas_billing_profile_v1`, `generate_saas_billing_statement_v1` and `finalize_saas_billing_statement_v1` are SECURITY INVOKER, executable by `service_role` and not executable by `anon` or `authenticated`.
- RLS is enabled on all three `saas_billing_*` tables. Authenticated access is SELECT-only and tenant-scoped to Organization OWNER/ADMIN. `GET /api/saas/billing` and `/billing` preserve that role boundary and the API is `private, no-store`.
- Fresh Production commercial state is intentionally empty: canonical plans `6` / active plans `0`; pricing versions `0`; subscriptions `0`; billing profiles `0`; billing statements `0`; billing line items `0`. All six canonical plans remain `DRAFT`; their existing `commercialActivation=PENDING_SAAS_BILLING` metadata was not rewritten without real commercial activation evidence.
- Fresh Supabase Security Advisor has no SAAS-BILLING-specific finding. The only SAAS-BILLING-specific Performance Advisor entries are `unused_index` INFO notices on zero-workload billing indexes; the FK hardening removed the package-specific missing-FK-index findings. Existing unrelated advisor debt remains separate.
- No synthetic Production tenant, pricing version, subscription, billing profile, statement, line item, usage, tax/FX evidence, discount, coupon or payment evidence was created.

**Fresh continuation cursor:** `SECTION SAAS_PLATFORM -> SAAS-COUPONS`.

Before SAAS-COUPONS mutation, fresh-audit current main/open PRs and canonical pricing/plan/subscription/billing evidence. Extend the existing SAAS-BILLING discount line/evidence boundary only; do not create a second pricing, subscription, billing, invoice, payment, entitlement or usage authority. Coupon redemption must be deterministic, tenant-scoped, idempotent, evidence-backed and must not imply provider payment collection.


---

## AI-CONTEXT-COMPILER Production closeout — 2026-10-03

- Work Package: `SECTION BUSINESS_INTELLIGENCE_AI -> AI-CONTEXT-COMPILER`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.
- PR #427 (`15091aca8ef9a783c94cca93d075c246eb0a6d68`) passed exact-head CI `37087017247` and merged as `cfff8a71e1886e7982601f9b626f9fbcbc168191`.
- PR #429 (`4f5ac0ab4a7b1c111e820c0e2397597f3634c135`) passed exact-head CI `37088072184` and merged to canonical `main@0415e377cdc4ac4d9c10a5d1b7cdeca75136f014`.
- Exact-main CI `37106982355` and Cloudflare Production Deploy `37107165996` both succeeded on that exact main SHA.
- The compiler only produces bounded deterministic projections from canonical Customer/CRM, Conversation/Sales State, Business Twin, Knowledge V2, Memory V2, Services/Pricing, Locale, IAM Permission Context and Tool Action Registry authorities. It did not create a second CRM, customer profile, conversation memory, Knowledge, Memory, pricing, IAM or Tool Registry authority.
- Tool Registry availability remains metadata only: **tool availability is not execution authority, and model proposals are not execution permission**. Only actions explicitly registered for the `AI` execution surface are exposed to model context.
- No Context Compiler schema migration or synthetic Production data was required or created.

**Fresh continuation cursor:** `SECTION BUSINESS_INTELLIGENCE_AI -> AI-AGENT-RUNTIME`.

AI-AGENT-RUNTIME must extend the existing Agent pipeline, `agent_runs`, Tool Action Registry, approval/policy gates and canonical domain runtimes. It must not create a second Agent framework, policy engine, approval engine, action gateway, provider-send path or financial execution authority.

---

## MEMORY-V2 Production closeout — 2026-10-03

- Work Package: `SECTION BUSINESS_INTELLIGENCE_AI -> MEMORY-V2`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.
- The fresh audit reused the existing canonical authorities for Conversation history/summaries, `sales_conversations.sales_state`, CRM Person/Relationship/Business, CRM Tasks, Business Twin, Knowledge and `agent_runs`; no second CRM, conversation store, Business Twin, Knowledge Base, IAM, queue, vector store, audit log or agent-learning authority was introduced.
- PR #423 implemented target-aware MEMORY-V2. Exact-head CI `37083874310` succeeded. It merged to `main@1b87e2ec05cc5cc03fee686c0700f95b270b44da`; exact-main CI `37084135524` and Cloudflare Production Deploy `37084337238` succeeded on that exact SHA.
- Production migration `0184_memory_v2` is applied as version `20261003010022`.
- Canonical `CONVERSATION`, `CUSTOMER`, `RELATIONSHIP` and `BUSINESS` memory is composed at retrieval time from source authorities. Only derived `WORKING`, `EPISODIC`, `OPERATIONAL` and `AGENT_LEARNING` assertions persist in `public.memory_items`.
- Persisted Memory carries source/evidence, confidence, observed/freshness bounds, sensitivity, validity, correction/supersession and expiry semantics. Working Memory requires expiry within 30 days. Derived/System/Agent candidates remain `PENDING_REVIEW` until explicit OWNER/ADMIN approval.
- Active/version identity is target-aware across Organization/Person/Business/Conversation using NULLS-NOT-DISTINCT unique indexes, so identical keys can coexist across legitimate targets without cross-customer collisions.
- PR #425 hardened `AGENT_RUNTIME` provenance so Agent Learning must reference a real canonical `agent_runs` row in the same Organization and remain consistent with Conversation/Person/Business targets. Exact-head CI `37084937083` succeeded; it merged to `main@ac3c0198cb03861c1936ad81c7985d3389ec0751`. Exact-main CI `37085168422` and Cloudflare Production Deploy `37085331976` succeeded on that exact SHA.
- Production migration `0185_memory_v2_agent_source_hardening` is live. Two near-simultaneous idempotent ledger entries were recorded at versions `20261003011446` and `20261003011451`; both have identical statement hash `78c2aae8fae61e5635c04a38849118b1`. The migration only replaces the validator plus ACL/comment metadata, so no duplicate data or authority was created.
- Production runtime verification proved a real canonical Agent Run passes provenance validation while a missing Agent Run UUID is rejected. `service_role` can execute trusted Memory staging/approval/resolution; `authenticated` and `anon` cannot execute those trusted mutation/resolver functions.
- `memory_items` RLS is enabled with OWNER/ADMIN read policy. Production currently has `memory_items=0`, active `0`, pending `0`, Agent Learning `0`; no synthetic Memory was created for verification.
- No parallel Memory authorities exist: `memory_queue`, `memory_events`, `memory_vectors`, `memory_conversations`, `memory_customers` and `agent_learning` are absent.
- Routed Production smoke for `/memory` resolves unauthenticated traffic to the real `/login` surface after the exact-main deploy, confirming the deployed session boundary.
- Fresh advisor comparison after 0185 shows no tracked regression: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. Generic `unused_index=447` remains INFO and includes zero-workload Memory indexes.

**Fresh continuation cursor:** `SECTION BUSINESS_INTELLIGENCE_AI -> AI-CONTEXT-COMPILER`.

Before mutation, fresh-audit the existing Agent context hydrator/contracts plus canonical Customer/Conversation/CRM/Business Twin/Knowledge/Memory/Pricing/Policy/Locale/Permission/Tool Registry inputs. The Context Compiler must deterministically compose bounded evidence from those authorities and must not create a second customer profile, conversation memory, CRM, Knowledge, Memory, pricing, policy, IAM or tool-availability authority.

---

## KNOWLEDGE-V2 Production closeout — 2026-10-03

- Work Package: `SECTION BUSINESS_INTELLIGENCE_AI -> KNOWLEDGE-V2`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Knowledge authority, source/provenance governance, review lifecycle, freshness/conflict handling, full hierarchy scoping, file/FAQ/Catalog ingestion, agent evidence and deployed UI. The external Crawl4AI endpoint configuration is separately **BLOCKED_EXTERNAL / CONFIG_REQUIRED** because `CRAWL4AI_URL` is not currently bound on either Cloudflare Worker. Image-only/scanned-PDF OCR remains **DEFERRED_WITH_REASON** to the governed Vision/OCR capability.
- Base implementation PR #417 final head `014fcc4763dd6a53a46f0a46fb7fbd7408cc1f11` passed exact-head CI `37075843449`; it squash-merged to `main@1b371ae8746053023c5bc13df8f2140bebbd5260`, whose exact-main CI `37077335921` and Cloudflare Production Deploy `37077559597` both succeeded.
- Hierarchy/evidence hardening PR #419 final head `c96bb2b9b517040693f308a399151ee951ac35b6` passed exact-head CI `37079619958`, including PostgreSQL 17 migration/smoke, lint, typecheck, tests, Next build, Vinext and scheduled verification. PR #419 squash-merged to `main@e451fe5184c29f7f8b936d33e83a24577a709ac3`; exact-main CI `37079954662` and Cloudflare Production Deploy `37080208227` succeeded on that exact SHA.
- Crawl authority reuse PR #421 final head `bc6d72022148b442d87b576489d8cd7c0bae5b32` passed exact-head CI `37080812851`. PR #421 squash-merged to current canonical `main@afa8c8d62ab58edb67abb75ee02ac5cf24bc75b6`; exact-main CI `37081073526` and Cloudflare Production Deploy `37081311038` both succeeded.
- Exact database migrations are `supabase/migrations/0182_knowledge_v2.sql` blob `45bc9e14ba69b07a7ea69f91d68931c60b71a142` and `supabase/migrations/0183_knowledge_v2_scope_evidence_hardening.sql` blob `9aba6e601c8f943f443967375a2e43d4272c7722`. Supabase Production records `0182_knowledge_v2@20261002232638` and `0183_knowledge_v2_scope_evidence_hardening@20261003000123`.
- `knowledge_versions` remains the canonical published Knowledge authority. `knowledge_sources` is only the governed provenance/freshness registry. No second Knowledge Base, vector authority, ingestion queue, approval table/system, IAM model, hierarchy model or agent framework was introduced.
- Production data was preserved in place: exactly 3 Knowledge versions remain, with 2 active versions, 0 pending versions, 0 rejected versions and 0 registered Knowledge Sources. The active real topics remain `smartvisions_brand_positioning v1` and `smartvisions_customer_journey v2`; the historical `smartvisions_customer_journey v1` remains inactive. No fake Source, crawl, file, FAQ, Business, Brand, Branch, Department, Team, conflict, approval, embedding or Knowledge publication was created.
- The source taxonomy now supports `MANUAL`, `WEBSITE`, `FILE`, `PDF`, `DOC`, `TEXT`, `FAQ`, `CATALOG`, `SERVICE`, `POLICY`, `INTEGRATION`, `API` and `SYSTEM` while preserving canonical Catalog/Service/Policy truth outside Knowledge.
- Knowledge scope now supports the canonical hierarchy `ORGANIZATION / BRAND / BUSINESS / BRANCH / DEPARTMENT / TEAM`. Active uniqueness is scope-aware through `knowledge_versions_one_active_scope_uidx`, so the same Knowledge key can coexist legitimately across separate scopes. RLS reuses `can_access_unified_inbox_scope` rather than creating a second IAM authority.
- External ingestion remains review-gated: Source -> fetch/import -> staged `PENDING_REVIEW` version -> explicit manager approval -> active published Knowledge. Changed evidence cannot silently replace approved truth, identical pending/approved evidence is deduplicated, and conflicting changes are marked for review.
- Review and verification history reuses the existing `audit_logs` authority; the Knowledge UI surfaces lifecycle events read-only. No `knowledge_ingestion_runs` or second approval queue/table was created.
- Freshness uses Source/version timestamps and stale-after semantics; stale external Knowledge is excluded from default retrieval. Conflict state, immutable provenance, source locator/type, sensitivity, scope, confidence and review state are exposed to the retrieval/agent context.
- Website Knowledge now reuses the existing `Crawl4AiAuditor` in `lib/audit/crawl4ai.ts`. Its structured evidence is treated as untrusted and staged for review; the prior direct Knowledge-side mini-crawler is no longer the website ingestion authority. Production deployment evidence reports `CRAWL4AI_URL` binding **missing** on both release-candidate and production Workers, so real website ingestion remains **BLOCKED_EXTERNAL / CONFIG_REQUIRED** until that existing provider endpoint is configured. No Production crawl was fabricated to bypass this blocker.
- File ingestion supports text-bearing PDF, DOCX, TXT, Markdown, HTML, CSV and JSON with bounded extraction. Image-only/scanned PDF extraction explicitly fails rather than inventing content; OCR is **DEFERRED_WITH_REASON**.
- FAQ/Policy/Manual/Service/Integration/API/System text can be staged through the same governed Source -> review -> publication authority. Catalog ingestion derives descriptive retrieval evidence from canonical Services/Catalog records while Price, Inventory and Payment remain execution-time canonical authorities and are not copied as authoritative Knowledge.
- Agent hydration receives Knowledge version plus source type/locator, provenance, sensitivity, scope, freshness, conflict, confidence and review state. The full hierarchy resolver exists and is Production-verified. Current agent hydration intentionally resolves Organization scope until legitimate tenant hierarchy/routing context exists; narrower live agent consumption is **DEFERRED_WITH_REASON**, not simulated with fake hierarchy rows.
- Runtime ACL verification confirms trusted Knowledge mutations and both hierarchy-aware/compatibility resolvers are service-role only; anonymous/authenticated callers cannot execute them. The superseded legacy `publish_knowledge_version(uuid,text,jsonb)` has no runtime execute privilege.
- Final Cloudflare deploy `37081311038` verified the production Worker Route, candidate/production safe smokes and the specific `/knowledge` route. An unauthenticated routed request to `/knowledge` returned HTTP `307` with a valid Cloudflare `cf-ray`, confirming the deployed session boundary.
- Fresh advisor comparison after Production verification shows no tracked regression: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. Generic `unused_index=436` remains INFO and includes zero-workload/new authority indexes.
- PR #420 (`feat/memory-v2`) was closed without merge because it started before KNOWLEDGE-V2 finished. Its branch must not be treated as authoritative; MEMORY-V2 must be fresh-audited/rebased from the final main before any mutation.

**Fresh continuation cursor:** `SECTION BUSINESS_INTELLIGENCE_AI -> MEMORY-V2`.

Before MEMORY-V2 mutation, fresh-audit conversation history/summaries, sales state, Customer 360/Person/Account relationships, tasks/events, Business Twin/Knowledge references and every existing memory-like state. MEMORY-V2 must extend canonical authorities and typed projections without creating a second CRM, conversation store, Business Twin, Knowledge Base, audit log, IAM model, queue or agent-learning authority.

---

## BRAIN-INDUSTRY-PACKS Production closeout — 2026-10-03

- Work Package: `SECTION BUSINESS_INTELLIGENCE_AI -> BRAIN-INDUSTRY-PACKS`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled versioned Pack framework, built-in catalog and governed Business activation boundary. Future/external Custom Object materialization remains **DEFERRED_WITH_REASON** until a canonical Custom Object authority exists; the Pack layer does not create a parallel object runtime.
- Implementation PR #415 final head `6ee0a67a2b1450860ee6edf07985b0b79dd49795` passed exact-head CI `37071851033`: lint, typecheck, tests, complete PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification all succeeded.
- PR #415 squash-merged to canonical `main@3d62c5de926f1f66ca278ca0182a452be86b2d48`. Exact-main CI `37072203881` succeeded on that exact merge SHA. Cloudflare Production Deploy `37072497317` also succeeded on the same SHA.
- Exact merged migration source is `supabase/migrations/0181_industry_packs.sql`, blob `b24f5e6018e0559f72a4eb8de98e86b934590553`. Supabase Production records `0181_industry_packs@20261002222659`.
- Production contains exactly 9 active built-in Pack definitions and 9 immutable V1 manifests: Dental/Medical, Pet Clinic, Automotive, Beauty/Wellness, Restaurant/Cafe, Home Services, Real Estate, Education and Retail/Professional Services.
- Every built-in Pack reports `runtimeReady=true` against the current canonical runtime. Readiness validates supported CRM Custom Field entity/data types, Pipeline shape, currently AVAILABLE Automation triggers and allowed Business Twin default keys before activation.
- Future/external Custom Object blueprints remain explicit `DEPENDENCY_PENDING` evidence rather than silently creating a second object store. Eight current packs expose one pending Custom Object dependency; Restaurant/Cafe exposes none.
- Pack activation is Business-scoped, OWNER/ADMIN governed, service-role executed, audit/idempotency protected and optimistic-versioned. Direct authenticated activation/deactivation is denied.
- Activation remains declarative: it does **not** silently create CRM Custom Fields, Pipelines, Automations, Catalog items, Bookings, Payments, messages or Deals. Those existing modules remain the only operational authorities and any future materialization must cross their governed contracts.
- Runtime catalog/version rows are immutable during normal runtime and migration-upgradable only through the explicit migration guard. Catalog/version/activation guards are enabled.
- Business Twin V2 composes bounded Pack references only, not full Pack operational state. Read-only Production compilation succeeds at `schemaVersion=2` with `industryPackReferences=[]` because Production still has zero canonical tenant Businesses and therefore zero legitimate Pack activations.
- Production is side-effect clean: `industry_packs=9`, `industry_pack_versions=9`, `industry_pack_activations=0`, `tenant_businesses=0`, `brands=0`, `branches=0`, `business_twin_versions=0`. No demo Business, activation, operational Pack materialization or Twin snapshot was manufactured.
- Runtime ACL verification confirms service-role Pack activation and Twin V2 publish are executable; authenticated callers cannot execute either trusted mutation. Authenticated Pack-context resolution remains available under RLS/member scope.
- Fresh routed Production smoke verifies `/industry-packs` is deployed and remains session-protected: unauthenticated request returns `307 -> /login`.
- Fresh advisor baseline remains unchanged in tracked security/performance debt: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. Generic `unused_index` is currently `419` INFO findings, including fresh zero-row indexes and not treated as a security/authority regression.

**Fresh continuation cursor:** `SECTION BUSINESS_INTELLIGENCE_AI -> KNOWLEDGE-V2`.

Before mutation, fresh-audit the existing Knowledge authority, ingestion/publish/versioning path, current `knowledge_versions` usage, website/file/FAQ/catalog ingestion, provenance, approval, freshness, scoped retrieval and stale/conflicting-source behavior. KNOWLEDGE-V2 must extend the canonical Knowledge path rather than create a second Knowledge Base, vector authority, ingestion queue or approval model.

---

# Smart Visions Growth OS — Current Production State

## BRAIN-BUSINESS-TWIN Production closeout — 2026-10-03

- Work Package: `SECTION BUSINESS_INTELLIGENCE_AI -> BRAIN-BUSINESS-TWIN`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Business Twin scope.
- Implementation PR #413 final head `05c5a1c3c9ea2f93aa48f73cf2e2588478d04099` passed exact-head CI `37063571893` across lint, typecheck, unit tests, the complete PostgreSQL 17 migration chain plus Business Twin controlled smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #413 squash-merged to canonical `main@147b782b1925b5e6780c8f360d2bc2e6abc35d6a`. Exact-main CI `37063966903` succeeded on that exact SHA. Cloudflare Production Deploy `37064288073` also succeeded on the same SHA.
- Production migration source `supabase/migrations/0180_business_twin.sql` is applied in Supabase Production as `0180_business_twin@20261002210152`; merged migration blob SHA is `7da9289bb5454d52373a6c6540ac3ebca33db6ca`.
- Business Twin is a compiled/versioned read model over existing canonical authorities only. It does **not** create a second Catalog, pricing store, Booking engine, Payment ledger, Knowledge Base, tenant hierarchy, CRM or secret store.
- The compiler composes Organization/Brand/Business/Branch hierarchy, staff/scope assignments, locale/market settings, Services/prices, Catalog products/variants/prices, Service booking profiles, Payment-provider readiness and active Knowledge version references.
- Business-hours, customer/refund/warranty policies, booking/payment/delivery rules, brand tone, language preferences, escalation rules and operational constraints reuse the existing `scope_configuration_overrides` authority under the guarded `business_twin` namespace. Direct namespace mutation is blocked; OWNER/ADMIN provenance and optimistic version checks are enforced through governed service-role RPCs.
- Published Twin versions are immutable and source-hash deduplicated. A per-Organization advisory transaction lock serializes publication; unchanged canonical truth reuses the latest version rather than manufacturing a new snapshot.
- Stored provider secrets and Knowledge payload bodies are intentionally excluded from Twin snapshots. Payment/provider truth and Knowledge content remain owned by their canonical modules.
- Production verification is side-effect clean: `business_twin_versions=0`, Business-Twin scoped configuration rows `0`, Brands `0`, Businesses `0`, Branches `0`, Catalog Products `0`. No synthetic Business, Branch, Catalog item, policy, Twin snapshot, Payment or Knowledge record was created.
- Read-only Production compilation succeeds against real Smart Visions canonical state: 1 Organization/OWNER, 8 Services, 6 locale profiles, 2 active Knowledge references, and currently 0 canonical Businesses/Branches/Products. This confirms composition without seeding missing business hierarchy.
- Runtime ACL verification confirms `service_role` has SELECT/INSERT but no UPDATE/DELETE on immutable Twin versions; authenticated callers cannot execute publish/configuration mutation RPCs. Both immutability and Business-Twin configuration guard triggers are enabled.
- Fresh routed Production smoke after deploy verifies `/business-twin` is present and remains session-protected: unauthenticated request returns `307 -> /login`.
- Fresh advisor safety baseline remains unchanged for tracked categories: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. The generic `unused_index` INFO advisory currently includes the new empty Twin-table indexes, expected before real Twin-version workload and not a security/authority regression.

**Fresh continuation cursor:** `SECTION BUSINESS_INTELLIGENCE_AI -> BRAIN-INDUSTRY-PACKS`.

Before mutation, fresh-audit existing tenant hierarchy, Business Twin scoped configuration, Catalog/Booking/CRM/Automation/Knowledge/AI evaluation/template authorities and any current vertical-specific code. Industry Packs must configure the canonical core, not fork it. A pack may supply onboarding defaults, allowed custom fields/objects, workflow/templates/metrics/evaluation scenarios and scoped configuration, but must not create parallel CRM, Catalog, Booking, Payment, Knowledge, IAM, queue or agent runtimes.

---


## PAYMENT-EXTENSION Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> PAYMENT-EXTENSION`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled provider-extension boundary. No future gateway was fabricated merely to prove extensibility.
- Implementation PR #411 final head `731fd3738dc5367c3ecedb441d610cfef682a69a` passed exact-head CI `37057706351` across lint, typecheck, tests, the full PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. An earlier exact-head run `37057515931` failed one pre-existing PAYMENT-OMAN wording assertion after the provider page became generic; the visible secret-disclosure guard wording was restored and the final exact-head rerun passed cleanly.
- PR #411 squash-merged to canonical `main@36bb227b50cc7efb35e37633be43ce358714075e`. Exact-main CI `37058095341` and Cloudflare Production Deploy `37058390433` both succeeded on that exact SHA.
- PAYMENT-EXTENSION required **no database migration**. Production schema therefore correctly remains through `payment_oman@20261002185224`; no provider-registry table, second ledger, provider-specific refund store, webhook journal, queue, IAM or scheduler was introduced.
- The provider boundary is now explicit in `lib/payments/providers/catalog.ts` and `lib/payments/providers/runtime.ts`. Every executable gateway must be registered with a stable provider code, supported countries/currencies, explicit capabilities and `settlementAuthority=PAYMENT_CORE`.
- Current registered adapters are Tap and Thawani. Their protocol-specific signature/readback/API logic remains in the existing Oman adapter boundary, while operator configuration, Payment Link creation, Refund execution and server reconciliation now cross the provider-neutral registry/runtime.
- Unknown providers fail closed. Currency and capability compatibility are checked before provider execution. Current Tap truth advertises OMR hosted links, verified webhook, server readback, refund and partial refund. Current Thawani truth advertises OMR hosted links, server readback and refund, but does not falsely advertise partial refund.
- `integration_connections` plus the existing Supabase Vault remain the only provider configuration/credential authority. The new abstraction does not persist plaintext credentials or return stored secrets to the browser.
- PAYMENT-CORE remains the only settlement/refund transaction authority. Provider-created links and HTTP success never become paid/refunded truth by themselves; only verified webhook or authenticated provider readback evidence can enter the canonical provider-event/transaction path.
- Business Web provider configuration and Payment Intent detail are now catalog-driven instead of hardcoded to Oman provider names. Adding another country/gateway is constrained to registration + adapter/configuration/callback evidence rather than forking the payment system.
- Fresh routed Production smoke after deploy verifies the operator provider page remains session-protected (`307` unauthenticated), while Tap return and Thawani reconciliation routes reach public handlers and safely return `400` for missing required identity; invalid Tap webhook input also returns `400`.
- Production remains side-effect clean: `payment_intents=0`, `payment_links=0`, `payment_refunds=0`, `payment_provider_events=0`, `payment_transactions=0`, registered Oman provider connections `0`, and Payment/Tap/Thawani-named Vault secrets `0`. No synthetic future provider, merchant, credential, Payment Link, capture, Refund or webhook success was created.
- Fresh advisor baseline is unchanged: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`.
- Real Tap/Thawani merchant activation and real-money E2E remain **BLOCKED_EXTERNAL** until legitimate merchant credentials/approval exist. Future provider activation likewise requires real external evidence and is not implied by this abstraction.

**Fresh continuation cursor:** `SECTION BUSINESS_INTELLIGENCE_AI -> BRAIN-BUSINESS-TWIN`.

Before mutation, fresh-audit current organization/business/branch/service/catalog/pricing/policy/hours/staff/locale/knowledge/CRM/booking/payment operational truths and existing settings/knowledge tables. BRAIN-BUSINESS-TWIN must compose/version canonical business truth without inventing a second Catalog, CRM, settings store, Knowledge Base, pricing authority or tenant hierarchy.

---


## PAYMENT-OMAN Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> PAYMENT-OMAN`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Oman gateway-adapter scope. Real merchant activation, merchant approval, credentials and real-money E2E remain **BLOCKED_EXTERNAL** until legitimate provider evidence exists.
- Implementation PR #408 final head `dd39c43a6f3d9a97f3190941a570bef286e85f1c` passed exact-head CI `37049624399` across lint, typecheck, tests, the complete PostgreSQL 17 migration chain plus PAYMENT-OMAN controlled smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #408 squash-merged to canonical `main@87a036cac3bf983a787523162fddc4ca4f07677b`. Exact-main CI `37050014540` and Cloudflare Production Deploy `37050299511` succeeded on that exact merge SHA.
- Production migration source `supabase/migrations/0179_payment_oman.sql` is applied in Supabase Production as migration `payment_oman@20261002185224`; merged migration blob SHA is `006b9e68fa83392feea5b2d4a596fd16e844290d`.
- PAYMENT-OMAN extends the existing canonical PAYMENT-CORE only. Tap and Thawani remain provider adapters; they do not own a second payment ledger, Invoice, Refund engine, webhook journal, queue, IAM, scheduler or billing authority.
- Provider credentials use the existing Supabase Vault boundary. `integration_connections` stores only Vault references and non-secret provider configuration. Trusted credential create/update/read and provider-configuration functions are service-role-only, SECURITY INVOKER, and denied to `authenticated`.
- Tap support includes hosted OMR charge creation, merchant binding, verified hashstring webhook ingestion, authenticated charge readback, governed Payment Link evidence, and provider refund execution/reconciliation. A Tap API response or link never marks an Invoice paid without canonical verified provider evidence.
- Thawani support includes TEST/LIVE hosted checkout sessions, OMR-to-baisa normalization, publishable/secret key separation, authenticated server-to-server session readback, governed settlement reconciliation, and provider refund execution where supported.
- Ambiguous provider outcomes fail closed into the existing `RECONCILIATION_REQUIRED` path. Captures/refunds still enter the immutable PAYMENT-CORE provider-event/transaction authority with replay-safe provider event IDs.
- Business Web exposes authenticated Oman-provider configuration and Payment Link/refund controls under the existing Payments surfaces. Stored provider secrets are never displayed back to operators.
- Production routed smoke found a real callback-routing defect after the first deploy: new provider callbacks were receiving the operator-auth `307` redirect. Hotfix PR #409 final head `bfd10b3881642f3ecc966ebab0249513e29df71f` passed exact-head CI `37050896062` and merged to canonical `main@bc2fc8664c1fa22def73e50e1ac98ed03bfd6ecb`.
- Exact-main CI `37051363965` and Cloudflare Production Deploy `37051736988` succeeded on the hotfix merge SHA. Fresh routed Production smoke verifies `/payments/providers` remains auth-protected (`307` unauthenticated), while Tap return, Thawani reconciliation and invalid provider webhook POSTs reach the public callback handlers and fail safely with `400` instead of redirecting to Login.
- Production verification remains side-effect clean: `payment_intents=0`, `payment_links=0`, `payment_refunds=0`, `payment_provider_events=0`, `payment_transactions=0`, Oman provider connections `0`, and Payment-named Vault secrets `0`. No synthetic merchant, credential, customer, Payment Link, transaction, refund, provider callback or provider-success evidence was created.
- Fresh advisor baseline remains unchanged from the pre-PAYMENT-OMAN baseline: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`.
- Tap/Thawani merchant onboarding, real provider credentials, provider approval and a real paid/refunded transaction remain external-evidence gated. Their absence does not justify fake Production success.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> PAYMENT-EXTENSION`.

Before mutation, audit the new canonical provider adapter boundary plus current `PAYMENT-CORE`, `integration_connections`, Vault wrappers, provider callback/reconciliation contracts, UI/provider selection and currency assumptions. PAYMENT-EXTENSION should make future country/gateway adapters plug into the same canonical payment truth without provider-specific ledgers, credential stores, webhooks, refund engines or settlement state.

---


## PAYMENT-CORE Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> PAYMENT-CORE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled provider-neutral Payment Core scope.
- Implementation PR #406 final head `4f9a9124fb113615a6bcd379fa0bce2302ce3c82` passed exact-head CI `37040760574` across lint, typecheck, tests, the full PostgreSQL 17 migration chain plus PAYMENT-CORE controlled smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #406 squash-merged to canonical `main@1669f47eb214427860983377d56aa37572119067`. Exact-main push CI `37041194204` succeeded on that exact merge SHA. Cloudflare Production Deploy `37041596109` succeeded on the same SHA through exact-green checkout, release-candidate smoke, controlled SSR load, Production promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0178_payment_core@20261002173449` is live from merged migration blob `bbd54adcdaa84e12445c303288a3da794707a2f9`.
- Canonical Payment authority is one provider-neutral chain: `public.payment_intents`, `payment_links`, immutable `payment_provider_events`, immutable `payment_transactions`, and governed `payment_refunds`. It does not create a second Invoice, Order, Catalog, SaaS billing ledger, provider send plane, outbox, approval engine or scheduler.
- Invoice commercial truth remains owned by INVOICE-ENGINE. Payment Core owns money intent/provider evidence/settlement/refund truth and is the only governed writer of the Invoice `paid_total` settlement projection. Payment Link creation, provider request acceptance or ambiguous HTTP outcomes never mark an Invoice paid.
- Settlement/refund ingress accepts only verified provider-webhook evidence or explicit reconciliation evidence. Provider event IDs are replay-safe/idempotent; conflicting replay fails closed. Ambiguous outcomes enter `RECONCILIATION_REQUIRED` rather than manufacturing success.
- Partial Invoice collection is supported by bounded exact-amount Payment Intents. Capture enforces current Invoice balance and prevents over-settlement. Refund requests do not move money; only verified/ref reconciled refund evidence decreases the governed Invoice paid projection. Refund and Credit Note remain distinct money-movement vs commercial-correction concepts.
- `PAYMENT_INTENT`, `PAYMENT_CAPTURED`, `PAYMENT_FAILED`, and `PAYMENT_REFUNDED` are now AVAILABLE canonical Automation triggers with subject `PAYMENT`, drained by the existing Automation Runtime. No second scheduler/event plane was introduced.
- Customer 360 V6 composes Payment truth over V5 with a cutover-safe V6 -> V5 app fallback. Business Web exposes `/payments`, Payment evidence detail, Invoice -> Payment Intent creation, unresolved-intent cancellation and governed Refund request surfaces; there is no manual “mark paid” shortcut.
- Production verification is side-effect clean: `payment_intents=0`, `payment_links=0`, `payment_refunds=0`, `payment_provider_events=0`, and `payment_transactions=0`. No synthetic Production Payment Intent, link, transaction, refund, provider callback, customer or merchant success was created.
- RLS is enabled on all five exposed Payment tables. Authenticated access is scoped read-only; direct authenticated INSERT/UPDATE is absent. Trusted financial mutation/provider-event RPCs are service-role-only while Customer360 V6 remains authenticated-readable through its governed composition.
- Runtime verification confirms canonical Payment RPCs, Customer360 V6, Invoice Payment projection guard and Payment Automation triggers are live.
- Post-`0178` advisor categories/counts remain unchanged from the pre-Payment baseline: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. Fresh zero-row Payment indexes may appear as unused-index INFO and are not an integrity regression.
- Production Vault currently has no Tap-, Thawani- or generic Payment-named secret records. PAYMENT-CORE therefore does **not** claim real provider activation, merchant approval or real-money E2E evidence. Those provider-specific responsibilities belong to the next official Work Package, `PAYMENT-OMAN`.
- Existing real-tenant WhatsApp E2E / same-number Coexistence blockers remain external-evidence gated and unchanged.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> PAYMENT-OMAN`.

Before mutation, fresh-audit existing provider abstractions, integration bindings, Vault refs, provider webhook journals/idempotency/reconciliation patterns, current Tap/Thawani code/docs/credentials/merchant activation state, Payment Core adapter boundaries, approval/audit/Automation reuse, and current Production webhook/deploy routing. PAYMENT-OMAN must extend canonical PAYMENT-CORE only; it must not create provider-specific payment ledgers, a second webhook plane, a second refund engine, or fake provider success.

---


## INVOICE-ENGINE Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> INVOICE-ENGINE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical Invoice/Credit Note scope.
- Implementation PR #404 final head `a1017fdbb30580343e7f3243743d19978650c2dd` passed exact-head CI `37028750396` across lint, typecheck, tests, the full PostgreSQL 17 migration chain plus INVOICE-ENGINE controlled smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #404 squash-merged to canonical `main@f5cd536af673c6f3f18085d78e3976ba279c596f`. Exact-main push CI `37029188586` succeeded on that exact merge SHA. Cloudflare Production Deploy `37029594495` succeeded on the same SHA through exact-green checkout, release-candidate smoke, controlled SSR load, Production promotion, routed smoke and safe API/webhook rejection smoke.
- Production migration `0177_invoice_engine@20261002154909` is live from merged migration blob `07382072f26b9f457ecd12b801717e354f2f344b`.
- Canonical Invoice authority is `public.invoices` with immutable `invoice_line_items`, immutable `invoice_credit_notes` / `invoice_credit_note_line_items`, and durable `invoice_lifecycle_events`. One canonical Invoice is allowed per canonical Order; creation converges on the existing Invoice rather than manufacturing a parallel commercial document.
- Invoice commercial values and tax/VAT evidence snapshot canonical ORDER-ENGINE evidence. INVOICE-ENGINE does not re-price Catalog data, does not create a second tax authority, and persists immutable issue-time customer documents with governed print/Save-as-PDF surfaces.
- Governed lifecycle covers Draft, Issued, Overdue and Void plus bounded line-level Credit Notes. Credit Notes reduce commercial balance only and never execute a money refund. `paid_total` is deliberately frozen until `PAYMENT-CORE` owns governed settlement projection; Payment/refund transaction truth is not invented in this slice.
- `INVOICE_ISSUED` and `INVOICE_OVERDUE` are now AVAILABLE canonical Automation triggers with subject `INVOICE`. Due/overdue reconciliation and Invoice event projection reuse the existing Automation Runtime scheduler. The same runtime wiring also now invokes the pre-existing `reconcile_order_automation_events` producer so already-AVAILABLE Order triggers are actually drained without adding another scheduler.
- Customer 360 V5 composes Invoice truth over V4 with a cutover-safe fallback during app-before-migration deployment windows. Business Web exposes `/invoices`, Order -> Invoice creation, governed issue/void/Credit Note operations, lifecycle evidence and immutable Invoice/Credit Note document routes.
- Production verification is side-effect clean: `invoices=0`, `invoice_line_items=0`, `invoice_credit_notes=0`, `invoice_credit_note_line_items=0`, and `invoice_lifecycle_events=0`. No synthetic Production Invoice, Credit Note, customer, Order, payment, refund or provider evidence was created.
- RLS is enabled on all five exposed Invoice tables; governed mutation/reconciliation RPCs are service-role-only while authenticated access remains scoped read-only. Runtime verification confirms the Invoice RPCs, Customer360 V5, Payment-Core freeze guard and AVAILABLE Invoice Automation triggers are live.
- Post-`0177` advisor categories/counts are unchanged from the pre-Invoice baseline: security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. Fresh zero-row Invoice indexes may appear as unused-index INFO and are not an integrity regression.
- Existing real-tenant WhatsApp E2E / same-number Coexistence blockers remain external-evidence gated and unchanged.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> PAYMENT-CORE`.

Before mutation, fresh-audit current Invoice/Order/Quote/Customer/Deal/Booking/Billing ledger/payment-link/provider/webhook/refund/idempotency/approval/Automation authorities plus Production provider credentials and activation state. PAYMENT-CORE must introduce one canonical payment/settlement/refund transaction authority only; it must not rewrite immutable Invoice evidence, invent provider acceptance, or create a second billing ledger/provider-send plane.

---


## INVENTORY-FULFILLMENT Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> INVENTORY-FULFILLMENT`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical Inventory/Fulfillment scope.
- Implementation PR #401 final head `c3b5d985a195ee3e0de5a76b04f6ae7c3fbb4e9b` passed exact-head CI `37019957842`; it squash-merged to `main@406893e57218b9ef1887dcf87cb8ae9d68a28832`. Exact-main CI `37020435853` and Cloudflare Production Deploy `37020829093` succeeded on that exact merge SHA.
- Production migration `0175_inventory_fulfillment@20261002143506` is live from merged blob `6848f76bc4a3fe5c2705d2ed4de8f5610d20e864`.
- Canonical Inventory authority is now `inventory_locations`, `inventory_items`, `inventory_stock_balances`, `inventory_reservations`, immutable `inventory_movements`, and derived `inventory_low_stock_v`. Catalog Product/Variant identity remains upstream truth; `branches` remains branch identity; Order remains customer-facing commercial/fulfillment truth.
- Inventory supports BRANCH/WAREHOUSE stock locations, Product/Variant stock tracking, governed positive/negative adjustments, non-negative on-hand/reserved invariants, idempotent Order reservation/release, atomic reserved-stock consumption into existing Order fulfillment, automatic outstanding reservation release on canonical Order cancellation, low-stock evidence and audited mutations. The Business Web exposes the governed `/inventory` operator surface.
- `STOCKED` Catalog Product/Variant lines are Inventory-managed. Services and non-STOCKED Catalog lines retain the existing direct ORDER-ENGINE fulfillment path. Booking resources and Field Service material-use evidence were not repurposed as stock authority.
- Integrity hardening PR #402 final head `1bbddc86cf4b8b0d286bcd147bea2e1c9d119c9e` passed exact-head CI `37021395045`; it squash-merged to canonical `main@0a4b46e2579974a3e7391ad4e57ea9a4caae9650`. Exact-main CI `37021808114` and Cloudflare Production Deploy `37022193335` succeeded on that exact SHA.
- Production hardening migration `0176_inventory_fulfillment_integrity_hardening@20261002144704` is live from merged blob `d85274e34dde3c6245eb0d2521bfb7e6f6b1de63`. It fail-closes legacy direct ORDER-ENGINE fulfillment increases for effective STOCKED lines unless backed by the exact one-use Inventory fulfillment proof, and adds the required composite FK covering indexes.
- Production verification is side-effect clean: `inventory_locations=0`, `inventory_items=0`, `inventory_stock_balances=0`, `inventory_reservations=0`, `inventory_movements=0`, and `orders=0`. No synthetic Production Business, Product, Variant, Order, reservation, warehouse, stock movement, customer or provider evidence was created.
- Runtime/schema verification confirms the STOCKED fulfillment guard trigger/function and all three hardening indexes are live. Every Inventory foreign key has a valid leading covering index. Fresh advisor baseline remains security `rls_enabled_no_policy=15`, `auth_leaked_password_protection=1`; performance `unindexed_foreign_keys=14`, `auth_rls_initplan=16`, `multiple_permissive_policies=6`. Fresh Inventory indexes are expected to appear as unused while Production Inventory remains zero-row.
- Invoice, Payment/refund, payment-provider activation and real customer stock/order evidence are not invented here; those remain with their owning Work Packages or real-data acceptance.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> INVOICE-ENGINE`.

Before mutation, fresh-audit current Order/Quote/Catalog/Inventory/Customer/Booking/Deal/tax/document/payment authorities, open PRs, current main, Production migrations/schema and any existing invoice references. INVOICE-ENGINE must produce immutable commercial invoice evidence without creating a second Order, Catalog, Customer, Payment ledger, tax authority or generic Document store.

---

## ORDER-ENGINE Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> ORDER-ENGINE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical Order scope.
- Implementation PR #398 final head `4e2f3007c944cc3fb40b791359cc9558cffe30d5` passed exact-head CI `37009383921` across lint, typecheck, unit tests, the complete PostgreSQL 17 migration chain plus ORDER-ENGINE smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #398 squash-merged to canonical `main@4c5d5b26d33b460e4d19c6e13551a65eda4d98dc`. Exact-main push CI `37009775188` succeeded on that exact merge SHA. Cloudflare Production Deploy `37010061631` succeeded on the same implementation merge SHA.
- Production migration `0173_order_engine@20261002130127` is live; merged migration blob SHA is `9123adb5a748a0b5440039ccb81ebe69cfff3236`.
- Canonical Order authority is now `public.orders` with immutable `order_line_items`, bounded `order_line_fulfillment`, governed `order_returns` / `order_return_lines`, and durable `order_lifecycle_events`. Accepted Quote conversion consumes canonical Quote evidence atomically; permitted direct Orders snapshot canonical Catalog pricing rather than creating a second pricing truth.
- ORDER-ENGINE supports processing, fulfillment evidence, cancellation before fulfillment, governed request/approve/reject/receive return lifecycle, Customer 360 V4 composition, and canonical Automation triggers `ORDER_CREATED` / `ORDER_STATUS_CHANGED`. Invoice, Payment/refund execution, live stock quantity, reservation, warehouse and stock-movement truth were not introduced early.
- All six Order tables have RLS enabled. `anon` has no Order read; `authenticated` has scoped SELECT and no direct INSERT/UPDATE/DELETE; trusted mutation/reconciliation RPCs are service-role-only. `get_crm_customer360_v4` remains the bounded authenticated read composition.
- Production verification remained side-effect clean: `orders=0`, `order_line_items=0`, `order_line_fulfillment=0`, `order_returns=0`, `order_return_lines=0`, `order_lifecycle_events=0`; upstream `quotes=0`, `catalog_products=0`, `catalog_product_variants=0`, `catalog_product_prices=0`. No synthetic Production Order, return, customer, Quote, Product, provider or payment evidence was created.
- Post-0173 advisors exposed exactly three new composite-FK indexing findings, with no new Order security regression. Hardening PR #399 final head `4935cbcfad527f2084123faa722ab1ada9ba9cb0` passed exact-head CI `37010634724`, squash-merged to `main@ac65d781251f8be112a351aa3ca73cd110314b68`, and exact-main CI `37011043404` plus Cloudflare Production Deploy `37011371669` succeeded.
- Production hardening migration `0174_order_engine_fk_index_hardening@20261002131210` is live; merged migration blob SHA is `b799d423d2db191f10c22a63ec116d09774ae683`. All three covering indexes are live and the performance advisor `unindexed_foreign_keys` count returned from 17 to the pre-Order baseline 14. Security remains the existing baseline: RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; auth RLS initPlan remains 16 and multiple permissive policies remain 6. Fresh zero-row Order indexes may appear as unused-index INFO until real traffic exists.
- Existing WhatsApp external blockers are unchanged: first real consented tenant Meta ↔ Smart Core ↔ Chatwoot E2E and real same-number Business App Coexistence remain external-evidence gated.
- Managerial recalibration after this verified slice: Phase 8 Billing & Commercial Platform is approximately **58% complete / 42% remaining**; overall program is approximately **66% complete / 34% remaining**. These are planning estimates, not canonical runtime state.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> INVENTORY-FULFILLMENT`.

Before mutation, fresh-audit current Product/Variant/Branch availability, Order fulfillment evidence, Field Service material usage, any existing inventory/reference tables, Booking resources, Invoice/Payment boundaries, open PRs and Production schema. INVENTORY-FULFILLMENT may introduce the canonical stock/reservation/warehouse/movement/fulfillment truth where required, but must not create a second Catalog, Order, Booking, Field Service or Payment authority.

---

## QUOTE-ENGINE Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> QUOTE-ENGINE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical Quote scope.
- Implementation PR #395 final head `f1a081a9337319e85e122bd9aff21e07c33d9673` passed exact-head CI `36993458750` across lint, typecheck, unit tests, the complete PostgreSQL 17 migration chain plus QUOTE-ENGINE smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #395 squash-merged to canonical `main@9eda74e080d00c2c691430709635d8719f7f885b`. Exact-main push CI `36994472061` succeeded on that exact merge SHA. Cloudflare Production Deploy `36994762553` succeeded on the same implementation merge SHA.
- Production migration `0171_quote_engine@20261002101923` is live; merged migration blob SHA is `688e38ed30df6706e1c67021e909638538b00c8c`.
- Post-deploy advisor review found three physically duplicate indexes only. Hardening PR #396 final head `adb843bd9aa2ab2fe8197788b3c43b40dcbdda9b` passed exact-head CI `36994998689`, squash-merged to `main@3eec7169ff51c70a737b358c54a1a2612c6257d8`, and exact-main CI `36995343955` plus Cloudflare Production Deploy `36995601281` succeeded.
- Production hardening migration `0172_quote_engine_postdeploy_hardening@20261002102818` is live; merged migration blob SHA is `07a2ee52a75376cddcdb730fcd81e69c54859803`. The three redundant indexes are gone while the existing canonical equivalents remain.
- Canonical Quote authority is `public.quotes` with immutable `quote_versions` and `quote_line_items`, governed `quote_version_reviews`, and durable `quote_lifecycle_events`. Service/Product/Variant identity and pricing remain owned by the existing Catalog authorities; QUOTE-ENGINE snapshots those prices and does not become a second Catalog or pricing truth.
- Quote lifecycle is governed and idempotent across Draft, Review, Sent, Viewed, Accepted, Rejected, Expired and evidence-only Conversion. Approval policy remains owned by `approval_rules`; `QUOTE_ACCEPTED` is now AVAILABLE in the canonical Automation Trigger Catalog with expected subject `QUOTE`.
- Customer-facing Quote document snapshots exclude internal notes, approval metadata and internal price IDs. Business Web exposes `/quotes`, version/review/customer-decision controls and a print/Save-as-PDF document surface without creating a second Document authority.
- Customer 360 V3 composes explicitly linked Quote truth. No Order, Invoice, Payment, inventory/stock, generic Document store, second approval engine, second scheduler or parallel event bus was introduced.
- Production verification remained side-effect clean: `quotes=0`, `quote_versions=0`, `quote_line_items=0`, `quote_version_reviews=0`, `quote_lifecycle_events=0`. No synthetic Production Business, Person, Deal, Quote, customer decision, provider event or Order was created.
- All five Quote tables have RLS enabled; `anon` has no SELECT, `authenticated` has scoped SELECT only and no INSERT, trusted mutation RPCs are service-role-only, and Customer360 V3 is the bounded authenticated read composition.
- Post-0172 advisors show no QUOTE-ENGINE-specific new security, unindexed-FK, multiple-permissive-policy or duplicate-index regression. Remaining advisor findings pre-date this slice; unused-index INFO on zero-row Quote tables is expected until real traffic exists.
- Existing WhatsApp external blockers are unchanged.
- Managerial recalibration after this verified slice: Phase 8 Billing & Commercial Platform is approximately **50% complete / 50% remaining**; overall program is approximately **65% complete / 35% remaining**. These are planning estimates, not canonical runtime state.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> ORDER-ENGINE`.

Before mutation, fresh-audit current Quote/Deal/Catalog/Booking/Order/Invoice/Payment/Inventory authorities, open PRs and Production schema. ORDER-ENGINE must consume accepted canonical Quote evidence without creating a second Quote, Catalog, CRM, Invoice or Payment truth.

---


## CATALOG-V2 Production closeout — 2026-10-02

- Work Package: `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical Catalog V2 scope.
- Implementation PR #393 final head `0e7b24d24144e6614f5eca13b5a4e8e475107ae7` passed exact-head CI `36983839157` across lint, typecheck, unit tests, the complete PostgreSQL 17 migration chain plus CATALOG-V2 smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #393 squash-merged to canonical `main@7e128fda4d644ea7374ad4244fc50083e6af7bb8`. Exact-main push CI `36984294927` succeeded on that exact merge SHA.
- Cloudflare Production Deploy `36984634584` succeeded on the same exact merge SHA through exact-green checkout, isolated release-candidate deploy/smoke, controlled SSR load, exact-bundle Production promotion, Worker Route verification, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0170_catalog_v2@20261002083318` is live; merged migration blob SHA is `435516227f772e2788bbf2b3c976e2d2f445507e`.
- Canonical Service identity remains `public.services` and canonical Service pricing remains `public.service_prices`. CATALOG-V2 adds canonical Product, Product Variant and Product/Variant pricing authorities without introducing a second Service catalog, generic catalog identity registry or second Service pricing truth.
- Product and Variant SKU uniqueness is Organization-scoped. Product/Variant price ownership is explicit by catalog subject + country + currency. Branch availability references canonical `public.branches`; media and warranty are bounded catalog metadata; Bundle/Add-on relations reject self-reference and direct reverse cycles.
- Inventory remains deliberately bounded to mode/reference metadata. CATALOG-V2 introduced no stock quantity, reservation, movement, warehouse or fulfillment truth; those remain owned by `INVENTORY-FULFILLMENT`. Quote, Order, Invoice and Payment authorities were not introduced early.
- All seven new catalog tables have RLS enabled. `authenticated` has scoped SELECT only; trusted mutations remain service-role governed with direct partial mutation guards, OWNER authorization, optimistic versioning, replay/idempotency evidence and existing `audit_logs`.
- Production verification remained side-effect clean: all seven CATALOG-V2 tables are 0-row; `services=8`, `service_prices=37`, `branches=0`, `tenant_businesses=0`, and CATALOG-V2 audit rows remain 0. No synthetic Product, Business, Branch, customer or provider evidence was created.
- Post-0170 advisor comparison shows no new security, unindexed-FK, auth-RLS-initPlan or multiple-permissive-policy regression. Unused-index INFO increased from 266 to 294 because 28 indexes were added on fresh zero-row catalog tables.
- Existing WhatsApp external blockers are unchanged: first real consented tenant Meta ↔ Smart Core ↔ Chatwoot E2E and real same-number Business App Coexistence remain `BLOCKED_EXTERNAL`; no Catalog work altered those safety gates.
- Managerial recalibration after this verified slice: Phase 8 Billing & Commercial Platform is approximately **42% complete / 58% remaining**; overall program is approximately **64% complete / 36% remaining**. These are planning estimates, not canonical database state.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> QUOTE-ENGINE`.

Before mutation, fresh-audit current Quote/Deal/Product/Service/Product Price/Service Price/tax/discount/approval/document/customer/Booking/Order authorities plus open PRs and Production schema. Extend canonical Commerce authorities only; do not create a second catalog, pricing truth, CRM Deal truth, document store, approval engine, Order engine or Payment truth.

---

## WhatsApp customer onboarding Slice 8 controlled-scope Production closeout — 2026-10-02

- Contract slice: **Reconnect / revoke / disconnect + first real tenant E2E acceptance**. The internally controlled lifecycle path extends only the existing canonical WhatsApp binding, setup-attempt, Vault credential, Meta provider adapter, Unified Inbox health/projection and audit authorities.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for reconnect, credential/subscription health, fail-closed revoke/disconnect behavior, UI controls, provider-unsubscribe reconciliation, schema and deploy scope. **First real consented tenant E2E remains BLOCKED_EXTERNAL / pending real tenant + Meta eligibility evidence** because Production still has zero WhatsApp bindings.
- Implementation PR #391 final head `09697e4127fbd3bb8a8216bc945bd16fbcfa637b` passed exact-head CI `36979621813`.
- PR #391 squash-merged to canonical `main@5051d6984e1d6413a0077da8da3142f89ef740cd`. Exact-main CI `36979959886` succeeded across lint, typecheck, unit tests, the complete PostgreSQL 17 migration chain plus Slice-8 smoke, Next build, Vinext and Cloudflare scheduled verification.
- Cloudflare Production Deploy `36980189935` succeeded on the same merge SHA through the existing exact-green deployment workflow.
- Production migration `0169_whatsapp_reconnect_disconnect_lifecycle@20261002074458` is live; merged migration blob SHA `10dd1fd8fdefed603dd8688f92130e70b7348774`.
- Reconnect remains the same logical `communication_channel_bindings.id`: credentials rotate in the existing Vault secret boundary and reconnect cannot silently retarget an existing binding to a different WABA/phone identity.
- Inbound destination and outbound credential resolution now fail closed for manual disconnect, invalid/revoked credential, unconfirmed credential health and missing Meta WABA app subscription.
- Owner lifecycle controls can verify Meta phone/subscription evidence without sending a test message. Safe disconnect blocks Smart Core provider actions first, supersedes active setup attempts, degrades active Unified Inbox projection state and then reconciles WABA webhook unsubscribe by provider readback. Ambiguous provider mutation is not blindly retried.
- Disconnect never deletes/uninstalls the customer’s WhatsApp Business mobile app and does not perform destructive migration. Same-number Business App Coexistence activation remains fail-closed pending real official Meta/provider/runtime eligibility.
- Production remained side-effect clean after migration: 0 WhatsApp bindings, 0 setup attempts, 37 Conversation Messages, 136 WhatsApp Events and 0 Unified Inbox projections; lifecycle incident rows are all 0.
- Slice-8 lifecycle RPCs are service-role-only; fresh advisors showed no Slice-8-specific new finding. Safety remains Shadow Mode ON; global Kill Switch OFF; WhatsApp AI pause OFF; Agents pause OFF.
- **WhatsApp onboarding overlay:** internally controlled Slices 1–8 are now closed. Real same-number Coexistence activation and the first real consented tenant Meta ↔ Smart Core ↔ Chatwoot E2E remain external-evidence gated and must not be fabricated.

**Stable roadmap cursor resumes:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

---

## WhatsApp customer onboarding Slice 7 controlled-scope Production closeout — 2026-10-02

- Contract slice: **Official coexistence + native activity + Human/AI arbitration**. The internally controlled native-activity/arbitration path extends only the existing Meta WhatsApp webhook journal, canonical CRM/conversation/message authorities, human-takeover semantics, final send gate and Chatwoot reconciliation worker. No second provider stack, message store, queue, webhook journal, CRM, IAM, secret store or Chatwoot plane was introduced.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Slice-7 native activity, arbitration, reconciliation, schema and deploy scope. **Official same-number Coexistence activation and first real-tenant native E2E are not claimed** and remain external-evidence dependent.
- Implementation PR #389 final head `75ad62a8bc88fa3b69226208e7b19ce5231fb6ef` passed exact-head CI `36943804916` across lint, typecheck, unit tests, the complete PostgreSQL 17 migration chain plus Slice-7 SQL smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #389 squash-merged to canonical `main@917913736fe6ac2cf5c87626d8ac92f422541df5`. Exact-main CI `36944138334` succeeded on that exact merge SHA.
- Cloudflare Production Deploy `36944402017` succeeded on the same merge SHA through exact-green checkout, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle Production promotion, Worker Route verification, immediate routed Production smoke and safe API/webhook rejection smoke. No provider send was used merely to prove setup.
- Production migration `0168_whatsapp_coexistence_native_arbitration@20261002000822` is live; exact merged migration blob SHA `0f3411fc50599e6241510362125a8f37c83c6e77`.
- Current `smb_message_echoes` events are normalized as native human activity only when canonical existing customer/Lead/WhatsApp Conversation scope is resolvable. The business sender number is never treated as the customer recipient. Canonical messages use `HUMAN_NATIVE_WHATSAPP / META_WHATSAPP` provenance/source identity and existing cross-plane dedupe.
- A current native human reply atomically moves the existing Lead and Conversation to HUMAN takeover semantics with `stage_reason=WHATSAPP_NATIVE_ACTIVITY`. The existing final provider send gate re-reads that state, so previously queued/approved AI cannot override the newer human reply.
- Native canonical outbound evidence is projected into Chatwoot through the existing reconciliation worker with durable `PENDING -> PROCESSING -> ACCEPTED / RECONCILIATION_REQUIRED` state. Replays are idempotent and ambiguous Chatwoot outcomes are not blindly retried.
- Historical synchronization is deliberately excluded from the live native-human parser/takeover path. Same-number Business App activation remains fail-closed and non-destructive until real Meta/provider/runtime eligibility can verify it; Smart Visions still never requires deleting or uninstalling the customer's mobile WhatsApp Business account.
- Production verification remained side-effect clean: 37 Conversation Messages, 136 WhatsApp Events, 0 Unified Inbox projections and 0 WhatsApp bindings; Slice-7 smoke message/event/handoff residues are all 0. The three new RPCs are executable by `service_role` only, not `anon` or `authenticated`.
- Production safety is unchanged: Shadow Mode ON; global Kill Switch OFF; WhatsApp AI pause OFF; Agents pause OFF. Fresh Supabase advisors report no Slice-7-specific security or performance finding; broader pre-existing advisor findings remain.
- **Not claimed here:** official Meta same-number Coexistence activation/eligibility, live real-customer `HUMAN_NATIVE_WHATSAPP` evidence, reconnect/revoke/disconnect or first real tenant Meta ↔ Smart Core ↔ Chatwoot E2E.

**Owner-prioritized WhatsApp continuation:** contract Slice 8 — **Reconnect/revoke/disconnect + first real tenant E2E acceptance**. Preserve the same canonical binding and fail closed on revoked/invalid credentials; never mutate or delete the customer's mobile WhatsApp account.

**Stable program cursor preserved for return after the owner-prioritized WhatsApp work:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

---

## WhatsApp customer onboarding Slice 6 Production closeout — 2026-10-02

- Contract slice: **Message/status/media bridge + provenance + dedupe**, implemented by extending the existing Meta WhatsApp journal/persistence, canonical `conversation_messages`, existing Smart Core send gate, Chatwoot signed-webhook journal, Unified Inbox projection and existing reconciliation runtime. No second message store, provider stack, webhook journal, queue, CRM, secret store, IAM or Chatwoot plane was introduced.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Slice-6 code/schema/deploy scope.
- Implementation PR #387 final head `4b6eba7ceb900e1d012d299e3b20816911f9fa51` passed exact-head CI `36939463033` across lint, typecheck, tests, the complete PostgreSQL 17 migration chain plus Slice-6 SQL smoke, Next build, Vinext and Cloudflare scheduled verification.
- PR #387 squash-merged to canonical `main@5f7f81c5b279efd92feb6341bdc971fe6e6c012e`. Exact-main CI `36939774658` succeeded on that exact merge SHA.
- Cloudflare Production Deploy `36940049403` succeeded on the same exact merge SHA through exact-green checkout, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle production promotion, Worker Route verification, immediate routed Production smoke and safe Production API/webhook rejection smoke. The smoke path invoked no outbound provider sends.
- Production migration `0167_whatsapp_message_bridge_provenance` is live as version `20261001231837`; merged migration blob SHA `60c4df822b1429bf77d975089af96a218a1bf81b`.
- Canonical message provenance is now bounded to `CUSTOMER`, `HUMAN_SMARTVISIONS`, `HUMAN_NATIVE_WHATSAPP`, `AI`, and `SYSTEM`. Cross-plane source identity is guarded by `organization_id + channel + source_plane + source_message_id`.
- Meta inbound persists into the existing canonical message path and is projected to Chatwoot from the existing durable WhatsApp journal with `PENDING -> PROCESSING -> ACCEPTED` / `RECONCILIATION_REQUIRED` semantics. Ambiguous external mutations remain fail-closed and are never blindly retried.
- Chatwoot human outgoing is accepted only from a canonically mapped Smart Visions human role and only during full human takeover. Owner/AI Smart Core sends mirror to Chatwoot using deterministic source identity so mirror echoes do not resend to Meta.
- Delivery reconciliation is monotonic across canonical and outreach message evidence, including out-of-order status replay. The media bridge uses the existing Meta provider/Vault authority, bounded downloads/uploads, trusted origins and MIME checks. Chatwoot outbound media is intentionally limited to one attachment per provider message so provider correlation remains deterministic.
- Business-wide Unified Inbox projection now supports `branch_id = null`; Branch-scoped Team mapping remains fail-closed.
- Production backfill was conservative: all 36 existing `SHADOW_MODE` outbound messages are `AI`; the one ambiguous old outbound message is `SYSTEM`. No existing message received guessed human/customer provenance.
- Production WhatsApp journal after migration has 37 inbound events eligible for Chatwoot sync in `PENDING`; 12 older inbound events remain without Chatwoot sync state because both `conversation_id` and `lead_id` are absent, so no scope was fabricated.
- Production remained side-effect clean: Conversation Messages 37, WhatsApp Events 136 and Unified Inbox projections 0. The controlled SQL smoke ran transactionally and no smoke Organization/Business/Lead/Conversation/Message/Event IDs exist in Production.
- Slice-6 RPCs for Chatwoot claim/finalize, Chatwoot-human outbound completion and delivery reconciliation are executable by `service_role` and denied to `anon` / `authenticated`. Source-identity and pending-sync indexes are live; Unified Inbox `branch_id` is nullable.
- Production safety is verified unchanged: Shadow Mode ON; global Kill Switch OFF; WhatsApp AI pause OFF; Agents pause OFF. Fresh advisors retain the broader existing platform findings; no Slice-6-specific ACL regression was found.
- **Not claimed here:** real-customer Meta ↔ Smart Core ↔ Chatwoot E2E, official same-number Business App Coexistence/native human activity, or reconnect/revoke/disconnect/final real-tenant acceptance. Those remain dependent on later contract slices and real external tenant/provider evidence.

**Owner-prioritized WhatsApp continuation:** contract Slice 7 — **Official coexistence + native activity + Human/AI arbitration**. Fresh-read the connection contract before mutation; keep same-number Coexistence fail-closed and non-destructive until official provider/runtime evidence can verify it.

**Stable program cursor preserved for return after the owner-prioritized WhatsApp work:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

---

## WhatsApp customer onboarding Slice 5 Production closeout — 2026-10-01

- Contract slice: **Existing Chatwoot provisioning integration**, implemented by composing the existing Chatwoot Account/User/Membership/API Inbox provisioning and reconciliation authorities onto the already verified canonical Meta WhatsApp binding. No second Chatwoot plane, Inbox authority, provider store, Vault, IAM or message store was introduced.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Slice-5 projection/orchestration path.
- Implementation PR #385 final head `0e6ec7a73c8b6d715e6914cb99a2a9f3c501624b` passed exact-head CI `36883590463` and squash-merged to canonical `main@4463c29be4b3cf91fc80136587f6c253a6597f36`.
- Exact-main CI `36884006244` succeeded on the merge SHA across lint, typecheck, tests, PostgreSQL 17 migration chain, Next build, Vinext and Cloudflare scheduled verification.
- Cloudflare Production Deploy `36884481705` succeeded on the exact same SHA through exact-main checkout, credential preflight, release-candidate deployment/smoke, SSR load, exact-bundle promotion, Production Worker Route verification and safe Production API/webhook rejection smoke.
- Slice 5 required **no new database migration**. Production remains through `0166_meta_whatsapp_mobile_wizard_completion@20261001135536`.
- Projection requires verified Slice-4 `META_WHATSAPP_PROVIDER_PROVISIONED` evidence matching the same canonical binding/WABA/phone before any Chatwoot mutation.
- Only an authenticated Smart Visions OWNER can finalize the Chatwoot projection. A remote Meta setup participant retains only bounded `WHATSAPP_SETUP` capability and receives no Chatwoot or normal panel authority.
- The existing Chatwoot Account mapping, OWNER User/administrator membership, `Channel::Api` Inbox mapping, marker-based ambiguous-create recovery, Vault secret capture, reconciliation receipt and verified activation paths are reused.
- Business-wide WhatsApp bindings with `branch_id = null` are now supported by the existing API Inbox provisioner; branch-scoped bindings remain unchanged.
- If Meta was completed remotely, the OWNER can use **Finalize communication Inbox** without repeating Meta authorization. Chatwoot failure does not roll back or duplicate the Meta/WhatsApp connection; retry is scoped only to Chatwoot projection.
- Read-only Production verification after deploy remained side-effect clean: tenant Businesses 0, WhatsApp bindings 0, Chatwoot Account/User/Membership/Inbox mappings 0, Inbox reconciliation receipts 0 and `META_WHATSAPP_CHATWOOT_PROJECTED` audit rows 0. No synthetic tenant, binding or external Chatwoot resource was created.
- Production safety remains unchanged: Shadow Mode ON; global Kill Switch OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-Slice-5 advisors remain at the existing baseline: security RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6.
- **Not claimed here:** first real-tenant Chatwoot projection E2E, message/status/media provenance bridge, official same-number Coexistence/native activity, Human/AI arbitration, disconnect lifecycle or first real-tenant end-to-end acceptance.

**Owner-prioritized WhatsApp continuation:** contract Slice 6 — **Message/status/media bridge + provenance + dedupe**. Extend the existing webhook journals, canonical conversation/message lifecycle, Unified Inbox/CRM projection and reconciliation authorities only; do not create another message store or webhook queue.

**Stable program cursor preserved for return after the owner-prioritized WhatsApp work:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

---

## WhatsApp customer onboarding Slice 4 Production closeout — 2026-10-01

- Contract slice: **Meta Provisioning / Subscription / Recovery**, implemented by extending the existing canonical WhatsApp binding, Vault credential resolver, Meta adapter, webhook receiver and OMNI channel-health evidence only. No second provider stack, connection authority, secret store, webhook journal, IAM, CRM or health truth was introduced.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Slice-4 provider provisioning/reconciliation scope.
- Implementation PR #382 final head `d39ca5db89f1661138dc4709cff8ab60a6bea579` passed exact-head CI `36880398289` and squash-merged to canonical `main@3e0eb5ec585b1be5d65ba48531c5026d38324178`.
- Exact-main CI `36880881774` succeeded on the merge SHA across lint, typecheck, tests, the PostgreSQL 17 migration chain, Next build, Vinext and Cloudflare scheduled verification. Cloudflare Production Deploy `36881305912` succeeded on the exact same SHA through release-candidate smoke, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Slice 4 required **no new database migration**. Production schema remains through `0166_meta_whatsapp_mobile_wizard_completion@20261001135536`.
- Provisioning re-reads the selected phone from the selected WABA, reconciles the Smart Visions Meta app through `subscribed_apps`, and treats ambiguous provider mutation results as recoverable only after a fresh provider readback confirms truth.
- `API_NEW_NUMBER` supports bounded Cloud API phone registration using an ephemeral six-digit PIN. The PIN is sent only to Meta for registration and is not persisted or audited. `EXISTING_API_RECONNECT` does not unnecessarily re-register the phone.
- Owner and bounded remote `WHATSAPP_SETUP` flows reuse the same canonical binding/Vault credential. Provider retries do not create a second binding or credential path.
- Same-number `BUSINESS_APP_COEXISTENCE` remains explicitly fail-closed and non-destructive. No Delete Account, uninstall or destructive full migration fallback was added.
- Existing OMNI channel health now recognizes tenant Vault-backed WhatsApp credentials rather than incorrectly treating only environment credentials as valid.
- Read-only Production verification after deploy remained side-effect clean: Setup Attempts 0, `META_WHATSAPP_PROVIDER_PROVISIONED` audit rows 0, provisioning-error bindings 0 and registration-required bindings 0. No synthetic tenant, binding, credential, Meta subscription, provider send or customer message was created for acceptance.
- Production safety remains unchanged: Shadow Mode ON; global Kill Switch OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-Slice-4 advisors remain at the existing baseline: security RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Slice 4 introduced no database objects or indexes.
- **Not claimed here:** existing Chatwoot provisioning integration, message/status/media provenance bridge, official same-number Coexistence/native activity, Human/AI arbitration, disconnect lifecycle or first real-tenant E2E.

**Owner-prioritized WhatsApp continuation:** contract Slice 5 — **Existing Chatwoot provisioning integration**. Reuse the existing Chatwoot Account/API Inbox mapping, Vault, marker reconciliation and receipt authorities; do not create a second Chatwoot plane or Inbox authority.

**Stable program cursor preserved for return after the owner-prioritized WhatsApp work:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

---

## WhatsApp customer onboarding Slice 3 Production closeout — 2026-10-01

- Contract slice: **Mobile-first Wizard + Preflight + Setup Later + Resume**, implemented by extending the existing Slice-1 setup attempt and Slice-2 `WHATSAPP_SETUP` session only. No second IAM, invitation/session authority, connection record, provider stack, Vault, CRM, queue, message store or Chatwoot authority was introduced.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Slice-3 wizard/session/trusted-completion scope only.
- Implementation PR #380 final head `ad4380caa27ad8928da8568e2b009114850d410e` passed exact-head CI `36871208717` across lint, typecheck, tests, the full PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. It squash-merged to canonical `main@19201aa26ad6176d978ccc6e70b17ac365f1f8aa`.
- Exact-main CI `36871735143` succeeded on the merge SHA. Cloudflare Production Deploy `36872092126` succeeded on that exact SHA through credential preflight, isolated release-candidate deploy/smoke, controlled SSR load, exact-bundle Production promotion, Worker Route verification, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0166_meta_whatsapp_mobile_wizard_completion` is live as version `20261001135536`; merged migration blob SHA `887c200e6d1a3f258ad70e95f3795a5dddb3ebce`.
- The public `/setup/whatsapp` flow is now mobile-first and resumable over the existing setup session: preflight, Meta-hosted authorization, cancel/retry recovery, Setup Later and same-device resume before session expiry all reuse the same setup attempt/session rather than creating duplicate connection or identity state.
- Customer UI does not expose WABA IDs, access tokens, webhook internals or developer-app details. Meta password entry remains on Meta; Smart Visions exchanges the authorization code server-side and validates exact phone/WABA membership before the existing trusted Vault mutation.
- Remote completion is bound to the exact setup-session hash + attempt + binding + binding version. Lost-network/repeated-completion recovery can read the completed attempt without re-running a credential exchange when the canonical binding already matches.
- Completion provenance now distinguishes `OWNER` from `REMOTE_SETUP`. For remote setup, the existing OWNER that initiated the attempt remains the sponsoring binding updater required by the canonical binding schema, while attempt/audit evidence records `REMOTE_SETUP / WHATSAPP_SETUP`; no fake user or Organization membership is created.
- The owner completion path and the remote completion path are both SECURITY INVOKER and executable only by `service_role`. `anon` and `authenticated` have no direct EXECUTE, authenticated setup-attempt table privileges remain empty and RLS remains enabled.
- Supported setup modes remain exactly `BUSINESS_APP_COEXISTENCE`, `API_NEW_NUMBER`, and `EXISTING_API_RECONNECT`. Same-number Coexistence completion remains explicitly fail-closed in both owner and remote backend paths; no Delete Account, uninstall or destructive migration fallback was introduced.
- Production remained side-effect clean after migration: Setup Attempts 0 and `META_WHATSAPP_REMOTE_SETUP_COMPLETED` audit rows 0. No synthetic tenant, binding, setup session, Meta credential, provider asset, provider send or customer message was created for acceptance.
- Production safety remains unchanged: Shadow Mode ON; global Kill Switch OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-`0166` advisors show no Slice-3 regression: security RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Unused-index INFO is 276 and Slice 3 introduced no new indexes.
- **Not claimed here:** real-customer Meta authorization E2E, WABA/webhook subscription provisioning or recovery, phone registration/eligibility orchestration, Chatwoot provisioning, message/status/media provenance, actual Business App Coexistence/native activity, Human/AI arbitration, disconnect lifecycle or first real-tenant acceptance.

**Owner-prioritized WhatsApp continuation:** contract Slice 4 — **Meta Provisioning / Subscription / Recovery**. Reuse the existing Meta adapter, canonical binding/Vault authority, webhook receiver, tenant routing and channel-health evidence; do not build a second provider stack or provisioning source of truth.

**Stable program cursor preserved for return after the owner-prioritized WhatsApp work:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

---

## WhatsApp customer onboarding Slice 2 Production closeout — 2026-10-01

- Contract slice: **Secure Remote Setup Invitation**, owned by existing `UX-BUSINESS-WEB` / `ENT-IAM` / `DEV-INTEGRATIONS` scope. No new Work Package, IAM/user directory, WhatsApp connection authority, provider stack, secret store, CRM, message store or Chatwoot authority was introduced.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Slice 2 invitation/session scope only.
- Implementation PR #378 final head `fb7018647bf8f632bedff678f450564ee200252c` passed exact-head CI `36865430981` across lint, typecheck, tests, the PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. It squash-merged to canonical `main@ba837577f38c90b390474de1998a2ce84de3c622`.
- Exact-main CI `36865851776` succeeded on that merge SHA. Cloudflare Production Deploy `36866185938` also succeeded on the exact same SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle Production promotion, Worker Route verification, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0165_meta_whatsapp_remote_setup_invitation` is live as version `20261001130718`; merged migration blob SHA `46ca7d1d3821ed84135013546f64d891cecb8a7a`.
- Remote setup extends the existing `communication_channel_setup_attempts` child operational state only. The invitation/session capability is still anchored to the canonical Organization + tenant Business + binding + attempt + binding version + connection mode + purpose. `communication_channel_bindings` remains the logical connection authority.
- The external Meta administrator is **not** turned into a Supabase Auth user, Organization member or `member_scope_assignment`. The public setup surface receives only a bounded `WHATSAPP_SETUP` capability; it has no CRM, Billing, Organization Settings, unrelated integration, cross-business, ADMIN or OWNER authority.
- Invitation/session bearer material is generated server-side from 256-bit randomness and persisted only as SHA-256 hashes. The invitation is carried in a URL fragment, removed from the address bar before redemption, redeemable once, and capped by the existing setup-attempt expiry (maximum 30 minutes). Redemption yields a separate session capped at 20 minutes.
- The setup session cookie is HttpOnly, SameSite=Strict, Production-secure and path-scoped to `/setup/whatsapp`. The server context command revalidates session/attempt expiry, revocation, canonical binding version/state, tenant Business state and enabled Meta/WhatsApp integration on every read.
- OWNER issue/revoke operations and public redeem/context operations execute only through service-role server routes. All four new database RPCs are SECURITY INVOKER, executable by `service_role` only; `anon` and `authenticated` have no direct EXECUTE. Direct authenticated access to `communication_channel_setup_attempts` remains absent and RLS remains enabled.
- Same-number `BUSINESS_APP_COEXISTENCE` remains non-destructive and fail-closed for actual activation. Slice 2 establishes secure setup authorization only; it does not add Meta OAuth completion, credential mutation, provider provisioning, a customer/provider send, or any fallback to Delete Account/full migration.
- Production remained side-effect clean after migration: Setup Attempts 0 and Slice-2 remote-setup audit events 0. No synthetic tenant, binding, invite, session, credential, Meta asset, message or provider call was created for acceptance.
- Production safety remains unchanged: Shadow Mode ON; global Kill Switch OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-`0165` advisors show no Slice-2 regression: security remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance remains unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Unused-index INFO is 277 and includes the two new zero-row invitation/session hash indexes, which have no real traffic yet.
- **Not claimed here:** Slice 3 mobile-first Meta authorization/resume wizard, Meta subscription/recovery orchestration, Chatwoot onboarding orchestration, message provenance/native activity, actual Coexistence/Human-AI arbitration, reconnect/disconnect lifecycle completion, or first real-tenant E2E.

**Owner-prioritized WhatsApp continuation:** contract Slice 3 — **Mobile-first Wizard + Preflight + Setup Later + Resume**. It must reuse the exact Slice-2 `WHATSAPP_SETUP` session and Slice-1 setup attempt rather than creating another identity, invitation authority or connection record.

**Stable program cursor preserved for return after the owner-prioritized WhatsApp work:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

---

## WhatsApp customer onboarding Slice 1 Production closeout — 2026-10-01

- Contract slice: **Connection Contract + Attempt/Mode + trusted completion + Meta asset validation**, owned by existing `COMM-TENANT-BRIDGE` / `ENT-SECURITY` / `DEV-INTEGRATIONS` scope. No new Work Package or parallel WhatsApp authority was introduced.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Slice 1 scope only.
- Implementation PR #375 was squash-merged at `main@474d7cd72d50a002add2e38a4cff30f7d588f09d`; final implementation head `1c6a47138635037189745615d1f25d387de00897` passed exact-head CI `36855801312`.
- Advisor-hardening PR #376 was squash-merged at final canonical `main@85774ea16adf20403832771d316e68e56283028d`; head `d0ba891e4646652fea5ba88391de7dfc5471afef` passed exact-head CI `36856807256`.
- Exact-main push CI `36857112993` succeeded on `85774ea16adf20403832771d316e68e56283028d`. Cloudflare Production Deploy `36857447148` also succeeded on that exact SHA through credential preflight, isolated Candidate deployment/smoke, controlled SSR load, exact-bundle Production promotion, Worker Route verification, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0163_meta_whatsapp_onboarding_slice1` is live as version `20261001113758`; merged blob SHA `366bcc271f9d516137a8dc75d50f2339058ad8b5`. Hotfix migration `0164_meta_whatsapp_onboarding_fk_index_hardening` is live as version `20261001114314`; merged blob SHA `c07d058d071b7614edaffa35ff4ddcac0a95c29d`.
- Canonical logical connection identity remains `communication_channel_bindings.id`. New `communication_channel_setup_attempts` is bounded child operational state only, version-bound to the canonical binding; it is not a second connection source of truth.
- Supported setup modes are exactly `BUSINESS_APP_COEXISTENCE`, `API_NEW_NUMBER`, and `EXISTING_API_RECONNECT`. `FULL_MIGRATION_FROM_BUSINESS_APP` / Delete Account / uninstall is not represented as an allowed mode.
- The legacy authenticated `configure_meta_whatsapp_binding` Vault-mutation path is no longer executable by `authenticated`. Setup start/completion are service-role-only commands; the actual Vault write is isolated in the private trusted helper `private.apply_meta_whatsapp_binding_credential_internal`.
- Meta completion now requires a bounded setup attempt, matching binding version/state, server-side authorization-code exchange, exact phone/WABA readback, and proof that the selected phone is a member of the selected WABA before the trusted credential commit.
- Official same-number Business App coexistence completion is intentionally **fail-closed** in Slice 1. The UI and DB do not fall back to destructive migration. Actual coexistence/native-activity activation remains a later contract slice and may remain `BLOCKED_EXTERNAL` until current Meta eligibility/provider evidence is available.
- `communication_channel_setup_attempts` has RLS enabled, authenticated direct SELECT/INSERT/UPDATE/DELETE privileges all remain false, and an explicit authenticated deny-all policy provides defense in depth. All four new composite FK paths have covering indexes.
- Production remained side-effect clean: Setup Attempts 0, Communication Channel Bindings 0, Chatwoot Inbox Mappings 0, Outreach Messages 43, Conversation Messages 37, Usage Events 108 and Follow-up Jobs 6. No synthetic tenant/binding/credential/message/provider send was created for acceptance.
- Production safety remains unchanged: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-0164 advisors returned to the pre-Slice baseline: security RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance unindexed FKs 14 and auth RLS initPlan 16. The six fresh zero-row setup-attempt indexes contribute expected unused-index INFO until real traffic exists.
- **Not claimed here:** Secure Remote Setup Invitation, mobile resume wizard, Meta subscription/recovery orchestration, Chatwoot onboarding orchestration changes, message provenance/native activity, Human/AI coexistence arbitration, or real-tenant Coexistence E2E.

**Owner-prioritized WhatsApp continuation:** contract Slice 2 — **Secure Remote Setup Invitation** under existing `UX-BUSINESS-WEB` + `ENT-IAM` + `DEV-INTEGRATIONS`. Reuse canonical auth/IAM and bind invitation authority to the exact Business + binding + purpose; do not grant OWNER/ADMIN/CRM/Billing access and do not create a second IAM.

**Stable program cursor preserved for return after this owner-prioritized WhatsApp work:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

---

## FIELD-SERVICE Production closeout — 2026-10-01

- Work Package: `SECTION BOOKING_OPERATIONS -> FIELD-SERVICE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Field Service RC scope.
- Implementation PR #372 was squash-merged to canonical `main@c9225ff366fcd1989beb5e3002dbf07a3f6906a9`; final implementation head was `f69c389133b2e0739629e31c3ddd01275243ad83`.
- Exact-head CI `36836510236` succeeded across lint, typecheck, tests, the full PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. Exact-main CI `36836878074` succeeded on the merge SHA. Cloudflare Production Deploy `36837226696` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0162_field_service` is live as version `20261001083712`; merged migration blob SHA is `9d62216932cd7a097cec10bd9ed9fd40fa329662`.
- Canonical work authority remains `crm_tasks` with `task_type=FIELD_SERVICE`; `crm_tasks.assignee_user_id` remains technician identity, `organization_members` remains staff authority, `bookings` remains scheduling authority when linked, `branches` remains branch/location authority, and `crm_support_cases` remains support-case authority. No second Task engine, Booking engine, scheduler, staff directory, location truth, notification engine or inventory truth was introduced.
- Field-specific child state is bounded to `field_service_work_orders`, `field_service_checklist_items`, `field_service_material_usage`, `field_service_evidence` and `field_service_signoffs`. All five tables are live with RLS enabled and remained zero-row after Production migration.
- Work Orders support linked Booking/Support Case/Branch, canonical/manual-confirmed/remote location evidence, manual due scheduling when no Booking is linked, technician assignment, required checklist, material-use evidence, completion summary/evidence, customer sign-off and terminal completion gating. `BOOKING_BRANCH` must resolve to the linked Booking branch and `BUSINESS_ADDRESS` requires canonical formatted-address evidence.
- Materials remain operational usage evidence only with `inventory_effect=NONE`; stock/reservation/fulfillment truth is intentionally deferred to `INVENTORY-FULFILLMENT`.
- Evidence bytes live in the private Supabase Storage bucket `field-service-evidence` with `public=false`, 15 MiB limit and MIME allowlist `image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`. Authenticated users have scoped metadata read only; direct authenticated evidence INSERT/UPDATE is denied. Server-side verified finalization uses the existing service-role boundary, and download/upload access uses short-lived signed Storage URLs rather than public URLs.
- Field Service guard/audit functions are SECURITY INVOKER. Trigger-only guard/audit functions are not directly executable by `anon`, `authenticated` or `service_role`; the bounded `field_service_task_can_manage` helper is authenticated-only. Customer 360 Person linkage remains behind the canonical trusted server function rather than direct browser provenance writes.
- Production remained side-effect clean: Field Service tables 0, CRM Tasks 0, Bookings 0, Booking lifecycle events 0, Booking profiles 0, Availability calendars 0, Automation Rules 0, Outreach Messages 43, Conversation Messages 37, Usage Events 108 and Follow-up Jobs 6. No synthetic Production customer/task/work-order/evidence/sign-off data was created and no provider/customer send was used for acceptance.
- Production safety remains unchanged: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-`0162` advisors show no Field Service regression: security remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance remains unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Unused-index INFO moved from 261 to 271 only because the ten new zero-row Field Service indexes have not yet seen real traffic.
- **Not claimed here:** inventory/stock ownership, Quote/Order/Invoice/Payment execution, or provider payment activation. Those remain later Commerce/Payments Work Packages.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

Before mutation, fresh-audit current canonical service/product/catalog, pricing, branch-availability, media/portfolio, inventory-reference, Quote/Order/Invoice/Payment and Business Twin authorities plus open PRs and Production schema. Extend the existing authorities only; do not create a second service catalog, pricing truth, media store, inventory truth or commerce model.

---

## BOOKING-AI Production closeout — 2026-09-30

- Work Package: `SECTION BOOKING_OPERATIONS -> BOOKING-AI`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled AI Booking orchestration RC scope.
- Implementation PR #370 merged to canonical `main@5014ce4b7f116bd33227789180fea3500deb6f28`; final implementation head was `164e749f65055550ae750da893c9b74f6b08d46c`.
- Exact-head CI `36697287541` succeeded. Exact-main CI `36725836638` succeeded on the merge SHA. Cloudflare Production Deploy `36726229249` succeeded on that exact merge SHA.
- Production migration `0161_booking_ai` is live as version `20260930140528`; merged migration blob SHA is `0728abfcb88378f19ed7be47ef267cd61bdbf0a5`.
- BOOKING-AI extends the canonical Booking Catalog, Availability and Lifecycle plus Automation Runtime and Operator Brief authorities. It does not create a second Booking engine, scheduler, workflow runtime, approval engine, provider-send authority or payment truth.
- Seven AI-only Tool Registry actions are live and AVAILABLE: `BOOKING_CHECK_AVAILABILITY`, `BOOKING_CREATE`, `BOOKING_RESCHEDULE`, `BOOKING_CANCEL`, `BOOKING_SCHEDULE_REMINDER`, `BOOKING_ESCALATE`, and `BOOKING_DEPOSIT_REQUIREMENT`. Their execution surface is `AI`; they are not published as general Automation Builder actions.
- The six pre-existing Automation actions remain AVAILABLE, for 13 AVAILABLE Tool Registry actions total. `BOOKING_CREATED`, `BOOKING_CONFIRMED`, and `BOOKING_CANCELLED` triggers are AVAILABLE and 11 typed `BOOKING.*` condition facts are live.
- Booking AI mutation paths require canonical Conversation/Person linkage, current explicit inbound customer request evidence, bookable service/policy checks, availability/lifecycle validation and Shadow Mode gating. Reminder scheduling reuses `SCHEDULE_DUE`; downstream customer send remains owned by `SEND_FOLLOWUP`.
- Governed AI Booking functions are SECURITY INVOKER, executable by `service_role`, and denied to `authenticated` and `anon`. SYSTEM lifecycle actions use truthful `actor_type=SYSTEM` / `actor_id=booking_ai`; `bookings.created_by_user_id` and `updated_by_user_id` are nullable only for governed system mutations.
- Deposit requirement is policy-only in BOOKING-AI. `paymentExecutionAvailable=false`; execution remains a `PAYMENT-CORE` dependency. No payment intent/link/paid state is invented here.
- Production remained side-effect clean: Bookings 0, Booking lifecycle events 0, Booking profiles 0, Availability calendars 0, Automation Rules 0, Outreach Messages 43, Conversation Messages 37, Usage Events 108 and Follow-up Jobs 6. No synthetic Production customer/service/Booking/workflow/payment data was created and no provider/customer send was used for acceptance.
- Production safety remains unchanged: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-`0161` advisor baseline has no BOOKING-AI regression: security remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance remains unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Unused-index INFO is expected on fresh zero-row Booking paths.
- **Not claimed here:** payment execution or Field Service. Payment execution remains `PAYMENT-CORE`; Field Service remains its separate Work Package.

**Fresh continuation cursor:** `SECTION BOOKING_OPERATIONS -> FIELD-SERVICE`.

Before mutation, fresh-audit canonical `crm_tasks`, Bookings, Branch, Organization member/staff, Support Case, service/resource, location/address, attachment/evidence, Automation Runtime and notification authorities. Extend those authorities only; do not create a second Task engine, Booking engine, staff directory, location truth, scheduler or notification engine.

---

## BOOKING-LIFECYCLE Production closeout — 2026-09-30

- Work Package: `SECTION BOOKING_OPERATIONS -> BOOKING-LIFECYCLE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical Booking lifecycle RC scope.
- Implementation PR #368 merged to canonical `main@787fe407a50dbe676c6d5a5dbdece02bf140850f`; final implementation head was `f3c5e0754f790789ee180604f99cf6eef990100d`.
- Exact-head CI `36679109855` succeeded across lint, typecheck, tests, the complete PostgreSQL 17 migration/smoke regression chain, Next build, Vinext and Cloudflare scheduled verification. Exact-main CI `36679379186` succeeded on the merge SHA. Cloudflare Production Deploy `36679640308` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0160_booking_lifecycle` is live as version `20260930064429`; merged migration blob SHA is `859e394b09c059a387d82bdb24a5081e25c0f998`.
- Canonical lifecycle truth is `public.bookings`, with `booking_resource_allocations` as durable resource child state and `booking_lifecycle_events` as immutable/replay-safe transition evidence. Canonical CRM Person, service, branch, staff, resource, Availability/Hold, scheduler and audit authorities are reused; no second customer store, service catalog, availability engine, scheduler, workflow runtime or payment truth was introduced.
- The governed lifecycle covers `REQUESTED -> HELD -> CONFIRMED -> RESCHEDULED` plus `CANCELED`, `COMPLETED` and `NO_SHOW`, with request-key conflict protection, Organization actor authorization and audit evidence.
- `HELD` is backed by the existing `booking_holds` authority. Confirmed/rescheduled Bookings become durable capacity claims in the existing `evaluate_booking_slot` path for service capacity, staff conflicts and resource capacity. A hold linked to a HELD Booking cannot be directly released outside the lifecycle boundary.
- Existing scheduled hold expiry is reused. If a linked hold expires, the HELD Booking is atomically closed as `CANCELED / HOLD_TTL_EXPIRED` with lifecycle/audit evidence rather than being left orphaned.
- The `/booking/lifecycle` operator surface exposes request, hold attachment, confirm, reschedule, cancel, complete and no-show operations over the governed RPCs. Trusted mutation RPCs are SECURITY INVOKER and service-role executable only; authenticated Organization members have RLS-scoped read access and anon access is denied.
- Controlled PostgreSQL acceptance verified replay safety, direct-mutation rejection, hold-link protection, confirmed capacity accounting, durable resource allocations, atomic reschedule capacity movement, cancellation capacity release, completed/no-show transitions, hold-expiry closure, RLS/grants and indexes.
- Production verification was intentionally read-only and side-effect clean because no real Booking configuration is active: Booking profiles 0, Availability calendars 0, Holds 0, Bookings 0, Booking resource allocations 0 and lifecycle events 0. No synthetic Production Person/service/hold/Booking was created.
- Existing customer/provider side effects remain unchanged: Outreach Messages 43, Conversation Messages 37, Usage Events 108 and legacy Follow-up Jobs 6, all six Follow-up Jobs still PENDING. No provider call or customer send was used to prove lifecycle behavior.
- Post-`0160` advisors show no lifecycle-specific security or FK regression: security remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance remains unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Fresh zero-row lifecycle indexes appear only as expected unused-index INFO until real Booking traffic exists.
- Production safety remains unchanged and fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- **Not claimed here:** BOOKING-AI tool orchestration, reminders, escalation, deposit requirement/payment integration, or Customer 360 Booking composition. Those remain separate Work Package / acceptance scope.

**Fresh continuation cursor:** `SECTION BOOKING_OPERATIONS -> BOOKING-AI`.

Before mutation, fresh-audit current main/open PRs plus canonical Booking lifecycle/availability state, Tool/Action Registry, Automation Trigger/Condition/Runtime, notification/reminder authorities, existing AI agent/context compiler paths, approval policy and any Payment Core/deposit dependency. Extend canonical authorities only; do not create a second Booking store, availability engine, agent framework, workflow engine, approval engine, provider-send authority, scheduler or payment truth.

---


## BOOKING-AVAILABILITY Production closeout — 2026-09-30

- Work Package: `SECTION BOOKING_OPERATIONS -> BOOKING-AVAILABILITY`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled deterministic availability, conflict and temporary-hold RC scope.
- Implementation PR #365 merged to canonical `main@002cea12384b960d32748cf893ac166bd5a92b65`; final implementation head was `e7c11c7dd1b35f8cf0914149f2c14c22582fc2f9`.
- Exact-head CI `36649357938` succeeded. Exact-main CI `36650795311` succeeded on the implementation merge SHA across lint, typecheck, tests, the PostgreSQL 17 full migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. Cloudflare Production Deploy `36651003233` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0158_booking_availability` is live as version `20260930003626`; merged migration blob SHA is `ce241b8aac3565adc4fe055f05aa71727cf7f60f`.
- Canonical service and Booking configuration truth remains the existing `public.services` plus the `BOOKING-CATALOG` child state. Availability adds child operational state only through `booking_availability_calendars`, `booking_availability_windows`, `booking_availability_exceptions`, `booking_holds` and `booking_hold_resources`; it does not create a second service catalog, staff/branch/resource truth or booking lifecycle authority.
- The availability engine covers timezone-aware calendars, recurring windows, exceptions/holidays, branch/staff/resource eligibility, capacity/conflict evaluation, deterministic slot reads and replay-safe temporary holds. Hold expiry is reconciled by the existing Cloudflare scheduled runtime rather than by a second scheduler.
- Governed configuration/hold/release/expiry mutations are SECURITY INVOKER and service-role executable only. Authenticated Organization members have RLS-scoped read access; authenticated mutation and all anon access are denied. Direct partial table mutation is guarded.
- Production activation remained side-effect clean: Booking profiles 0, Booking resources 0, availability calendars 0, windows 0, exceptions 0, holds 0 and hold-resource rows 0. No synthetic Production service, staff member, resource, availability calendar or hold was created.
- Existing customer/provider side effects remained unchanged after controlled verification: Outreach Messages 43, Conversation Messages 37, Usage Events 108 and legacy Follow-up Jobs 6. No provider call or customer send was used to prove availability.
- Post-`0158` advisor verification correctly exposed three new unindexed Booking foreign keys. Hotfix PR #366 added only the three covering indexes and merged to `main@14a89a1f40d9b0b7c2e587c012dc8c824f9c19ea`; hotfix head was `2390bc481cda840ef55939cfb67be4c751976da8`.
- Hotfix exact-head CI `36651317853`, exact-main CI `36651582315` and Cloudflare Production Deploy `36651816808` all succeeded. Production migration `0159_booking_availability_fk_index_hardening` is live as version `20260930004624`; merged migration blob SHA is `e48f1ca6532793726d314028e063e320a9fa0040`.
- All three new covering indexes are live, ready and valid. Performance advisor `unindexed_foreign_keys` returned from 17 to the pre-Availability baseline 14 with zero Booking FK findings. Security remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance baseline remains auth RLS initPlan 16 and multiple permissive policies 6. Fresh zero-row indexes may appear as unused-index INFO until real Booking traffic exists.
- Production safety remains unchanged and fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- **Not claimed here:** requested/confirmed/rescheduled/canceled/completed/no-show lifecycle transitions, AI booking actions/reminders/deposit orchestration, or Field Service. Those remain separate Booking Operations Work Packages.

**Fresh continuation cursor:** `SECTION BOOKING_OPERATIONS -> BOOKING-LIFECYCLE`.

Before mutation, fresh-audit current main/open PRs plus the canonical Booking catalog and availability/hold state, any existing appointment/reservation/order/customer timeline authority, lifecycle/status transitions, audit/event producers and every booking-related UI/API path. Extend the canonical Booking authority only; do not create a second service catalog, availability engine, reservation truth, customer identity store, scheduler, payment truth or workflow engine.

---


## BOOKING-CATALOG Production closeout — 2026-09-30

- Work Package: `SECTION BOOKING_OPERATIONS -> BOOKING-CATALOG`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled canonical service-booking catalog RC scope.
- Implementation PR #363 merged to canonical `main@c8b7b701d6354097183486923608a230c64ef0cc`; final implementation head was `e1ceb4961ae6b378756a53ee804b6f5bad64a821`.
- Exact-head CI `36646539493` succeeded across lint, typecheck, tests, the complete PostgreSQL 17 migration/smoke regression chain, Next build, Vinext and Cloudflare scheduled verification. Exact-main CI `36646895908` succeeded on the merge SHA. Cloudflare Production Deploy `36647112423` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0157_booking_catalog` is live as version `20260929235009`; merged migration blob SHA is `451800f93f9164db62aaec2bc8bdf46c24ea7918`.
- Canonical service truth remains `public.services`. Booking configuration is modeled as child state through `service_booking_profiles`, branch/staff/resource eligibility mappings and `booking_resources`; no second service catalog, staff directory, branch model, availability engine or booking lifecycle authority was introduced.
- The Booking catalog models duration, before/after buffers, capacity per slot, branch/location eligibility, staff eligibility, typed booking rules and resource requirements. Resource requirements fail closed when inactive, over capacity or incompatible with the configured location mode.
- `configure_service_booking_catalog` is the replay-safe governed configuration command with request-key conflict protection, OWNER actor authorization, advisory locking and audit evidence. Direct partial mutation of Booking child state is blocked.
- The existing `/services` surface now exposes Booking configuration and resource management over the same canonical service authority. Existing service/pricing and Telegram Owner Catalog Composer authorities remain intact.
- Production activation was intentionally side-effect clean: all 8 existing services remain enabled exactly as before, **0** have a Booking profile, **0** are bookable, Booking Resources 0, Service/Branch links 0, Service/Staff links 0 and Service/Resource requirements 0. No synthetic Production service, branch, staff, resource or booking fixture was created.
- RLS is enabled on all five Booking catalog child tables. The trusted `configure_service_booking_catalog` mutation is SECURITY INVOKER, service-role executable only and denied to authenticated/anon callers. Organization members retain governed read access.
- All four Booking FK covering indexes are present and valid: branch eligibility, staff eligibility, booking-resource branch and resource-requirement lookup indexes.
- Post-`0157` advisors show no Booking-specific regression: security remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance remains unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Fresh zero-row Booking indexes may appear as unused-index INFO until real Booking traffic exists.
- Production safety remains fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- **Not claimed here:** availability calculation, slot generation, conflict/hold/locking semantics, booking lifecycle, AI booking orchestration or Field Service. Those remain their separate Booking Operations Work Packages.

**Fresh continuation cursor:** `SECTION BOOKING_OPERATIONS -> BOOKING-AVAILABILITY`.

Before mutation, fresh-audit current main/open PRs plus canonical Booking catalog, Organization/Business/Branch timezone authority, working/business hours, staff/team eligibility, resource capacities, any existing appointment/reservation/hold/conflict tables and every availability-related code path. Extend canonical authorities only; do not create a second service catalog, branch/staff/resource truth, booking lifecycle store or parallel availability authority.

---

## AUTO-NOTIFICATIONS Production closeout — 2026-09-30

- Work Package: `SECTION AUTOMATION -> AUTO-NOTIFICATIONS`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled notification projection, preference, escalation and configured-delivery RC scope.
- Implementation PR #360 merged to canonical `main@02d7fe39897ee7cd96d6e75c45b6f2355ed99051`; final implementation head was `d02415f5e3fd55e3aed6c7c25ab7493deaf721c2`.
- Exact-head CI `36641388201` succeeded across lint, typecheck, tests, the complete PostgreSQL 17 migration/smoke regression chain, Next build, Vinext and Cloudflare scheduled verification. Exact-main CI `36642548223` succeeded on the implementation merge SHA. Cloudflare Production Deploy `36642802504` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0155_automation_notifications` is live as version `20260929230224`; merged migration blob SHA is `2eb66ee4941aadd1dc9f0fd489abd0d781f0d194`.
- Canonical business/event truth remains in existing `audit_logs`, approval evidence and Automation runtime state. `notification_inbox` is a per-member projection, `notification_delivery_receipts` is terminal delivery evidence, and `notification_projection_checkpoints` is a projection watermark. No second event bus, workflow runtime, provider-send authority or notification work queue was introduced.
- Projection is cutover-safe and lossless: existing Organizations start at the migration cutover, historical events are not replayed, and the cursor is ordered by `(created_at,id)`. Current supported source evidence is governed approval escalation/expiry plus Automation runtime dead-letter evidence.
- In-app notification read/acknowledge and per-member preferences are governed. High/critical alerts have bounded escalation; acknowledgement stops further escalation. Default role targeting keeps Automation DLQ alerts to OWNER/ADMIN and approval alerts to eligible management/reviewer recipients.
- Telegram owner delivery reuses the existing Telegram notification authority and dedupe evidence. Email delivery reuses the existing Resend/email-provider authority plus cost guard. Configuration blockers remain retryable rather than being recorded as false terminal delivery receipts.
- Production currently has no configured notification email or notification mailbox, so real email notification delivery is **BLOCKED_EXTERNAL / configuration-pending** rather than claimed as live-verified. Push remains **DEPENDENCY_PENDING** on canonical device-registration/push-provider authority. SMS remains **DEPENDENCY_PENDING** on a Production-verified `OMNI-SMS-RCS` provider route.
- Production activation was intentionally side-effect clean: notification preferences 0, notification inbox 0, delivery receipts 0, Automation Rules 0, Automation Runs 0, Runtime Actions 0, Outreach Messages 43, Conversation Messages 37, Usage Events 108, Follow-up Jobs 6, pending approvals 9 and decided approvals 0. No synthetic Production notification, runtime event or provider send was created to demonstrate the feature.
- Notification tables have RLS enabled. Trusted mutation/projection/delivery RPCs are SECURITY INVOKER, service-role executable only, and denied to authenticated/anon callers. Authenticated users receive self-scoped read access only.
- Post-`0155` advisor verification exposed exactly two new unindexed notification foreign keys. Hotfix PR #361 added covering indexes only and merged to `main@e0ce35b157ad716286b0585231f90c5874bdc380`; hotfix head was `0ddc997f72c51e403823a20411e59f0b4c3f6af0`.
- Hotfix exact-head CI `36643473325` and exact-main CI `36643793575` succeeded. Cloudflare Production Deploy `36644062870` succeeded on the exact hotfix merge SHA. Production migration `0156_automation_notifications_fk_index_hardening` is live as version `20260929231538`; merged migration blob SHA is `702a84ea9f3c365f2f3c351e949118ed304fe63e`.
- Both notification FK covering indexes are valid and ready in Production. Performance advisor `unindexed_foreign_keys` returned from 16 to the pre-Notifications baseline 14 with zero notification-specific FK findings. Security advisor remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance baseline remains auth RLS initPlan 16 and multiple permissive policies 6.
- Production safety remains fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.

**Fresh continuation cursor:** `SECTION BOOKING_OPERATIONS -> BOOKING-CATALOG`.

Before mutation, fresh-audit current main/open PRs plus existing service/product catalog, branch/location, staff/team eligibility, business hours/resources, CRM/custom-object authorities and every booking-related schema/code path. Extend canonical authorities only; do not create a second service catalog, staff directory, branch model, resource truth, availability engine or booking lifecycle authority.

---

## AUTO-BUILDER Production closeout — 2026-09-30

- Work Package: `SECTION AUTOMATION -> AUTO-BUILDER`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled business-facing Automation Builder RC scope.
- Implementation PR #358 merged to canonical `main@96d6ecefda8d23fd8126dddd7f50e6709ff677fc`; final implementation head was `f265026ef314952fe64934e2e0686e8e325c0724`.
- Exact-head CI `36637555138` succeeded across lint, typecheck, **1418 tests**, the complete PostgreSQL 17 migration/smoke regression chain, Next build, Vinext and Cloudflare scheduled verification.
- Exact-main CI `36637897801` succeeded on the Builder merge SHA. Cloudflare Production Deploy `36638174944` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- AUTO-BUILDER required **no database migration**. Canonical workflow-definition authority remains `public.automation_rules` plus immutable `public.automation_rule_versions`; runtime truth remains `public.automation_runs` + `public.automation_run_actions`. No second workflow model, trigger catalog, condition store, action registry, executor, queue, scheduler or approval engine was introduced.
- The `/automations` surface is now a business-facing visual **When -> Only if -> Then** builder over the existing Trigger Catalog, typed Condition Fact Catalog and Tool/Action Registry. Raw Conditions/Actions JSON editing is no longer the normal builder path.
- Governed starter templates use only currently AVAILABLE trigger/action contracts. Action selection is scope-aware and action-specific business configuration is exposed for Preview, Human Handoff, Operator Brief, MARK_HOT, SEND_FOLLOWUP and PAUSE_AUTOMATION.
- Existing advanced/nested condition graphs are preserved exactly rather than silently flattened. Replacing an advanced graph with simpler visual conditions requires an explicit user action.
- Test Mode is side-effect-free: it reuses canonical trigger/condition/action/runtime validators and can optionally evaluate conditions read-only against one Organization-scoped subject. It does **not** enqueue an Automation event, create a run, execute an action, send a provider message or bypass approval/Shadow policy.
- Draft save, Publish and Enable/Disable remain separate explicit governed operations through the existing workflow RPC boundary. Creating a workflow produces a disabled draft; saving never implicitly publishes or enables it.
- Version comparison reads immutable `automation_rule_versions`; execution history and error diagnostics read canonical runtime tables, including action attempts, terminal errors and compensation state. Builder history does not create a parallel reporting/runtime store.
- Production remained unseeded and side-effect clean after deployment: Automation Rules 0, published versions 0, Automation Runs 0, Runtime Actions 0, Outreach Messages 43, Conversation Messages 37, Usage Events 108, Follow-up Jobs 6, pending approvals 9 and decided approvals 0. No synthetic Production workflow or runtime event was created merely to demonstrate the Builder.
- Production Builder contracts remain 17 AVAILABLE triggers, 61 typed condition facts and all 6 canonical Tool/Action contracts AVAILABLE.
- No migration was added after `0154_automation_runtime_fk_index_hardening`; Production migration history remains unchanged by AUTO-BUILDER.
- Production safety remains fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-deploy advisor baseline is unchanged: security RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6.
- **Not claimed here:** automation notification delivery/escalation surfaces. Those remain the separate `AUTO-NOTIFICATIONS` Work Package.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-NOTIFICATIONS`.

Before mutation, fresh-audit current main/open PRs plus existing notification/event authorities, approval escalation evidence, runtime DLQ/compensation/error states, operator surfaces and channel delivery boundaries. Extend canonical notification/event paths only; do not create a second event bus, notification queue, provider-send authority, alert truth or workflow runtime.

---

## AUTO-RUNTIME Production closeout — 2026-09-30

- Work Package: `SECTION AUTOMATION -> AUTO-RUNTIME`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled durable workflow-execution RC scope.
- Implementation PR #355 merged to canonical `main@9d540a4c75bab5aaeef771fa260f8093880077fc`; final implementation head was `caa793cdb137c21f9df2bc777ea4f0f3d56808ea`.
- Exact-head CI `36630486924` succeeded across lint, typecheck, tests, the complete PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. Controlled SQL acceptance covered event idempotency, immutable published-version execution, ordered actions, `FOR UPDATE SKIP LOCKED` leasing, verified-success gating, bounded retry, timeout recovery, DLQ, compensation requirements, Global Kill Switch, Agents Pause, approval/Shadow waits and scheduled approval deadline reconciliation.
- Exact-main CI `36631038101` succeeded on the runtime merge SHA. Cloudflare Production Deploy `36631362277` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0153_automation_runtime` is live as version `20260929211117`; merged migration blob SHA is `41a500b9d0490794dde5f4146cff00aa13ad258d`.
- Canonical workflow-definition authority remains `public.automation_rules` plus immutable `public.automation_rule_versions`. `public.automation_runs` and `public.automation_run_actions` are child runtime state only. The action table is the ordered durable runtime outbox/DLQ state, not a second workflow engine, generic queue, action gateway or provider-send authority.
- The existing Cloudflare Worker `scheduled()` loop remains the scheduler. No `pg_cron`, `pgmq` or parallel scheduler was introduced. Existing `agent_runs` and `followup_jobs` retain their domain-specific authority; the 6 real legacy overdue `followup_jobs` were not executed or mutated.
- Runtime executes only immutable published READY versions. Event ingestion is idempotent by Organization/rule/version/source-event key. Action claims use bounded leases and `SKIP LOCKED`; actions execute in order. Internal idempotent actions use bounded retry, while external-provider ambiguity never blind-retries after provider acceptance and moves to reconciliation-only evidence.
- Success requires verifier evidence. Terminal failures are durable DLQ state and prior successful side effects can be marked compensation-required for governed resolution.
- Global Kill Switch and Agents Pause both fail closed at the claim boundary and controlled PostgreSQL acceptance proves claims resume only after release. Disabling a workflow cancels unstarted runtime actions.
- Approval deadlines are now scheduled by AUTO-RUNTIME through the existing `reconcile_due_message_approvals` authority. `WAITING_APPROVAL`, `WAITING_RELEASE` and `VERIFYING` are durable external waits rather than active short-deadline execution; after release, active runtime deadline budget is restored.
- All 6 canonical Tool/Action contracts are now `AVAILABLE`: `GENERATE_PREVIEW`, `HANDOFF_HUMAN`, `CREATE_OPERATOR_BRIEF`, `MARK_HOT`, `PAUSE_AUTOMATION` and `SEND_FOLLOWUP`. Runtime reuses their existing authorities instead of bypassing them.
- `SEND_FOLLOWUP` creates the canonical approval artifact, waits for governed approval, remains `WAITING_RELEASE` while Shadow Mode is ON, and only after release routes through the existing approved-send authority. No direct provider client was added to the runtime dispatcher and no controlled Shadow bypass was introduced.
- Runtime mutation/claim/reconciliation/command RPCs are SECURITY INVOKER and service-role executable only; authenticated and anon execution is denied. Runtime tables have RLS enabled and authenticated Organization-member read policies.
- Production verification after `0153` remained side-effect clean: Automation Rules 0, published Automation versions 0, Automation Runs 0, Runtime Actions 0, Outreach Messages 43, Conversation Messages 37, Usage Events 108, Follow-up Jobs 6, pending approvals 9 and decided approvals 0. No synthetic Production workflow/event/run or provider call was created.
- Post-`0153` advisor verification exposed exactly 7 new unindexed runtime foreign keys. Hotfix PR #356 added covering indexes only and merged to `main@3655644a709ba206fbd75e5b58497a8d696326c4`; hotfix head was `1f3a6337cf60757d80fb538a929eff3a3e3e5723`.
- Hotfix exact-head CI `36631862464` and exact-main CI `36632242868` succeeded. Cloudflare Production Deploy `36632563479` succeeded on the hotfix merge SHA. Production migration `0154_automation_runtime_fk_index_hardening` is live as version `20260929212153`; merged migration blob SHA is `2f802768edd9faa92efbd5157cdf225ffc1887f9`.
- All 7 AUTO-RUNTIME FK covering indexes are valid and ready in Production. Performance advisor `unindexed_foreign_keys` returned from 21 to the pre-runtime baseline 14, with **zero runtime-specific FK findings**. Security advisor baseline remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance baseline is auth RLS initPlan 16 and multiple permissive policies 6. Newly created runtime indexes may appear as unused-index INFO until real runtime traffic exists.
- Production safety remains fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- **Not claimed here:** the visual automation builder or automation notification surfaces. Those remain separate Work Packages.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-BUILDER`.

Before mutation, fresh-audit current main/open PRs plus the existing workflow editor UI, draft/publish/version RPCs, Trigger Catalog, typed Condition Engine, Tool/Action Registry, approval model and runtime contracts. Build the visual/business-facing builder over those canonical authorities only; do not create a second workflow definition model, trigger/condition/action catalog, executor, queue, scheduler or approval engine.

---

## AUTO-APPROVAL Production closeout — 2026-09-29

- Work Package: `SECTION AUTOMATION -> AUTO-APPROVAL`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled approval-orchestration RC scope.
- PR #353 merged to canonical `main@e04c57d45d53f64fbed4834dc273941a7001dd41`; final implementation head was `5542734d330f1ac456e78c1fa47d0094aca5912c`.
- Exact-head CI `36617523783` succeeded across lint, typecheck, 1395 tests, the complete PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. Controlled SQL acceptance covered replay-safe approve/reject, required denial reason, direct-mutation fail-closed guard, delegation and delegated-reviewer decision, escalation, expiry and side-effect cleanliness.
- Exact-main CI `36618071238` succeeded on the merge SHA. Cloudflare Production Deploy `36618411998` succeeded on the same SHA through credential preflight, isolated release-candidate deploy/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0152_automation_approval` is live as version `20260929192120`; merged migration blob SHA is `627d315fe761dacd751b4db346bd9fb6480177de`.
- Canonical approval policy authority remains `public.approval_rules`; the existing `public.conversation_messages` approval states remain the queue and `public.audit_logs.correlation_id` is reused as replay evidence. No second approval engine/request table/queue/outbox/action gateway/provider-send authority was created.
- All 6 real Smart Visions approval rules are now explicit `STRICT` policies with 24-hour expiry, 4-hour escalation, OWNER reviewers and governed delegation eligibility to OWNER/ADMIN/SALES_MANAGER. This changed policy metadata only; it did not create new Organization members.
- The 9 pre-existing real pending approvals were preserved and policy-snapshotted. Their legacy deadline clocks started at migration time instead of being retro-expired: 9 pending, 9 snapshotted, 0 expired-now and 0 escalation-due at verification.
- Pending approval state is guarded against direct mutation. A controlled Production attempt to bypass the governed command path failed closed and left queue cardinality unchanged.
- `decide_message_approval`, `delegate_message_approval`, `reconcile_due_message_approvals`, replay/actor/reviewer helpers are SECURITY INVOKER. Trusted mutation/reconciliation execution is service-role only; authenticated and anon cannot execute these RPCs. Trigger functions are not directly executable by service/authenticated/anon.
- Real Smart Visions OWNER read-only runtime verification returned `owner_can_review=true` for an existing pending approval. Deadline reconciliation returned `expired_count=0`, `escalated_count=0`; no Production approval decision or delegation was created.
- Approve/reject server actions now use governed RPCs rather than direct `conversation_messages` updates. Reject requires a bounded denial reason. The existing approval surface exposes mode, request/escalation/expiry timing and governed delegation while controlled WhatsApp provider-send pilots remain OWNER-only.
- `SEND_FOLLOWUP` remains `DEPENDENCY_PENDING`, approval-required and bound to `OUTBOUND_SEND`, but its remaining Work Package dependency is now only `AUTO-RUNTIME`; approval orchestration is no longer the blocker.
- Production side-effect evidence remained unchanged by verification: Automation Rules 0, published Automation versions 0, Outreach Messages 43, Conversation Messages 37, Usage Events 108 and Follow-up Jobs 6. The approval queue remained 9 pending / 0 decided / 0 escalated. No synthetic customer/workflow/provider evidence and no provider call was created.
- Production safety remains fail-safe: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF. Unreleased/held channel AI pauses remain ON for Instagram, Facebook Messenger, Web Chat, Telegram, TikTok, SMS and RCS.
- Post-0152 advisor baseline shows no AUTO-APPROVAL-specific security or unindexed-FK regression: RLS-enabled/no-policy INFO 15, leaked-password-protection WARN 1, unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. The new approval reviewer index is only an unused-index informational finding immediately after creation.
- **Not claimed here:** durable workflow execution, scheduler/outbox processing, retries, DLQ, compensation, timeout/concurrency runtime, visual builder or automation notifications. These remain separate Work Packages.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-RUNTIME`.

Before mutation, fresh-audit current main/open PRs and the existing queue/outbox/event/follow-up execution primitives, workflow publication/enablement model, Tool/Action Registry, approval boundary, provider send authorities and all current automation execution consumers. Reuse existing primitives; do not create a second workflow engine, queue, outbox, scheduler, action gateway, provider-send authority or approval engine.

---


## AUTO-TOOL-ACTION-REGISTRY Production closeout — 2026-09-29

- Work Package: `SECTION AUTOMATION -> AUTO-TOOL-ACTION-REGISTRY`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the governed Tool/Action contract-registry RC scope.
- PR #351 merged to canonical `main@3a8cbe0735cb948556c9154cde5a2c6e51887ef9`; final implementation head was `e723d18d8d38e5093f7784506cd67b0139e610c4`.
- Exact-head CI `36610866049` succeeded across lint, typecheck, tests, the complete PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. Earlier head CI `36610457171` exposed only a compact-CI lineage gap: the legacy Production `approval_rules` authority was absent from the test bootstrap. The bootstrap was aligned to the real Production schema and the full chain then passed without weakening the product contract.
- Exact-main CI `36611263495` succeeded on the merge SHA. Cloudflare Production Deploy `36611505849` succeeded on that same SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0151_automation_tool_action_registry` is live as version `20260929182352`; merged migration blob SHA is `8451fc77a17ac2d998b2fdf23716800c527627cc`.
- Canonical workflow action-definition truth remains `public.automation_rules.actions`. `public.tool_action_registry` is system-owned contract metadata only; it stores no action requests and creates no second executor, action gateway, queue, outbox, provider-send authority or approval engine.
- Production contains exactly 6 current workflow action contracts. `GENERATE_PREVIEW` and `HANDOFF_HUMAN` are `AVAILABLE`; `CREATE_OPERATOR_BRIEF`, `MARK_HOT`, `PAUSE_AUTOMATION` and `SEND_FOLLOWUP` are explicitly `DEPENDENCY_PENDING`.
- Every registered action carries typed input/output schemas, permission key, scope, idempotency contract, cost class, side-effect class, approval requirement, verifier and audit contract.
- `SEND_FOLLOWUP` is bound to the existing `APPROVED_SEND_POLICY` / `OUTBOUND_SEND` authority, classified `PROVIDER_METERED` + `EXTERNAL_PROVIDER`, requires approval, and remains dependency-gated on `AUTO-APPROVAL` + `AUTO-RUNTIME`. The real Smart Visions `OUTBOUND_SEND` approval rule exists in Production with `requires_approval=true`.
- `MARK_HOT` is bound to `SALES_SCORING_GOVERNANCE`; Registry metadata explicitly forbids a direct `leads.status` write that would bypass canonical Sales Scoring evidence.
- Unknown action keys fail closed at Draft. Dependency-pending actions may be designed in Draft but fail closed at Publish. Enablement re-checks the latest immutable published action snapshot so a later deprecation cannot silently reactivate a workflow.
- Tool/Action Registry RLS is enabled. A real Smart Visions OWNER authenticated read saw all 6 contracts. Authenticated users and service role have SELECT-only table access; authenticated/anon cannot execute the trusted validator, while service role can. Validator and guards are SECURITY INVOKER.
- Three live guards protect the workflow root, immutable published versions and enablement boundary.
- Read-only Production validation proved `GENERATE_PREVIEW` publish validation succeeds, `SEND_FOLLOWUP` is valid as a Draft contract, and its Publish validation remains blocked while dependency-pending.
- Automation UI now reads action contracts from the database Registry instead of a hardcoded action list and surfaces action availability beside each workflow.
- Production remained side-effect clean: Automation Rules 0, published Automation versions 0, Approval Rules 6, Outreach Messages 43, Conversation Messages 37, Usage Events 108 and Follow-up Jobs 6. No synthetic workflow/customer/provider evidence was created.
- Post-0151 advisors show no Tool/Action Registry-specific security or unindexed-FK regression. Existing baseline remains RLS-enabled/no-policy INFO 15, leaked-password-protection WARN 1, unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6.
- Production safety is unchanged: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- **Not claimed here:** approval orchestration, durable workflow/action execution, retries/compensation runtime, visual builder or notifications. Those remain separate Automation Work Packages.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-RUNTIME`.

Before mutation, fresh-audit current main/open PRs plus the existing `approval_rules` authority, Shadow approval queue, approved-send policy, message approval surfaces and all approval consumers. Extend the existing approval boundary only; do not create a second approval engine, action gateway, workflow runtime, queue, outbox or provider-send authority.

---

## AUTO-CONDITION-ENGINE Production closeout — 2026-09-29

- Work Package: `SECTION AUTOMATION -> AUTO-CONDITION-ENGINE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the typed deterministic condition-evaluation RC scope.
- PR #349 merged to canonical `main@6292d0cc0725864e0f44f2bc923f403851fb04b9`; final implementation head was `c15da2b86cda24dcd8f1b1fdb4e97f3e1bc0ac36`.
- Exact-head CI `36571352718` succeeded across lint, typecheck, tests, the full PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification. An earlier head run exposed only a compact-CI-bootstrap drift for the legacy Lead `recommended_offer` column; the bootstrap was aligned to the real Production lineage and the complete chain then passed.
- Exact-main CI `36571715430` succeeded on the merge SHA. Cloudflare Production Deploy `36572032475` succeeded on that exact SHA through credential preflight, isolated release-candidate deployment/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0150_automation_condition_engine` is live as version `20260929130243`; merged migration blob SHA is `fc0b663d890f14fe0fa89c3737b3af919fb80827`.
- Canonical workflow-condition truth remains `public.automation_rules.conditions`. `public.automation_condition_fact_catalog` is system-owned metadata only and stores no customer/runtime fact values; no second workflow/rules engine, fact store, queue or outbox was created.
- The condition contract is typed and bounded: `GROUP(AND/OR)` + `PREDICATE`, TEXT/NUMBER/BOOLEAN/UUID/TIMESTAMP facts, depth <= 4, <= 20 leaves, <= 8 children/top-level nodes and <= 20 list values. A condition set targets one canonical subject type and must match the trigger family when subject-bound conditions are used.
- Production catalog contains 61 allowlisted facts across 7 canonical subject types: Lead, Deal, CRM Task, Account, Conversation, Segment Snapshot and Support Case. Evaluation uses fixed Organization-scoped reads from those existing authorities; there is no dynamic SQL or expression-eval surface.
- Condition validation/fact loading/evaluation RPCs are SECURITY INVOKER, service-role executable only; authenticated and anon execution is denied. Authenticated users can read the fact metadata catalog but cannot INSERT/UPDATE/DELETE it.
- A read-only Production runtime evaluation against an existing Smart Visions Lead deterministically matched 2/2 bounded numeric Lead conditions. No Production fixture or customer/provider event was created.
- The existing least-privilege Task boundary was preserved: `service_role` still has no table-wide SELECT on `crm_tasks`; only already-governed columns such as status/due/assignee remain readable, while priority/task_type remain denied.
- Production stayed side-effect clean: Automation Rules 0, published Automation versions 0, Approval Rules 6, Outreach Messages 43, Conversation Messages 37, Usage Events 108 and Follow-up Jobs 6.
- Post-0150 advisors show no Condition Engine-specific security or unindexed-FK regression. Existing baseline remains RLS-enabled/no-policy INFO 15, leaked-password-protection WARN 1, unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6.
- Production safety is unchanged: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- **Not claimed here:** tool/action registry, approval orchestration, durable workflow execution, retry/compensation runtime, visual builder or notifications. Those remain separate Automation Work Packages.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-TOOL-ACTION-REGISTRY`.

Before mutation, fresh-audit current main/open PRs and the existing action/tool authorities, approval/policy/action-gateway boundaries and all current `automation_rules.actions` consumers. Extend the canonical workflow/action boundary only; do not create a second tool registry, action gateway, workflow engine, queue, outbox, provider-send authority or approval engine.

---


## AUTO-TRIGGER-CATALOG Production closeout — 2026-09-29

- Work Package: `SECTION AUTOMATION -> AUTO-TRIGGER-CATALOG`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the governed trigger-contract catalog RC scope.
- PR #347 merged to canonical `main@1c63bb6734206f5bd0cd4e4d4963553d1cf46afb`; implementation head was `a2611007c559a00440b45e9136d8d858add54ae4`. 
- Exact-head CI `36531934368` succeeded across lint, typecheck, tests, PostgreSQL 17 migration/smoke, Next build, Vinext and Cloudflare scheduled verification.
- Exact-main CI `36532221317` succeeded on the merge SHA. Cloudflare Production Deploy `36532486413` succeeded on that same SHA through exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0149_automation_trigger_catalog` is live as version `20260929064517`; merged migration blob SHA is `8bc156375b355e8da80060de5ac4fa907d6f34d7`.
- The canonical workflow authority remains `public.automation_rules`. `public.automation_trigger_catalog` is system-owned reference metadata only; it stores no trigger occurrences and creates no event bus, queue, outbox, executor or second workflow authority.
- Production contains 32 cataloged trigger contracts across all 15 required families: 17 `AVAILABLE`, 15 `DEPENDENCY_PENDING`, 0 `DEPRECATED`. Booking, Quote, Order, Invoice and Payment trigger contracts remain dependency-gated until their canonical owning modules exist.
- Draft/root definitions fail closed on unknown trigger keys. Immutable published versions accept only `AVAILABLE` triggers, and enablement re-checks the latest published trigger contract. The three guards are live and SECURITY INVOKER.
- Trigger Catalog RLS is enabled. Authenticated and service-role runtime access is SELECT-only; authenticated INSERT/UPDATE/DELETE are denied. A real Smart Visions OWNER/RLS read saw all 32 catalog entries and the dependency-pending Booking contract.
- Production remained side-effect clean: Automation Rules 0, published Automation versions 0, Approval Rules 6, Outreach Messages 43, Conversation Messages 37, Usage Events 108 and Follow-up Jobs 6. No synthetic workflow/event/customer/provider evidence was created.
- Production safety is unchanged: Shadow Mode ON; Global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-0149 advisors show no Trigger Catalog-specific security or unindexed-FK regression. Existing baseline remains RLS-enabled/no-policy INFO 15, leaked-password-protection WARN 1, unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6.
- **Not claimed here:** condition evaluation, action/tool registry, approval orchestration, durable workflow execution, retries/compensation, builder or notifications. Those remain separate Automation Work Packages.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-CONDITION-ENGINE`.

Before mutation, fresh-audit current main/open PRs and the existing `automation_rules.conditions` shape plus canonical CRM/Segment/communication facts. Extend the existing workflow model only; do not create a second workflow engine, rules engine, customer fact store, scoring engine, queue or outbox.

---

## AUTO-WORKFLOW-MODEL Production closeout — 2026-09-29

- Work Package: `SECTION AUTOMATION -> AUTO-WORKFLOW-MODEL`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the governed workflow-definition model RC scope.
- PR #345 merged to canonical `main@c6abc26fd5521774ab2f0b4c70c3cffa482c0efe`; implementation head was `b65d0b501b876a5ad32e10a7808f6358f3c6814a`.
- Exact-head CI `36506580079` succeeded across lint, typecheck, tests, PostgreSQL 17 migration/smoke, Next build, Vinext and Cloudflare scheduled verification.
- Exact-main CI `36506777208` succeeded on the merge SHA. Cloudflare Production Deploy `36506935424` succeeded on that exact SHA, including release-candidate deploy/smoke, controlled SSR load, exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0148_automation_workflow_model` is live as version `20260929011256`; merged migration blob SHA is `fc4f19680e6583b4273f4eeaa6ddae2028103a78`.
- Canonical workflow authority remains `public.automation_rules`. The new `public.automation_rule_versions` table is only the immutable published-version snapshot child of that authority; it is not a second automation engine, runtime, queue or outbox.
- The model now governs Trigger, ordered Conditions/Actions payloads, eligible owner, DRAFT/PUBLISHED state, optimistic draft revision, immutable published versions, explicit enable/disable and `NOT_READY / READY / DISABLED` execution eligibility. A newer draft can coexist with the last published READY version without silently changing runtime truth.
- Creation/update/publish/enable mutations are service-role-only SECURITY INVOKER RPCs with explicit human actor provenance. Authenticated browser access to both workflow tables is read-only under RLS; direct INSERT/UPDATE/DELETE/TRUNCATE is denied.
- Existing Web and Telegram Owner surfaces reuse the same canonical authority. Legacy `automation.create/update` parity now routes through the governed RPC boundary; richer draft/publish/enable controls remain specialized workflow-model actions.
- Production remains honest: 0 automation rules, 0 published automation versions and 6 existing approval rules. Outreach messages stayed 43 and conversation messages stayed 37. No synthetic Production workflow, execution, provider send, Task, Lead or approval evidence was created.
- Production safety is unchanged: Shadow Mode ON; global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-0148 advisors show no Automation-specific security or unindexed-FK regression. Existing platform baseline remains RLS-enabled/no-policy INFO 15, leaked-password-protection WARN 1, unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Fresh zero-row workflow indexes are naturally reported unused.
- **Not claimed here:** trigger catalog semantics, condition evaluation, tool/action registry, approval orchestration, durable execution, retries/compensation, builder or notifications. Those remain their separate Work Packages, especially `AUTO-RUNTIME`.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-TRIGGER-CATALOG`.

Before mutation, fresh-audit current main/open PRs and existing event/trigger/state catalogs plus all code paths that consume `automation_rules.trigger_key`. Extend the canonical workflow model only; do not create a second event bus, trigger store, workflow engine, queue or outbox.

---


## CUSTOMER-SUCCESS-LOYALTY Production closeout — 2026-09-29

- Work Package: `SECTION SEGMENT_SALES_MARKETING -> CUSTOMER-SUCCESS-LOYALTY`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the current RC scope.
- PR #343 merged to canonical `main@2c4b4ef72c3fb13f27012f16078323b4a68d1b9f`; implementation head was `b9aea3f746eb6c5331482a2fa899219786b8e1c5`.
- Exact-head CI `36497500213` succeeded across lint, typecheck, Vitest, PostgreSQL 17 migration/smoke, Next build, Vinext and scheduled verification.
- Exact-main CI `36497865655` succeeded on the merge SHA.
- Cloudflare Production Deploy `36498116462` succeeded on the same exact main SHA, including exact-green checkout, release-candidate deployment/smoke, controlled SSR load, exact bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0147_customer_success_loyalty` is live as version `20260928232514`; merged migration blob SHA is `792bfe02b27ca2f7eba61480edb3cb8368450670`.
- Canonical Account lifecycle remains `public.businesses.account_lifecycle`; CRM Task remains `public.crm_tasks`; Support remains `public.crm_support_cases`; Marketing Campaign remains `public.campaigns`. No second customer, task, campaign, consent, scoring, billing or workflow authority was created.
- Health/churn are bounded explainable derived evidence, not a second persisted scoring engine. New persisted truth is limited to append-only non-cash loyalty events and governed referral evidence linked back to canonical Account/Person/Lead/Deal truth.
- Production runtime succeeded under the real Smart Visions authenticated OWNER/RLS context. Current honest state is 19 Businesses, 0 CUSTOMER accounts, 0 FORMER_CUSTOMER accounts, 19 Leads, 0 Deals, 0 Tasks, 0 CUSTOMER_SUCCESS Tasks, 0 loyalty events, 0 referrals, 7 Campaigns and 0 lifecycle-classified Campaigns; `get_customer_success_summary` and `get_customer_success_accounts` return valid zero-data results without fixtures.
- Production remained side-effect clean: Outreach messages stayed 43 and Conversation messages stayed 37. No synthetic customer, Task, referral, loyalty, campaign, send or commercial evidence was created.
- RLS is enabled on `customer_loyalty_events`, `customer_referrals`, `crm_tasks` and `campaigns`. The loyalty immutable guard and Customer Success Task provenance guard are live.
- Customer-success read RPCs are SECURITY INVOKER and authenticated/service-role readable; trusted task/loyalty/referral/campaign mutations are SECURITY INVOKER, service-role-only, authenticated execution denied and anon execution denied.
- The trusted runtime keeps least privilege on `crm_tasks`: service_role still has no table-wide SELECT; only the required `due_at` and `metadata` read columns were added to the previously scoped grant set.
- Post-0147 advisors show no Customer Success security or unindexed-FK regression: security remains RLS-enabled/no-policy INFO 15 plus leaked-password-protection WARN 1; performance remains unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6. Fresh zero-row indexes are naturally reported unused and are not an integrity regression.
- Production safety is unchanged: Shadow Mode ON, global Kill Switch OFF, Email pause OFF, WhatsApp AI pause OFF and Agents pause OFF.

**Fresh continuation cursor:** `SECTION AUTOMATION -> AUTO-WORKFLOW-MODEL`.

Before mutation, fresh-audit current main/open PRs and the existing `automation_rules` / `approval_rules` authority. Production currently has 0 Smart Visions automation rules and 6 canonical approval rules. Extend `automation_rules` rather than creating a second workflow/automation authority; add immutable published-version semantics only where the existing model cannot represent them.

## Superseding SALES-SCORING Production checkpoint — 2026-09-28

- PR #326 merged to canonical `main@f6b08675d8c3a83aa6dccd8790fe9b9077e1c7ea`.
- Exact-head CI `36424281940` succeeded before merge. Exact-main CI `36424607322` also succeeded across lint, typecheck, Vitest, PostgreSQL 17 migration/smoke, Next build, Vinext and Cloudflare scheduled verification.
- Cloudflare Production Deploy `36424885898` succeeded on the same exact main SHA, including release-candidate smoke, controlled SSR load, exact bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production Supabase migration `0138_sales_scoring_governance` is live as version `20260928125243`; merged migration file SHA is `78e37903711be84971a7c01a7ab4b21885720124`.
- Canonical accepted Lead scoring truth remains on `public.leads`; no `lead_scores` table, competing scoring engine or second scoring authority was created.
- Governance now covers deterministic opportunity score, fit, intent, bounded engagement evidence, structured provenance/policy version, optimistic scoring revision, explicit manual override with reason/expiry/correction, and advisory-only model suggestions that cannot silently overwrite canonical accepted score truth.
- Existing Hunter score writers now stamp bounded source provenance and use the trusted service boundary; Hunter acquisition evidence remains source-attributed rather than silently redefined as generic CRM truth.
- Scoring mutation RPCs are SECURITY INVOKER and service-role-only for OWNER/ADMIN/SALES_MANAGER attribution. Authenticated users have RLS-governed read through `get_crm_lead_scoring`; browser execution of trusted score/override mutations is denied.
- PostgreSQL 17 controlled smoke proved idempotent request replay, request-key semantic conflict rejection, manual override preserving deterministic base truth, advisory model separation, bounded engagement recompute, cross-tenant actor/read isolation, audit privacy and zero outbound-message side effects.
- Production stayed honest: 19 real Leads remain, while governed scoring revisions=0, fit non-null=0, engagement non-null=0, active overrides=0, model suggestions=0 and scoring source provenance=0 for pre-existing rows. Migration did not fabricate or rescore Production Leads.
- Production Lead RLS remains enabled; governance trigger and all five new supporting indexes are live. Authenticated execution is false for deterministic/override mutations while service-role execution is true.
- Post-0138 Supabase advisors show no SALES-SCORING-specific regression. Existing advisor debt remains separate: historical RLS-enabled/no-policy info findings, leaked-password-protection warning, older unindexed FKs and auth RLS initPlan warnings.
- Disposition: `SALES-SCORING` current RC scope is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.
- Fresh next cursor: `SECTION SEGMENT_SALES_MARKETING / SALES-PIPELINE-V2`. Fresh runtime/main audit is required before any schema or authority change.

## Superseding SEGMENT-SNAPSHOT Production checkpoint — 2026-09-28

- PR #324 merged to canonical `main@0e5e4e61be1d30c2ba134ed66a4ad1b2457a7c98`.
- Exact-main CI `36411781776`: SUCCESS across lint, typecheck, 1298 Vitest tests, PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification.
- Cloudflare Production Deploy `36411960392`: SUCCESS on the exact main SHA.
- Production migration `0137_segment_snapshot` is live as version `20260928104942`; merged migration file SHA `abc1e5d7c9710bf43ca99aa989ec9dff8f5ce8e3`.
- Canonical dynamic Segment authority remains `crm_segments + crm_segment_versions`; Snapshot owns only immutable historical audience evidence through `crm_segment_snapshots + crm_segment_snapshot_members`.
- Production stayed honest: Segment definitions=0, Segment versions=0, Snapshots=0, Snapshot members=0. No synthetic audience or acceptance snapshot was created.
- Snapshot creation is service-role-only SECURITY INVOKER and requires an attributed OWNER/ADMIN/SALES_MANAGER. Authenticated members have RLS-governed read only; browser INSERT/UPDATE/DELETE is denied.
- Snapshot header freezes exact Segment/version/entity type/predicate hash/member count/membership hash. Exact ordered member IDs are immutable, request-key-idempotent and capped at 10,000 in the RC contract.
- Deferred integrity triggers bind the header count/hash to exact member rows and immutable triggers reject UPDATE/DELETE. Controlled PostgreSQL 17 smoke proved replay safety, tamper rejection, historical reproducibility after Segment definition advancement, Deal Custom Field evaluation, cross-tenant isolation, bounded audit privacy and zero outbound-message side effects.
- The trusted service received SELECT-only access required to evaluate Segment predicates atomically; no INSERT/UPDATE/DELETE authority was added on canonical Segment, Deal or Custom Field stores.
- Post-0137 advisors show no Snapshot-specific security or unindexed-FK regression; existing advisor debt remains separate.
- Disposition: `SEGMENT-SNAPSHOT` current RC scope is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.
- Fresh next cursor: `SECTION SEGMENT_SALES_MARKETING / SALES-SCORING`. Existing canonical score truth is already on `leads.opportunity_score`, `leads.intent_score` and `leads.score_reasons`, with deterministic scoring libraries. Do not create a second lead-score store. Fresh audit must add the missing governed fit/engagement/evidence/manual-override/model-suggestion contract over this existing authority.

## Superseding CRM Customer 360 Support integration Production checkpoint — 2026-09-28

- Canonical main: `eed2a07b0bda3ec87c57f7ee4c4062d40b351cd7` after PR #321.
- Exact-main CI `36403380564`: SUCCESS across lint, typecheck, Vitest, PostgreSQL 17 migration/smoke chain, Next build, Vinext and Cloudflare scheduled verification.
- Cloudflare Production Deploy `36403658680`: SUCCESS on the same SHA, including release-candidate smoke, controlled SSR load, exact bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production Supabase migration `0135_crm_customer360_support_integration` is live as version `20260928092811`; merged migration file SHA `42e7a4bd56b9577840827757a3b1460deae26e66`.
- Existing `get_crm_customer360_v2` now includes canonical Support Cases only when `crm_support_cases.person_id` explicitly equals the requested Person. Company relationship alone does not attribute a Case to a Person.
- Support Case identity/context remains immutable after creation; Customer 360 does not add a parallel LINK/UNLINK mutation path or weaken Support governance.
- The Support collection omits description, resolution-summary and CSAT-comment prose; scoped internal Notes remain `CANONICAL_LINK_PENDING` rather than being widened into Organization-level Customer 360 visibility.
- Production stayed honest: `crm_people=0`, `crm_support_cases=0`, `crm_support_sla_policies=0`, `crm_data_import_batches=0`; no synthetic Person/Case/import evidence was created.
- `get_crm_customer360_v2` remains SECURITY INVOKER, authenticated-only; anon/service-role direct execute is denied. Post-0135 advisors show no Customer360/Support-specific security or unindexed-FK regression.
- Disposition: Person/Lead/Conversation/Task/Deal/Support composition is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**. The whole `CRM-CUSTOMER360-V2` remains **PARTIAL / REQUIRED** because scoped Notes linkage and Booking/Quote/Order/Invoice/Payment/Document/Consent authorities remain absent or intentionally authorization-gated.
- Fresh read-only audit of `SEGMENT-V2` found canonical `crm_segments + crm_segment_versions` live with RLS and zero Production rows. Existing functions/evaluator are LEAD/DYNAMIC-only. Next code-first cursor is `SECTION SEGMENT_SALES_MARKETING / SEGMENT-V2`: extend the existing governed engine to justified Person/Deal/Account entities rather than creating another Segment store.


## Superseding CRM Data Quality Production checkpoint — 2026-09-28

- Canonical main: `4a1cf8d0064bf6f35f82987e6b5f78c2ee2f3bc1` after PR #319.
- Exact-main CI `36401560832`: SUCCESS.
- Cloudflare Production Deploy `36401836383`: SUCCESS on the same SHA.
- Production Supabase migration `0134_crm_data_quality_foundation` is live as version `20260928090829`; merged migration file SHA `a63ff38551fb6153bd1841d177575677525c6063`.
- `CRM-DATA-QUALITY` reuses canonical Business/Identity/Person authorities plus `CRM-IDENTITY-GRAPH`; no second dedupe engine, Person store, Account model or import-contact truth exists.
- Deterministic read-only quality scan surfaces exact Person/Business identity conflicts, active People without active identity, canonical normalization mismatches and exact duplicate Business email/phone/domain evidence. It never fuzzy-matches or auto-merges.
- Verified Contact import is bounded to 1–100 rows / 256 KiB, validates the whole batch before canonical mutation, is atomic, request-key/content-hash idempotent, OWNER/ADMIN/SALES_MANAGER governed and fails closed on ambiguous identity evidence.
- Import apply reuses `record_crm_business_identity` and `create_or_resolve_crm_person_from_verified_identity`. Import receipts store bounded counts/hash only; raw imported PII is not copied into the receipt/audit summary.
- Production stayed honest after migration: `crm_data_import_batches=0`, `crm_people=0`, `crm_person_identity_links=0`, `crm_person_business_relationships=0`, `crm_identities=47`, `crm_identity_links=47`, `businesses=19`. No synthetic import/Person/relationship evidence was created.
- `crm_data_import_batches` has RLS enabled with authenticated SELECT only; authenticated INSERT/UPDATE/DELETE are denied. `get_crm_data_quality_summary` is authenticated-only SECURITY INVOKER; `apply_crm_verified_contact_import` is service-role-only SECURITY INVOKER.
- Post-0134 advisors show no Data-Quality-specific security or unindexed-FK regression; remaining advisor findings are existing platform debt.
- Disposition: implemented Data Quality scan/import/validation/normalization/audit/bounded-bulk paths are **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**. Irreversible retention/purge remains **DEFERRED_WITH_REASON** until an Organization-approved legal/business retention contract exists, so the entire Work Package is not reported globally complete.
- Fresh next audit must re-evaluate `CRM-CUSTOMER360-V2` now that canonical Support Cases exist, then continue through the stable Work Package order without fabricating absent Booking/Commerce/Consent authorities.


## Superseding CRM Support Case Production checkpoint and Data Quality active slice — 2026-09-28

- Canonical Production baseline before this active branch: `main@ec70f9e60cc8ece014c0ca1ba50a20a2c8badecb`.
- PR #317 / migration `0132_crm_support_case` established one canonical Smart Core Support Case + SLA authority; PR #318 / `0133_crm_support_case_fk_index_hardening` closed its FK-index findings.
- Exact-main CI `36376715097` and Cloudflare Production Deploy `36376910976` succeeded on `ec70f9e60cc8ece014c0ca1ba50a20a2c8badecb`.
- Production has 0 Support Cases and 0 SLA policies; no synthetic ticket/SLA evidence was created. RLS is enabled; reads are authenticated-only; trusted create/assign/escalate/transition/SLA mutations are service-role-only; relevant functions are SECURITY INVOKER. Post-0133 advisors show no Support-specific unindexed-FK regression.
- Disposition: internally controlled `CRM-SUPPORT-CASE` paths are **PRODUCTION_VERIFIED**. Order/Payment linkage remains dependency-gated until canonical commerce authorities exist.
- Fresh audit selected `CRM-DATA-QUALITY` next. Existing Identity Graph already owns exact conflict detection and governed MERGE/SPLIT/UNLINK; no duplicate resolution engine may be created.
- Active branch `feat/crm-data-quality-foundation` extends canonical CRM truth with a deterministic quality scan and bounded atomic verified Contact import. The import reuses `record_crm_business_identity` and `create_or_resolve_crm_person_from_verified_identity`, is capped at 100 rows / 256 KiB, uses request-key idempotency, fails closed on ambiguity, stores receipt counts/hash only, and never copies raw imported PII into the receipt/audit summary.
- Destructive retention remains **DEFERRED_WITH_REASON** in this slice: irreversible purge/anonymization must not be enabled before an Organization-approved legal/business retention contract exists.
- This Data Quality branch is implementation evidence only until exact-head CI, merge, Production migration, exact-main deploy and post-apply verification succeed.



## Superseding CRM Activity / Task v2 Production checkpoint — 2026-09-28

- Canonical main: `11599810d8ffebd081e3571859c1bc3588a08ebe` after PR #316.
- Exact-main CI `36371693852`: SUCCESS.
- Cloudflare Production Deploy `36371846971`: SUCCESS on the same SHA.
- Production Supabase migration `0131_crm_activity_task_v2` is live as version `20260928025600`.
- `crm_tasks` remains the only actionable human-work store. Task v2 added Deal linkage, reminders, acknowledgement, due/overdue state and immutable activity evidence over existing audit truth; no second Task/Activity store exists.
- Production has 0 CRM Tasks. No recurring task, Booking/Order/Case link or synthetic Task was fabricated.
- Authenticated Task reads/reminder acknowledgement are SECURITY INVOKER and RLS-governed. Existing task mutation authority remains canonical.
- Recurrence remains `DEFERRED_WITH_REASON` until a real recurring-work contract exists.
- Fresh dependency audit selected `CRM-SUPPORT-CASE` next. `CRM-CUSTOM-OBJECTS` remains deferred until a real use case proves the schema contract.


## Superseding CRM Account v2 Production checkpoint — 2026-09-28

This checkpoint supersedes older notes that still mark `CRM-ACCOUNT-V2` as implementation-only.

- PR #314 merged into canonical `main@88a6ab7f1b4f4241ea031deda85b5cecd66b7bc1`.
- PR head CI run `36370240276` succeeded after PostgreSQL 17 caught and drove fixes for TypeScript narrowing, a test false-positive, backward compatibility with the core Business bootstrap, and privilege-level fail-closed behavior.
- Exact-main CI run `36370424412` succeeded on the merge SHA across lint, typecheck, Vitest, the complete PostgreSQL 17 migration chain including dedicated Account smoke, Next build, Vinext build and Cloudflare scheduled verification.
- Production migration `crm_account_v2_governance` is live as version `20260928023612`, sourced from merged migration file SHA `d7093bf90def75759962abe5a91f75032660bedb`.
- Cloudflare Production Deploy run `36370581976` succeeded on the exact merge SHA. Release-candidate Worker version: `2f89924e-14ee-49e0-8f36-b56f3f3d816e`; Production Worker version: `dc6142da-42d9-42f4-9bf0-6d38be7bf358`. Candidate smoke, controlled SSR load, exact-bundle promotion, Production route check and safe API/webhook rejection smoke all passed without an outbound provider send.
- Canonical external Company/Account authority remains `public.businesses`. No `crm_accounts` or second Account store was created. `tenant_businesses` / `branches` remain the tenant operating hierarchy.
- Production stayed honest after migration: 19 Businesses total, 19 `UNCLASSIFIED`, 0 classified, 0 assigned Account owners, 0 external child Accounts. No discovered Company was silently promoted to Customer and no hierarchy was fabricated.
- `crm_person_business_relationships` remains canonical Contact relationship authority.
- External Account hierarchy is Organization-bound and cycle-safe; owner assignment is Organization-member-bound; lifecycle evidence is bounded and explicit.
- `get_crm_account_v2` is authenticated-only and SECURITY INVOKER. Owner/lifecycle/parent mutation RPCs are service-role-only and SECURITY INVOKER. `businesses` RLS remains enabled and the governance trigger is live.
- Supabase advisor output introduced no Account-specific security/FK regression. Existing baseline findings remain separate platform debt.
- Production safety remains Shadow Mode ON and Global Kill Switch OFF. Chatwoot Platform token GitHub secret remains unconfigured, so Production Chatwoot provisioning remains disabled.
- Disposition: internally controlled `CRM-ACCOUNT-V2` schema, authorization, runtime, UI/API and Production deployment are **PRODUCTION_VERIFIED**. Real operator lifecycle/owner/hierarchy actions remain evidence-driven and intentionally absent in Production because there is no authorized reason to mutate the 19 existing Companies merely for a green test.
- Next cursor: fresh dependency audit inside `SECTION IDENTITY_CRM` across `CRM-CUSTOM-OBJECTS`, `CRM-ACTIVITY-TASK-V2`, `CRM-SUPPORT-CASE` and `CRM-DATA-QUALITY`. Reuse existing custom-field/task/deal/identity authorities and select the first real unresolved dependency; do not reimplement already Production-verified foundations.



## Superseding CRM Customer 360 v2 Person-context Production checkpoint — 2026-09-28

This checkpoint supersedes older Identity/CRM continuation notes where they still name `CRM-CUSTOMER360-V2` as the next unaudited slice.

- Canonical runtime main at verification: `77917d7722099b0b998dff8fd3aac94bf1f9fe4b` after PR #313.
- Production migration `0129_crm_customer360_v2_person_context` is live as version `20260928012548`.
- Exact-main CI run `36365898775` succeeded on the same SHA, including the dynamic PostgreSQL 17 late-migration chain and dedicated Customer 360 smoke.
- Cloudflare Production Deploy run `36366058009` succeeded on the exact same SHA; release-candidate Worker version observed during promotion was `ac78994c-064e-42ca-aece-22898c629423`. Candidate smoke, controlled load, exact-bundle promotion, Production route verification and safe API/webhook rejection smoke passed without invoking an outbound provider send.
- `CRM-CUSTOMER360-V2` now composes canonical Person identity/relationships with existing Lead, Conversation, Task and Deal authorities. It adds evidence-backed Person context to those authorities, not a second Customer/activity/conversation/deal/task store.
- Person attribution is explicit only. A Company relationship alone never attributes Company activity to a Person. Authorized manual LINK/UNLINK is service-bound; authenticated direct mutation is denied; merge reconciliation preserves explicit Person linkage.
- Production remained honest after migration: `crm_people=0`, `crm_person_identity_links=0`, `crm_person_business_relationships=0`; `leads=19` with 0 Person links; `sales_conversations=12` with 0 Person links; `crm_tasks=0`; `crm_deals=0`. No synthetic Person or link was created.
- Production RLS remains enabled on People, Leads, Conversations, Tasks and Deals. `get_crm_customer360_v2` is authenticated-only and SECURITY INVOKER; trusted LINK/UNLINK mutations are service-role-only and SECURITY INVOKER.
- Supabase security/performance advisor classes relevant to this slice did not introduce a new blocking finding. Existing advisor debt remains tracked separately.
- Disposition: the internally controlled Person-centric composition over currently implemented CRM modules is **PRODUCTION_VERIFIED**; the broader `CRM-CUSTOMER360-V2` requirement is **PARTIAL / REQUIRED** because Notes canonical linkage and Booking/Quote/Order/Invoice/Payment/Support/Document/Consent modules are not yet complete. Missing modules remain explicit; no placeholder truth is fabricated.
- Fresh dependency audit selected `SECTION IDENTITY_CRM / CRM-ACCOUNT-V2` as the next bounded Work Package. Canonical external Company/Account authority is `public.businesses`; `tenant_businesses` and `branches` are the tenant's internal operating hierarchy and must not be repurposed as customer Accounts.
- Current implementation branch `feat/crm-account-v2-governance` extends `public.businesses` for governed external Account hierarchy, ownership and B2B lifecycle. It is **IMPLEMENTATION IN PROGRESS**, not Production evidence until CI, merge, migration and exact-main deploy are verified.


## Superseding CRM Person / Identity Graph Production checkpoint — 2026-09-28

This checkpoint supersedes older Phase 3 continuation notes where they still name `CRM-PERSON-CONTACT` as the next Work Package.

- Canonical runtime main at verification: `c5710ac556faea883745f8656bf0b6c0afc2506f` after PR #311.
- PR #309 / migration `0126_crm_person_contact_foundation` established the canonical Person/Contact foundation on `crm_people`, `crm_identities`, `crm_person_identity_links` and `crm_person_business_relationships` without creating a second CRM, Person store, Account store or identity authority.
- PR #310 / migration `0127_crm_person_contact_fk_index_hardening` closed the Person/Contact foreign-key index findings without changing authorization semantics.
- PR #311 implements `SECTION IDENTITY_CRM / CRM-IDENTITY-GRAPH` over those existing authorities: deterministic exact-identity conflict candidates; evidence/confidence state; governed manual MERGE, SPLIT and UNLINK; cross-Organization fail-closed behavior; anti-orphan guards; bounded evidence/audit; and the `/identity-review` operator surface. No fuzzy/display-name-only auto-merge was added.
- Production migration `0128_crm_identity_graph_resolution` is live as version `20260928004331`.
- Exact-head PR CI and exact-main CI #1495 both passed lint, typecheck, Vitest, the PostgreSQL 17 migration chain, dedicated CRM identity-graph smoke, Next build, Vinext build and Cloudflare scheduled verification.
- Cloudflare Production Deploy #975 succeeded on the exact main SHA. Release-candidate Worker version: `7a4f60cc-d9fa-41af-ae0d-9094e9ffe3fb`; Production Worker version: `e641d560-637f-4d65-9f6b-7cbc2a1c12d1`. Candidate smoke, controlled SSR load, exact-bundle promotion, Production Worker Route verification and safe routed Production smoke passed. `/login` returned HTTP 200 with Cloudflare evidence, root returned HTTP 307, and a missing route returned HTTP 404. No outbound provider send was invoked.
- Post-`0128` Production verification: RLS remains enabled on `crm_identities`, `crm_identity_links`, `crm_people`, `crm_person_identity_links` and `crm_person_business_relationships`. Candidate read is authenticated-only; MERGE/SPLIT/UNLINK execution is service-role-only; all four functions remain SECURITY INVOKER.
- Production data remains honest: `crm_people=0`, `crm_person_identity_links=0`, `crm_person_business_relationships=0`, `crm_identities=47`, `crm_identity_links=47`. No Person, conflict or acceptance row was fabricated for a green result.
- Production safety remains Shadow Mode ON and Global Kill Switch OFF. The Chatwoot Platform token GitHub secret is still unconfigured and Production Chatwoot provisioning remains disabled.
- The Supabase advisor finding counts did not increase after `0128`; existing security/performance findings are unrelated baseline work and are not folded into this Work Package.
- Disposition: `CRM-PERSON-CONTACT` and the internally controlled `CRM-IDENTITY-GRAPH` schema/security/runtime paths are **PRODUCTION_VERIFIED**; deterministic merge/split/unlink behavior is also **CONTROLLED_TEST_VERIFIED** on PostgreSQL 17. A real Production happy-path Person resolution action remains unclaimed because Production currently contains zero real People. Creating synthetic People merely to produce acceptance evidence is prohibited.
- Exact automatic “unmerge” is **DEFERRED_WITH_REASON**: merge lineage and retired evidence are preserved, and governed split/unlink correction paths exist, but a generic lossless inverse cannot be promised after coalescing potentially overlapping relationship evidence.
- `crm_customer_timeline`, `leads` and `sales_conversations` currently have no canonical `person_id` foreign key. PR #311 deliberately does not rewrite those histories. The next Work Package must integrate existing authorities rather than manufacture links.
- Next code-first cursor: fresh dependency audit of `SECTION IDENTITY_CRM / CRM-CUSTOMER360-V2`. If that audit proves an Account/Data-Quality dependency must precede a safe Customer 360 slice, follow the verified dependency rather than the stale planning order.


## Superseding OMNICHANNEL TikTok / SMS-RCS / controlled Voice checkpoint — 2026-09-28

This checkpoint supersedes older TikTok, SMS/RCS and partial Voice continuation notes where they conflict with the evidence below.

- Canonical runtime main at verification: `70a83c0a94d1a1e6613c222a6688ce3c450a4df0` after PR #307.
- PR #302 added the fail-closed TikTok capability foundation; PR #303 added its canonical health surface. Production migration `0124_omni_tiktok_capability_foundation` is live as version `20260927201116`.
- Production TikTok remains deliberately inactive: the organization-level `TIKTOK / TIKTOK` integration is `NOT_CONFIGURED + disabled`, `tiktok_ai_paused=true`, and there are zero TikTok bindings. Provider send/webhook execution is not fabricated while exact provider-contract execution evidence is unavailable.
- PR #304 added the provider-neutral SMS/RCS capability foundation; PR #305 added fail-closed readiness/routing policy without activating an adapter. Production migration `0125_omni_sms_rcs_capability_foundation` is live as version `20260927212408`.
- Production SMS/RCS remains deliberately inactive: `sms_ai_paused=true`, `rcs_ai_paused=true`, and there are zero SMS/RCS bindings. No provider credential, consent source, billing ledger, webhook journal, send path or acceptance receipt was fabricated.
- SMS/RCS readiness requires evidence-backed provider connection, exact country/channel capability, canonical permission/suppression state, pricing evidence and sender-registration readiness. RCS -> SMS fallback is permitted only when provider capability evidence explicitly declares and supports it.
- PR #306 added the fail-closed WhatsApp audio-reply foundation; PR #307 wired controlled WhatsApp AI audio replies through the existing Shadow artifact + approved-send boundary, existing Meta tenant provider, OpenAI TTS, Cost Guard/`usage_events`, 24-hour freeform-window check, human-takeover check and canonical reconciliation semantics.
- The controlled voice-reply path is restricted to `INTERNAL_TEST` businesses, requires Shadow Mode ON, Global Kill Switch OFF, WhatsApp/OpenAI CONNECTED, WhatsApp AI/Agents unpaused, AI-voice disclosure, conservative cost reserve and approved `gpt-4o-mini-tts*` MP3 output. Telephony and voice cloning remain disabled.
- Exact-main CI run `36356555098` succeeded on `70a83c0a94d1a1e6613c222a6688ce3c450a4df0`; Cloudflare Production Deploy run `36356705964` succeeded on the same SHA, including release-candidate smoke, controlled SSR load, exact-bundle promotion, Worker Route verification, routed Production smoke and safe API/webhook rejection smoke.
- Fresh Production verification after deployment: `voiceReply` runtime config is still null, Shadow Mode ON, Global Kill Switch OFF, WhatsApp AI pause OFF, Agents pause OFF, and there have been zero `VOICE_REPLY_TTS` usage events and zero `AUDIO_SENT` WhatsApp events since the #307 merge. No outbound voice side effect was introduced by deployment.
- `OMNI-TIKTOK` and `OMNI-SMS-RCS` are internally fail-closed/readiness-ready but real provider activation remains evidence-gated. The controlled WhatsApp voice-reply slice of `OMNI-VOICE` is implemented/deployed/Production-verified for the directly observed safe path; broader telephony/voice-agent, recording-retention/consent and call-outcome scope is not declared complete by this checkpoint.
- With the current Omnichannel internal slices exhausted to their present provider/evidence boundaries, the next safe code-first continuation is `SECTION IDENTITY_CRM / CRM-PERSON-CONTACT`, while deferred provider-gated Omnichannel acceptance remains explicitly open.

## Superseding OMNI-TELEGRAM Production checkpoint — 2026-09-27

This checkpoint supersedes older Telegram-customer continuation notes where they conflict with the evidence below.

- Canonical runtime main before this documentation reconciliation: `6532693d7cc653e6611af0fea3ba4eea432d6feb`.
- PR #298 implemented the tenant/business/Branch-bound customer Telegram channel without reusing the existing Owner Assistant identity, global Owner Bot credential, Owner command journal, CRM truth, Conversation truth, queue or Chatwoot integration.
- Customer Telegram uses the existing canonical communication binding, Vault-backed tenant credential, CRM identity graph (`TELEGRAM_PROVIDER_USER` / `TELEGRAM_INBOUND`), Unified Inbox/Chatwoot projection, governed outbound send gate, system controls, audit and reconciliation boundaries.
- The customer webhook is binding-scoped, requires Telegram's secret-token header, journals `update_id` for replay/idempotency, normalizes private messages/callbacks/media and fails closed when binding/credential evidence is absent.
- PR #299 added only the three Production-advisor-requested covering indexes for Telegram activation-acceptance composite foreign keys.
- Production migration `0122_omni_telegram_customer_foundation` is live as version `20260927171724`.
- Production migration `0123_telegram_activation_acceptance_fk_index_hardening` is live as version `20260927172358`.
- Exact-main CI #1452 succeeded on `6532693d7cc653e6611af0fea3ba4eea432d6feb`.
- Cloudflare Production Deploy #932 succeeded on that exact SHA. Candidate Worker version: `f1d716c9-dfe7-43b5-8b52-2e83435570c8`; Production Worker version: `0c1a6d02-de44-4603-804f-81e807a1f672`. Candidate smoke, controlled SSR load, Production promotion, Worker Route verification, routed Production smoke and safe API/webhook rejection smoke all passed. No outbound provider send was invoked by smoke.
- The Chatwoot Platform token GitHub secret remains unconfigured and Production Chatwoot provisioning remains disabled.
- Independent smoke from the OVH Production host after Deploy #932: Chatwoot HTTP 200; Smart Core login HTTP 200; unauthenticated `/integrations` HTTP 307; invalid Owner Telegram secret HTTP 401; nonexistent customer-Telegram binding HTTP 404.
- Production safety remains fail-closed: Shadow Mode ON, Global Kill Switch OFF, `telegram_ai_paused=true`.
- Production Telegram customer state intentionally has one organization-level `TELEGRAM / TELEGRAM` integration row as `NOT_CONFIGURED + disabled`, with 0 customer Telegram bindings, 0 customer events and 0 activation-acceptance receipts. No synthetic Bot token, tenant or acceptance evidence was created.
- Sensitive Telegram customer resolver/reconciliation/acceptance RPCs remain service-role-only. Owner Assistant and customer-channel authority remain separate.
- Post-`0123` Supabase advisors no longer report Telegram activation-receipt unindexed-foreign-key findings. New Telegram indexes report only expected `unused_index` INFO while the real evidence stream is empty. Service-only Telegram journal/receipt tables retain RLS-enabled/no-policy INFO by design.
- `OMNI-TELEGRAM` disposition: internally controlled customer-channel schema, credential boundary, webhook/replay handling, canonical identity/projection, media path, outbound safety/reconciliation, pause/readiness/health surfaces and Production deployment are **PRODUCTION_VERIFIED** where directly observed above. Real tenant Bot authorization, real inbound/outbound/media happy-path and activation receipt remain **BLOCKED_EXTERNAL** until a real consented tenant credential is available.
- Verification caveat: the current CI workflow's named PostgreSQL migration-chain step still explicitly enumerates migrations only through `0101`; do not misstate CI #1452 as direct execution proof for `0122/0123`. Their current proof is successful Production migration application plus post-migration runtime/schema/advisor verification. CI chain coverage for later migrations is a separate repository hardening gap.

## Superseding OMNI-CHANNEL-HEALTH Production checkpoint — 2026-09-27

This checkpoint supersedes older Omnichannel health notes where they conflict with the evidence below.

- Canonical runtime main before this documentation reconciliation: `8e857ae9cc68310e53ce89dac2c39399871f8f1b`.
- PR #295 implemented the unified evidence-derived customer-channel health read model and Connection Center surface across Email, WhatsApp, Instagram, Facebook Messenger, Web Chat, Telegram/TikTok/SMS-RCS pending states and the partial Voice boundary without creating a second health source of truth.
- PR #295 also added Production migration `0120_omnichannel_health_messenger_bootstrap`, which creates only the missing organization-level `META / FACEBOOK_MESSENGER` configuration row as `disabled + NOT_CONFIGURED`; it does not create a tenant binding, credential, adapter activation or provider side effect.
- PR #296 implemented bounded provider quota/rate-limit evidence for Resend and Meta provider boundaries. Summaries are written only to existing `audit_logs` under `CHANNEL_PROVIDER_RATE_LIMIT_OBSERVED`; raw headers, tokens, provider business/account identifiers and arbitrary provider JSON are not persisted.
- Provider quota telemetry is non-authoritative. A telemetry persistence failure never converts an already accepted provider send into a retry/failure path.
- Quota health can become `EVIDENCE_PRESENT`, `NEAR_LIMIT` or `RATE_LIMITED` only when real provider response evidence exists. With no provider evidence it remains `NO_PROVIDER_QUOTA_EVIDENCE`; no green value is fabricated.
- Production migration `0121_omnichannel_channel_rate_limit_evidence_index` is live as version `20260927155456`; the targeted partial index `audit_logs_channel_rate_limit_health_idx` exists.
- Exact-main CI #1441: SUCCESS on `8e857ae9cc68310e53ce89dac2c39399871f8f1b`.
- Cloudflare Production Deploy #921: SUCCESS on the same SHA. Production Worker version: `0ece4443-c100-48c4-8da4-e86b12be3c92`. Candidate smoke, controlled SSR load, Production promotion, Worker Route verification, routed Production smoke and safe API/webhook rejection smoke all passed. No outbound provider send was invoked by smoke.
- Independent Production smoke from the OVH VPS after Deploy #921: Chatwoot HTTP 200; Smart Core login HTTP 200; unauthenticated `/integrations` redirected with HTTP 307; Owner Telegram webhook with an invalid Telegram secret failed closed with HTTP 401.
- Production safety remained unchanged: Shadow Mode ON; Global Kill Switch OFF; Instagram AI pause ON; Facebook Messenger AI pause ON; Web Chat AI pause ON.
- The Production Messenger bootstrap row is `NOT_CONFIGURED + disabled`. Instagram remains `NOT_CONFIGURED + disabled`. Email and WhatsApp remain configured according to existing Production state.
- Current provider quota evidence count is intentionally zero because no real provider response carrying rate/quota evidence has been observed since this capability was introduced. The new partial index therefore appears as `unused_index` INFO only; this is expected while the evidence stream is empty.
- `OMNI-CHANNEL-HEALTH` disposition: the internally controlled health aggregator, Connection Center health dimensions, inactive/pending channel states, bounded quota telemetry, failure isolation and Production deployment are **PRODUCTION_VERIFIED** where directly observed above. Channel-specific live quota evidence and first-real-tenant acceptance remain evidence-dependent and must stay unclaimed until real provider/tenant activity exists.
- This does **not** mark the broader customer connection journey (`CONN-01..05`) complete. Guided connect/reconnect/disconnect, provider-hosted authorization and real customer acceptance remain owned by their existing Work Packages and external gates.

## Superseding OMNI-WEBCHAT Production checkpoint — 2026-09-27

This checkpoint supersedes older Web Chat and Omnichannel continuation notes where they conflict with the evidence below.

- Canonical repository main before this documentation reconciliation: `e8c2f127c7d7483e6095d7f5d07aa69cc7c9daa4`.
- PR #292 completed the internally controlled `SECTION OMNICHANNEL / OMNI-WEBCHAT` gaps for operator-to-visitor attachment delivery, evidence-backed activation/readiness and canonical Connection Center health without introducing a second message store, attachment store, queue, tenant model or integration authority.
- PR #293 added only targeted covering indexes for the new Web Chat acceptance-receipt foreign keys surfaced by the Production performance advisor.
- Exact-main CI #1423 succeeded on `e8c2f127c7d7483e6095d7f5d07aa69cc7c9daa4`.
- Cloudflare Production Deploy #903 succeeded on that exact main. Release-candidate smoke, controlled SSR load, Production promotion, Worker Route verification, routed Production smoke and safe API/webhook rejection smoke all passed. Production Worker version: `55ddcf6d-6893-4fc9-94a0-66ddbf0ced11`. No provider send was invoked by smoke.
- Production Supabase is live through `0119_web_chat_acceptance_fk_index_hardening` as version `20260927144538`; `0118_web_chat_outbound_attachments_readiness` is live as version `20260927144031`.
- Signed Chatwoot outgoing `message_created` events can now project text and attachment metadata into canonical `conversation_messages`. Direct Chatwoot Active Storage URLs are not persisted into browser-facing message metadata.
- Browser attachment delivery is Smart-Core proxied and revalidates exact public key, HTTPS Origin, active/unexpired session token hash, tenant/business/Branch/channel binding, canonical conversation, Chatwoot inbox/account, signed webhook event, message ID and attachment ID. Public delivery is bounded to 10 MiB and uses private/no-store, nosniff, no-referrer and sandboxed content headers.
- The embeddable widget now consumes operator attachments only through the Smart Core session-bound route. It never receives Chatwoot credentials or a Chatwoot storage URL.
- Web Chat readiness is derived from canonical binding/widget/origin/Chatwoot inbox mappings, unresolved reconciliation, system controls and an immutable acceptance receipt. There is no caller-supplied `ready=true` or synthetic success flag.
- A Web Chat acceptance receipt requires real scoped session evidence, accepted inbound Chatwoot sync, canonical inbound projection, signed processed Chatwoot outbound evidence, canonical outbound projection and real media evidence. GAP-09 is therefore preserved rather than bypassed.
- Connection Center now has a Web Chat canonical health panel for connection/readiness, widget/origin, inbound/outbound evidence, Chatwoot inbox verification, reconciliation incident state, AI pause and Shadow Mode. The existing `integration_connections` Web Chat row remains bootstrap/configuration state only and is not promoted into a second health source of truth.
- Production fail-closed smoke from the OVH VPS after deployment: Chatwoot HTTP 200, Smart Core login HTTP 200, fake-origin/key/session Web Chat attachment request HTTP 403, and fake Web Chat upload request HTTP 403.
- Production Web Chat activation data intentionally remains empty: no real Web Chat widget, binding, session, event, canonical Web Chat message or acceptance receipt was fabricated to make the gate green.
- Safety remains fail-closed: Shadow Mode ON; Web Chat AI pause ON; Global Kill Switch OFF. External/native Chatwoot provisioning remains disabled.
- Supabase post-0119 performance advisor has no unindexed-foreign-key finding for `web_chat_activation_acceptance_receipts`. Its unused-index findings are expected while the real-tenant receipt table is empty. The table's RLS-enabled/no-policy INFO remains intentional service-role-only isolation.
- `OMNI-WEBCHAT` disposition: internally controlled implementation, deployment and Production security/fail-closed evidence are **PRODUCTION_VERIFIED** where observed above. Real tenant browser ↔ Smart Core ↔ Chatwoot happy-path acceptance remains **BLOCKED_EXTERNAL / GAP-09** until a real consented tenant/session exists.
- All six Work Package requirements now have an implemented Production path: embeddable chat, tenant/business configuration, anonymous-to-known transition foundation, consent/session rules, file/media support and Chatwoot inbox projection. None of this is evidence that a real first tenant has completed end-to-end acceptance.

## Requirements preservation note — 2026-09-26

The owner-requested [product completeness and customer connection acceptance](business-os-2027/PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md) companion records full scope and audited integration gaps at `542ef8bf33b394918404990fdb97b9b7df1e7f8e`. It adds requirements/traceability only. It does not change runtime readiness, Production migration state, provider permissions, tenant activation or the current Unified Inbox continuation below.


**Reconciled:** 2026-09-26 (Oman, UTC+4)

This is the current operational handoff for Growth OS. Current `main`, routed Cloudflare Production and Production Supabase evidence override older planning documents, stale issue text and chat history.


## Superseding Unified Inbox action checkpoint — 2026-09-27

This checkpoint supersedes the older PR #257-only Unified Inbox continuation below for current action-layer status.

- Runtime implementation baseline before this documentation-only scope synchronization: `main@bae105697bdb68cb8b25494cf8303e6efe1a6d81`.
- PR #260 added the governed Chatwoot conversation action bridge for status, labels, assignee and Team changes over the existing Unified Inbox projection and Smart Core scope authority.
- Production migration `0098_comm_unified_inbox_actions` is live.
- PR #261 consolidated action-claim SELECT/INSERT RLS policies without changing authorization semantics.
- Exact-main CI #1341 and Cloudflare Production Deploy #821 succeeded on `bae105697bdb68cb8b25494cf8303e6efe1a6d81`.
- Production migration `0099_comm_unified_inbox_action_claim_policy_consolidation` is live as version `20260926205020`.
- Post-0099 Performance Advisor no longer reports the action-claim multiple-permissive-policy findings on `chatwoot_bridge_command_claims`; older unrelated advisor findings remain separate work.
- Fresh Production evidence: Brand=0, tenant Business=0, Chatwoot Account/User/Membership/Inbox/Team mappings=0 and Unified Inbox projections=0.
- Safety remains: Shadow Mode ON; Global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- The action bridge is therefore implementation/deployment complete but real-tenant action acceptance remains activation-gated. Do not fabricate tenant mappings or enable provisioning merely to produce demo evidence.
- Next bounded `COMM-UNIFIED-INBOX` work: operator UI for governed actions, internal notes, and scoped attachment authorization/read bounds.

## Superseding Unified Inbox Production checkpoint — 2026-09-26

This checkpoint supersedes older same-day Communication/Unified Inbox notes below. Historical sections remain for provenance only.

- Current canonical repository main: `a9e5a7387d6d4602e5ed363361761f187868d757` after PR #257.
- PR #252 established the scoped Unified Inbox security boundary; Production Supabase migration `0093_comm_unified_inbox_scope_boundary` is live.
- PR #253 added the signed Chatwoot webhook journal -> idempotent projection reconciler; Production migration `0094_comm_unified_inbox_reconciler` is live.
- PR #254 hardened Unified Inbox FK indexes; Production migration `0095_comm_unified_inbox_fk_index_hardening` is live and Supabase reports zero Unified-Inbox unindexed-FK findings.
- PR #255 added the bounded Unified Inbox read model, deterministic activity/id cursor pagination, scoped counters and per-user read/open state; Production migration `0096_comm_unified_inbox_read_model` is live.
- PR #256 removed the new read-state RLS initPlan warnings without changing authorization semantics; Production migration `0097_comm_unified_inbox_read_state_rls_initplan` is live.
- PR #257 wires the real `/conversations` operator UI and detail rail to that read model. The UI now uses per-user unread state, scoped counters, bounded search/filtering, deterministic next-page cursors and governed mark-read when a conversation is open.
- PR #257 exact-head CI #1331 passed. Post-merge main CI #1332 succeeded on exact `main@a9e5a7387d6d4602e5ed363361761f187868d757`.
- Cloudflare Production Deploy #812 succeeded on that exact merge commit. Release-candidate smoke, controlled SSR load, Production promotion, route verification, routed Production smoke and safe API/webhook rejection smoke all passed.
- `sales_conversations` remains canonical Conversation truth. `unified_inbox_conversation_projections` remains a Communication Plane scope/state projection. `unified_inbox_user_states` stores only per-user read/open state.
- Owner manual reply and takeover/control paths were not widened or replaced. The existing provider-bound send gate remains authoritative.
- Chatwoot Production remains on the dedicated OVH VPS at `https://inbox.smartvisionsai.com`; Railway is not part of the Production path and no new Railway work belongs in this continuation.
- No Chatwoot Platform-token activation or provisioning activation was introduced by the Unified Inbox packages.
- Next bounded continuation: complete governed Conversation operations on top of the same projection/read model: status/labels/assignment/team-transfer reconciliation, internal notes and attachment read bounds. Do not create a second Conversation/CRM/IAM/Queue source of truth.

## Superseding Tenant Bridge runtime checkpoint — 2026-09-26

This checkpoint supersedes older same-day Chatwoot/Bridge checkpoints below. Historical sections remain for provenance only.

- Current canonical repository main: `ca5067ae817b9cc07f49be5bc12ded11cc879cb8` after PR #239.
- PR #238 (`ec6ce6f9358af92c479135a2b1575342b405c49f`) closed the Cloudflare Chatwoot runtime boundary. Production binds `CHATWOOT_BASE_URL=https://inbox.smartvisionsai.com`, `CHATWOOT_WEBHOOK_PUBLIC_ORIGIN=https://app.smartvisionsai.com`, and `CHATWOOT_PROVISIONING_ENABLED=false`. The isolated release candidate remains Chatwoot-unbound and provisioning-disabled.
- The Chatwoot Platform token is **not** provisioned into the Cloudflare runtime. Do not create, transfer, log, persist in browser/DB, or activate it until a secure server-only secret transport and exact activation gate are verified.
- PR #239 added the missing governed Smart Core bootstrap path at `/api/business-os/control-plane/bootstrap`. It is authenticated, explicitly OWNER-gated, reuses existing RLS and Control Plane audit triggers, and is race-safe/idempotent on canonical natural keys:
  - Brand: `(organization_id, slug)`
  - tenant Business: `(brand_id, slug)`
- The bootstrap path does not import/call Chatwoot, Meta, WhatsApp, Email or another provider. It does not use service-role bypass and does not create a parallel tenant/claim/queue model.
- Exact-head PR #239 CI #1260 passed lint, typecheck, Vitest, PostgreSQL 17 migration-chain verification, Next build, Vinext build and scheduled-runtime verification.
- Post-merge main CI run `36204798135` succeeded on exact `main@ca5067ae817b9cc07f49be5bc12ded11cc879cb8`.
- Cloudflare Production Deploy run `36204923459` succeeded on that exact main. Release-candidate smoke, controlled load, Production promotion, route verification, routed Production smoke and safe API/webhook rejection smoke all passed. Deployment smoke invoked zero provider sends.
- Runtime build evidence includes `/api/business-os/control-plane/bootstrap`. Unauthenticated POST is intercepted by the existing auth middleware with HTTP 307 to `/login`; no mutation occurs.
- Production Supabase migration head remains `0090_chatwoot_fk_index_hardening`.
- Post-deploy Production evidence remains intentionally empty for the new tenant projection path: `brands=0`, `tenant_businesses=0`, all Chatwoot Account/User/Membership/Inbox/Team mappings = 0, webhook journal = 0, bridge command claims = 0, and Brand/Business audit rows created since PR #239 merge = 0.
- No outbound delta was created by the deployment window: new outreach = 0, WhatsApp events = 0, Email events = 0.
- Safety state remains: Shadow Mode ON; Global Kill Switch OFF; Email pause OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Chatwoot Production remains on the OVH VPS and `https://inbox.smartvisionsai.com/health` remains HTTP 200. The canonical Chatwoot image is unchanged from PR #236.
- Railway `smartvisions-chatwoot-candidate` remains read-only temporary rollback evidence. It is not a Production runtime dependency and must not be deleted without explicit destructive approval.
- **Next unresolved gates:** no evidence-backed real Brand/tenant Business has been bootstrapped; `CHATWOOT_PLATFORM_TOKEN` is not provisioned; External Chatwoot provisioning remains OFF. Do not fabricate tenant data merely to exercise the Bridge.

## Chatwoot Production source-plane closeout — 2026-09-26

This checkpoint supersedes older same-day Candidate-only and "Production Chatwoot does not exist" notes below.

- Canonical repository main after mobile-onboarding fix: `3c3443389a5d7edfdf3230387cf16b1ec75a3a1e` (PR #236).
- Exact-main CI #1253: SUCCESS.
- Cloudflare Production Deploy #733: SUCCESS. This is the separate Growth OS Worker deployment and does not host Chatwoot.
- Chatwoot Production is live on the dedicated OVH VPS at `57.131.156.171` in Frankfurt.
- Public communication-plane origin: `https://inbox.smartvisionsai.com`; direct Caddy/Let's Encrypt TLS is active and public `/health` and `/app/login` return HTTP 200.
- Dedicated Chatwoot PostgreSQL and authenticated Redis run locally on the VPS; they are not Smart Core/Supabase resources.
- Attachments use OVH S3-compatible bucket `smartvisions-chatwoot-prod` in Frankfurt 1-AZ with Versioning enabled. Rails Active Storage upload/download/purge verification passed and the old local attachment volume was removed.
- PostgreSQL off-host backups use `smartvisions-chatwoot-backups` in Paris 3-AZ with Versioning enabled. Daily upload is scheduled for 02:17 UTC; upload/download SHA-256 verification and an isolated restore test both passed, including 100/100 public tables.
- Rollback/DR evidence is stored on the VPS in `/srv/smartvisions/chatwoot/ROLLBACK_DR.md`; operational runtime evidence is in `/srv/smartvisions/chatwoot/ORIGIN_STATE.md`.
- First owner provisioning completed privately. Public installation onboarding is blocked and account signup remains disabled.
- PR #236 is merged at `main@3c3443389a5d7edfdf3230387cf16b1ec75a3a1e`; exact-main CI #1253 and Chatwoot Source Image #37 are SUCCESS. Production now runs the canonical immutable image `ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-3c3443389a5d7edfdf3230387cf16b1ec75a3a1e@sha256:22cb4663d0369b6d7954b32beb1f124e1699eaa5405239899ddd617be31942d6`. Runtime verification confirms the responsive mobile onboarding row/select source, public health/login and brand assets, Community-only provenance, S3 Active Storage, healthy Puma/Sidekiq/PostgreSQL/Redis, and no `enterprise/` tree.
- Production runtime has no `railway.app` or `railway.internal` dependency. The Railway project `smartvisions-chatwoot-candidate` is retained only as a temporary Candidate rollback asset pending explicit destructive decommission approval.
- API Inbox/provider/customer activation remains OFF. Smart Core continues to own tenant/business/customer/CRM/provider credentials/send authority/safety.
- Next semantic continuation is `SECTION COMMUNICATION / COMM-TENANT-BRIDGE`, using real tenant evidence only. Do not fabricate a tenant Business merely to populate Chatwoot.


## Production identity

- Repository: `hamed665/smartvisions`
- Branch: `main`
- Primary Production: `https://app.smartvisionsai.com`
- Runtime: Cloudflare Workers Paid
- Production Worker: `smartvisions-growth-os-production`
- Production Worker Route: `app.smartvisionsai.com/* -> smartvisions-growth-os-production`
- Production Supabase: `pkypexzpyfbikdnkrzvw`
- Latest runtime-changing Production merge: PR #191, merge commit `a34bfd243d2f95e2ccad9895d5a753ef902a4299`
- Current routed Production Worker version at latest verified heartbeat: `09d84ef6-5928-429a-a926-ef4324ed99ab` (Worker timestamp `2026-09-23T09:50:07.867348Z`; heartbeat `2026-09-23T12:21:16.135625Z`, failed=0). The last runtime-changing implementation merge remains PR #191; later docs-only deploys can legitimately produce a newer Worker version without a runtime-code change.
- Latest Business OS Production migration: `0076_crm_segment_governance`, version `20260923093619`
- Latest Business OS runtime-changing merge: PR #191, merge commit `a34bfd243d2f95e2ccad9895d5a753ef902a4299`; later closeout commits are documentation-only
- Latest Business OS Production migration before Tasks: `0071_customer_360_timeline`, version `20260922202957`
- CRM Task Foundation merged in PR #181 at `main@4c2a4d3bc78a57088f92ba8eae82542d501a37dc`; Production migration `0072_crm_task_foundation` version `20260922214407`
- CRM Task FK cleanup merged in PR #182 at `main@1eab75f73a5ae99a973e5616bb30c09325b9a680`; Production migration `0073_crm_task_fk_indexes` version `20260922214843`
- Latest verified Cloudflare Production Worker heartbeat after Slice 5: `d42bd9c5-e862-4af6-ae70-787cbf81c5d6`
- CRM Deal/Pipeline Foundation merged in PR #184 at `main@d416fcee020bc393a45096ee1330f8378bbd8e38`; Production migration `0074_crm_deal_pipeline_foundation` version `20260922225908`
- Production Deal/Pipeline rows intentionally remain 0 Pipelines / 0 Stages / 0 Deals after migration and rollback-only verification
- Cloudflare runtime after Slice 4 is proven by Worker version `47d22421-109e-4c1e-81e6-20bb273078e1`, with heartbeat `failed=0`, acquisition `SKIPPED`, dispatch `SKIPPED`, and zero Email/WhatsApp outbound rows after the PR #184 merge
- CRM Custom Field Governance merged in PR #188 at `main@b771883b1ba2f4787c6a466aea49f95a9052bd5f`; Production migration `0075_crm_custom_field_governance` version `20260923012557`
- Production intentionally has 0 custom-field definitions / 0 options / 0 values after migration and rollback-only verification
- Slice 5 Cloudflare runtime is proven by Worker version `d42bd9c5-e862-4af6-ae70-787cbf81c5d6`; latest checked heartbeat had `failed=0`, acquisition `SKIPPED`, dispatch `SKIPPED`
- Zero Email/WhatsApp outbound rows were created after the Slice 5 merge in the verification window
- Phase 3 Slice 6 Segment Governance gap audit merged in PR #190 at `main@496811c80a550299c3d01d5b23c2ea9b82d491a1`.
- Governed Dynamic Lead Segments merged in PR #191 at `main@a34bfd243d2f95e2ccad9895d5a753ef902a4299`; exact-head PR CI and post-merge push CI were fully green, including PostgreSQL 17 migration-chain smoke, Next/Vinext builds and scheduled-runtime verification.
- Production migration `0076_crm_segment_governance` is live as version `20260923093619`.
- Slice 6 is deliberately LEAD-only and DYNAMIC-only: stable Segment identity + immutable semantic versions + strict typed allowlisted predicate AST + bounded on-demand evaluation. It does not add Snapshot/current-membership persistence, Deal/Business/Task/Conversation/Person Contact segmentation, Campaign/Workflow execution or provider sends.
- Segment predicate validation is enforced at both authenticated API and database boundaries; Custom Field predicates are limited to governed ACTIVE/filterable INTERNAL Lead fields. PII/SENSITIVE ordinary predicates, arbitrary SQL/JSONPath/PostgREST filters and arbitrary metadata JSON are rejected.
- Production migration created 0 Segment identities and 0 Segment versions. Rollback-only Production smoke verified create -> evaluate -> semantic version update -> archive -> reactivate -> audit -> deferred constraints, then left 0 Segment rows, 0 version rows and 0 audit fixture residue.
- Supabase Security Advisor after 0076 is unchanged from baseline. Performance Advisor adds only the four expected new Segment/FK/list indexes as unused on an intentionally empty table and reports no new unindexed-FK defect.
- Zero Email/WhatsApp outbound rows were created from the 0076 promotion through verification.
- Implementation-runtime Cloudflare Worker checkpoint after PR #191 (before docs-only closeout): `b6ad6482-11e1-4658-97e8-7f5d1a842318`; failed=0, acquisition/evidence/auto-dispatch SKIPPED.
- Production cron: exactly `*/2 * * * *`
- Release candidate: no scheduled trigger
- Old Vercel deployment: frozen rollback/history only; not a Production health source
- Master Tracker: GitHub Issue #18; useful for milestones but not authoritative over runtime/DB evidence

The Smart Visions Website repository and its Supabase project are separate and out of scope. The frozen historical Website paths inside this repository remain out of scope.

## Controlled-launch status

The core system is beyond platform construction and is in **controlled Oman launch validation**. This is not permission for broad autonomous outreach.

Current verified safety state after PR #191 Production promotion:

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


### PR #181 / #182 — CRM Task Foundation and FK cleanup

Production-verified human work queue without duplicating Activity:

- `crm_tasks` owns actionable human work only; Customer 360 remains immutable historical Activity;
- no historical follow-up/handoff/reply/operator/approval facts were auto-backfilled into Tasks;
- tenant-consistent Business -> Lead -> Conversation scope and Organization-member assignee are enforced;
- OWNER/ADMIN/SALES_MANAGER manage; SALES_AGENT self-assigned only; VIEWER read-only;
- state machine: OPEN / IN_PROGRESS / BLOCKED / DONE / CANCELED, with CANCELED terminal and explicit DONE -> OPEN reopen;
- request-key idempotency, optimistic versioning and PII-minimized audit are enforced;
- migration 0072 is live as version `20260922214407`;
- migration 0073 is live as version `20260922214843` and cleared all five new unindexed-FK advisor findings;
- Production migration created zero Task rows; rollback-only Production smoke verified OPEN -> DONE -> OPEN and audit without persisting fixtures;
- zero provider/customer messages were sent by Slice 3 verification;
- latest verified Cloudflare Worker heartbeat after the Slice 3 runtime change is `84d19f06-ead7-4abe-b332-ba14309629d8` with failed=0.


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

For Business OS work, continue from the current dependency order without duplicating canonical stores. CRM Identity, Customer 360 Timeline, CRM Task Foundation, Deal/Pipeline Foundation, Custom Field Governance and governed Dynamic Lead Segments are Production-verified. Do not automatically build Custom Objects, Person Contact, Deal Segments, Snapshots or Campaign/Workflow Segment execution next. Re-audit the remaining Phase 3 gaps against current Production and the implementation map first, then implement only the next proven dependency.

For controlled Oman launch behavior, the next runtime behavior change must still correspond to one of these:

1. a real Production defect;
2. a provider/configuration requirement needed for the controlled pilot;
3. measured pilot evidence showing a specific reply/qualification/handoff/market-allocation weakness.

If a proposal adds another Agent, another CRM/event store, another analytics stack or broader autonomy without a proven dependency, stop rather than adding architecture for decoration.


## Chatwoot Production schema closeout — 2026-09-25

Current canonical Git/Cloudflare baseline:

- main: `d1766e6b12b1784359289e0244c777b23fcd0fca`;
- exact-main CI run #1222: SUCCESS;
- routed Cloudflare Production deploy #702: SUCCESS;
- latest pinned Chatwoot Community source-image run #17: SUCCESS on the latest source-changing main commit `d336a03c231bb66de8959510e57ce775dbfb7f52`;
- upstream Chatwoot remains pinned to v4.18.0 commit `9f920b549c14491a4e587687a3eed5d21c6ccc7d`.

Production Supabase `pkypexzpyfbikdnkrzvw` is now promoted through the complete Chatwoot bridge schema chain:

`0077_chatwoot_tenant_bridge_slice_a` through `0089_chatwoot_team_governance`.

Post-promotion verification proves:

- all canonical Chatwoot mapping/receipt tables are present with RLS enabled;
- public mutation/activation RPCs remain SECURITY INVOKER;
- only the reviewed narrow private evidence/role helpers are SECURITY DEFINER;
- service_role has read-only access to canonical mapping tables;
- reconciliation receipt tables are service-only with SELECT/INSERT;
- the verified webhook journal is service-only with SELECT/INSERT/UPDATE;
- anon/authenticated have no direct privileges on service-only receipt/journal tables;
- Supabase Vault remains the secret store boundary;
- Shadow Mode remains ON;
- Kill Switch remains OFF;
- Email/WhatsApp/Agent pause controls remain OFF;
- canonical Cost Guard remains USD 25 total with 10/5/4/3/3 OpenAI/Places/Email/WhatsApp/reserve allocation;
- no new outreach, WhatsApp or email event was produced by the migration promotion.

Supabase security advisor reports INFO-only no-policy notices on intentionally service-only RLS tables; this is expected and must not be “fixed” with broad policies. The pre-existing leaked-password-protection account warning remains a manual Supabase Auth setting. Performance advisor reports unindexed foreign-key opportunities; these require a targeted measured hardening pass rather than blind index creation.

Chatwoot runtime is **not yet Production-deployed**. The immutable Community-safe image exists, but `inbox.smartvisionsai.com`, dedicated Chatwoot PostgreSQL, Redis, object storage, Rails/Puma web and Sidekiq worker do not yet have verified Production runtime evidence. Therefore `COMM-CHATWOOT-SOURCE` is source-build verified / deployment pending, not complete.

C5 scoped-only membership remains intentionally blocked: Chatwoot CE v4.18.0 conversation authorization grants access through Inbox OR Team membership, so a Team-only Smart user must never be added to a shared mixed-scope Inbox without a coherent scope-aware access topology/interlock.


### Chatwoot FK hardening closeout — 2026-09-25

Production Supabase `pkypexzpyfbikdnkrzvw` is now promoted through `0090_chatwoot_fk_index_hardening` (Production migration version `20260924203449`).

Evidence:

- canonical main at promotion: `30cfaf481bc44e9aa08bc34ef75ebead2c3360c6`;
- exact-main CI #1226: SUCCESS;
- routed Cloudflare Production deploy #706: SUCCESS;
- migration 0090 adds only the 27 Production-advisor-reported covering indexes for new Chatwoot/communication foreign keys;
- PostgreSQL 17 catalog smoke passes on main;
- Production catalog verification reports `unindexed_count=0` across all public `chatwoot_%` tables plus `communication_channel_bindings`;
- Supabase performance advisor reports zero remaining unindexed-FK findings for those Chatwoot/communication tables;
- Shadow Mode remains ON;
- Kill Switch remains OFF;
- Email/WhatsApp/Agent pause controls remain OFF;
- no outreach send, WhatsApp event or email event occurred during the 0090 promotion window.

This closes the targeted FK-index hardening gap created by the new Communication Plane schema. It does not change Chatwoot runtime deployment status: the immutable Community-safe image is verified, but the long-running Chatwoot web/worker runtime is still deployment-pending.


## Current Chatwoot Candidate checkpoint — 2026-09-25

- Current `main`: `4987088dc4ba2e9212e196304ccebd69073ba536`, merge commit for PR #229.
- Exact-main CI run #1234: SUCCESS.
- Cloudflare Production deploy run #714: SUCCESS on this SHA. Growth OS Release Candidate and Production Worker deploys, route verification, safe API/webhook checks, and routed smoke all passed. Production Worker version: `eda99066-ed51-4ee7-a0d7-96102152f513`; smoke returned `/login=200`, `/=307`, unknown path `=404`, each through Cloudflare. No provider send was invoked.
- Production Supabase `pkypexzpyfbikdnkrzvw`: migration head remains `0090_chatwoot_fk_index_hardening`. Fresh read-only verification: Shadow Mode ON; global Kill Switch OFF; email, WhatsApp AI, and Agent pauses OFF. Cost Guard remains $25 monthly ($10 OpenAI, $5 Google Places, $4 Email, $3 WhatsApp, $3 reserve), thresholds 70/85/95/100. Month-to-date recorded usage was $0.219241 (OpenAI $0.039241, Google Places $0.18, Email $0, WhatsApp $0). Outbound outreach and WhatsApp events in the last hour were 0; email events in the last hour were 0.
- Chatwoot Source Image run #23 succeeded on this main SHA. Image: `ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-4987088dc4ba2e9212e196304ccebd69073ba536@sha256:c6e759a89867b41eae2230f5afcad75c7a54f421225d2e46c3e865bd401058ff`. Upstream remains Chatwoot `v4.18.0@9f920b549c14491a4e587687a3eed5d21c6ccc7d`; provenance inspection passed, Enterprise source was absent, runtime Enterprise disabled, provider authority Smart Core.
- The Candidate env template remains pinned to the previously verified immutable image from Source Image run #21. No Candidate or Production Chatwoot runtime exists yet.
- A fresh Railway read-only audit confirmed account `hamed665` can read its Personal workspace; the workspace currently has 0 projects and no Chatwoot Candidate project, service, or deployment. No Railway resources were created. Keep this as a read-only checkpoint; resource provisioning requires an explicitly authorized next step.
- Continue at `SECTION COMMUNICATION / COMM-CHATWOOT-SOURCE`: isolated Candidate hosting/resource provisioning and runtime verification. Keep Shadow Mode ON and provider activity disabled.

## Chatwoot isolated Candidate runtime — verified checkpoint 2026-09-25

This checkpoint supersedes the earlier same-day notes that said Railway had zero projects and no Candidate runtime.

Current repository/runtime baseline before this documentation branch:

- canonical main: `a90961e8b329b425bf5935174432f21029e11fd6` (PR #230);
- main validation: green;
- Cloudflare Production deploy #717: successful on that exact main, including route verification, safe API/webhook smoke and routed Production smoke;
- Production Supabase migration head: `0090_chatwoot_fk_index_hardening`;
- Production safety state remained Shadow Mode ON, global Kill Switch OFF, Email/WhatsApp-AI/Agents pauses OFF, with zero outbound activity in the checked verification window.

An isolated Railway project named `smartvisions-chatwoot-candidate` now exists. Railway's default environment is unfortunately named `production`, but the entire Railway project is Candidate-only and is not the Smart Visions Production communication plane.

Verified Candidate resources:

- dedicated `chatwoot-postgres` using `pgvector/pgvector:pg16`, private networking and a persistent Candidate-only volume;
- dedicated `chatwoot-redis` using `redis:8.2.1`, private networking, password authentication and AOF on a persistent Candidate-only volume;
- private S3-compatible bucket `chatwoot-candidate-storage`;
- one-shot `chatwoot-prepare`;
- Rails/Puma `chatwoot-web`;
- Sidekiq `chatwoot-worker`;
- isolated Railway origin `https://chatwoot-web-production-1a44.up.railway.app`.

All Chatwoot application services use the immutable Community-safe image:

`ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-4987088dc4ba2e9212e196304ccebd69073ba536@sha256:c6e759a89867b41eae2230f5afcad75c7a54f421225d2e46c3e865bd401058ff`

The source remains upstream Chatwoot Community `v4.18.0@9f920b549c14491a4e587687a3eed5d21c6ccc7d`. Enterprise source is absent from the built tree and `DISABLE_ENTERPRISE=true` remains required at runtime.

Runtime evidence:

- Candidate database preparation and `SMARTVISIONS_CONFIGURE.rb` completed successfully after correcting Redis password expansion;
- Rails/Puma boots in production mode and listens on `0.0.0.0:3000`;
- Sidekiq 7.3.10 boots successfully, authenticates to the dedicated Redis and registers SidekiqAlive;
- Candidate object-storage write/read verification succeeded;
- logical PostgreSQL backup -> Candidate S3 upload -> checksum verification -> isolated restore -> table-state verification succeeded; the verified restore contained 180 schema migrations and 113 installation-config rows;
- deployment history retains rollback-capable immutable snapshots for the Candidate application services.

Railway-specific corrections proven during this deployment:

- PostgreSQL volume root cannot be used directly as `PGDATA` because the mounted filesystem contains `lost+found`; use a subdirectory such as `/var/lib/postgresql/data/pgdata`;
- Redis password expansion must run through a shell, for example `sh -lc 'exec redis-server --appendonly yes --requirepass "$REDIS_PASSWORD"'`;
- Railway HTTP health checks require a direct 200 and do not follow SSL redirects. With mandatory `FORCE_SSL=true`, the platform-local HTTP `/health` check can fail despite Puma being healthy. The Railway healthcheck was therefore removed rather than weakening SSL.

Safety remained closed throughout Candidate work:

- no Production provider credential was copied into Chatwoot;
- no native Chatwoot WhatsApp/Email provider channel was enabled;
- no API Inbox was activated;
- no Production customer/contact/message data was imported;
- no customer/provider message was sent;
- `CHATWOOT_WEBHOOK_PUBLIC_ORIGIN` remains empty;
- account signup remains disabled;
- Production Chatwoot remains unprovisioned and `inbox.smartvisionsai.com` was not created or attached.

Post-deploy public HTTPS smoke is now verified from a Candidate one-shot runtime with normal TLS peer verification: `GET /health` returned HTTP 200 with `{"status":"woot"}`, and `GET /app/login` returned HTTP 200. Independent Railway HTTP logs recorded the same two 200 responses against the Candidate public hostname. The one-shot prepare service was then restored to its canonical `db:chatwoot_prepare && SMARTVISIONS_CONFIGURE.rb` command.

The current Railway Candidate account tier is Candidate-only evidence, not Production sizing evidence: Candidate database/Redis volumes are 500 MB and the current tier does not provide native volume backups. Production promotion remains a separate gate with durable backup, capacity and public-origin requirements.

Work Package status:

`SECTION COMMUNICATION / COMM-CHATWOOT-SOURCE` = **isolated Candidate runtime release gate verified; Production deployment/promotion is still separate and not authorized**.


## SALES-PIPELINE-V2 Production closeout — 2026-09-28

**Current evidence checkpoint — PRODUCTION_VERIFIED (2026-09-28):**
- PR #329 / Production migration `0139_sales_pipeline_v2` extends the existing canonical `crm_pipelines + crm_pipeline_stages + crm_deals` authority. No second CRM, Pipeline engine, Deal store, Team store, commercial-history store or persisted weighted-amount truth was created.
- Stages now carry basis-point probability, typed forecast category and bounded policies for amount, expected-close and Deal probability overrides. Terminal WON/LOST semantics are fixed to 10000/0 bps and CLOSED_WON/CLOSED_LOST.
- Deals can reference the canonical `public.teams`, carry a policy-gated probability override, and require bounded typed close evidence plus authenticated actor attribution before governed WON/LOST completion.
- `crm_deal_forecast_rows` derives effective probability and weighted amount instead of persisting a second commercial truth; `get_crm_pipeline_forecast` exposes bounded owner/team/currency forecast summaries through SECURITY INVOKER/RLS.
- Exact-head CI `36429203959` succeeded on `b9ea52c29063f4aa19d52a3a9b24521fde373829`. Exact-main CI `36429525004` and Cloudflare Production Deploy `36429837860` succeeded on `main@6d609ebf4abcd2faadd8f474ec1a48849acdb434`.
- Production migration version is `20260928135144`. Production remains honest at 0 Pipelines / 0 Stages / 0 Deals / 0 forecast rows; no synthetic commercial acceptance records were created.
- Production RLS remains enabled on Pipelines, Stages and Deals. V2 policy/audit guards, Team/close-actor FKs and the security-invoker forecast view are live. Post-migration advisors show no new unindexed-FK finding for the V2 Deal Team or close-actor FKs; existing advisor debt remains separate.
- Controlled PostgreSQL 17 acceptance proved stage-policy rejection, Team tenant isolation, probability override gating, derived weighted forecast, bounded terminal evidence, terminal immutability, RLS isolation, audit privacy and zero outbound/conversation side effects.
- Disposition: current RC scope is **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**.

The next bounded continuation cursor is `SECTION SEGMENT_SALES_MARKETING / SALES-NEXT-ACTION`. Re-audit current main and Production before mutation. Reuse canonical Lead/Deal/Task/Conversation authorities; do not create a second follow-up queue, reminder store, ownership model or send engine.


## SALES-NEXT-ACTION Production closeout — 2026-09-28

**Disposition: IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED.**

- PR #331 delivered the bounded `SALES-NEXT-ACTION` slice by extending the existing canonical `public.crm_tasks` authority and deriving a prioritized read model from canonical Tasks, Leads, Deals and Conversation activity. It did not create a second task/reminder store, ownership model, scoring engine, automation engine, queue/outbox or provider send path.
- Exact-head CI for PR #331: `36460193532` succeeded. PR #331 merged to `main@fc82c727c7099e46602a466d3d4faaac1fa4b574`.
- Production migration `0140_sales_next_action` is applied as version `20260928174748`.
- Production runtime verification of 0140 exposed PostgreSQL `42804` because long-lived Production uses enum `public.lead_status` while the derived UNION exposed `source_status text`. This was treated as a real Production defect, not papered over.
- PR #332 fixed only the canonical `get_crm_next_actions` function by explicitly normalizing Task, Lead and Deal source statuses to text. No data mutation, seed, new table or second authority was introduced.
- Final exact-head CI for PR #332: `36462166810` succeeded on `c1489fcf719dbf348e3e95b9917180c67d36946c`. PR #332 merged to `main@7a923beacb89fa8a39c7f35f0255ad9532ff5d54`.
- Exact-main CI `36462560234` succeeded on that same SHA. Cloudflare Production Deploy `36462884290` also succeeded, including exact-bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0141_sales_next_action_status_cast_fix` is applied as version `20260928180433`.
- Production runtime now executes `get_crm_next_actions(...,72,NULL,200)` successfully under authenticated RLS for the real Smart Visions owner. Current real data is 19 Leads / 0 Deals / 0 CRM Tasks / 0 NEXT_ACTION Tasks / 6 PENDING legacy `followup_jobs`. The derived queue currently returns 17 real `LEAD_STALE` candidates; the remaining 2 Leads are recent NEW Leads and therefore correctly excluded by the 72-hour stale boundary.
- `crm_tasks` RLS remains enabled. `crm_tasks_next_action_guard` and `crm_tasks_next_action_audit` are live. All three next-action functions are SECURITY INVOKER. Authenticated users can execute only the read function; acceptance and model-suggestion mutation functions are restricted to `service_role`.
- Human acceptance remains explicit: the authenticated API resolves the human actor, then the trusted service boundary creates the canonical Task with actor provenance. SALES_AGENT cannot assign another user. Direct browser fabrication of `NEXT_ACTION` Tasks is rejected.
- AI next-action suggestions remain advisory only. They cannot change task owner/status/due/reminder/send state and do not create provider/customer side effects.
- Legacy `followup_jobs` remains outreach scheduling evidence only and is not the canonical CRM work queue.
- No synthetic Production Deal, Task or next-action fixture was created. Production stayed at 0 Tasks/0 NEXT_ACTION Tasks through verification. No outbound/provider send path is invoked by the derived queue or hotfix.
- Current Supabase advisor output contains pre-existing platform debt, but no new advisor finding specific to the SALES-NEXT-ACTION schema/function hotfix.

**Fresh continuation cursor:** `SECTION SEGMENT_SALES_MARKETING -> MARKETING-CAMPAIGNS`.

Before mutation, re-audit current main/open PRs/exact-head CI, Production migrations/schema/data/security and current provider/consent/campaign authorities. Reuse existing canonical suppression, outreach/provider, segment/snapshot and audit authorities. Do not create a second campaign, consent, audience, send or provider-truth plane.

---

# Superseding MARKETING-CAMPAIGNS Production checkpoint — 2026-09-28

Canonical main at this checkpoint: `b9dc839dcc30fbfb398852fc18258196290ab75c`.

## MARKETING-CAMPAIGNS Production closeout — 2026-09-28

**Disposition: IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED.**

- PR #334 extended the existing canonical `public.campaigns` / outreach plane for governed MARKETING campaigns; no second Campaign, audience, Consent, send, provider or attribution authority was created.
- MARKETING campaigns bind to immutable CAMPAIGN-purpose LEAD Segment Snapshots, governed Message Templates/Variants, schedule/channel/frequency/budget caps, explicit approval lifecycle, actor provenance and A/B allocation evidence. Direct conversion evidence is append-only and explicitly does not claim attribution.
- Campaign control never invokes provider sends. Consent/suppression remains enforced at the canonical send gate, and START/RESUME remains bounded by Shadow Mode.
- Final PR #334 exact-head CI `36470405184` succeeded on `de27a43c9408f0dcf8d02be849c8495fa5b503c2`. PR #334 merged to `main@6cdb3a7a35f1d0f98d0dac63110800a7a5361cad`; exact-main CI `36470727765` and Cloudflare Production Deploy `36471049566` succeeded.
- Production migration `0142_marketing_campaign_governance` is applied as version `20260928191814`.
- Post-migration advisor verification found three new unindexed composite FKs on `marketing_campaign_conversion_evidence`. PR #335 / migration `0143_marketing_campaign_fk_index_hardening` added only those covering indexes and extended the PostgreSQL 17 smoke.
- PR #335 exact-head CI `36471556035` succeeded on `c209fbc762e47e45bf444e8c634bdd0ea5eb615c`. PR #335 merged to `main@b9dc839dcc30fbfb398852fc18258196290ab75c`; exact-main CI `36471907606` and Cloudflare Production Deploy `36472242677` succeeded.
- Production migration `0143_marketing_campaign_fk_index_hardening` is applied as version `20260928192755`. The three MARKETING conversion FK indexes are present and the advisor now reports zero unindexed-FK findings for that table.
- Production remains honest: 7 total campaigns, all 7 HUNTER and 0 MARKETING; 43 existing outreach messages; 0 Marketing conversion evidence. No synthetic Production Campaign, Snapshot, Template, Variant or conversion fixture was created.
- Conversion evidence RLS is enabled. Authenticated users can read but cannot insert it; trusted mutation RPCs are service-role-only with explicit human actor provenance. All five campaign RPCs are SECURITY INVOKER. The three governance/immutability triggers are enabled.
- Shadow Mode remains ON; Kill Switch and pause controls remain unchanged.
- Existing Hunter runtime/data was preserved.

**2026-09-29 MARKETING-CONSENT Production closeout**

- PR #337 delivered MARKETING-CONSENT governance. Exact-head CI `36476465786` succeeded on `145fe69c3d4617d399a76842e0e516bdf8999c89`; the PR merged to `main@2ad80936aaae62020face3b263fc5b98cb666790`.
- Exact-main CI `36476868405` and Cloudflare Production Deploy `36477188658` both succeeded on the same main SHA.
- Production migration `0144_marketing_consent_governance` is applied as version `20260928205708`.
- Canonical permission evidence reuses `public.lead_sources`; canonical suppression/DNC remains `public.suppression_list`. No second Consent, preference, provider-permission or suppression authority was created.
- Permission evidence is append-only behind `lead_sources_marketing_permission_guard`. `record_marketing_permission_event` is SECURITY INVOKER and service-role-only with explicit human/preference-center provenance. `get_marketing_permission` and `get_marketing_preferences` are SECURITY INVOKER and readable by authenticated/service-role callers under existing RLS.
- Production verification remains honest: 0 marketing permission events, 0 effective preferences, 1 existing suppression row and 43 existing outreach messages. Post-migration verification observed 0 new outbound rows in the preceding 10 minutes. No synthetic opt-in/opt-out evidence was created.
- The post-0144 advisor pass introduced no new Marketing security or unindexed-FK regression; existing platform advisor debt remains separate.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the governed internal permission path. Real customer opt-in/opt-out evidence remains data-driven and must never be fabricated.

**Fresh continuation cursor:** `SECTION SEGMENT_SALES_MARKETING -> MARKETING-ATTRIBUTION`.

For `MARKETING-ATTRIBUTION`, first audit existing outreach/reply/conversation/Lead/Deal and future booking/order/payment evidence. Do not infer attribution from Segment membership, Campaign approval, or direct conversion evidence alone; do not fabricate click/view events or create a second revenue truth.




## MARKETING-ATTRIBUTION Production closeout — 2026-09-29

- Work Package: `SECTION SEGMENT_SALES_MARKETING -> MARKETING-ATTRIBUTION`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the current observational attribution scope.
- PR #339 delivered the bounded read-only model on existing canonical authorities only. No second attribution table, revenue truth, Campaign store, CRM store, send path or provider truth was created.
- Implementation merge: `main@9e8373bb37102b3763b92d19abda66ee3acf724a`.
- Exact-head CI: `36484937638` SUCCESS on `dcd9fbbf51f6857cacee787f546cf11d7d4001af`.
- Exact-main CI: `36485322314` SUCCESS.
- Cloudflare Production Deploy: `36485633187` SUCCESS, including release-candidate smoke, exact validated bundle promotion, routed Production smoke and safe API/webhook rejection smoke.
- Production migration `0145_marketing_attribution_observational` is live. Near-simultaneous idempotent application recorded two migration-history entries, versions `20260928212346` and `20260928212358`. Their stored statement hashes differ, but both contain the same hardened contract markers (Lead-first touch index, Deal-bounded limit, reply/conversion outcome-time bounds and LINEAR truncation protection). The canonical runtime matches merged `main`; the schema contains only the intended single function/index and no manual migration-history deletion was performed.
- Production runtime under the real Smart Visions authenticated OWNER/RLS context successfully executed `FIRST_TOUCH`, `LAST_TOUCH` and `LINEAR` with the bounded 30-day/200-Deal contract.
- Current honest Production evidence: 19 Leads, 0 Deals / 0 WON Deals, 7 total Campaigns / 0 MARKETING Campaigns, 43 Outreach messages, 12 Sales Conversations, 37 Conversation messages, 0 Reply events and 0 Marketing conversion-evidence rows; therefore all three attribution models correctly return 0 rows. No synthetic Campaign, Deal, message, click, view, payment or revenue fixture was created.
- `get_marketing_attribution` is SECURITY INVOKER; authenticated/service_role may execute, anon may not. No persisted `marketing_attribution*` table/view/materialized authority exists.
- Attribution requires real sent MARKETING outreach before a canonical WON Deal. Exact Conversation linkage requires the same provider message ID. FIRST_TOUCH/LAST_TOUCH/LINEAR are bounded observational credit models only; `causal_claim=false` and `revenue_claimed=false`.
- Deal amount remains sales evidence, not collected revenue. Booking/Order/Invoice/Payment attribution stays deferred until their canonical authorities exist.
- Post-apply advisors show no Attribution-specific security finding. The new partial index is currently reported only as unused, expected while Production has no MARKETING Campaign/WON Deal attribution workload.
- No outbound/provider send side effect was introduced; Shadow Mode and existing safety controls remain unchanged.

**Fresh continuation cursor:** `SECTION SEGMENT_SALES_MARKETING -> HUNTER-CUSTOMER-MODULE`.

Before mutation, re-audit current main/open PRs/exact-head CI and Production Hunter/discovery/enrichment/credit/dedupe/CRM-promotion/compliance authorities. Extend the existing Hunter only; do not create a second prospect, discovery, enrichment, credit, CRM, consent/suppression or provider-send authority.

---

# Production evidence checkpoint — HUNTER-CUSTOMER-MODULE

## HUNTER-CUSTOMER-MODULE Production closeout — 2026-09-29

- Work Package: `SECTION SEGMENT_SALES_MARKETING -> HUNTER-CUSTOMER-MODULE`.
- Disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the current customer-facing Hunter read/composition scope.
- PR #341 merged to canonical `main@b36b1dc4df72f61d6de84a4b70475377eb1903cc`.
- Final exact-head CI `36493943818` succeeded after the test-only legacy Business bootstrap was aligned with long-lived Production's canonical Hunter enrichment shape; no Product/Production authority was changed to satisfy CI.
- Exact-main CI `36494234082` succeeded on the merge SHA across lint, typecheck, Vitest, PostgreSQL 17 migration/smoke, Next build, Vinext and scheduled verification.
- Cloudflare Production Deploy `36494486700` succeeded on the same merge SHA.
- Production migration `0146_hunter_customer_module_read_model` is live as version `20260928224839`; merged migration file blob SHA is `768522507c96b0011020f550bd5906407f68553f`.
- The module extends existing canonical Hunter/CRM/usage/entitlement/suppression authorities only. It created no second Prospect store, CRM, credit ledger, entitlement store, consent source, send gate or provider runtime.
- Production runtime was executed under the real Smart Visions authenticated OWNER/RLS context. Current real evidence: 7 Hunter Campaigns, 13 discovered prospects, 13 enriched Businesses, 13 CRM-promoted prospects, 12 qualified prospects, 1 suppressed prospect, 18 Hunter usage units this month, USD 0.18 Hunter provider cost this month, 0 observed WON Deals and Hunter entitlement status `UNCONFIGURED`.
- `get_hunter_customer_summary` and `get_hunter_customer_prospects` are SECURITY INVOKER. Authenticated/service_role execution is granted; anon execution is denied.
- Contactability remains evidence only: Production returned `permission_true_count=0`. Suppression is surfaced, while actual outreach remains governed by canonical consent/channel/send gates and Shadow Mode.
- ROI remains observational WON Deal evidence only and does not claim Hunter caused revenue.
- Production stayed honest across the migration/runtime verification: Leads 19 -> 19, Outreach messages 43 -> 43, Conversation messages 37 -> 37, Usage events 108 -> 108, Deals 0 -> 0, Discovery records 13 -> 13, Growth opportunities 14 -> 14. No synthetic Production prospect, Lead, Deal, send or usage fixture was created.
- Post-apply Supabase advisor categories/counts show no Hunter-specific regression: security baseline remains RLS-enabled/no-policy INFO 15 and leaked-password-protection WARN 1; performance baseline remains unindexed FKs 14, auth RLS initPlan 16, multiple permissive policies 6. Unused indexes decreased from 223 to 222 and are not a Hunter security regression.

**Fresh continuation cursor:** `SECTION SEGMENT_SALES_MARKETING -> CUSTOMER-SUCCESS-LOYALTY`.

Before mutation, fresh-audit current main/open PRs/exact-head CI and Production onboarding/health/retention/churn/reactivation/loyalty/referral/lifecycle-task authorities. Reuse canonical Person/Account/Lead/Deal/Task/Support/Segment/Marketing Consent/Campaign authorities and do not create a second customer, task, campaign, consent, scoring or billing truth.