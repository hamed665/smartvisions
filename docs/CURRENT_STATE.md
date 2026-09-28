# Smart Visions Growth OS — Current Production State

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
