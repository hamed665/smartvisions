# Smart Visions Growth OS — Current Production State

**Reconciled:** 2026-09-26 (Oman, UTC+4)

This is the current operational handoff for Growth OS. Current `main`, routed Cloudflare Production and Production Supabase evidence override older planning documents, stale issue text and chat history.


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
