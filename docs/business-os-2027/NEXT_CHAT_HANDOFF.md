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

**Fresh continuation cursor:** `SECTION ANALYTICS_REPORTING -> DATA-ASK`.

Before DATA-ASK mutation, fresh-audit the current Metrics Registry, Analytics Warehouse, dashboard composer, semantic definitions and any existing natural-language/query surfaces. DATA-ASK must resolve only governed metric/semantic contracts and bounded canonical projections; it must not expose arbitrary Production SQL, create a second metrics/warehouse truth, bypass RLS/IAM, or let model-generated text become execution authority.

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

# Smart Visions AI Business OS 2027 — Next Chat Handoff

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
- Implementation PR #398 final head `4e2f3007c944cc3fb40b791359cc9558cffe30d5` passed exact-head CI `37009383921`; canonical squash merge is `main@4c5d5b26d33b460e4d19c6e13551a65eda4d98dc`.
- Exact-main CI `37009775188` and Cloudflare Production Deploy `37010061631` succeeded on that exact implementation merge SHA.
- Production migration `0173_order_engine@20261002130127` is live from merged blob `9123adb5a748a0b5440039ccb81ebe69cfff3236`.
- Canonical Order truth is `orders` + immutable line snapshots + bounded fulfillment/return/lifecycle child state. Accepted Quote conversion and permitted direct canonical-price Orders reuse existing Quote/Catalog/CRM/Booking authorities. Invoice, Payment/refund, live stock, reservations, warehouse and stock-movement truth remain outside ORDER-ENGINE.
- Order mutations are service-role governed; authenticated users have scoped reads only. `ORDER_CREATED` and `ORDER_STATUS_CHANGED` are AVAILABLE canonical Automation triggers and Customer 360 V4 composes Order truth.
- Production remained side-effect clean with all six Order tables at 0 rows and upstream Quotes/Products/Variants/Product Prices at 0. No synthetic Production Order/return/customer/Product/payment/provider evidence was created.
- Post-0173 advisors found exactly three new composite-FK index gaps. Hardening PR #399 final head `4935cbcfad527f2084123faa722ab1ada9ba9cb0` passed exact-head CI `37010634724`, merged as `main@ac65d781251f8be112a351aa3ca73cd110314b68`, and exact-main CI `37011043404` plus Cloudflare Production Deploy `37011371669` succeeded.
- Production hardening migration `0174_order_engine_fk_index_hardening@20261002131210` is live from merged blob `b799d423d2db191f10c22a63ec116d09774ae683`. The three FK findings are gone and `unindexed_foreign_keys` is back at baseline 14; security baseline is unchanged.
- Existing WhatsApp real-tenant E2E and same-number Coexistence blockers remain unchanged.
- Managerial estimate after ORDER-ENGINE: Phase 8 approximately **58% complete / 42% remaining**; overall program approximately **66% complete / 34% remaining**. These are planning estimates only.

**Fresh continuation cursor:** `SECTION COMMERCE_PAYMENTS -> INVENTORY-FULFILLMENT`.

Next chat must fresh-audit current main/open PRs, Production migrations/advisors, Product/Variant/Branch availability, Order fulfillment evidence, Field Service material usage, Booking resources and any existing inventory/warehouse/stock references before mutation. Build one canonical inventory/stock/reservation/warehouse/movement/fulfillment truth only; do not duplicate Catalog, Order, Booking, Field Service, Invoice or Payment authorities.

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

- Slices 1–7 remain **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for their internally controlled scopes.
- Slice 8 disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for internally controlled same-binding reconnect, credential/subscription health, safe disconnect/revoke fail-closed behavior, provider reconciliation, UI controls, schema and deploy scope.
- PR #391 final head `09697e4127fbd3bb8a8216bc945bd16fbcfa637b` passed exact-head CI `36979621813`, then squash-merged to `main@5051d6984e1d6413a0077da8da3142f89ef740cd`.
- Exact-main CI `36979959886` and Cloudflare Production Deploy `36980189935` succeeded on that exact merge SHA.
- Production migration `0169_whatsapp_reconnect_disconnect_lifecycle@20261002074458` is live; merged migration blob SHA `10dd1fd8fdefed603dd8688f92130e70b7348774`.
- Reconnect rotates the existing binding credential/Vault secret and rejects WABA/phone identity drift. It does not create a new logical WhatsApp connection.
- Manual disconnect, invalid/revoked credentials, unconfirmed health and missing WABA subscription all fail closed in the canonical inbound/outbound resolvers.
- Safe disconnect first blocks Smart Core provider actions, supersedes active setup attempts and degrades active Unified Inbox projection state. WABA webhook unsubscribe is reconciled by provider readback; ambiguous mutation is recorded for explicit reconciliation and is never blindly retried.
- Customer mobile WhatsApp Business is never deleted/uninstalled and no destructive migration path was introduced. Same-number Coexistence activation remains fail-closed until real official Meta/provider/runtime eligibility exists.
- Production remains clean: WhatsApp bindings 0, setup attempts 0, Conversation Messages 37, WhatsApp Events 136, Unified Inbox projections 0 and Slice-8 lifecycle incident rows 0. No synthetic Production tenant/credential/customer/message/provider mutation was used.
- Safety remains Shadow Mode ON; global Kill Switch OFF; WhatsApp AI pause OFF; Agents pause OFF. Slice-8 lifecycle RPC ACLs are service-role-only and fresh advisors show no Slice-8-specific new finding.
- **Not claimed:** first real consented tenant Meta ↔ Smart Core ↔ Chatwoot E2E or real same-number Coexistence. Those remain `BLOCKED_EXTERNAL` / pending real external evidence.

**Owner-prioritized WhatsApp overlay is internally complete through Slice 8. Resume the stable roadmap at:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

---

## WhatsApp customer onboarding Slice 7 controlled-scope Production closeout — 2026-10-02

- Slices 1–6 remain **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for their internally controlled canonical setup/provider/Chatwoot/message bridge scopes.
- Slice 7 disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for internally controlled native WhatsApp Business App activity, Human/AI arbitration, durable Chatwoot reconciliation, schema and deploy scope. Real same-number Coexistence activation and real-customer native E2E remain external-evidence dependent.
- PR #389 final head `75ad62a8bc88fa3b69226208e7b19ce5231fb6ef` passed exact-head CI `36943804916`, then squash-merged to `main@917913736fe6ac2cf5c87626d8ac92f422541df5`.
- Exact-main CI `36944138334` and Cloudflare Production Deploy `36944402017` both succeeded on that exact merge SHA. Production deploy passed release-candidate smoke, SSR load, routed Production smoke and safe API/webhook rejection smoke without a provider send for acceptance.
- Production migration `0168_whatsapp_coexistence_native_arbitration@20261002000822` is live; exact merged migration blob SHA is `0f3411fc50599e6241510362125a8f37c83c6e77`.
- `smb_message_echoes` now enters the existing WhatsApp journal/canonical lifecycle as current native-human evidence only after exact existing customer/Lead/Conversation scope resolves. The business sender number is not projected as a CRM customer.
- Canonical native messages use `HUMAN_NATIVE_WHATSAPP` provenance and existing source identity/dedupe. Current native activity atomically sets the existing Lead/Conversation to HUMAN takeover with `WHATSAPP_NATIVE_ACTIVITY`; the existing final send gate blocks stale queued/approved AI after that newer human action.
- The existing Chatwoot reconciler now drains native outbound evidence with durable claim/finalize semantics and no blind retry after ambiguous external mutation. Historical synchronization is excluded from current-live takeover semantics.
- Production remained side-effect clean: Conversation Messages 37, WhatsApp Events 136, Unified Inbox projections 0, WhatsApp bindings 0 and Slice-7 controlled-smoke residue 0. New RPC ACLs are service-role-only.
- Safety remains unchanged: Shadow Mode ON; global Kill Switch OFF; WhatsApp AI pause OFF; Agents pause OFF. Supabase advisors show no Slice-7-specific finding.
- Same-number Business App Coexistence activation remains intentionally fail-closed/non-destructive until real Meta/provider/runtime evidence confirms eligibility. Never delete/uninstall the customer's mobile WhatsApp Business app merely to connect the API.

**Owner-prioritized continuation overlay:** WhatsApp onboarding contract **Slice 8 — reconnect/revoke/disconnect + first real tenant E2E acceptance**.

Fresh-audit existing binding/integration/Vault lifecycle, credential revocation handling, disconnect semantics, webhook/provider recovery and real-tenant acceptance gates before mutation. Reuse those exact authorities. Do not create a second connection state machine, secret store or provider stack.

**Stable program cursor preserved for return after the owner-prioritized WhatsApp onboarding work:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

---

## WhatsApp customer onboarding Slice 6 Production closeout — 2026-10-02

- Slices 1–5 remain **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** and their canonical connection/setup/provider/Chatwoot authorities remain unchanged.
- Slice 6 disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for internally controlled message/status/media bridge, provenance, dedupe, reconciliation and deploy scope.
- PR #387 final head `4b6eba7ceb900e1d012d299e3b20816911f9fa51` passed exact-head CI `36939463033`, then squash-merged to `main@5f7f81c5b279efd92feb6341bdc971fe6e6c012e`.
- Exact-main CI `36939774658` and Cloudflare Production Deploy `36940049403` both succeeded on that exact merge SHA. Production deploy passed release-candidate smoke, SSR load, routed production smoke and safe API/webhook rejection smoke without an outbound provider send.
- Production migration `0167_whatsapp_message_bridge_provenance@20261001231837` is live; exact merged migration blob SHA is `60c4df822b1429bf77d975089af96a218a1bf81b`.
- Canonical `conversation_messages` now carries semantic provenance plus cross-plane source identity; the existing `whatsapp_events` journal carries durable Chatwoot sync state. No second message store, webhook journal, queue or provider authority was created.
- Meta inbound persists canonically before asynchronous Chatwoot projection. Chatwoot human replies require canonical user/membership mapping plus full human takeover and cross the existing send safety gate before Meta. Smart Core Owner/AI sends mirror into Chatwoot with deterministic echo suppression.
- Provider status reconciliation is monotonic and replays early/out-of-order status evidence. Media uses the existing provider/Vault authority with bounded trusted download/upload and MIME validation. Ambiguous external mutation outcomes remain `RECONCILIATION_REQUIRED` / fail-closed rather than blind-retried.
- Business-wide Unified Inbox `branch_id=null` is live; branch-scoped Team semantics remain fail-closed.
- Production verification stayed side-effect clean: Conversation Messages 37, WhatsApp Events 136, Unified Inbox projections 0. Existing message backfill is 36 `SHADOW_MODE -> AI` plus one ambiguous old outbound -> `SYSTEM`. No guessed provenance or synthetic Production customer/message/resource was created.
- WhatsApp journal backfill has 37 scoped inbound events at `PENDING`; 12 older inbound events remain without Chatwoot sync state because they lack both canonical Conversation and Lead scope.
- Slice-6 RPC ACLs are service-role-only as intended. Production safety remains Shadow Mode ON, global Kill Switch OFF, WhatsApp AI pause OFF and Agents pause OFF.
- Real Meta/Chatwoot customer E2E is **not claimed** because no real tenant/binding/credential is available for a non-synthetic acceptance run.

**Owner-prioritized continuation overlay:** WhatsApp onboarding contract **Slice 7 — Official coexistence + native activity + Human/AI arbitration**.

Before mutation, fresh-read `WHATSAPP_CUSTOMER_ONBOARDING_CONNECTION_CONTRACT.md` from current main and fresh-audit official provider capability/runtime evidence plus existing human-takeover/send-gate authorities. Do not infer native WhatsApp activity, do not activate same-number Coexistence from schema capability alone, and do not add a second message/activity/arbitration authority. `BUSINESS_APP_COEXISTENCE` remains non-destructive and fail-closed until official provider path and real evidence support activation.

**Stable program cursor preserved for return after the owner-prioritized WhatsApp onboarding work:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

---

## WhatsApp customer onboarding Slice 5 Production closeout — 2026-10-01

- Slices 1–4 remain **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** and their canonical Meta/binding/Vault/setup authorities remain unchanged.
- Slice 5 disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled existing-Chatwoot projection/orchestration path.
- PR #385 final head `0e6ec7a73c8b6d715e6914cb99a2a9f3c501624b` passed exact-head CI `36883590463` and squash-merged to `main@4463c29be4b3cf91fc80136587f6c253a6597f36`.
- Exact-main CI `36884006244` and Cloudflare Production Deploy `36884481705` both succeeded on the exact merge SHA.
- No Slice-5 migration was required; Production remains through `0166_meta_whatsapp_mobile_wizard_completion@20261001135536`.
- Slice 5 reuses canonical `chatwoot_account_mappings`, OWNER User/administrator membership, `chatwoot_inbox_mappings`, marker reconciliation, Vault secret capture and reconciliation receipts. The WhatsApp connection remains owned by Smart Core/Meta, not Chatwoot.
- OWNER finalization requires matching Slice-4 provider evidence. Remote Meta admins are not projected to Chatwoot and gain no Smart Visions panel authority.
- Business-wide `branch_id=null` Inbox projection is supported. A remote-completed Meta setup can be finalized by the OWNER without repeating Meta login.
- Production remained side-effect clean: tenant Businesses 0, WhatsApp bindings 0, all Chatwoot mapping/receipt counts 0 and Slice-5 projection audit rows 0. Real-tenant Chatwoot E2E is therefore intentionally not claimed.
- Security/performance advisor baseline and Production safety controls remain unchanged.

**Owner-prioritized continuation overlay:** WhatsApp onboarding contract **Slice 6 — Message/status/media bridge + provenance + dedupe**.

Fresh-audit the existing Meta WhatsApp webhook journal/persistence, message/status/media lifecycle, Unified Inbox/CRM projection, Chatwoot webhook journal, outbound send reconciliation, media handling and provider-message idempotency before mutation. Extend those exact authorities only. Required Slice-6 semantics include explicit semantic provenance, cross-plane echo/dedupe, out-of-order status recovery, media provenance and deterministic reconciliation. Do not create another message/conversation store, provider queue, webhook journal or Chatwoot message authority.

**Stable program cursor preserved for return after the owner-prioritized WhatsApp onboarding work:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

---

## WhatsApp customer onboarding Slice 4 Production closeout — 2026-10-01

- Slices 1–3 remain **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** and their canonical binding/setup-attempt/`WHATSAPP_SETUP` authorities remain unchanged.
- Slice 4 disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled Meta provisioning/subscription/recovery scope.
- PR #382 final head `d39ca5db89f1661138dc4709cff8ab60a6bea579` passed exact-head CI `36880398289`, then squash-merged to `main@3e0eb5ec585b1be5d65ba48531c5026d38324178`.
- Exact-main CI `36880881774` and Cloudflare Production Deploy `36881305912` both succeeded on that exact merge SHA.
- Slice 4 required no schema migration. Production remains through `0166_meta_whatsapp_mobile_wizard_completion@20261001135536`.
- WABA phone readback, `subscribed_apps` reconciliation, ambiguous-success recovery and bounded new-number Cloud API registration now reuse the existing Meta adapter/binding/Vault authority.
- Six-digit registration PIN material is ephemeral and never persisted/audited. `EXISTING_API_RECONNECT` does not force registration, and `BUSINESS_APP_COEXISTENCE` remains fail-closed/non-destructive.
- Production stayed side-effect clean: Setup Attempts 0, Slice-4 provisioning audit rows 0, provisioning-error bindings 0 and registration-required bindings 0. No synthetic tenant/binding/credential/provider mutation or customer send was used.
- Existing advisor baseline remains unchanged for security/FK/RLS-plan/policy findings.

**Owner-prioritized continuation overlay:** WhatsApp onboarding contract **Slice 5 — Existing Chatwoot provisioning integration**.

Fresh audit already confirms the required Chatwoot foundation exists: canonical `chatwoot_account_mappings` / `chatwoot_inbox_mappings`, Account/API Inbox provisioning, marker-based ambiguous-create reconciliation, Vault capture, reconciliation receipts and activation gating. The current gaps to solve are onboarding orchestration onto those exact authorities, support for business-wide bindings where `branch_id` is null, and a bounded trusted path for remote setup that does not grant the external Meta admin OWNER/ADMIN or normal panel authority.

Do not create a second Chatwoot Account/Inbox authority, second webhook receiver, second secret store or second communication plane. Preserve `Meta ↔ Smart Core ↔ Chatwoot Channel::Api`.

**Stable program cursor preserved for return after the owner-prioritized WhatsApp onboarding work:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

---

## WhatsApp customer onboarding Slice 3 Production closeout — 2026-10-01

- Slices 1–2 remain **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** and their non-destructive connection, setup-attempt and bounded `WHATSAPP_SETUP` invitation/session authorities remain canonical.
- Slice 3 disposition: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED** for the internally controlled mobile wizard/preflight/setup-later/resume/trusted-remote-completion scope.
- PR #380 final head `ad4380caa27ad8928da8568e2b009114850d410e` passed exact-head CI `36871208717` and squash-merged to `main@19201aa26ad6176d978ccc6e70b17ac365f1f8aa`.
- Exact-main CI `36871735143` and Cloudflare Production Deploy `36872092126` both succeeded on that exact merge SHA.
- Production migration `0166_meta_whatsapp_mobile_wizard_completion@20261001135536` is live; merged migration blob SHA `887c200e6d1a3f258ad70e95f3795a5dddb3ebce`.
- The customer wizard reuses the Slice-2 HttpOnly setup session and Slice-1 setup attempt. It supports preflight, Meta-hosted authorization, popup cancel/retry, Setup Later and reload/mobile-return resume without creating another identity, invitation/session authority or logical connection.
- Meta code exchange remains server-side. The selected phone must still be proven to belong to the selected WABA before the existing Vault helper can update the canonical binding.
- Remote completion is service-only, version/session-bound and replay-safe. Completion provenance records `REMOTE_SETUP / WHATSAPP_SETUP` while preserving the initiating OWNER as the sponsoring canonical binding updater; no fake Smart Visions user/member is created.
- Both owner and remote completion retain explicit same-number `BUSINESS_APP_COEXISTENCE` fail-closed guards. Existing WhatsApp Business on the phone is never deleted, uninstalled or destructively migrated by this flow.
- Production stayed side-effect clean: Setup Attempts 0 and Slice-3 remote completion audit rows 0. No synthetic tenant/binding/session/credential, real Meta authorization, provider send or customer message was used to prove the slice.
- Production safety remains unchanged: Shadow Mode ON; global Kill Switch OFF; WhatsApp AI pause OFF; Agents pause OFF.
- Post-`0166` advisor baseline remains unchanged for security/FK/RLS-plan/policy findings: RLS/no-policy 15, leaked-password warning 1, unindexed FKs 14, auth RLS initPlan 16 and multiple permissive policies 6.

**Owner-prioritized continuation overlay:** WhatsApp onboarding contract **Slice 4 — Meta Provisioning / Subscription / Recovery**.

Fresh-audit first. Current evidence already shows the existing signed Meta webhook receiver, canonical Meta WhatsApp tenant routing/Vault resolver and omnichannel health surface exist, while no dedicated WABA `subscribed_apps` / provisioning-recovery authority was found. Extend the existing binding/setup-attempt/provider-health authorities only. Required Slice-4 concerns include WABA webhook subscription, provider/phone eligibility and registration evidence, partial completion, retry/reconciliation and ambiguous-success recovery. Do not create a second Meta provider adapter, second binding state, duplicate webhook receiver or new secret authority.

Same-number Business App Coexistence activation remains fail-closed and belongs to the later Coexistence/native-activity slice.

**Stable program cursor preserved for return after the owner-prioritized WhatsApp onboarding work:** `SECTION COMMERCE_PAYMENTS -> CATALOG-V2`.

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

## Latest continuation checkpoint — SALES-SCORING → SALES-PIPELINE-V2 — 2026-09-28

Always re-read runtime/current main before mutation.

Verified Production baseline:
- PR #326 merged to `main@f6b08675d8c3a83aa6dccd8790fe9b9077e1c7ea`;
- exact-head CI `36424281940`: SUCCESS;
- exact-main CI `36424607322`: SUCCESS;
- Cloudflare Production Deploy `36424885898`: SUCCESS on the same SHA;
- Production migration `0138_sales_scoring_governance` version `20260928125243`;
- `SALES-SCORING`: **IMPLEMENTED + CONTROLLED_TEST_VERIFIED + PRODUCTION_VERIFIED**;
- canonical accepted score truth remains on `public.leads`; no second score store/engine;
- Production has 19 real Leads and zero migration-created scoring revision/fit/engagement/override/model-suggestion/provenance rows;
- deterministic score, explicit human override and advisory model suggestion are separate authorities by contract;
- no SALES-SCORING-specific Supabase advisor regression.

Next bounded Work Package: `SECTION SEGMENT_SALES_MARKETING / SALES-PIPELINE-V2`.

Fresh pipeline audit must start from existing `crm_pipelines` / `crm_pipeline_stages` / `crm_deals` authority and current UI/API/runtime writers. Do not create a second pipeline/deal store. Verify multiple pipelines, configurable stages, weighted amount/probability/forecast, owner/team, expected close, stage policies, Won/Lost evidence and forecasting read models before choosing the smallest safe vertical slice.

## Latest continuation checkpoint — SEGMENT-SNAPSHOT → SALES-SCORING — 2026-09-28

Always re-read runtime/current main before mutation.

Verified Production baseline:
- PR #324 merged to `main@0e5e4e61be1d30c2ba134ed66a4ad1b2457a7c98`;
- exact-main CI `36411781776`: SUCCESS;
- Cloudflare Production Deploy `36411960392`: SUCCESS;
- Production migration `0137_segment_snapshot` version `20260928104942`;
- Production Segment definitions/versions/Snapshots/members = 0/0/0/0; no synthetic audience evidence;
- Snapshot creation is service-role-only SECURITY INVOKER, OWNER/ADMIN/SALES_MANAGER attributed, <=10,000 members, request-key-idempotent and atomic against one exact Segment semantic version;
- authenticated Organization members have RLS-governed read only; Snapshot UPDATE/DELETE is rejected;
- deferred integrity proves member_count + membership_hash against exact frozen ordered entity IDs;
- controlled PostgreSQL smoke proved Person and Deal Custom Field snapshots, replay, tamper rejection, historical reproducibility, tenant isolation, audit privacy and no outbound side effect;
- no Snapshot-specific advisor regression.

Disposition:
- `SEGMENT-V2`: **PRODUCTION_VERIFIED + CONTROLLED_TEST_VERIFIED**.
- `SEGMENT-SNAPSHOT`: **PRODUCTION_VERIFIED + CONTROLLED_TEST_VERIFIED**.

Next bounded Work Package: `SECTION SEGMENT_SALES_MARKETING / SALES-SCORING`.

Fresh scoring audit:
1. canonical Lead score truth already exists on `public.leads`: `opportunity_score`, `intent_score`, `score_reasons`;
2. existing deterministic runtime libraries include `lib/scoring/opportunity.ts`, `lib/scoring/intent.ts` and acquisition/Hunter qualification evidence;
3. do not create `lead_scores`, a second score store or a competing qualification engine;
4. required missing scope is governed fit + engagement components, structured evidence/reasons, explicit manual override with provenance/expiry/correction semantics, deterministic effective-score ownership, and model-assisted suggestions that never silently mutate canonical score truth;
5. preserve 0..100 bounds, tenant isolation, audit privacy, optimistic/idempotent mutation safety and no automatic outreach;
6. existing Hunter/prospect qualification remains acquisition evidence and must not be silently conflated with canonical CRM Lead scoring.

## Active continuation checkpoint — SEGMENT-V2 multi-entity implementation — 2026-09-28

Always re-read runtime/current main before mutation.

Verified baseline before this active branch:
- canonical main `72036a5b2609c770e54898343fe9031d62c8d8aa`;
- no open PR at branch start;
- canonical Segment authority remains `crm_segments + crm_segment_versions`, RLS enabled, Production rows 0/0;
- existing engine is DYNAMIC and LEAD-only; `SEGMENT-SNAPSHOT` remains separate.

Active branch: `feat/segment-v2-multi-entity`.

Bounded implementation rules:
1. extend the existing Segment authority only; no second Segment/rule/membership engine;
2. support `LEAD | PERSON | DEAL | ACCOUNT` from canonical authorities;
3. keep Person PII/display-name/free metadata out of predicates;
4. keep Account contact/enrichment prose and arbitrary JSON out of predicates;
5. Custom Field predicates are only Lead/Deal because current Custom Field authority supports only those entities;
6. preserve immutable semantic versions, depth <=4, <=8 children/group, <=20 leaves, request-key idempotency and tenant isolation;
7. dynamic evaluation is <=100 rows/page and has no Campaign/Workflow/provider side effect;
8. do not persist dynamic membership; immutable membership is owned by following `SEGMENT-SNAPSHOT`;
9. existing Lead Segment RPC/API behavior remains backward compatible;
10. do not claim Production completion until exact-head CI, merge, migration 0136, exact-main deploy and Production security/advisor/no-backfill checks pass.


## Latest continuation checkpoint — CRM-CUSTOMER360-V2 Support closeout → SEGMENT-V2 — 2026-09-28

Always re-read runtime/current main before mutation.

Verified Production baseline:
- main `eed2a07b0bda3ec87c57f7ee4c4062d40b351cd7`, PR #321 merged;
- exact-main CI `36403380564`: SUCCESS;
- Cloudflare Production Deploy `36403658680`: SUCCESS;
- Production migration `0135_crm_customer360_support_integration` version `20260928092811`;
- `get_crm_customer360_v2` is authenticated-only SECURITY INVOKER and now reads canonical Support Cases only through explicit `person_id`;
- Production has 0 People, 0 Support Cases, 0 Support SLA policies and 0 import batches; no synthetic acceptance data;
- Support context stays immutable; no Customer360 Support LINK/UNLINK mutation was added;
- internal Notes remain `CANONICAL_LINK_PENDING` because their scoped-inbox authorization must not be widened;
- Booking/Quote/Order/Invoice/Payment/Document/Consent remain explicit missing dependencies.

Current disposition:
- implemented Person/Lead/Conversation/Task/Deal/Support Customer360 composition: **PRODUCTION_VERIFIED + CONTROLLED_TEST_VERIFIED**;
- whole `CRM-CUSTOMER360-V2`: **PARTIAL / REQUIRED**.

Next bounded Work Package: `SECTION SEGMENT_SALES_MARKETING / SEGMENT-V2`.

Fresh Segment audit:
1. canonical authority is existing `crm_segments` + immutable `crm_segment_versions`; Production rows = 0/0;
2. RLS is enabled; existing RPCs are SECURITY INVOKER;
3. current schema/evaluator is deliberately `LEAD` + `DYNAMIC` only;
4. do not create `crm_segment_rules` or a second Segment engine;
5. extend typed predicate validation/evaluation to justified `PERSON`, `DEAL` and `ACCOUNT` entities using existing canonical authorities;
6. preserve bounded predicate depth/leaves, versioning, idempotency, audit, tenant isolation and no arbitrary SQL/JSONPath;
7. custom-field predicates remain governed and may only apply where the custom-field authority supports that entity;
8. saved views/lifecycle criteria may be implemented inside the existing Segment contract where evidence justifies them;
9. `SEGMENT-SNAPSHOT` is a separate following Work Package; do not silently persist current dynamic membership in SEGMENT-V2.


## Latest continuation checkpoint — CRM-DATA-QUALITY Production closeout — 2026-09-28

Always re-read runtime/current main before mutation.

Verified baseline:
- main `4a1cf8d0064bf6f35f82987e6b5f78c2ee2f3bc1`, PR #319 merged;
- exact-main CI `36401560832`: SUCCESS;
- Cloudflare Production Deploy `36401836383`: SUCCESS;
- Production migration `0134_crm_data_quality_foundation` version `20260928090829`;
- Production `crm_data_import_batches=0`, `crm_people=0`, Person links/relationships=0; no synthetic import evidence;
- read-only deterministic quality scan and bounded atomic verified Contact import are live over existing canonical CRM authorities;
- import apply is service-role-only SECURITY INVOKER; quality read is authenticated-only SECURITY INVOKER; receipt table has RLS and authenticated read-only grants;
- no Data-Quality-specific advisor regression was introduced;
- retention/purge remains `DEFERRED_WITH_REASON` until an approved Organization retention contract exists.

Disposition:
- Data-quality scan/import/validation/normalization/audit/bounded-bulk paths: **PRODUCTION_VERIFIED + CONTROLLED_TEST_VERIFIED**.
- Destructive retention execution: **DEFERRED_WITH_REASON**.
- Therefore do not call the entire Work Package globally complete.

Next bounded action:
1. fresh-audit `CRM-CUSTOMER360-V2` against current Support Case authority and existing Notes/Conversation/Task/Deal sources;
2. integrate only authorities that now actually exist; Support linkage is now justified;
3. do not fabricate Booking/Quote/Order/Invoice/Payment/Consent/Document truth if those modules are absent;
4. if Customer360 has no safe incremental gap, proceed to `SECTION SEGMENT_SALES_MARKETING / SEGMENT-V2`;
5. preserve exact Production evidence and no-parallel-truth rules.


## Latest continuation checkpoint — CRM-SUPPORT-CASE → CRM-DATA-QUALITY — 2026-09-28

Always re-read runtime/current main before mutation.

Verified Production baseline:
- main `ec70f9e60cc8ece014c0ca1ba50a20a2c8badecb`;
- PR #317 Support Case + SLA merged; PR #318 FK-index hardening merged;
- Production migrations `0132_crm_support_case` and `0133_crm_support_case_fk_index_hardening` are live;
- exact-main CI `36376715097`: SUCCESS;
- Cloudflare Production Deploy `36376910976`: SUCCESS;
- Production Support Cases = 0; SLA policies = 0; no synthetic support evidence;
- Support reads are RLS-governed authenticated paths; trusted mutations are service-role-only SECURITY INVOKER; no Support-specific FK advisor regression remains.

Current bounded Work Package: `SECTION IDENTITY_CRM / CRM-DATA-QUALITY`.

Active branch: `feat/crm-data-quality-foundation`.

Rules for this slice:
1. reuse Identity Graph exact duplicate/conflict candidates and existing MERGE/SPLIT/UNLINK; never build a second dedupe engine;
2. quality scan is deterministic/read-only and may surface exact Business/Identity anomalies without fuzzy auto-merge;
3. verified Contact import targets existing canonical Business + Identity + Person + Person-Business relationship authorities;
4. import is atomic, bounded to 100 rows / 256 KiB, request-key idempotent and OWNER/ADMIN/SALES_MANAGER governed;
5. ambiguous identity-to-Business evidence fails the entire batch closed;
6. import receipt/audit stores counts/hash only, never raw imported PII;
7. no Production import batch may be fabricated merely to prove the happy path;
8. irreversible retention/purge remains DEFERRED_WITH_REASON until an approved Organization legal/business retention contract exists;
9. PostgreSQL 17 dedicated smoke, exact-head CI, merge, Production migration, exact-main deploy and advisors are mandatory before Production completion is claimed.



## Latest continuation checkpoint — CRM-ACTIVITY-TASK-V2 → CRM-SUPPORT-CASE — 2026-09-28

Always re-read runtime/current main before mutation.

Verified baseline:
- main `11599810d8ffebd081e3571859c1bc3588a08ebe`, PR #316 merged;
- exact-main CI `36371693852`: SUCCESS;
- Cloudflare Production Deploy `36371846971`: SUCCESS;
- Production migration `0131_crm_activity_task_v2` version `20260928025600`;
- Production `crm_tasks=0`; no synthetic Task or recurrence evidence;
- `CRM-ACTIVITY-TASK-V2` internally controlled current scope is Production-verified; recurrence and Booking/Order/Case links remain dependency/evidence gated.

Fresh dependency audit:
- `CRM-CUSTOM-OBJECTS`: defer until a real use case proves a typed object schema; existing custom-field governance is not permission to create arbitrary EAV objects.
- `CRM-SUPPORT-CASE`: no canonical Case authority existed, while Omnichannel/Customer360 prove the use case. Selected as the next bounded Work Package.
- `CRM-DATA-QUALITY`: remains required after Support Case; identity merge/split/conflict controls cover only part of it.

Active implementation: PR #317 / branch `feat/crm-support-case`.
The slice may create the first canonical Support Case + Smart Core SLA policy authority, link only to existing Account/Person/Conversation truth, keep Order/Payment links absent until those modules exist, use service-bound optimistic-versioned mutations, RLS reads, bounded audit and a real operator surface. It is not Production evidence until exact-head CI, merge, Production migration, exact-main deploy and post-apply verification succeed.


## Latest continuation checkpoint — CRM-ACCOUNT-V2 Production-verified — 2026-09-28

Always re-read runtime/current main before mutation.

- canonical main: `88a6ab7f1b4f4241ea031deda85b5cecd66b7bc1`, PR #314 merged;
- exact-main CI `36370424412`: SUCCESS;
- Cloudflare Production Deploy `36370581976`: SUCCESS on the same SHA;
- Production Worker: `dc6142da-42d9-42f4-9bf0-6d38be7bf358`;
- Production Supabase migration: `crm_account_v2_governance` version `20260928023612`;
- `public.businesses` remains canonical external Company/Account truth; no second Account store exists;
- `tenant_businesses` / `branches` remain internal tenant operating hierarchy;
- Production Businesses: 19 total, all 19 `UNCLASSIFIED`, 0 owner assignments, 0 external Account hierarchy links. Do not fabricate lifecycle/ownership/hierarchy evidence;
- `crm_person_business_relationships` remains canonical Contact relationship authority;
- Account read is authenticated-only + SECURITY INVOKER; owner/lifecycle/hierarchy mutations are service-role-only + SECURITY INVOKER; RLS and governance trigger are live;
- advisor output has no new Account-specific security/FK regression;
- Shadow Mode ON, Global Kill Switch OFF; Chatwoot external provisioning still disabled because Platform token GitHub secret is unconfigured.

Disposition: `CRM-ACCOUNT-V2` internally controlled paths are **PRODUCTION_VERIFIED**.

Next bounded action:
1. audit current main + Production for `CRM-CUSTOM-OBJECTS`, `CRM-ACTIVITY-TASK-V2`, `CRM-SUPPORT-CASE`, `CRM-DATA-QUALITY`;
2. reuse existing custom-field/task/deal/identity authorities;
3. do not create duplicate object/task/case/data-quality stores;
4. select the first verified missing dependency and implement it as one bounded vertical slice;
5. preserve no-fabrication, tenant isolation, bounded bulk operations and exact Production evidence.



## Latest continuation checkpoint — CRM-CUSTOMER360-V2 → CRM-ACCOUNT-V2 — 2026-09-28

Always re-read runtime/current main before mutation. The verified baseline at this checkpoint is:

- canonical main: `77917d7722099b0b998dff8fd3aac94bf1f9fe4b`, PR #313 merged;
- exact-main CI `36365898775`: SUCCESS;
- Cloudflare Production Deploy `36366058009`: SUCCESS on that exact SHA;
- Production Supabase head: `0129_crm_customer360_v2_person_context` version `20260928012548`;
- Customer 360 Person context is evidence-backed only. Production has 19 Leads and 12 Conversations but zero Person links because Production still has zero canonical People. No synthetic backfill was created;
- Customer 360 read/mutation functions are SECURITY INVOKER; read is authenticated-only; LINK/UNLINK is service-role-only; RLS remains enabled;
- the implemented Person-centric composition over Leads/Conversations/Tasks/Deals is Production-verified, but the whole `CRM-CUSTOMER360-V2` Work Package remains partial because Notes linkage and Booking/Quote/Order/Invoice/Payment/Support/Document/Consent depend on still-open modules;
- `public.businesses` is the canonical external/prospect/customer Company/Account authority. Do not create `crm_accounts`;
- `tenant_businesses` / `branches` are the tenant's own operating hierarchy and must remain separate from external CRM Account hierarchy;
- Production currently has 19 `businesses`, 0 `tenant_businesses`, 0 `brands`, 0 `branches`, 0 `departments`, 0 `teams`, and 0 Person-Business relationship rows.

Current bounded Work Package: `SECTION IDENTITY_CRM / CRM-ACCOUNT-V2`.

Implementation branch `feat/crm-account-v2-governance` must:
1. extend `public.businesses` rather than create a second Account table;
2. add evidence-backed external Account hierarchy, Account ownership and B2B lifecycle without reclassifying the 19 existing Production Companies;
3. reuse `crm_person_business_relationships` for Contacts;
4. keep hierarchy cycle-safe and Organization-bound;
5. keep browser mutation fail-closed behind service-role commands with OWNER/ADMIN/SALES_MANAGER governance;
6. provide bounded RLS-governed read/API/UI surfaces;
7. run dedicated PostgreSQL 17 smoke plus full CI before merge;
8. apply Production migration only after exact PR head is green and merged;
9. verify Production row counts/grants/RLS/advisors with no synthetic Account governance data;
10. reconcile docs only from observed merge/deploy/migration evidence.


## Latest continuation checkpoint — CRM-IDENTITY-GRAPH — 2026-09-28

Always re-read runtime/current main before mutation. The verified baseline at this checkpoint is:

- canonical main: `c5710ac556faea883745f8656bf0b6c0afc2506f`, PR #311 merged with exact expected head `1b46af4da044efe6df26dfd7ca3874c471584b99`;
- exact-main CI #1495: SUCCESS, including PostgreSQL 17 migration-chain and dedicated CRM identity-graph smoke;
- Cloudflare Production Deploy #975: SUCCESS on the same SHA; candidate Worker `7a4f60cc-d9fa-41af-ae0d-9094e9ffe3fb`, Production Worker `e641d560-637f-4d65-9f6b-7cbc2a1c12d1`;
- Production Supabase head: `0128_crm_identity_graph_resolution` version `20260928004331`;
- `CRM-PERSON-CONTACT` foundation (#309/#310) and `CRM-IDENTITY-GRAPH` (#311) extend canonical `crm_people`, `crm_identities`, `crm_identity_links`, `crm_person_identity_links` and `crm_person_business_relationships`; no second Person/CRM/Account/identity store exists;
- exact identity conflicts are surfaced with evidence IDs; manual MERGE/SPLIT/UNLINK are governed; ambiguous/cross-Organization/orphaning operations fail closed; no fuzzy or display-name-only auto-merge exists;
- Production mutation RPCs are service-role-only and SECURITY INVOKER; candidate read is authenticated-only; relevant public tables retain RLS;
- Production still has 0 People, 0 Person-identity links and 0 Person-business relationships. Do not create synthetic People/conflicts/acceptance receipts merely to exercise the happy path;
- Shadow Mode remains ON; Global Kill Switch OFF; Chatwoot external provisioning remains disabled; no outbound provider side effect was invoked by the deployment smoke;
- exact generic unmerge remains `DEFERRED_WITH_REASON`; merge lineage plus split/unlink correction paths are retained instead of promising a lossy inverse.

Next bounded Work Package: fresh audit of `SECTION IDENTITY_CRM / CRM-CUSTOMER360-V2`.

Before designing that slice:
1. re-read current main/open PRs/CI/Production migrations and current master/completeness requirements;
2. audit canonical `crm_people`, identities/links, Person-Business relationships, `crm_customer_timeline`, `leads`, `sales_conversations`, Deals/Pipelines, Tasks and any current Notes/Consent/Documents/Booking/Quote/Order/Invoice/Payment/Support sources;
3. build a governed Customer 360 composition over existing authorities; do not create a second customer/activity/conversation/deal/task store;
4. do not add `person_id` to historical authorities merely for visual convenience. Introduce a link only when a canonical evidence and lifecycle contract justifies it;
5. integrate modules that actually exist; for absent booking/order/payment/support/etc. preserve typed integration boundaries without fake rows, fake success or duplicate truth;
6. preserve tenant isolation, scoped authorization, deterministic pagination, bounded queries, auditability and no-cross-tenant behavior;
7. if the fresh audit proves `CRM-ACCOUNT-V2` or `CRM-DATA-QUALITY` is a hard prerequisite, follow that dependency and document why instead of forcing the planning order.

Older continuation sections below are historical where they conflict with this checkpoint.


## Latest continuation checkpoint — TikTok / SMS-RCS / controlled Voice — 2026-09-28

Always re-read runtime/current main before mutation. The verified baseline before this documentation reconciliation is:

- canonical runtime main: `70a83c0a94d1a1e6613c222a6688ce3c450a4df0` after PR #307;
- PR #302/#303: TikTok fail-closed capability + health foundation; Production migration `0124_omni_tiktok_capability_foundation` live as `20260927201116`;
- PR #304/#305: SMS/RCS fail-closed capability + readiness/routing policy; Production migration `0125_omni_sms_rcs_capability_foundation` live as `20260927212408`;
- PR #306/#307: controlled WhatsApp AI audio-reply foundation + execution through the existing approved-send boundary;
- exact-main CI run `36356555098`: SUCCESS;
- Cloudflare Production Deploy run `36356705964`: SUCCESS on the same SHA, including candidate smoke, controlled SSR load, exact-bundle promotion, Worker Route verification, routed smoke and safe rejection smoke;
- Production TikTok: one disabled + `NOT_CONFIGURED` organization integration, `tiktok_ai_paused=true`, zero bindings;
- Production SMS/RCS: zero bindings, `sms_ai_paused=true`, `rcs_ai_paused=true`; no provider was selected or fabricated;
- Production Voice safety: Shadow Mode ON, Global Kill Switch OFF, WhatsApp AI pause OFF, Agents pause OFF, `voiceReply` runtime config null;
- post-#307 Production verification: zero `VOICE_REPLY_TTS` usage events and zero `AUDIO_SENT` WhatsApp events since merge;
- controlled voice reply remains `INTERNAL_TEST` only and requires the existing Meta/OpenAI connection, 24-hour service window, no human takeover, disclosure, conservative Cost Guard reserve and approved MP3 TTS model;
- voice cloning and telephony are not activated.

Disposition:

- `OMNI-TIKTOK`: internal fail-closed foundation/health deployed; real provider webhook/send execution remains evidence-gated.
- `OMNI-SMS-RCS`: internal capability/readiness policy deployed; provider/country/permission/pricing/real-send acceptance remains evidence/configuration-gated.
- `OMNI-VOICE`: controlled WhatsApp audio-reply slice is Production-verified for the safe no-send/default path; broader telephony/voice-agent, recording-retention/consent and call-outcome scope remains open and must not be reported complete.

Next safe code-first Work Package: `SECTION IDENTITY_CRM / CRM-PERSON-CONTACT`.

For that continuation:
1. re-read `AGENTS.md`, current main/open PRs, Production Supabase, current Cloudflare Production and the current master/completeness docs;
2. audit existing `leads`, `crm_identity_links`, `crm_customer_timeline` and related APIs before adding schema;
3. extend canonical CRM truth rather than creating a second customer/identity store;
4. create Person/Contact only from sufficient evidence; never fabricate a person from a provider display name;
5. preserve tenant/business scope, merge/split evidence, no-cross-tenant guarantees and existing channel identity links;
6. keep provider-gated Omnichannel activation blocked until real supported credentials/contracts/evidence exist.

## Latest continuation checkpoint — OMNI-TELEGRAM — 2026-09-27

Always re-read runtime/current main before mutation. The verified baseline before this documentation reconciliation is:

- canonical runtime main: `6532693d7cc653e6611af0fea3ba4eea432d6feb`;
- PR #298 merged tenant-bound customer Telegram messaging while preserving the existing Owner Assistant as a separate control plane;
- PR #299 merged only Telegram activation-receipt FK index hardening surfaced by the Production advisor;
- Production Supabase is live through `0123_telegram_activation_acceptance_fk_index_hardening` version `20260927172358`; `0122_omni_telegram_customer_foundation` is live as version `20260927171724`;
- exact-main CI #1452: SUCCESS;
- Cloudflare Production Deploy #932: SUCCESS on the same SHA;
- Candidate Worker: `f1d716c9-dfe7-43b5-8b52-2e83435570c8`;
- Production Worker: `0c1a6d02-de44-4603-804f-81e807a1f672`;
- Production deployment smoke invoked no outbound provider send;
- Chatwoot Platform token remains unconfigured; Production provisioning remains disabled;
- independent OVH smoke: Chatwoot 200, Smart Core login 200, unauthenticated integrations 307, invalid Owner Telegram secret 401, nonexistent customer binding 404;
- Shadow Mode remains ON, Global Kill Switch OFF, Telegram customer AI pause ON;
- Telegram customer integration is disabled + NOT_CONFIGURED with 0 bindings, 0 events and 0 acceptance receipts;
- no fake tenant, Bot token or activation evidence was created;
- service-only Telegram customer journals/resolvers/reconciliation/acceptance remain fail-closed and separate from Owner Assistant authority;
- post-0123 advisors have no Telegram activation-receipt unindexed-FK finding; unused-index INFO is expected before real traffic.

`OMNI-TELEGRAM` is internally implemented/deployed and **PRODUCTION_VERIFIED** for the controlled schema/security/runtime paths above. Real tenant Bot connection plus real inbound/outbound/media acceptance remains **BLOCKED_EXTERNAL**.

Important verification caveat: the current CI PostgreSQL migration-chain command still explicitly enumerates migrations only through `0101`. CI #1452 is valid for lint/typecheck/tests/build/Vinext/scheduled verification, but it must not be cited as direct SQL execution evidence for migrations `0122/0123`. Those migrations are proven by successful Production application and post-apply runtime/schema/advisor verification. Close the CI chain-coverage gap without redesigning the migration architecture.

The next bounded Omnichannel Work Package after Telegram reconciliation is `SECTION OMNICHANNEL / OMNI-TIKTOK`. Before implementation, revalidate current official TikTok Business Messaging API access, authentication, webhook signature/event contract, supported message/media capabilities and tenant eligibility. Do not create a fake TikTok adapter if exact official provider contracts are unavailable. Reuse canonical tenant bindings, Vault authority, CRM identity, Chatwoot projection, send safety, reconciliation and health; do not create another channel truth.

## Latest continuation checkpoint — OMNI-CHANNEL-HEALTH — 2026-09-27

Always re-read runtime/current main before mutation. The verified baseline before this documentation reconciliation is:

- canonical runtime main: `8e857ae9cc68310e53ce89dac2c39399871f8f1b`;
- PR #295 merged the evidence-derived unified channel-health aggregator + Connection Center surface and the disabled/NOT_CONFIGURED Messenger bootstrap;
- PR #296 merged bounded provider quota/rate evidence for Resend + Meta provider boundaries;
- exact-main CI #1441: SUCCESS;
- Cloudflare Production Deploy #921: SUCCESS on the same SHA; Production Worker `0ece4443-c100-48c4-8da4-e86b12be3c92`;
- Production Supabase is live through `0121_omnichannel_channel_rate_limit_evidence_index` version `20260927155456`;
- `0120_omnichannel_health_messenger_bootstrap` is live and Messenger remains disabled + NOT_CONFIGURED;
- unified health reads existing integration/binding/event/readiness/acceptance/control authorities; no channel-health table or second source of truth was added;
- quota evidence uses existing `audit_logs`, persists bounded summaries only, and never stores raw provider headers/tokens/business IDs;
- telemetry failure is non-authoritative and cannot cause resend after provider acceptance;
- real quota evidence count is still 0, so provider quota health correctly remains unknown until real provider responses are observed;
- independent Production smoke: Chatwoot 200, Smart Core login 200, unauthenticated integrations 307, invalid Owner Telegram webhook secret 401;
- Shadow Mode remains ON; Global Kill Switch OFF; Instagram/Messenger/Web Chat AI pauses remain ON.

`OMNI-CHANNEL-HEALTH` is internally implemented/deployed and Production-verified for the controlled infrastructure/read-model/security paths above. Do not mark provider-specific live quota/real-tenant acceptance green without evidence.

Dependency audit selected the next bounded Work Package as `SECTION OMNICHANNEL / OMNI-TELEGRAM`. Important boundary: the existing Telegram Owner Assistant is an owner control plane and MUST remain separate from customer Telegram messaging. Do not reuse its global `TELEGRAM_BOT_TOKEN`, owner webhook journal or owner authorization as customer-channel authority.

For customer Telegram:
- extend the existing canonical communication/identity/channel constraints; do not create a second CRM, Conversation store, queue or Telegram inbox;
- use a tenant/business/Branch channel binding and a tenant-specific server-side/Vault bot credential contract;
- use the official Telegram webhook `secret_token` / `X-Telegram-Bot-Api-Secret-Token` authenticity mechanism and `update_id` for replay/idempotency evidence;
- reuse canonical CRM identity, Chatwoot projection, send safety, DNC/suppression, human takeover, audit and reconciliation;
- keep the customer adapter inactive until evidence-backed readiness/acceptance exists;
- do not fabricate a Telegram tenant or Bot token for Production acceptance.

## Latest continuation checkpoint — OMNI-WEBCHAT — 2026-09-27

Always re-read runtime/current main before mutation. The evidence-backed baseline before this documentation reconciliation is:

- canonical main: `e8c2f127c7d7483e6095d7f5d07aa69cc7c9daa4`;
- PR #292 merged the bounded OMNI-WEBCHAT attachment-delivery/readiness/Connection-Center slice;
- PR #293 merged Web Chat acceptance-receipt FK index hardening only;
- exact-main CI #1423: SUCCESS;
- Cloudflare Production Deploy #903: SUCCESS on the same SHA, Production Worker `55ddcf6d-6893-4fc9-94a0-66ddbf0ced11`;
- Production Supabase head: `0119_web_chat_acceptance_fk_index_hardening` version `20260927144538`;
- `0118_web_chat_outbound_attachments_readiness` version `20260927144031` is live;
- Chatwoot Production remains `https://inbox.smartvisionsai.com` on the OVH VPS; Smart Core remains Cloudflare + Supabase;
- signed Chatwoot public outgoing messages now reconcile attachment metadata into the existing canonical `conversation_messages` store;
- visitor attachment bytes are delivered only through a session/origin/public-key/conversation/message/account-bound Smart Core proxy with no direct Chatwoot storage URL in the browser;
- Web Chat readiness and acceptance use evidence-derived service-only contracts; no caller-provided success boolean exists;
- Web Chat Connection Center health is derived from canonical binding/widget/inbox/evidence/control state, not from a second integration truth;
- Production fake-origin/key/session attachment and upload probes fail closed with HTTP 403;
- Production still has no real Web Chat binding/widget/session/event/message/acceptance receipt. No synthetic activation evidence was created;
- Shadow Mode remains ON, Web Chat AI pause remains ON and Global Kill Switch remains OFF;
- post-0119 advisor evidence has no Web Chat acceptance-receipt unindexed-FK defect; the service-only RLS/no-policy INFO is intentional.

`OMNI-WEBCHAT` is internally implemented/deployed and Production-verified for the directly observable infrastructure/security paths above. Real tenant end-to-end happy-path acceptance remains `BLOCKED_EXTERNAL / GAP-09`.

Do not reopen OMNI-WEBCHAT by inventing another Web Chat store, Chatwoot integration or health authority. Before selecting the next Work Package, re-read current `MASTER_PROGRAM_SECTIONS.md`, compare current runtime gaps, and follow the closest verified dependency. The current Web Chat work has already established a partial `OMNI-CHANNEL-HEALTH` slice, but the whole cross-channel health Work Package must be audited before it can be selected or declared complete.

## Product completeness and customer connection requirements

Read [PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md](PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE.md) before selecting or closing a Business OS delivery package. It preserves the owner-requested full-product scope, simple official customer connection journey, verified multi-business WhatsApp gaps, detailed acceptance gates and the complete Work Package coverage index. It extends acceptance under this roadmap; it does not replace architecture, renumber Work Packages or authorize provider activation. Keep its requirement dispositions and this handoff traceable to implementation and Production evidence.


## 24-hour full-product scope lock — 2026-09-27

Owner reconfirmed that the target is the complete Business OS 2027. Preserve the union of Phase 0–12, all current `MASTER_PROGRAM_SECTIONS` Work Packages and all applicable `PRODUCT_COMPLETENESS_AND_CONNECTION_ACCEPTANCE` requirements. Do not reduce scope because a provider/API/payment credential is pending.

Verified implementation baseline before this documentation synchronization:

- `main@bae105697bdb68cb8b25494cf8303e6efe1a6d81`;
- PR #260 governed Unified Inbox status/labels/assignee/Team backend action bridge is merged;
- Production migration `0098_comm_unified_inbox_actions` is live;
- PR #261 action-claim policy consolidation is merged; exact-main CI #1341 and Cloudflare Production Deploy #821 succeeded;
- Production migration `0099_comm_unified_inbox_action_claim_policy_consolidation` is live;
- fresh Production evidence still shows 0 Brand, tenant Business, Chatwoot Account/User/Membership/Inbox/Team mappings and 0 Unified Inbox projections; Shadow Mode remains ON;
- therefore live-tenant Chatwoot action acceptance remains blocked by the explicit real-tenant/API activation gate, not by missing internal action code.

Immediate bounded continuation inside `COMM-UNIFIED-INBOX`: wire the governed actions into operator UI, complete internal notes, then complete scoped attachment authorization/read bounds. In parallel, continue code-ready provider/API connection work so receipt of a real credential is activation/configuration, not the start of architecture.

## Delivery model checkpoint — compact vertical slices, full scope

This program does **not** plan or report future work by PR count.

Use `SECTION -> WORK PACKAGE ID -> verified runtime gap -> implementation evidence -> acceptance gate` as the only stable continuation model.

Delivery must follow `DELIVERY_PACKAGING_STANDARD.md`:

- prefer coherent vertical slices over one-Work-Package-per-PR fragmentation;
- combine compatible audit, schema, API/runtime, authorization, tests, required UI, migration/rollback and documentation work when they share one bounded context and one safe promotion boundary;
- split only for a real independent security, migration, provider, financial, rollback or Production-verification gate;
- do not pre-schedule separate audit/hardening/index/docs PRs by habit;
- no approved Work Package may disappear to make delivery look smaller;
- completion is measured by Work Package acceptance criteria and Section exit gates, not PR volume;
- actual PR numbers are evidence only after they exist.

Owner preference is compact, high-throughput delivery, but there is no hard PR cap. Architecture, tenant isolation, safety, rollback, testing, observability and complete product scope remain non-negotiable.

This delivery-policy change was prepared from verified `main@4d1da421c9c0242398926f637bc343285cbe6f7a`; always re-read current main before the next mutation.


## Latest continuation checkpoint — COMM-UNIFIED-INBOX — 2026-09-26

Always re-read runtime/current main before mutation. At this checkpoint the verified baseline is:

- canonical repository main: `a9e5a7387d6d4602e5ed363361761f187868d757` after PR #257;
- exact-main CI #1332: SUCCESS;
- Cloudflare Production Deploy #812: SUCCESS on the same SHA, including release-candidate smoke, controlled SSR load, Production promotion, route verification, routed Production smoke and safe rejection smoke;
- Production Supabase is live through `0097_comm_unified_inbox_read_state_rls_initplan`;
- `0093`: scoped Unified Inbox security boundary;
- `0094`: signed Chatwoot webhook journal -> idempotent projection reconciler;
- `0095`: Unified Inbox FK index hardening;
- `0096`: bounded read model + deterministic cursor pagination + scoped counters + per-user read/open state;
- `0097`: read-state RLS initPlan hardening with authorization semantics unchanged;
- the real `/conversations` page and recent-chat rail now consume the bounded Unified Inbox read model rather than issuing their old direct list query against `sales_conversations`;
- opening a conversation uses the governed mark-read RPC, so unread state is per operator rather than globally shared;
- search/filter support in the real UI includes primary stage/human/unread filters plus bounded customer/summary/intent search, channel, Chatwoot status and exact label; Branch/Team remain supported by the read-model contract for scoped/hierarchy-aware callers;
- owner-reply and Take Over / Resume AI paths remain the existing canonical implementations and were not replaced by this work;
- Smart Core remains authority for tenant/business/CRM/identity/permissions/provider credentials/provider send authority/safety; Chatwoot remains Communication Plane only;
- Chatwoot Production is on the OVH VPS at `https://inbox.smartvisionsai.com`. Do not move Production work back to Railway;
- no new Chatwoot Platform token or provisioning activation was introduced;
- no parallel CRM, Conversation store, queue/outbox, tenant model, IAM or Chatwoot integration was created.

Next safe Work Package inside `SECTION COMMUNICATION / COMM-UNIFIED-INBOX`:

1. verify current projection/API/runtime state again;
2. add governed reconciliation/actions for Chatwoot status, labels, assignee and Team transfer using the existing projection and canonical Smart Core scope;
3. add internal-note behavior without turning Chatwoot into CRM authority;
4. enforce attachment read bounds and scoped access;
5. extend the existing UI only after those action/read boundaries are proven;
6. preserve existing owner manual reply, DNC/suppression, WhatsApp 24-hour rule, Cost Guard and human-takeover controls;
7. keep Railway out of the Production path.

Do not activate Chatwoot provisioning or Platform-token runtime merely to exercise these features. Do not fabricate tenant/customer evidence.

## Current continuation checkpoint — 2026-09-26

Use this checkpoint before every older section below, but always re-read runtime/current main first.

- Current verified baseline before this policy-closeout package: `main@039083c38e87dc6c24bf2906cce9d7d763972f3f` after PR #250.
- PR #250 completed external-first lower-scope demotion orchestration. Exact-main CI and Cloudflare Production Deploy are SUCCESS.
- Production Supabase is live through `0092_chatwoot_external_first_scoped_demotion` as version `20260926105514`. The immutable reduction receipt table exists and contains zero Production rows because no real Chatwoot tenant projection has been activated.
- Production Chatwoot remains healthy on the dedicated OVH VPS; Smart Core remains Cloudflare Workers + Supabase; Railway remains Candidate/rollback evidence only.
- Production still has zero Brand, tenant Business, Branch, Department, Team, Chatwoot AccountUser, Inbox and Team projection rows. Do not fabricate tenant data.
- Shadow Mode remains ON. Latest verified post-merge outbound deltas are zero for outreach, WhatsApp and Email.
- `CHATWOOT_PLATFORM_TOKEN` remains absent and `CHATWOOT_PROVISIONING_ENABLED=false`. Keep provisioning off until the real tenant/token/explicit-activation gate is reviewed.
- C5 native-access policy is now source-backed and closed: Chatwoot AccountUser + native SSO is Business-wide only. OWNER -> administrator; Business-wide ADMIN/SALES_MANAGER/SALES_AGENT -> agent; Business-wide VIEWER -> no AccountUser/SSO.
- Scoped-only BRANCH/DEPARTMENT/TEAM staff must not receive native Chatwoot AccountUser/SSO. Chatwoot Community v4.18.0 ContactPolicy allows ordinary agents to list/search/show/update/create Account-wide Contacts, so native AccountUser would be broader than canonical Smart Core scope.
- Scoped-only staff are therefore served by the future Smart Core `COMM-UNIFIED-INBOX`, where Branch/Department/Team scope can be enforced before conversation/contact/action exposure.
- The SSO adapter now recomputes live Business-wide Smart Core authority before issuing a Platform login URL and requires it to match the stored ACTIVE AccountUser role, preventing stale native SSO after canonical Business-wide authority disappears.
- `COMM-TENANT-BRIDGE` implementation boundary is closed in code/security policy. Its Production activation remains a separate operational release gate requiring real tenant data, server-only Platform token staging, explicit provisioning activation and runtime verification.
- Do not fabricate activation evidence. Continue with the next safe implementation package while preserving the activation gate; scoped-only human UX belongs in `COMM-UNIFIED-INBOX`.

## Superseding continuation checkpoint — 2026-09-26

Use this checkpoint before older historical notes in this file.

- Current canonical repository main: `3c3443389a5d7edfdf3230387cf16b1ec75a3a1e` after PR #236.
- Exact-main CI #1253 and Cloudflare Production Deploy #733 are green.
- Chatwoot Production source plane is live on the dedicated OVH VPS at `57.131.156.171`.
- Public communication-plane URL: `https://inbox.smartvisionsai.com`; Caddy/Let's Encrypt TLS, `/health=200` and `/app/login=200` are verified.
- Dedicated Chatwoot PostgreSQL + authenticated Redis are local to the VPS and separate from Smart Core Supabase.
- Attachments: OVH S3 `smartvisions-chatwoot-prod`, Frankfurt 1-AZ, Versioning enabled, Rails S3 roundtrip verified.
- Off-host database backup: OVH S3 `smartvisions-chatwoot-backups`, Paris 3-AZ, Versioning enabled, daily 02:17 UTC, upload/download checksum and isolated restore verified.
- First owner was provisioned privately. Account signup is disabled and public installation onboarding is blocked.
- PR #236 fixes the mobile onboarding layout and is merged at `main@3c3443389a5d7edfdf3230387cf16b1ec75a3a1e`. Exact-main CI #1253 and Chatwoot Source Image #37 are SUCCESS. Production is canonicalized to `ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-3c3443389a5d7edfdf3230387cf16b1ec75a3a1e@sha256:22cb4663d0369b6d7954b32beb1f124e1699eaa5405239899ddd617be31942d6`; prepare exited 0 and public health/login, Community-only provenance, responsive onboarding source, S3 Active Storage, Puma/Sidekiq/PostgreSQL/Redis all re-verified.
- Production runtime contains no Railway hostname/dependency. Railway `smartvisions-chatwoot-candidate` is temporary rollback evidence only and must not be destroyed without explicit destructive approval.
- Keep native Chatwoot provider channels, API Inbox, real customer/contact projection and provider sends OFF.
- Smart Core remains canonical for tenant/business/customer/CRM/provider credentials/provider send authority/safety.
- Continue at: `SECTION COMMUNICATION / COMM-TENANT-BRIDGE`.
- Never fabricate a tenant Business or Chatwoot Account merely to populate the UI. External provisioning requires evidence-backed real tenant scope.


## Repository truth

Repository: `hamed665/smartvisions`

Business OS status as of 2026-09-23:

- Phase 0 merged in PR #172 at `main@144906c8f72c368851f8c4efb3e85dff8627f863`.
- Phase 1 Control Plane Foundation merged in PR #173 at `main@01d74f7c8d333c017f8f4790d7bc3e4a7d1f6ca4`.
- Migration `0068_business_os_control_plane_foundation` is live in Production as migration version `20260922100907`.
- Production verification passed for schema, RLS, grants, SECURITY INVOKER boundaries, usage classification, audit correlation, runtime safety controls and empty initial Control Plane catalog data.
- Supabase security-advisor findings after 0068 are unchanged from the pre-0068 baseline.
- The 15 post-0068 unindexed-FK findings were cleared by PR #174 / Production migration `0069_business_os_control_plane_fk_indexes` version `20260922101641`.
- Phase 2 semantic adapter/status slice merged in PR #175 at `main@5d812eee8a0e15dac658247b254660ae8f09aacd`.
- Post-merge Production heartbeat was healthy, Shadow Mode remained ON, acquisition/dispatch were SKIPPED, and no Email/WhatsApp outbound send occurred in the verification window.
- Phase 2 reconciliation/provider-identity slice merged in PR #176 at `main@a5396156afc58a22cdf78baf7a495fb07ec38b40`.
- Phase 2 is complete for current Production-proven Email/Resend and WhatsApp/Meta Cloud channels.
- Post-PR #176 Production verification: heartbeat `failed=0`, Shadow Mode ON, acquisition/dispatch SKIPPED, and zero Email/WhatsApp outbound rows after the merge.
- Phase 2 reuses the current canonical Email/WhatsApp send gate, provider implementations, journals, lifecycle/reconciliation evidence and Human takeover semantics.
- Phase 2 closeout merged in PR #177 at `main@e677407bce74818e5d5c8fea4643fb9706acbefb`.
- Phase 3 Slice 1 CRM Identity Foundation merged in PR #178 at `main@27e980e417ec52c64055c029b8ffa6c6c77ab961`.
- Production migration `0070_crm_identity_foundation` is live as version `20260922164110`.
- Production verification after 0070: 47 identities, 47 identity links, zero conflicts, zero cross-tenant mismatches, Shadow Mode ON, heartbeat `failed=0`, and zero Email/WhatsApp outbound rows after the merge.
- Cloudflare runtime after PR #178 is proven by Worker version `562c495f-ceeb-4021-b2d9-122ddc04021b`.
- Phase 3 still reuses `businesses` as canonical Company/Account and `leads` as the existing Lead/Opportunity foundation; it does not create a parallel CRM.
- A Person/Contact row is deliberately not fabricated from provider display names.
- Phase 3 Slice 2 Customer 360 Timeline merged in PR #179 at `main@efcf979ff15d32062b48928672a25128c521987a`.
- Production migration `0071_customer_360_timeline` is live as version `20260922202957`.
- Production Timeline evidence: 85 rows across 9 Businesses; 65 CUSTOMER / 20 INTERNAL; zero duplicate customer provider IDs; zero provider-journal standalone rows; zero customer-visible unsent rows.
- Timeline view/RPC remains SECURITY INVOKER and authenticated-only. Existing service-role restrictions on handoff/reply/operator tables were not widened.
- Cloudflare Production Deploy #332 succeeded on exact merge SHA; Production Worker version is `a78567d8-e4f9-484e-a62b-2bd8e47b8583`.
- Candidate smoke, controlled load, route verification, routed production smoke and safe API/webhook rejection smoke all passed; deployment smoke sent no provider message.
- No customer/provider message was sent for timeline architecture verification.
- Shadow Mode remains ON.
- Phase 3 Slice 3 CRM Task Foundation merged in PR #181 at `main@4c2a4d3bc78a57088f92ba8eae82542d501a37dc` and is live as Production migration `0072_crm_task_foundation` version `20260922214407`.
- Post-0072 FK cleanup merged in PR #182 at `main@1eab75f73a5ae99a973e5616bb30c09325b9a680` and is live as Production migration `0073_crm_task_fk_indexes` version `20260922214843`.
- Activity remains existing immutable evidence and Customer 360 Timeline; `crm_tasks` is only actionable human work.
- Production Task rows remained zero after migration and rollback-only smoke; no historical follow-up/handoff/reply/operator/approval rows were auto-converted to Tasks.
- Task authorization: Organization members read; OWNER/ADMIN/SALES_MANAGER manage; SALES_AGENT self-assigned only; VIEWER read-only.
- Supabase Performance Advisor has zero post-Slice-3 unindexed-FK findings after 0073; Security Advisor is unchanged baseline.
- Cloudflare runtime heartbeat after Slice 3 changed Worker version to `84d19f06-ead7-4abe-b332-ba14309629d8`, with failed=0 and acquisition/dispatch SKIPPED.
- Zero Email/WhatsApp outbound rows were created by Slice 3 verification.
- Phase 3 Slice 4 Deal/Pipeline Foundation merged in PR #184 at `main@d416fcee020bc393a45096ee1330f8378bbd8e38`; Production migration `0074_crm_deal_pipeline_foundation` is live as version `20260922225908`.
- Growth/Intent Opportunities remain acquisition evidence and are not canonical Deals.
- Deal aggregate state is OPEN/WON/LOST; Pipeline stages are configurable labels categorized OPEN/WON/LOST.
- Lead->Deal conversion is explicit/idempotent and does not mutate Lead state or auto-convert acquisition Opportunities.
- Cloudflare runtime after Slice 4 is proven by Worker version `47d22421-109e-4c1e-81e6-20bb273078e1`; latest checked heartbeat had failed=0 with acquisition/dispatch SKIPPED.
- Zero Email/WhatsApp outbound rows were created after the PR #184 merge in the verification window.
- Phase 3 Slice 5 Custom Field Governance is Production-verified: PR #188 / migration `0075_crm_custom_field_governance` version `20260923012557`; 0 definitions / 0 options / 0 values remain intentionally seeded.
- Phase 3 Slice 6 Segment Governance Gap Audit merged in PR #190 at `main@496811c80a550299c3d01d5b23c2ea9b82d491a1`.
- Phase 3 Slice 6 Dynamic Lead Segment implementation merged in PR #191 at `main@a34bfd243d2f95e2ccad9895d5a753ef902a4299`.
- Production migration `0076_crm_segment_governance` is live as version `20260923093619`.
- Segment first slice is LEAD-only + DYNAMIC-only, with immutable semantic versions, typed allowlisted predicates, RLS/RBAC, idempotent/version-checked mutations, deterministic bounded evaluation and minimized canonical audit.
- Snapshot/current-membership persistence, Deal/Business/Task/Conversation/Person Contact Segment entities, Campaign/Workflow execution, arbitrary SQL/JSONPath/PostgREST/metadata predicates and PII/SENSITIVE ordinary Custom Field predicates remain out of scope.
- Production 0076 created zero Segment data. Rollback-only Production smoke passed and left zero Segment/version/audit-fixture residue and no outbound delta.
- Post-0076 Security Advisor is unchanged; no new unindexed-FK finding was introduced.
- Implementation-runtime Cloudflare Worker checkpoint after PR #191 (before docs-only closeout) is `b6ad6482-11e1-4658-97e8-7f5d1a842318`, with failed=0 and acquisition/evidence/auto-dispatch SKIPPED.
- Zero Email/WhatsApp outbound rows were created from 0076 promotion through verification.

Runtime and Production evidence outrank stale documentation or chat memory.

## Read before changing anything

Read in this order:

1. `AGENTS.md`
2. `docs/CURRENT_STATE.md`
3. `docs/EXECUTION_PLAYBOOK.md`
4. `docs/business-os-2027/README.md`
5. this file
6. `docs/business-os-2027/MASTER_ARCHITECTURE.md`
7. `docs/business-os-2027/MASTER_PROGRAM_SECTIONS.md`
8. `docs/business-os-2027/IMPLEMENTATION_MAP.md`
9. `docs/business-os-2027/SERVICE_CONTRACT_STANDARD.md`
10. `docs/business-os-2027/STATE_EVENT_CATALOG.md`
11. `docs/business-os-2027/MIGRATION_FROM_GROWTH_OS.md`
12. `docs/business-os-2027/CONTROL_PLANE_FOUNDATION.md`
13. `docs/business-os-2027/OMNICHANNEL_ADAPTER_BOUNDARY.md`
14. `docs/business-os-2027/CUSTOMER_360_CRM_NORMALIZATION.md`
15. `docs/business-os-2027/CUSTOM_FIELD_GOVERNANCE_GAP_AUDIT.md`
16. `docs/business-os-2027/SEGMENT_GOVERNANCE_GAP_AUDIT.md`
17. `docs/business-os-2027/CHATWOOT_SOURCE_GAP_AUDIT.md`
18. `docs/business-os-2027/CHATWOOT_TENANT_BRIDGE_GAP_AUDIT.md`
19. current relevant Section/Work Package branch/PR, if any
20. current `main` SHA, Production Cloudflare Worker evidence and Production Supabase migration state

Runtime and Production evidence outrank stale documentation or chat memory.

## Control Plane decisions already closed by Production evidence

Do not reopen these without new Production evidence:

- **REUSE** `organizations` as the canonical tenant root.
- **REUSE** Supabase `auth.users` as user identity.
- **EXTEND** `organization_members` as the organization membership/RBAC boundary.
- **REUSE** existing `businesses` as the Growth OS CRM/Hunter external/prospect business table.
- **NEW** `tenant_businesses` as the tenant-owned Business entity in the Business OS hierarchy.
- **EXTEND** existing `usage_events` rather than creating a second cost/usage ledger.
- **EXTEND** existing `audit_logs` rather than creating a second tenant audit ledger.
- No `REPLACE` decision exists in Phase 1.

Canonical hierarchy:

```text
Organization -> Brand -> Business -> Branch -> Department -> Team -> User
```

Storage compatibility note: the Business node above is `tenant_businesses`; the old `businesses` table keeps its current CRM/Hunter meaning.

## PR #173 implemented scope

The implementation branch contains:

- Brand / tenant Business / Branch / Department / Team hierarchy;
- composite `(organization_id, parent_id)` FKs for tenant-consistent hierarchy;
- immutable `organization_id` guards on all new tenant-owned Control Plane entities, preventing cross-tenant row transfer by UPDATE;
- runtime canonical-scope lineage validation for Brand -> Business -> Branch -> Department -> Team;
- lower-scope member assignments attached to existing `organization_members`;
- organization `OWNER` kept organization-wide only;
- lower-scope roles limited to `ADMIN | SALES_MANAGER | SALES_AGENT | VIEWER`;
- runtime scope resolution filtered by tenant, `user_id`, hierarchy scope, and fail-closed scalar ABAC attributes;
- `member_scope_assignments` reads limited to the assigned user or organization OWNER;
- configuration inheritance foundation;
- feature-flag override scopes;
- reserved safety controls excluded from ordinary config/feature override keys;
- Plans, Pricing Versions, Subscriptions and Entitlements foundation;
- ACTIVE pricing uniqueness per Plan + Currency + Billing Period lane;
- one live primary subscription per organization;
- formal catalog/subscription state guards aligned to `STATE_EVENT_CATALOG.md` (`TRIAL -> ACTIVE -> PAST_DUE -> GRACE_PERIOD -> SUSPENDED -> CANCELED | EXPIRED`, with `PAST_DUE -> ACTIVE` recovery);
- published pricing commercial-field immutability;
- plan entitlements mutable only while pricing version is DRAFT;
- `usage_events.usage_classification` with:
  - BILLABLE
  - NON_BILLABLE
  - SYSTEM_RETRY
  - CACHED
  - PROMOTIONAL
  - INTERNAL
- default classification `INTERNAL` so billing fails closed;
- tenant clients cannot directly set customer-billing classification;
- trusted classification mutation goes through service-role-only `classify_usage_event`, uses SECURITY INVOKER + column-scoped privilege, and writes audit evidence;
- current customer AI billing policy is constrained to exactly 4× and only BILLABLE usage is chargeable;
- audit correlation/causation and hierarchy scope;
- database audit triggers for tenant-scoped important control-plane mutations;
- global Plan/Pricing/Plan-Entitlement runtime DML is revoked until a platform-level audited catalog command exists;
- runtime contract helpers and contract/isolation tests.

## Production primitives that remain untouched

Do not duplicate or redesign these as part of Phase 1:

- CRM Business / Lead / Campaign / Conversation;
- Hunter / Google Places;
- Website Audit;
- existing multi-agent runtime;
- Context Hydrator;
- conversation memory and `sales_state`;
- `knowledge_versions`;
- `prompt_versions`;
- ZERO_COST / LIGHT / FULL routing;
- OpenAI router;
- Cost Guard;
- outbound send gate;
- WhatsApp / Email journals;
- idempotency and `agent_runs.request_key`;
- automation/follow-up primitives;
- Telegram Owner Assistant;
- Portfolio / Preview infrastructure.

## Safety state

PR #173 must not:

- apply migration 0068 to Production while still under review;
- disable Shadow Mode;
- alter the global kill switch or channel send gates;
- send real customer messages;
- change live provider credentials;
- enable broad autonomous outreach;
- add Omnichannel v2, CRM v2, Mobile, Marketplace, Booking or Agent redesign.

AI/customer/provider side effects remain governed by:

```text
Agent -> Context -> Policy -> Approval -> Action Gateway -> Execute -> Verify -> Audit
```

## Verification gate for PR #173

Before merge:

- current head SHA is known;
- lint green;
- typecheck green;
- Vitest green;
- Next build green;
- Vinext build green;
- Cloudflare scheduled-bundle verification green;
- migration reviewed, including service-role grants and absence of new SECURITY DEFINER functions;
- tenant isolation, user-scope isolation and ABAC fail-closed tests green;
- multi-currency pricing lane and one-live-subscription invariants green;
- review threads resolved;
- no duplicate source of truth;
- no Production provider/send behavior change.

A green CI run is necessary, not a substitute for review of a migration.

## Current stacked Chatwoot execution checkpoint — 2026-09-23

Dependency stack:

1. PR #195 — Chatwoot source foundation.
2. PR #196 — Tenant Bridge audit.
3. PR #197 — Slice A mapping contract.
4. PR #198 — Slice B audit.
5. PR #199 — Slice B mapping contract.
6. PR #200 — Slice C Candidate/Reconciliation audit.
7. Slice C1 implementation branch — `feat/comm-tenant-bridge-slice-c1-vault`; create/verify its Draft PR before C2.

Slice C1 contains:

- migration `0079_chatwoot_vault_boundary.sql`;
- service_role-only SECURITY INVOKER Vault wrappers;
- exact `secretref://supabase-vault/<uuid>` format;
- server-only create/read/update client;
- pure reference parser;
- PostgreSQL 17 synthetic Vault contract bootstrap + rollback smoke;
- zero live Chatwoot calls;
- zero provider sends.

Production Vault evidence:

- `supabase_vault 0.3.1` installed;
- service_role Vault create/update/read privileges verified;
- authenticated has no Vault schema/decrypted-secret access.

External blocker remains GitHub-hosted runner allocation (`runner_id=0`, zero steps). Do not merge around it.

Production remains migration `0076_crm_segment_governance`; no Chatwoot mapping/Vault secret fixture was created for these slices.

Next implementation after C1 review is:

`COMM-TENANT-BRIDGE / Slice C2 — Chatwoot HTTP client`

C2 may be implemented with mocks and provisioning disabled by default; no Candidate/Production side effect until dependencies are green.

## Stable program cursor

Future chats must not continue by guessing a future PR number.

Use the stable roadmap in `MASTER_PROGRAM_SECTIONS.md`:

- current planned Section: `SECTION COMMUNICATION`;
- current planned Work Package: `COMM-CHATWOOT-SOURCE`;
- target: source-based Chatwoot Community Edition communication plane;
- Smart Core remains source of truth for CRM/business/customer/consent/pricing/booking/commerce/payment/billing/Knowledge/Memory/action safety;
- Chatwoot owns operational communication-plane UX/projections only;
- outbound actions initiated from Chatwoot must cross Smart Core policy/action/send-gate/reconciliation;
- Chatwoot proprietary `enterprise/` source is prohibited unless a valid license is intentionally adopted.

A work package can require any number of actual PRs. Record those PR numbers as evidence after creation; never renumber later Sections because a PR was added.

## Exact next action

1. Start from the **current canonical `main` at the time of the next session** and re-check its SHA, open PRs, CI, Production Supabase and routed Cloudflare evidence before any change. The last runtime-changing implementation checkpoint for Slice 6 is PR #191 at `a34bfd243d2f95e2ccad9895d5a753ef902a4299`; later closeout commits may be documentation-only.
2. Treat Phase 3 Slice 6 Dynamic Lead Segments as Production-verified:
   - gap audit PR #190;
   - implementation PR #191;
   - migration `0076_crm_segment_governance` -> Production version `20260923093619`;
   - implementation-runtime Worker checkpoint `b6ad6482-11e1-4658-97e8-7f5d1a842318`;
   - current routed Production Worker at latest verified heartbeat `09d84ef6-5928-429a-a926-ef4324ed99ab` (Worker timestamp `2026-09-23T09:50:07.867348Z`, heartbeat `2026-09-23T12:21:16.135625Z`);
   - latest checked heartbeat failed=0 with acquisition/evidence/auto-dispatch SKIPPED;
   - 0 Segment identities / 0 Segment versions intentionally persisted;
   - rollback-only Production smoke left zero fixture residue;
   - zero Email/WhatsApp outbound delta from promotion verification.
3. Preserve Slice 6 boundaries: LEAD-only, DYNAMIC-only, no Snapshot/current-membership table, no Campaign/Workflow/provider execution, no arbitrary query language, no PII/SENSITIVE ordinary predicates.
4. Do **not** automatically extend Segment to Deal, Business, Task, Conversation or Person Contact. Require fresh evidence.
5. `COMM-CHATWOOT-SOURCE` gap audit is complete. Implement the approved source foundation from `CHATWOOT_SOURCE_GAP_AUDIT.md`:
   - pin Chatwoot Community `v4.18.0` / commit `9f920b549c14491a4e587687a3eed5d21c6ccc7d`;
   - use a separate source/deployable Chatwoot component;
   - separate Chatwoot PostgreSQL/Redis/storage from Smart Core;
   - preserve Community/Enterprise license boundary;
   - do not activate provider channels or send customer messages;
   - if external fork/repository provisioning is unavailable through the active GitHub connection, record the dependency honestly and complete every source-lock/build/runbook artifact that can be verified without pretending the fork exists.
6. Keep `businesses` as the existing Growth OS CRM/Hunter Company/Account and `tenant_businesses` as tenant-owned Business hierarchy.
7. Do not fabricate Person Contact from provider display names.
8. Keep Shadow Mode and all canonical provider-boundary safety gates unchanged.
9. Any next implementation must repeat exact-head CI, PostgreSQL 17 migration-chain smoke, technical review, zero unresolved threads, controlled Production migration, advisor verification, rollback-only smoke, zero fabricated data, zero architecture-test provider sends and routed Worker heartbeat verification.

Runtime and Production evidence outrank stale docs or chat memory.


## Latest Communication Plane checkpoint — 2026-09-23 (C3B audit)

The current stacked Draft order is #195 → #196 → #197 → #198 → #199 → #200 → #201 (C1 Vault) → #202 (C2 HTTP) → #203 (C3A external Account/User/AccountUser adapter) → #204 (C3B governed persistence audit). Verify current heads and Production again at the next turn; old sections above are historical.

C3B audit: `CHATWOOT_TENANT_BRIDGE_C3B_GOVERNED_PERSISTENCE_AUDIT.md`. Slice A Account mapping writes require OWNER-authenticated governed RPCs and command claims. Slice B User/AccountUser/Inbox/Team tables allow service-role INSERT/UPDATE with contract/audit triggers but do not yet have the same command path. Migration 0078 extends claim table CHECK constraints, while the claim function in 0077 still rejects Slice B command types. Do not connect C3A by direct service-role writes or a SECURITY DEFINER shortcut. Implement the narrow governed path with crash/reconciliation evidence first.

The malformed duplicated SQL in the Slice B rollback smoke was fixed on #199 and copied to all dependent Draft branches through #204. CI remains blocked before step 1 on GitHub-hosted jobs (null steps/logs); no PR in this stack was merged and no Chatwoot migration was applied to Production.


## C3B claim catalog alignment — Draft PR #205

PR #205 is stacked on #204. Migration `0080_chatwoot_claim_catalog_alignment.sql` replaces only the existing OWNER-authenticated, SECURITY INVOKER claim function body. It aligns its 12 command and 6 entity types with 0078, enforces the command/entity pair, and rejects replay with a changed applied version. The original claim table, fingerprint, role gate and ACL remain canonical. PostgreSQL 17 rollback smoke is chained after 0079. This does not add any Slice B mapping writer or initiate Chatwoot provisioning.

Before C3B Account orchestration, close the separate concurrency gap: `create_chatwoot_account_mapping` persists a PROVISIONING mapping, but does not reserve exclusive external mutation ownership. Two concurrent requests may both list zero external Accounts and POST duplicates. Do not connect the C3A Account create call until there is a durable single-owner claim/lease and exact-marker reconciliation for crashes. No service-role direct write or SECURITY DEFINER shortcut.

Exact-head runner-backed CI and dependency review remain mandatory. Production still ends at 0076 unless fresh evidence shows otherwise.


## C3B Account external attempt — Draft PR #206

PR #206 is stacked on #205. Migration `0081_chatwoot_account_external_claim.sql` extends the same `chatwoot_bridge_command_claims` ledger with one OWNER-authenticated Account external-create attempt per mapping. The dedicated RPC returns `may_attempt_create=true` only for the first committed claim. Same-key replay returns false; another key fails closed for reconciliation. It does not call Chatwoot. The PostgreSQL 17 rollback smoke is chained after 0080.

Next unit: a Candidate-only Account orchestrator may invoke C3A only after it receives `may_attempt_create=true` from the committed owner claim. If it receives false or a timeout, reconcile by exact marker; never POST again automatically. If the process dies after claim and before HTTP, reconciliation/manual recovery is required. Preserve mapping state through existing OWNER-governed RPCs, including expected version and new request key. No real Chatwoot call or Production migration until runner-backed dependency CI and source-plane Candidate evidence pass.


## 2026-09-24 stack reconciliation — PR #206

PR #205 is merged to `main` at `f8786351d197b85ad0399d2a7b38a540c3da4c2a`. Its exact-head CI, post-merge main CI, and routed Cloudflare Production deployment all passed. Production Supabase migration state remains intentionally unchanged unless separately promoted and verified.

PR #206 is now retargeted directly to current `main` and marked ready for review. GitHub Actions runner allocation is restored. A rerun of the historical failed check reused an obsolete pull-request merge ref, so it is not valid evidence for the current base. This checkpoint commit exists to force a fresh pull-request merge ref and exact-head CI. Do not merge #206 unless that fresh run passes lint, typecheck, tests, PostgreSQL 17 migration smoke, Next build, Vinext build, and scheduled-runtime verification with no unresolved review threads.


## 2026-09-24 stack reconciliation — PR #207

PR #206 is merged to `main` at `e4c122a4e4a7bde26ee80a846b74e23dd224d7b2`. Its fresh exact-head CI, post-merge main CI, and routed Cloudflare Production deployment all passed. Production Supabase migration promotion remains a separate explicit step; no Chatwoot migration is assumed live from a Git merge alone.

PR #207 is retargeted directly to current `main` and marked ready for review. It adds a read-only exact-marker reconciler and a server-only Candidate Account orchestrator. `CHATWOOT_PROVISIONING_ENABLED` remains the fail-closed feature gate; no route or scheduler imports this orchestrator. A new one-shot claim may enter the create path, while replay/ambiguous cases reconcile by GET-only exact marker and never blindly POST again. Confirmed Account identity is persisted only through the existing OWNER-governed expected-version RPC.

The Slice B membership role-integrity finding remains a separate blocker for User/AccountUser writes: declared role is not canonical authority. PR #207 does not implement that membership writer. Do not activate Candidate provisioning or make a live Chatwoot call from this PR validation. Fresh exact-head CI and zero unresolved review threads remain mandatory before merge.


## C3B Business-wide membership role read — Draft PR #208

PR #208 is stacked on #207 and adds only a server-only Candidate read. The caller identity is verified from the authenticated Smart session first; canonical Organization membership, ACTIVE Brand/tenant Business lineage and BRAND/BUSINESS scope assignments are then read through the existing server-only Supabase service client with explicit organization/business/user filters. This avoids weakening `organization_members` RLS. A reviewed attempt to add an OWNER-read policy was reverted because current `is_org_owner` is SECURITY INVOKER and reads `organization_members` itself, making a same-table policy recursive; migration 0017 explicitly hardened that helper away from SECURITY DEFINER.

The resolver reuses `effectiveRoleForScope`, fails closed on incomplete/mismatched rows, excludes narrower branch/team assignments from a Business-wide Account role, and does not accept caller-supplied ABAC attributes. Only a canonical Organization OWNER resolves to Chatwoot administrator. ADMIN and sales roles resolve to agent; VIEWER has no membership. Mock-only tests also assert that no service client is created before caller authentication succeeds.

This remains a read-only Candidate projection, not transactional mutation authority. The same service-role read bypass must not be reused as a writer shortcut. A SECURITY INVOKER User/AccountUser writer cannot currently recompute another member's canonical Organization role through self-read-only `organization_members` RLS without either a source-backed delegation/read primitive or a security-boundary change. Treat that as the explicit C3B writer blocker: do not activate external membership, do not use direct service_role writes, and do not reintroduce SECURITY DEFINER merely to bypass the block. Exact-head runner-backed CI and review remain mandatory; preserve dependency order.

## 2026-09-24 stack reconciliation — PR #208

PR #207 is merged and Production-verified at `f7c8cf8df56abba038ac02b79ec2301800ab0b58`. PR #208 is rebuilt directly on that verified `main` with only its read-only role-resolution implementation, focused tests, and handoff evidence. It does not add AccountUser mutation authority, change RLS, invoke Chatwoot externally, or send provider/customer traffic. Fresh exact-head CI and zero unresolved review threads remain mandatory before merge.


## C3B User / AccountUser writer blocker — Draft PR #209

PR #208 review established that its read-only role resolver may safely use the existing server-only service client for exact canonical reads only after authenticating the caller and verifying current Organization OWNER authority. That does **not** solve mutation authority.

The User/AccountUser writer remains blocked because authenticated `SECURITY INVOKER` cannot read another member's `organization_members.role` under the current self-read RLS boundary. Direct `service_role` writes are forbidden, and a broad `SECURITY DEFINER` bypass would reverse prior hardening. PR #209 therefore contains no writer migration or runtime activation; it records the blocker and required reverse-role contract in `CHATWOOT_C3B_USER_MEMBERSHIP_WRITER_BLOCKER.md`.

Before writer implementation resumes, require a reviewed least-privilege transactional authorization design that recomputes canonical Organization/Brand/Business role at the mutation boundary, reuses the existing claim ledger/version/request semantics, and proves safe OWNER demotion and VIEWER membership removal. Keep external User/AccountUser membership disabled.


## C3B private canonical-role authority proof — Draft PR #210

PR #210 is stacked on #209 and does not implement the User/AccountUser writer. It records and rollback-tests a source-backed least-privilege authority primitive for the exact blocker found in #208/#209.

The proposed shape keeps the eventual mutation writer SECURITY INVOKER. Only the canonical role read primitive is SECURITY DEFINER, isolated in a non-exposed private schema, with empty search_path, fully qualified relations, exact OWNER/Organization/Business/target checks, and narrow grants. This follows current Supabase guidance for breaking RLS recursion without reverting public.is_org_owner to SECURITY DEFINER or using service_role writes.

The PostgreSQL 17 rollback-only smoke proves the intended contract: direct organization_members target-row access remains self-read under RLS; the private primitive returns only the canonical role for a current Organization OWNER; BUSINESS outranks BRAND; conditional attributes do not grant without trusted context; non-OWNER/cross-tenant/archived lineage calls fail closed; anon/service_role lack helper access; public.is_org_owner remains SECURITY INVOKER.

No migration or runtime activation is included. Do not implement or activate external User/AccountUser membership until #210 exact-head CI executes real steps successfully and the security boundary is reviewed.


## C3B reverse-role mutation interlock audit — next stacked Draft

Fresh Production review found two different IAM mutation boundaries.

`organization_members` is currently effectively read-only through normal authenticated runtime: RLS exposes only self-read SELECT, service_role has SELECT only, and no normal member-role mutation RPC exists. Future Organization member management must therefore adopt Chatwoot reverse-role safety before it becomes writable.

`member_scope_assignments` is already OWNER-mutable for SELECT/INSERT/UPDATE/DELETE and service_role has table DML privileges, but the table has no version column and no governed request-key/expected-version mutation RPC. This is the first real pre-activation reverse-role gap.

The required invariant is now explicit: external Chatwoot privilege may be equal to or weaker than Smart Core, never stronger. Promotions may commit Smart Core first and temporarily leave Chatwoot under-privileged. Demotions must be external-first: administrator -> agent must be verified before canonical OWNER demotion; membership -> VIEWER/no membership must be removed and the mapping archived before canonical authority is reduced.

BRAND assignment changes must evaluate every affected ACTIVE tenant Business. Do not perform Chatwoot HTTP inside a DB transaction. Use external claim/reconciliation first for demotions, then permit the canonical mutation only from persisted safe mapping evidence. Ambiguous external outcomes remain reconciliation-only.

Before external User/AccountUser membership activation, add a governed versioned scope-mutation boundary and prove the interlock with PostgreSQL 17 rollback + mock orchestration tests. Direct service-role IAM or Chatwoot mapping writes are not acceptable shortcuts.


## 2026-09-24 stack reconciliation — PR #211

PR #210 is merged to `main` at `563539d77a63629271c42e5d783f8a32c7de137d` after exact-head CI and routed Cloudflare Production verification of its dependency baseline. PR #211 is now retargeted directly to current `main` and contains only its reverse-role audit plus this handoff evidence.

GitHub Actions runner allocation is restored. This reconciliation commit intentionally forces a fresh pull-request CI signal against the new base. Do not merge #211 unless that exact head passes lint, typecheck, tests, PostgreSQL 17 migration smoke, Next build, Vinext build and scheduled-runtime verification with zero unresolved review threads.


## C3B governed member scope mutations — Draft PR #212

PR #212 is stacked on #211 and introduces migration `0082_member_scope_assignment_governance.sql`. It closes the direct Smart Core IAM mutation gap without activating external Chatwoot membership.

The canonical `member_scope_assignments` table now gains optimistic `version`, `last_request_key` and `updated_by_user_id` evidence. CREATE/UPDATE/DELETE use dedicated SECURITY INVOKER RPCs with server-computed payload hashes, transaction-local governed command context, durable immutable request-key claims, FOR UPDATE locking, expected-version checks and bounded audit. Assignment identity/scope is immutable after creation.

Direct `service_role` INSERT/UPDATE/DELETE on canonical scope authority is revoked; service_role remains read-only. Authenticated OWNER mutation is permitted only through the governed command context. Delete retains replay evidence in the IAM command ledger even after the assignment row is gone. PostgreSQL 17 rollback smoke covers direct-DML denial, replay, request-key conflicts, stale versions, non-OWNER denial, service-role read-only behavior, delete replay, claim immutability, audit count and parent cascade behavior.

This is deliberately not the reverse-role interlock. Migration 0078 keeps Chatwoot Account membership state service-only, so #212 does not pretend a SECURITY INVOKER IAM RPC can independently verify external projection state. External User/AccountUser membership must remain disabled. The next implementation unit must combine the reviewed private canonical-role authority with persisted Chatwoot reconciliation evidence so external demotion/removal is verified before any BRAND/BUSINESS authority reduction.

Do not promote 0082 to Production while the stacked exact-head GitHub Actions runner still fails before Step 1. No Production migration, live Chatwoot request, provider/customer send, route/scheduler activation or Shadow Mode change has been made.


## 2026-09-24 stack reconciliation — PR #212

PR #211 is merged to `main` at `0ab85137978d89dbfa9180290443fc8b4185ce7c`. PR #212 is now retargeted directly to current `main` with only its governed member-scope mutation boundary, focused PostgreSQL smoke, CI-chain update and handoff evidence.

GitHub Actions runner allocation is restored. This reconciliation commit forces fresh CI on the new base. Do not merge #212 unless this exact head passes lint, typecheck, tests, PostgreSQL 17 migration-chain smoke including 0082, Next build, Vinext build and scheduled-runtime verification, with zero unresolved review threads. External Chatwoot User/AccountUser membership remains disabled and Production migration remains a separate explicit promotion step.


CI refresh note: PR #212 is open directly against current main after PR #211 merge. This documentation-only commit exists solely to force exact-head runner-backed validation on the reconciled base; migration 0082 and runtime behavior are unchanged.


## C3B persistent private canonical-role authority — Draft PR #213

PR #213 is stacked on #212 and converts the reviewed #210 proof into migration `0083_private_chatwoot_role_authority.sql`.

The persistent boundary is intentionally narrow: `private.chatwoot_business_wide_role(org,business,target_user)` is the only SECURITY DEFINER primitive. It has empty search_path, fully qualified canonical reads, current OWNER authentication via auth.uid(), exact ACTIVE Brand/Business lineage checks, target Organization-role lookup and deterministic BUSINESS > BRAND precedence. Conditional scope assignments fail closed without trusted attributes. It returns only the effective role and contains no mutation SQL.

The helper is outside the exposed public schema. authenticated receives only private schema USAGE plus exact function EXECUTE; anon and service_role receive neither. public.is_org_owner remains SECURITY INVOKER.

The PostgreSQL 17 migration smoke runs after 0082 and creates lower-scope evidence only through the governed scope-assignment RPCs. It verifies RLS remains self-read, role precedence, conditional fail-closed behavior, owner preservation, non-owner/cross-tenant/archived-lineage denial, grants, empty search_path and absence of mutation SQL.

External User/AccountUser membership remains disabled. The next implementation unit may use this primitive inside SECURITY INVOKER governed logic, but must still enforce the reverse-role invariant from #211: external Chatwoot privilege can never remain stronger than canonical Smart Core authority.

No Production migration, live Chatwoot request, provider/customer send, route/scheduler activation or Shadow Mode change has been made.


## C3B governed User / Account membership persistence — Draft PR #214

PR #214 is stacked on #213 and introduces migration `0084_chatwoot_user_membership_governance.sql`. It adds governed Smart Core persistence for Chatwoot User and Account membership projections without activating external provisioning.

The mutation boundary remains SECURITY INVOKER and uses the reviewed private canonical-role authority from 0083. User and Account membership mappings use stable request keys, expected versions, bounded audit, canonical tenant lineage and fail-closed role checks. Direct service-role mapping writes are not treated as normal mutation authority.

Canonical Smart Core role remains authoritative. Chatwoot administrator is permitted only from canonical Organization OWNER; agent projection is constrained to supported non-VIEWER roles; VIEWER does not gain Account membership. This PR does not make a live Chatwoot request and does not authorize a caller-declared effective role.

The PostgreSQL 17 smoke verifies governed create/update/replay/version behavior, cross-tenant denial, role projection constraints, direct-DML restrictions and audit evidence.

Reverse-role safety remains a separate required boundary: an external Chatwoot administrator/member must be demoted or removed and reconciled before canonical authority can be reduced. External User/AccountUser membership therefore remains disabled until the subsequent reconciliation interlock is verified.

No Production migration, live Chatwoot request, provider/customer send, route/scheduler activation or Shadow Mode change has been made.


## C3B membership reconciliation + reverse-role interlock — Draft PR #215

PR #215 is stacked on #214 and adds migration `0085_chatwoot_membership_reconciliation_interlock.sql` plus the server-only AccountUser reconciliation runtime.

External AccountUser mutation is now reconciliation-first after ambiguity. The code performs one POST only; an ambiguous mutation is resolved by GET, never a blind second POST. Removal performs exact GET preflight, one DELETE, then GET absence verification. An ambiguous DELETE is not repeated.

Verified external state is persisted as an immutable, short-lived reconciliation receipt bound to the exact Organization, tenant Business, membership ID/version, Smart user/mapping identities, Chatwoot Account/User IDs and prior AccountUser ID. Only service_role may append/read the receipt table directly and execute the receipt-record RPC. Authenticated clients cannot mint receipts.

The #214 generic state RPC that accepted caller-declared verified Chatwoot role has been revoked. ACTIVE membership now requires a fresh server-recorded PRESENT receipt whose observed role matches the canonical 0083 projection. ARCHIVED requires a fresh server-recorded ABSENT receipt bound to the exact prior AccountUser identity. DEGRADED remains a governed non-adoption state.

BRAND/BUSINESS member-scope INSERT, UPDATE and DELETE now run a reverse-role interlock. The helper computes post-mutation Business-wide authority for every affected ACTIVE tenant Business. If any would become VIEWER while a PROVISIONING/ACTIVE/DEGRADED Chatwoot Account membership remains, the Smart Core mutation fails closed. Parent cascades remain preserved. This enforces the external-first removal rule before canonical authority reduction.

Mock tests cover GET-only reconciliation, one-delete removal, bigint identity, drift rejection and server receipt recording. PostgreSQL 17 rollback smoke covers receipt ACLs, receipt-backed activation/archive, stale receipt rejection and INSERT/UPDATE/DELETE authority-reduction blocking.

Remaining pre-activation boundaries are explicit: Organization-role mutation is still not opened; agent-to-agent canonical role changes need projection freshness work; global Chatwoot User identity activation requires final hardening; Inbox/Team governed writers and Contact/Conversation projection still remain.

No Production migration, live Chatwoot request, provider/customer send, route/scheduler activation or Shadow Mode change has been made. Keep #215 Draft until the complete dependency stack gets real runner-backed exact-head CI and review.


## C3B server-recorded Chatwoot User identity — Draft PR #216

PR #216 is stacked on #215 and adds migration `0086_chatwoot_user_reconciliation_receipt.sql` plus the server-only User reconciliation runtime.

Chatwoot User marker PATCH is now single-attempt. If its outcome is ambiguous, the adapter performs GET on the exact known Chatwoot User ID and requires exact ID + canonical email + Smart projection marker before claiming success. It does not blindly repeat PATCH.

The persistent receipt is immutable, short-lived and bound to exact Organization, ACTIVE tenant Business, global User mapping ID/version, Smart user, observed Chatwoot User ID and observed canonical email. Only service_role can append/read the receipt ledger directly and record evidence. Authenticated clients cannot mint User receipts.

The #214 caller-declared User-state RPC is revoked. ACTIVE User mapping now requires a fresh server-recorded receipt and an OWNER-authenticated SECURITY INVOKER activation command. External User ID remains immutable once adopted and the existing Chatwoot command claim ledger supplies request-key/version replay semantics. A separate governed DEGRADED command remains; live Account memberships continue to block weakening an ACTIVE global User mapping.

Runtime helpers `ensureAndRecordChatwootUser` and `reconcileAndRecordChatwootUser` record receipts only after external identity/marker proof. Mock and PostgreSQL 17 rollback tests cover ambiguous PATCH reconciliation, missing marker denial, identity drift, receipt ACL, stale version receipts, verified activation, degradation and reactivation.

No Production migration, live Chatwoot request, provider/customer send, route/scheduler activation or Shadow Mode change has been made. Keep #216 Draft until runner-backed exact-head CI and the full dependency stack are proven.


## C4 ephemeral Account-admin token boundary — Draft PR #217

PR #217 is stacked on #216 and implements the first API Inbox/Team provisioning dependency without creating either resource.

Pinned Chatwoot v4.18.0 source was re-verified: Inbox and Team CRUD are account-scoped Application API routes; Platform User token issuance is POST `/platform/api/v1/users/:id/token`; API Inbox uses Channel::Api.

The new server-only `chatwootAdminAccountRequest` verifies the authenticated caller is the current Smart Organization OWNER before any service client exists. It then performs exact read-only service checks for ACTIVE tenant Business, Account mapping, global User mapping and Account membership. The membership must link the exact mappings and remain OWNER -> Chatwoot administrator with an adopted AccountUser identity.

Only then is an ephemeral Chatwoot User access token issued. The token remains inside the call stack, is immediately consumed by the existing account-scoped HTTP client and is never persisted, logged, audited or returned.

Resource paths are suffix-only and are rejected before auth/service/token issuance if they attempt /api, /platform, scheme-relative, traversal or root-only paths. The Chatwoot Account ID always comes from the exact ACTIVE canonical mapping.

No migration, Production mutation, live Chatwoot call, provider/customer send, route/scheduler activation or Shadow Mode change has been made. Next C4 unit is API Inbox provisioning with immediate Vault capture of Channel::Api secret + hmac_token and exact ambiguous-create reconciliation.


## C4 signed API Inbox webhook receiver — Draft PR #218

PR #218 is stacked on #217 and establishes the real webhook ingress required before creating any Channel::Api Inbox.

Pinned Chatwoot v4.18.0 source was re-verified: API Inbox webhook signing uses the Channel::Api `secret`, not `hmac_token`; Chatwoot emits `X-Chatwoot-Timestamp`, `X-Chatwoot-Signature: sha256=...` over `timestamp.rawBody`, and UUID `X-Chatwoot-Delivery` evidence.

The new `POST /api/chatwoot/webhook/[mappingId]` route is JSON-only, declared- and streaming-body capped at 1 MiB, and uses Web Crypto HMAC-SHA256. The canonical Inbox mapping must be exact ACTIVE/DEGRADED Channel::Api with valid Organization/tenant Business identity. The signing secret is read only from the existing source-backed Supabase Vault reference. Payload external Inbox ID must match the canonical mapped external Inbox ID. Invalid mapping/signature/scope fails with generic 401; malformed input is 400; Vault/journal unavailability is retryable 503; valid verified evidence is journaled then fast-ACKed 200. No paid AI/provider work occurs synchronously in the webhook request.

Migration `0087_chatwoot_webhook_event_journal.sql` adds a service-only Communication Plane journal keyed by exact Inbox mapping + Chatwoot delivery UUID. It stores event type, SHA-256 of the verified body, verified JSON payload and processing lifecycle. RLS is enabled; anon/authenticated have no direct table access or recorder EXECUTE. service_role gets SELECT/INSERT/UPDATE only. Exact replay is idempotent; same delivery ID with changed hash/payload/event/scope fails closed. Signed evidence columns are immutable.

Unit tests cover HMAC/timestamp/body tampering, Vault lookup, exact Inbox binding, replay, bad signature and persistence errors. Route tests cover fast ACK, 415/413/400/401/503, actual streaming body cap and error non-leakage. PostgreSQL 17 rollback smoke covers ACL, insert/replay mismatch, wrong Inbox rejection and evidence immutability.

No Production migration, live Chatwoot call, route deployment, provider/customer send or Shadow Mode change has been made. Next C4 unit may provision Channel::Api only after generating this exact webhook URL, then capture returned `channel.secret` and `hmac_token` immediately into Vault and persist only source-backed secret references.


## C4 governed Channel::Api Inbox provisioning — Draft PR #219

PR #219 is stacked on #218 and implements the actual API Inbox provisioning path while keeping external side effects unactivated.

Pinned Chatwoot v4.18.0 source confirms Channel::Api create accepts webhook_url, hmac_mandatory and additional_attributes, and administrator Inbox responses expose secret, hmac_token, webhook_url, inbox_identifier and additional_attributes.

Provisioning writes an exact Smart projection marker containing the Inbox mapping UUID and tenant Business UUID. Every attempt performs GET marker reconciliation before POST. If absent, only one POST is attempted; ambiguous POST is followed by GET-only reconciliation. Duplicate markers fail closed.

Raw Channel::Api secret and hmac_token are captured immediately into deterministic Supabase Vault entries. They are never stored in mapping/audit/receipt JSON and never returned from the orchestration API. Only source-backed secret references proceed into Smart Core.

Migration `0088_chatwoot_api_inbox_governance.sql` adds the governed Inbox mapping command path, command-context RLS, read-only service-role mapping access, immutable service-only reconciliation receipts, receipt-backed activation and governed DEGRADED state. It reuses the existing Chatwoot command claim ledger and optimistic version/request-key semantics. Its sole SECURITY DEFINER primitive is the private owner-authenticated receipt reader.

Runtime order is: validate explicit HTTPS webhook origin -> claim/replay PROVISIONING mapping -> derive exact #218 webhook URL -> GET reconcile -> one POST if absent -> GET after ambiguous create -> Vault capture -> server receipt -> OWNER receipt-backed activation. An already complete ACTIVE mapping replays without external or Vault work.

Mock tests cover create/adopt/ambiguous reconciliation, duplicate marker denial, Vault capture, no plaintext secret leakage, Vault failure, ACTIVE replay and config failure before DB claim. PostgreSQL 17 rollback smoke covers mapping governance, receipt ACL, authenticated receipt denial, source-backed refs, receipt activation, stale receipt denial, service-role read-only mapping ACL, degradation and fresh reactivation.

`CHATWOOT_WEBHOOK_PUBLIC_ORIGIN` is declared as required configuration but is intentionally not activated in Production from this Draft.

No Production migration, live Chatwoot call, provider/customer send, route invocation or Shadow Mode change has been made.


## C4 governed Team projection — Draft PR #220

PR #220 is stacked on #219 and closes the governed Smart Team -> Chatwoot Team projection boundary.

Pinned Chatwoot v4.18.0 source confirms Team CRUD is account-scoped, Team IDs are bigint, Team names are normalized/lowercased and unique per Account, and there is no custom-attributes marker field. The projection therefore uses a deterministic collision-safe name from canonical Smart Team name plus the first 8 Smart Team UUID characters, while the exact Smart marker lives in Team description: `smartvisions:team:<team-uuid>;business:<business-uuid>;v=1`.

Migration `0089_chatwoot_team_governance.sql` adds command-context RLS/guarding for `chatwoot_team_mappings`, exact ACTIVE Team->Department->Branch->Business lineage validation, ACTIVE Account mapping requirement, immutable service-only short-lived reconciliation receipts, receipt-backed activation and governed DEGRADED transition. service_role mapping access is SELECT-only. The existing Chatwoot claim ledger supplies request-key/version replay. The only SECURITY DEFINER helper is private, OWNER-authenticated and uses empty search_path.

Server runtime performs GET /teams before every create; exact description marker is adopted, absent marker causes exactly one POST, ambiguous POST is followed by GET-only reconciliation and duplicate markers fail closed. No external Team ID is accepted from caller input. External Team bigint IDs stay lossless decimal strings and unsafe JavaScript numeric IDs fail closed.

Mock tests cover create/adopt/ambiguous reconciliation, one-POST semantics, receipt/activation arguments, duplicate marker denial, bigint safety, ACTIVE replay and scope drift. PostgreSQL 17 rollback smoke covers deterministic projected naming, direct authenticated mutation denial, service-role read-only mapping ACL, service-only receipt ACL, marker/identity conflict, receipt-backed activation, stale receipt denial, direct service mutation denial, degradation and fresh receipt reactivation.

No Production migration, live Chatwoot call, provider/customer send, route activation or Shadow Mode change has been made. Keep #220 Draft until exact-head CI is runner-backed and the stacked dependency chain is proven.


## C5 governed Chatwoot SSO login — Draft PR #221

PR #221 is stacked on #220 and implements the permissioned Chatwoot SSO boundary without adding schema.

Pinned Chatwoot v4.18.0 source confirms GET /platform/api/v1/users/:id/login returns a five-minute SSO URL at FRONTEND_URL/app/login containing canonical email and a 64-hex sso_auth_token.

The server-only adapter requires an authenticated Smart user, exact current Organization membership via self-read RLS, ACTIVE tenant Business, ACTIVE global User mapping, ACTIVE exact Account mapping and ACTIVE AccountUser membership linking those mappings. OWNER must still project to administrator; ADMIN/SALES_MANAGER/SALES_AGENT must project to agent; VIEWER and stale/cross-scope projections fail before the Platform login endpoint.

The returned URL is treated as untrusted and must match the exact configured Chatwoot origin, exact /app/login path, authenticated user's canonical email, exactly one 64-hex token and no extra query parameters/credentials/fragment.

The route GET /api/chatwoot/sso/[organizationId]/[tenantBusinessId] returns a 302 only after validation and sets private no-store/no-cache plus no-referrer. The SSO URL/token is never persisted, audited or logged. Bounded failures map to 400/401/403/503 without leaking internal details.

Mock tests cover session/org authorization ordering, VIEWER/cross-scope/inactive denial, OWNER/admin role projection, exact upstream redirect confinement and no-store redirect behavior.

No Production mutation, live Chatwoot request, provider/customer send, Shadow Mode change or CI bypass has been made. Remaining C5 work is Inbox/Team membership desired-set reconciliation from canonical Smart Core scope semantics.


## 2026-09-25 Production closeout — Chatwoot bridge through 0089

Fresh runtime evidence now supersedes the older “not Production” notes above.

Git/runtime baseline:

- main: `d1766e6b12b1784359289e0244c777b23fcd0fca`;
- main CI #1222: SUCCESS;
- Cloudflare Production deploy #702: SUCCESS, including routed Production smoke and safe webhook rejection smoke;
- Chatwoot Source Image run #17: SUCCESS on source-changing main `d336a03c231bb66de8959510e57ce775dbfb7f52`;
- pinned upstream remains Chatwoot CE v4.18.0 @ `9f920b549c14491a4e587687a3eed5d21c6ccc7d`;
- PRs #215 through #223 are merged; only stale unrelated PR #158 remains open.

Production Supabase `pkypexzpyfbikdnkrzvw` was promoted sequentially from 0076 through:

- 0077 Chatwoot Tenant Bridge Slice A;
- 0078 Tenant Bridge Slice B;
- 0079 Vault boundary;
- 0080 claim catalog alignment;
- 0081 Account external claim;
- 0082 governed member-scope assignments;
- 0083 private canonical Chatwoot role authority;
- 0084 governed User/Account membership persistence;
- 0085 membership reconciliation + reverse-role interlock;
- 0086 User reconciliation receipts;
- 0087 signed webhook event journal;
- 0088 governed API Inbox persistence;
- 0089 governed Team persistence.

Post-promotion verification:

- relevant mapping, receipt and webhook tables have RLS enabled;
- mapping tables keep service_role read-only;
- reconciliation receipts are service-only SELECT/INSERT;
- webhook journal is service-only SELECT/INSERT/UPDATE;
- anon/authenticated have no direct service-only table privileges;
- private role/receipt evidence helpers are the narrow SECURITY DEFINER boundary;
- public mutation/activation commands remain SECURITY INVOKER;
- Shadow Mode=true;
- global_kill_switch=false;
- email_paused=false;
- whatsapp_ai_paused=false;
- agents_paused=false;
- Cost Guard remains USD 25 total (OpenAI 10 / Places 5 / Email 4 / WhatsApp 3 / reserve 3; 70/85/95/100 thresholds);
- no outreach send, WhatsApp event or email event occurred during the promotion window.

Supabase advisor interpretation:

- RLS-enabled/no-policy INFO findings on Chatwoot receipt/webhook tables are intentional service-only isolation, not a request to add broad client policies;
- leaked-password protection remains a pre-existing manual Auth setting warning;
- unindexed-FK INFO findings require targeted performance hardening, not automatic blanket index creation.

Critical runtime truth:

The Chatwoot Community-safe immutable image is built/published, but Chatwoot itself is **not yet deployed as a Production communication plane**. There is no verified `inbox.smartvisionsai.com` runtime, dedicated Chatwoot PostgreSQL, Redis, object storage, Rails/Puma web, Sidekiq worker, backup/restore evidence or running-image provenance evidence.

Next cursor:

1. close this documentation reconciliation through exact-head CI;
2. provision an isolated Candidate Chatwoot runtime from the immutable source image with dedicated PostgreSQL, Redis and S3-compatible storage;
3. run `db:chatwoot_prepare` and `SMARTVISIONS_CONFIGURE.rb`;
4. prove web/login, Sidekiq/Redis, object storage and source provenance;
5. only then plan controlled Production Chatwoot runtime promotion;
6. keep provider credentials, live customer data, API Inbox provisioning and live sends disabled until the bridge/runtime release gates are explicitly satisfied;
7. keep C5 scoped-only Inbox/Team membership blocked until the source-backed mixed-Inbox access-policy problem has a coherent scope-aware solution.

Do not turn Shadow Mode off as part of runtime deployment.


## Chatwoot FK index hardening — Draft after Production 0089

Fresh Production Supabase performance advisor evidence after the 0077-0089 promotion reports 27 unindexed foreign-key paths limited to the new Chatwoot/communication tables.

This unit adds `0090_chatwoot_fk_index_hardening.sql` with only the 27 missing covering indexes reported by Production evidence. It does not alter table data, RLS, grants, provider behavior, runtime routes or Shadow Mode.

The PostgreSQL 17 smoke does not merely count index names. It walks every public foreign key on `chatwoot_%` plus `communication_channel_bindings` and fails unless a valid/ready index covers the FK columns in order.

Do not promote 0090 until exact-head CI and the prior main Production baseline are green.


## 2026-09-25 Production closeout — 0090 Chatwoot FK index hardening

PR #226 is merged. Canonical main is now `30cfaf481bc44e9aa08bc34ef75ebead2c3360c6`.

Verified gates:

- exact-main CI #1226: SUCCESS;
- Cloudflare Production deploy #706: SUCCESS, including routed Production and webhook rejection smoke;
- Production Supabase migration `0090_chatwoot_fk_index_hardening` applied successfully as version `20260924203449`;
- all 27 Production-advisor-reported Chatwoot/communication FK gaps received targeted covering indexes;
- generic catalog verification now reports `unindexed_count=0`;
- Supabase performance advisor filtered to `chatwoot_%` + `communication_channel_bindings` reports no remaining unindexed-FK findings;
- Shadow Mode=true;
- global_kill_switch=false;
- email_paused=false;
- whatsapp_ai_paused=false;
- agents_paused=false;
- no outreach send, WhatsApp event or email event occurred during promotion.

The next semantic cursor remains Chatwoot runtime deployment, not more schema invention. Source image build is verified; real Candidate/Production Chatwoot web + Sidekiq + dedicated PostgreSQL + Redis + durable object storage are still absent. Keep live API Inbox provisioning, customer imports, native Chatwoot provider connectors and provider sends disabled until the runtime release gates are proven. C5 scoped-only shared-Inbox membership remains blocked.


## Chatwoot Candidate runtime safety gate — implementation branch

The next runtime dependency is now machine-checkable before any hosting mutation.

This branch adds:

- a fail-closed Candidate environment verifier;
- an isolated non-secret Candidate env template;
- Candidate Compose with one-shot `db:chatwoot_prepare` + `SMARTVISIONS_CONFIGURE.rb`;
- web/worker startup dependency on successful prepare;
- local Rails web healthcheck;
- unit tests for Production-hostname reuse, Smart Core database reuse, floating/fake images, unresolved secrets and native provider/SMTP credentials;
- source-image workflow validation of the env template and Compose model.

The verifier requires an immutable Smart Visions GHCR digest, isolated Candidate HTTPS hostname, dedicated PostgreSQL/Redis/S3-compatible storage and no provider/Webhook activation. It does not create hosting resources, DNS, databases, Redis, buckets or secrets.

Actual Candidate runtime remains blocked on long-running host resources. A fresh read-only Railway audit confirmed the account/workspace is accessible but currently has zero projects and no Candidate runtime. No Railway resources have been created. Do not substitute Smart Core Cloudflare Workers, Smart Core Supabase schema or Vercel for the Rails + Sidekiq runtime.

After exact-head CI/source-image verification, deploy only to isolated Candidate resources. Keep Production customer data, Production provider credentials, API Inbox activation, native Chatwoot Email/WhatsApp and outbound sends disabled.


## Chatwoot Candidate image publication — verified 2026-09-25

The Candidate runtime safety-gate PR #228 is merged at `main@6d86ad068c941be8ecf73c22d14205f9254ada41`.

The exact-main Chatwoot Source Image workflow run #21 completed successfully on that SHA:

- upstream Chatwoot: `v4.18.0@9f920b549c14491a4e587687a3eed5d21c6ccc7d`;
- Smart Visions image tag: `ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-6d86ad068c941be8ecf73c22d14205f9254ada41`;
- immutable digest: `sha256:942f4e4404dac52c83a938ca5f984186d47c4fecf85f65a6064c2db0a3a92e1e`;
- provenance inspection passed; Enterprise source is absent; runtime Enterprise is disabled; provider authority remains Smart Core.

The non-secret Candidate env template now pins that exact immutable image. It remains a template: hostname, secret-store values, dedicated Candidate PostgreSQL, Redis and S3-compatible storage must be resolved before deployment. No Candidate or Production Chatwoot runtime has been created. Keep API Inbox activation, customer data, native provider credentials and outbound sends disabled; keep Shadow Mode ON. The next gate is Candidate hosting-resource provisioning and runtime verification, not another source build.


## Current Chatwoot Candidate checkpoint — 2026-09-25

- Current `main`: `4987088dc4ba2e9212e196304ccebd69073ba536`, merge commit for PR #229.
- Exact-main CI run #1234: SUCCESS.
- Cloudflare Production deploy run #714: SUCCESS on this SHA. Growth OS Release Candidate and Production Worker deploys, route verification, safe API/webhook checks, and routed smoke all passed. Production Worker version: `eda99066-ed51-4ee7-a0d7-96102152f513`; smoke returned `/login=200`, `/=307`, unknown path `=404`, each through Cloudflare. No provider send was invoked.
- Production Supabase `pkypexzpyfbikdnkrzvw`: migration head remains `0090_chatwoot_fk_index_hardening`. Fresh read-only verification: Shadow Mode ON; global Kill Switch OFF; email, WhatsApp AI, and Agent pauses OFF. Cost Guard remains $25 monthly ($10 OpenAI, $5 Google Places, $4 Email, $3 WhatsApp, $3 reserve), thresholds 70/85/95/100. Month-to-date recorded usage was $0.219241 (OpenAI $0.039241, Google Places $0.18, Email $0, WhatsApp $0). Outbound outreach and WhatsApp events in the last hour were 0; email events in the last hour were 0.
- Chatwoot Source Image run #23 succeeded on this main SHA. Image: `ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-4987088dc4ba2e9212e196304ccebd69073ba536@sha256:c6e759a89867b41eae2230f5afcad75c7a54f421225d2e46c3e865bd401058ff`. Upstream remains Chatwoot `v4.18.0@9f920b549c14491a4e587687a3eed5d21c6ccc7d`; provenance inspection passed, Enterprise source was absent, runtime Enterprise disabled, provider authority Smart Core.
- The Candidate env template remains pinned to the previously verified immutable image from Source Image run #21. No Candidate or Production Chatwoot runtime exists yet.
- A fresh Railway read-only audit confirmed account `hamed665` can read its Personal workspace; the workspace currently has 0 projects and no Chatwoot Candidate project, service, or deployment. No Railway resources were created. Keep this as a read-only checkpoint; resource provisioning requires an explicitly authorized next step.
- Continue at `SECTION COMMUNICATION / COMM-CHATWOOT-SOURCE`: isolated Candidate hosting/resource provisioning and runtime verification. Keep Shadow Mode ON and provider activity disabled.

## 2026-09-25 Chatwoot Candidate runtime handoff — superseding Railway-zero-resource notes

Semantic cursor remains:

`SECTION COMMUNICATION / COMM-CHATWOOT-SOURCE`

Current main before this docs branch is `a90961e8b329b425bf5935174432f21029e11fd6`. The older notes in this file that say Railway has no project/Candidate runtime are superseded by the runtime evidence below.

Candidate project `smartvisions-chatwoot-candidate` now contains exactly five intended services/resources lanes: dedicated PostgreSQL, dedicated Redis, one-shot prepare, Rails web and Sidekiq worker, plus one private S3-compatible Candidate bucket. The accidental duplicate prepare service created during provisioning was deleted through Railway's required 2FA gate.

All Chatwoot app services use the same immutable image digest:

`ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-4987088dc4ba2e9212e196304ccebd69073ba536@sha256:c6e759a89867b41eae2230f5afcad75c7a54f421225d2e46c3e865bd401058ff`

Verified evidence now includes:

- `db:chatwoot_prepare` + `SMARTVISIONS_CONFIGURE.rb` success;
- Puma production boot on port 3000;
- Sidekiq/Redis authenticated runtime and SidekiqAlive registration;
- Candidate S3 write/read success;
- logical DB backup to Candidate S3 and successful isolated restore verification;
- rollback-capable immutable deployment snapshots;
- no native provider credentials, API Inbox activation, customer import or outbound send.

Operational findings to preserve:

- Candidate PostgreSQL `PGDATA` must be below the volume root;
- Redis password-bearing command requires explicit shell expansion;
- do not disable `FORCE_SSL` to satisfy Railway's internal HTTP healthcheck; Railway's healthcheck was removed because it does not follow the SSL redirect;
- The current Railway Candidate account tier is not Production-sized and has no native volume backup. The verified Candidate recovery path is logical PostgreSQL backup in private S3-compatible storage.

Candidate release-gate closeout evidence now also includes a real post-deploy HTTPS smoke with TLS peer verification: `GET /health` returned 200/`{"status":"woot"}` and `GET /app/login` returned 200; Railway HTTP logs independently recorded both responses. The canonical `chatwoot-prepare` command was restored after the one-shot check.

Remaining work for this checkpoint:

1. reconcile this runtime checkpoint through exact-head CI/review/merge;
2. after merge, re-verify exact-main CI, Cloudflare Production and Production Supabase/safety controls;
3. do not create or activate Production Chatwoot without a separate explicit promotion gate.

Production provider/customer traffic remains out of scope. Shadow Mode stays ON.

## 2026-09-25 Production-promotion readiness checkpoint

Current canonical main before this documentation branch:

`9805c7dc6453d8179b4d2efcae9e5e0c2bdd3f6d`

Verified current evidence:

- exact-main CI is green;
- Cloudflare Production Deploy #727 succeeded on that exact SHA with release-candidate smoke, exact-bundle promotion, route verification, routed Production smoke and safe API/webhook rejection smoke;
- Production Supabase migration head remains `0090_chatwoot_fk_index_hardening`;
- Shadow Mode remains ON and the latest checked one-hour Email/WhatsApp/Outreach outbound counts are zero;
- Railway contains only the isolated `smartvisions-chatwoot-candidate` project; no separate Production Chatwoot project exists;
- the Candidate's five intended services remain SUCCESS;
- Production still contains zero Brands, zero tenant Businesses, zero Chatwoot mappings, zero channel bindings and zero Chatwoot webhook/reconciliation evidence.

The isolated Candidate runtime gate is complete. The next mutating action is **not** API Inbox activation or provider wiring. It is a separately authorized Production source-plane promotion governed by `CHATWOOT_PRODUCTION_PROMOTION_READINESS_AUDIT.md`.

Do not provision Production Chatwoot, attach `inbox.smartvisionsai.com`, create a real Chatwoot Account/API Inbox, move provider credentials, create customer data or weaken Shadow Mode without that separate explicit promotion authorization.

When the Production-promotion gate is authorized, first re-check current main/PRs/CI/Cloudflare/Supabase/Railway and then follow the audit sequence. Never reuse Candidate PostgreSQL/Redis/storage for Production.



## Superseding SALES-PIPELINE-V2 handoff — 2026-09-28

Canonical main at this checkpoint: `6d609ebf4abcd2faadd8f474ec1a48849acdb434`.

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

### Fresh continuation cursor

`SECTION SEGMENT_SALES_MARKETING -> SALES-NEXT-ACTION`

Before mutation, re-verify current main/open PRs/exact-head CI, Production migrations/schema/data/security and exact-main Cloudflare Production evidence.

For `SALES-NEXT-ACTION`, first map and reuse existing canonical authorities for Leads, Deals, CRM Tasks, Conversations, owners/Teams and governed scoring. Audit for stale Lead/Deal detection, bounded follow-up queue/read model, reminders, next-best-action suggestions, human ownership and explicit no-blind-auto-send behavior. Do not introduce a second Task/reminder authority, ownership model, scoring engine, automation engine, queue/outbox or provider send path. Production fixtures remain prohibited.


## Superseding SALES-NEXT-ACTION handoff — 2026-09-28

Canonical main at this checkpoint: `7a923beacb89fa8a39c7f35f0255ad9532ff5d54`.

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

For `MARKETING-CAMPAIGNS`, first map current campaign/outreach/send/audience/suppression/segment/template/provider authorities and verify what already exists in Production. Build only the missing bounded contract. Preserve Shadow Mode and the no-blind-auto-send rule.

---

# Superseding handoff — MARKETING-CAMPAIGNS closed, 2026-09-28

Canonical main: `b9dc839dcc30fbfb398852fc18258196290ab75c`.

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

Before any MARKETING-ATTRIBUTION mutation, fresh-check current main/open PRs/exact-head CI, Production migrations/schema/data/security and the existing outreach/reply/conversation/Lead/Deal evidence graph. Runtime/Production evidence remains authoritative.



---

# Superseding handoff — MARKETING-ATTRIBUTION closed


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