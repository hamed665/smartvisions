# Customer 360 + CRM Normalization — Evidence, Gap Map, and Identity Foundation

Status: **Phase 3 active — Slice 1 through Slice 4 Production-verified**  
Slice 1 merge: PR #178 -> `main@27e980e417ec52c64055c029b8ffa6c6c77ab961`  
Slice 1 Production migration: `0070_crm_identity_foundation` -> version `20260922164110`  
Slice 2 merge: PR #179 -> `main@efcf979ff15d32062b48928672a25128c521987a`  
Slice 2 Production migration: `0071_customer_360_timeline` -> version `20260922202957`  
Slice 2 Production Worker: `a78567d8-e4f9-484e-a62b-2bd8e47b8583`

## 1. Production evidence

Phase 3 extends the existing Growth OS CRM. It does not create a second CRM.

Observed Production facts before this slice:

- `businesses` is the canonical external/prospect/customer Company/Account record used by Hunter, Google Places, Website Audit and lead acquisition;
- `leads` is the canonical lead/opportunity record and references `businesses`;
- all 19 current Leads reference a Business;
- `sales_conversations` and `conversation_messages` reference Leads, not a separate Contact entity;
- Email inbound currently resolves a customer by exact `businesses.email`;
- WhatsApp inbound currently resolves a customer by exact normalized `businesses.whatsapp | phone | international_phone`;
- current `businesses` contact-point coverage is 4 Email, 13 Phone, 13 International Phone, 14 WhatsApp and 3 Instagram values;
- current Business contact points contain no duplicate Email, Phone or WhatsApp identity inside the Organization;
- WhatsApp durable evidence contains `from` and usually `contactName`;
- every WhatsApp identity currently linked to a Lead matches that Lead's Business contact point; no linked identity maps to multiple Leads;
- Email and WhatsApp provider journals remain canonical channel evidence from Phase 2;
- there is no Production table matching Contact, Identity, Deal, Task, Segment, Pipeline, Account, Activity or Custom Field/Object;
- a provider profile/display name is evidence only and is not sufficient to fabricate a canonical person.

## 2. Gap Map

| Capability | CURRENT | TARGET | Decision | Rule |
| --- | --- | --- | --- | --- |
| Company / Account | `businesses` | CRM Company/Account | **REUSE** | Do not rename or duplicate in Phase 3. |
| Lead / opportunity | `leads` | lead/opportunity foundation | **REUSE + EXTEND** | Keep IDs/state; Deals come later as a deliberate domain extension. |
| Conversation | `sales_conversations` | Customer 360 conversation timeline | **REUSE + EXTEND** | Do not add a second inbox/conversation store. |
| Messages | `conversation_messages`, channel journals | timeline/message evidence | **REUSE** | Provider journals remain channel source of truth. |
| Contact points | Email/Phone/WhatsApp/Instagram columns on `businesses` | normalized identity registry | **ADAPT** | Existing fields remain compatibility truth until migration is proven. |
| Identity resolution | direct Email/phone lookups | deterministic tenant-scoped resolution | **NEW** | Fail closed on ambiguity; no fuzzy auto-merge. |
| Person Contact | none | canonical person/contact entity | **DEFERRED NEW** | Do not create a person from provider display name alone. |
| Activities/tasks | follow-up/handoff/reply/operator primitives | governed activity/task model | **EXTEND/NEW later** | Reuse existing evidence first. |
| Pipeline/deals | Lead status + conversation stage | explicit deal/pipeline domain | **NEW later** | Do not duplicate Lead lifecycle in the identity slice. |
| Segments | none | governed segments | **NEW later** | Depends on normalized Customer 360 facts. |
| Custom fields/objects | JSON fields scattered by domain | governed custom field/object registry | **NEW later** | Depends on canonical CRM entities first. |
| Customer timeline | messages + reply/handoff/follow-up evidence | unified timeline query | **ADAPT later** | Build from canonical evidence, not copied event tables. |
| Merge/conflict rules | exact business dedupe + fail-closed channel matching | explicit identity conflict state | **NEW** | First slice stores ambiguity instead of overwriting it. |

No `REPLACE` decision exists.

## 3. First slice: CRM Identity Foundation

The first Phase 3 slice introduces two new facts:

### `crm_identities`

One normalized identity per Organization and identity type.

Initial identity types:

- `EMAIL`
- `PHONE`
- `WHATSAPP`
- `INSTAGRAM`

This table owns the normalized identity value. It does **not** claim that the identity is a verified human person.

### `crm_identity_links`

Evidence linking one CRM Identity to the existing canonical `businesses` Account.

A single Identity may have evidence for more than one Business. That situation is represented as conflict and resolution fails closed.

Identity links record:

- source type;
- source reference;
- evidence strength;
- link status;
- first/last seen timestamps;
- metadata.

The design intentionally allows ambiguity to exist as evidence rather than forcing one Business owner with a unique FK.

## 4. Identity resolution rules

Resolution is deterministic:

1. normalize according to identity type;
2. find the tenant-scoped `crm_identities` row;
3. read non-retired links;
4. zero distinct Businesses -> `NO_MATCH`;
5. exactly one distinct Business and no conflicted evidence -> `MATCH`;
6. more than one Business or a conflicted link -> `AMBIGUOUS`.

No fuzzy name match, AI inference or cross-tenant lookup may produce an automatic match.

## 5. Normalization

- Email: trimmed, lowercase, must contain a plausible `@` separator.
- Phone/WhatsApp: digits only, minimum 8 digits.
- Instagram: lowercased handle; standard Instagram profile URLs are reduced to the first path segment; leading `@` is removed.

Normalization is deterministic and side-effect free.

## 6. Backward compatibility

Migration/backfill derives identity evidence from existing `businesses` fields but does not remove or rewrite those fields.

Backfilled Business-field links are `OBSERVED`, not automatically human-verified.

Runtime Email/WhatsApp lookup follows:

```text
Identity Registry
  -> exact unambiguous match
  -> existing Business/Lead lifecycle
else
Legacy exact lookup
  -> preserve current behavior
  -> record new identity evidence when a single exact Business is proven
```

This means rollout can be reversed to the existing lookup without losing CRM/Lead IDs.

## 7. Conflict policy

An Identity linked to multiple distinct Businesses becomes `CONFLICTED`.

Conflict behavior:

- do not auto-select one Business;
- do not auto-merge Businesses;
- do not send because of identity inference alone;
- preserve evidence for operator/manual resolution later;
- provider inbound may remain unlinked when ambiguity exists.

## 8. Security

- every identity/link carries `organization_id`;
- composite tenant FKs prevent cross-tenant links;
- `organization_id` is immutable after insert;
- authenticated Organization members may read identity evidence;
- runtime mutation is service-side only in this first slice;
- `anon` has no access;
- raw identity values are not copied into audit-log before/after payloads;
- audit uses identity fingerprints/IDs and link metadata without duplicating PII.

## 9. Audit

Important identity/link mutations write to existing `audit_logs`.

Audit evidence includes:

- Organization;
- entity type/id;
- identity type and a SHA-256 fingerprint rather than raw normalized identity;
- Business ID for link mutations;
- source/evidence/link status;
- DB transaction correlation fallback.

No second audit ledger is introduced.

## 10. Commands / queries

Initial trusted command:

- `RecordBusinessIdentityEvidence`

Initial query:

- `ResolveBusinessByIdentity`

No provider action is introduced.

## 11. Data migration

Initial backfill reads existing Business fields:

- `businesses.email`
- `businesses.phone`
- `businesses.international_phone`
- `businesses.whatsapp`
- `businesses.instagram`

Invalid/blank identity values are skipped.

If an identity has links to more than one Business after backfill, all non-retired links become `CONFLICTED`.

The migration does not create Leads, Conversations, Contacts, Deals or provider sends.

## 12. Phase 3 later slices

After Identity Foundation is proven:

1. canonical Person/Contact model only when real person evidence/entry paths are defined;
2. Customer 360 query/timeline over existing canonical evidence;
3. activity/task normalization over follow-up/handoff/operator evidence;
4. explicit pipeline/deal model;
5. merge/manual conflict-resolution commands;
6. segments;
7. custom fields/objects.

## 13. Test contract

Required before merge:

- deterministic normalization tests;
- no cross-tenant identity resolution;
- identity resolution returns MATCH / NO_MATCH / AMBIGUOUS correctly;
- backfill preserves existing Business IDs;
- direct authenticated identity mutation is denied;
- service-role evidence command is idempotent;
- same identity + second Business becomes conflict;
- tenant ownership is immutable;
- audit does not duplicate raw normalized identity values;
- Email/WhatsApp legacy fallback remains available;
- lifecycle integration records evidence only after an exact single Business match;
- no provider send path is added;
- PostgreSQL 17 migration smoke;
- lint;
- typecheck;
- full Vitest;
- Next build;
- Vinext build;
- Cloudflare scheduled verification.

## 14. Non-scope

This first slice does not add:

- a fabricated Person Contact from provider profile names;
- Deals/Pipelines;
- Tasks;
- Segments;
- Custom Objects;
- a second Conversation store;
- a second Account/Company table;
- provider messages;
- autonomous merge.


## 15. Implementation verification evidence

The first implementation slice has been exercised on PostgreSQL 17 before Production promotion.

Verified on implementation head `7a394f3fe42aa7c25a758cfffd90d094f292294d`:

- lint passed;
- typecheck passed;
- full Vitest passed;
- migration chain `0068 -> 0069 -> pre-0070 CRM fixtures -> 0070 -> CRM identity smoke -> Control Plane smoke` passed;
- pre-migration Business contact points backfilled without rewriting Business IDs;
- Phone and International Phone evidence for the same number deduped to one identity;
- the same normalized identity remains isolated across Organizations;
- authenticated direct identity mutation is denied;
- service-role evidence recording is idempotent;
- linking one identity to a second Business produces explicit conflict instead of auto-merge;
- tenant ownership is immutable;
- CRM identity audit stores SHA-256 fingerprints rather than raw normalized identity values;
- the identity evidence RPC remains SECURITY INVOKER;
- Email and WhatsApp remain registry-first with legacy exact fallback for controlled rollout;
- Next build passed;
- Vinext build passed;
- Cloudflare scheduled verification passed.

Two defects were caught by the PostgreSQL gate before Production:

1. PostgreSQL regex escaping initially used the wrong backslash form and was corrected against live PostgreSQL behavior.
2. RPC output parameter names initially collided with table column names in PL/pgSQL and were renamed to avoid ambiguity.

Migration 0070 was subsequently merged and promoted to Production. Production verification confirmed 47 identities, 47 evidence links, zero conflicted identities, zero cross-tenant mismatches, unchanged safety controls and zero outbound Email/WhatsApp rows after PR #178. Cloudflare runtime evidence after promotion shows Worker version `562c495f-ceeb-4021-b2d9-122ddc04021b`.


## 16. Slice 2 — Customer 360 Timeline

Production evidence showed that Customer 360 already has durable facts spread across canonical stores:

- `conversation_messages`: Agent/Human outbound message lifecycle and internal blocked/approval-required/failed evidence;
- `outreach_messages`: durable inbound customer messages plus cold/outbound ledger evidence;
- `whatsapp_events` and `email_events`: provider delivery/read/bounce status authority;
- `followup_jobs`: scheduled follow-up state;
- `handoff_events`: durable Human/Auto mode changes;
- `reply_events`: reply classification evidence;
- `operator_briefs`: operator-facing handoff/action summaries.

The current Production sample also proved overlap:

- one provider message currently appears in both `conversation_messages` and `outreach_messages`;
- provider journals overlap with the message ledgers and therefore must enrich delivery state rather than become duplicate timeline rows;
- all current `conversation_messages` and `outreach_messages` are Lead-linked;
- current Businesses have at most one Lead, but the read model supports multiple Leads per Business.

### Slice 2 decision

**ADAPT, do not copy.**

Migration 0071 introduces:

- `public.crm_customer_timeline`: conventional PostgreSQL view with `security_invoker=true`;
- `public.get_crm_customer_timeline(...)`: stable SECURITY INVOKER cursor query;
- no timeline table;
- no materialized view;
- no trigger;
- no provider action;
- no copied journal/event rows.

The read model maps canonical evidence into:

- customer-visible inbound messages;
- actually sent outbound messages;
- internal approval/blocked/failed message evidence;
- follow-up jobs;
- Human handoff events;
- reply classification;
- operator briefs.

Provider journals only enrich the latest canonical delivery status.

### Dedupe rule

When `conversation_messages` and `outreach_messages` share the same Organization + Channel + provider message ID and the conversation row is customer-visible, the conversation row wins.

This prevents one real message from appearing multiple times merely because multiple canonical ledgers record different parts of its lifecycle.

### Visibility rule

`CUSTOMER` means the event represents an actual customer interaction.

`INTERNAL` includes:

- blocked drafts;
- approval-required drafts;
- failed/unsent messages;
- follow-up scheduling evidence;
- handoff evidence;
- reply classification;
- operator briefs.

An internal draft must never be presented as though the customer received it.

### Security

- the view is SECURITY INVOKER and therefore preserves RLS from underlying canonical tables;
- the API uses the signed-in Supabase session, not service-role credentials;
- `anon` has no view or RPC access;
- `service_role` is intentionally not granted timeline view/RPC access because existing Production grants on handoff/reply/operator sources are narrower and do not need to be widened;
- authenticated Organization members receive read-only access through existing underlying tenant RLS.

### Pagination

The RPC orders by:

```text
occurred_at DESC, item_id DESC
```

and uses the same two fields as the cursor. This avoids losing or repeating events when multiple facts share the same timestamp.

### Verification

Implementation head `3f25b41d052519ddffb8a5ce7f8f8503d38fa97f` passed CI #854:

- lint;
- typecheck;
- full Vitest;
- PostgreSQL 17 migration chain through 0071;
- SECURITY INVOKER view/RPC verification;
- authenticated tenant isolation and cross-tenant denial;
- provider-ID message dedupe;
- WhatsApp latest READ enrichment;
- Email latest DELIVERED enrichment;
- blocked-draft INTERNAL classification;
- provider journal non-duplication;
- customer-only filtering;
- deterministic two-part cursor pagination;
- Next build;
- Vinext build;
- Cloudflare scheduled-bundle verification.

Migration 0071 was subsequently merged and promoted to Production. Production verification confirmed:

- view option `security_invoker=true`;
- query RPC `security_definer=false`;
- authenticated SELECT/EXECUTE only; anon and service_role have no timeline view/RPC access;
- existing service-role restrictions on `handoff_events`, `reply_events` and `operator_briefs` remain unchanged;
- 85 real timeline items across 9 Businesses;
- 65 CUSTOMER and 20 INTERNAL items;
- 42 inbound and 23 actually-sent outbound customer interactions;
- 4 blocked, 9 approval-required and 1 failed message remain internal;
- provider-journal standalone rows = 0;
- duplicate customer provider-ID groups = 0;
- customer-visible unsent rows = 0;
- authenticated owner RLS sees the expected 85 rows and a random inaccessible Business returns zero rows;
- Supabase Security Advisor findings are unchanged from baseline;
- no new Performance Advisor class was introduced;
- zero Email/WhatsApp outbound rows were created by the merge/migration/deploy verification.

Cloudflare Production Deploy #332 promoted exact `main@efcf979ff15d32062b48928672a25128c521987a`. Wrangler reported Production Worker version `a78567d8-e4f9-484e-a62b-2bd8e47b8583`; Worker Route, routed smoke, candidate smoke, safe production API/webhook rejection smoke and the `*/2 * * * *` scheduled-trigger invariant all passed. The deployment smoke invoked no outbound provider send.


## 17. Slice 3 — Activity + Task Normalization

### Production evidence

Before this slice, Production already had durable Activity evidence but no general human Task lifecycle:

- `followup_jobs`: 6 rows, all `PENDING`; 4 were already due at audit time. These are automation jobs and remain their own source of truth.
- `handoff_events`: immutable conversation-mode change evidence.
- `reply_events`: immutable reply-classification evidence.
- `operator_briefs`: operator summaries with `requires_action`, but no assignee/due/priority/completion lifecycle.
- `reply_decisions`: approval-specific commercial reply decisions; not a general Task system.
- `conversation_messages`: 9 `APPROVAL_REQUIRED` rows and 4 `BLOCKED` rows. Approval remains an Action/Approval concern and is not auto-converted into Task.
- Customer 360 Timeline already normalizes historical Activity. A second activity/event table would duplicate canonical evidence.

### Decision

**REUSE Activity, NEW Task.**

Historical facts remain in their canonical stores and Customer 360 Timeline.  
`crm_tasks` owns only actionable human work.

A Task is not created merely because an Activity exists.

### Task model

Migration `0072_crm_task_foundation.sql` adds:

- `crm_tasks`;
- tenant-safe Business -> Lead -> Conversation lineage;
- Organization-member assignee;
- task type, priority, due date and current status;
- optimistic `version`;
- idempotent `request_key`;
- immutable source provenance;
- completion/cancellation evidence;
- PII-minimized audit summaries;
- SECURITY INVOKER cursor query `get_crm_tasks(...)`.

Task states:

```text
OPEN
  -> IN_PROGRESS | BLOCKED | DONE | CANCELED

IN_PROGRESS
  -> OPEN | BLOCKED | DONE | CANCELED

BLOCKED
  -> OPEN | IN_PROGRESS | DONE | CANCELED

DONE
  -> OPEN  # explicit reopen/correction only

CANCELED
  -> terminal
```

### Activity boundary

Existing primitives keep ownership:

- Follow-up execution -> `followup_jobs`;
- Human/AI mode history -> `handoff_events`;
- Reply classification -> `reply_events`;
- Operator summary -> `operator_briefs`;
- Approval -> existing approval/action primitives;
- Customer interaction history -> Customer 360 Timeline.

No historical row is backfilled into `crm_tasks`.

### Source provenance

Source types are reserved for future explicit commands:

- `FOLLOWUP_JOB`
- `HANDOFF_EVENT`
- `REPLY_EVENT`
- `OPERATOR_BRIEF`
- `APPROVAL_REQUEST`
- `OTHER`

In this first slice, authenticated users may create only `MANUAL` tasks. This prevents a client from forging trusted source provenance.

A later trusted system command may create a source-linked Task only with idempotency and audit.

### Authorization

- all Organization members may read Tasks;
- `OWNER | ADMIN | SALES_MANAGER` may create/manage Tasks;
- `SALES_AGENT` may create/manage only self-assigned Tasks;
- `VIEWER` is read-only;
- assignee must be a member of the same Organization;
- no DELETE grant exists; cancellation is a state transition;
- API uses the signed-in Supabase session and RLS;
- no service-role browser path is introduced.

### Concurrency and evidence

Every update increments `version`. API PATCH requires `expectedVersion`; stale updates return a version conflict instead of silently overwriting newer work.

Completion/cancellation actor and timestamps are database-governed. Task title/description are intentionally omitted from audit before/after summaries.

### Non-scope

Slice 3 does not:

- auto-create Tasks from all Timeline items;
- turn `followup_jobs` into human Tasks;
- replace approvals;
- add Deals/Pipelines;
- fabricate Person Contacts;
- add provider sends;
- add a second activity/event store.


## 18. Slice 3 Production verification

Slice 3 merged in PR #181 at `main@4c2a4d3bc78a57088f92ba8eae82542d501a37dc`.

Production migration:

- `0072_crm_task_foundation` -> version `20260922214407`

Post-promotion verification confirmed:

- `crm_tasks` exists with RLS enabled;
- authenticated grants are exactly SELECT / INSERT / UPDATE; no DELETE;
- anon and service_role have no Task table SELECT;
- `get_crm_tasks(...)` is SECURITY INVOKER and authenticated-only;
- all Task trigger/helper/query functions remain SECURITY INVOKER;
- Organization -> Business -> Lead -> Conversation composite lineage FKs are present;
- Task assignee, creator, completer and canceler are Organization-member scoped;
- Production Task row count remained exactly **0** after migration: historical Activity was not fabricated into Tasks;
- no Task audit rows were fabricated by migration;
- Shadow Mode remained ON;
- global/channel/Agent safety controls remained unchanged;
- outbound Email/WhatsApp rows created by architecture verification: **0**.

A rollback-only Production transaction smoke then verified the real RLS/trigger path:

```text
OPEN version 1
  -> DONE version 2 + completion evidence
  -> OPEN version 3 + completion evidence cleared
```

The transaction also verified Task audit generation and confirmed the task title was not copied into audit before/after payloads. The entire smoke transaction was rolled back, leaving Task and audit fixture counts unchanged at zero.

### Post-0072 advisor cleanup

Supabase Performance Advisor reported five new unindexed Task foreign keys after 0072.

PR #182 added only those five covering indexes and merged at:

`main@1eab75f73a5ae99a973e5616bb30c09325b9a680`

Production migration:

- `0073_crm_task_fk_indexes` -> version `20260922214843`

Verified indexes:

- `crm_tasks_org_created_by_fk_idx`
- `crm_tasks_org_completed_by_fk_idx`
- `crm_tasks_org_canceled_by_fk_idx`
- `crm_tasks_org_conversation_lead_fk_idx`
- `crm_tasks_org_lead_business_fk_idx`

After 0073, Supabase Performance Advisor reported **zero `unindexed_foreign_keys`**. Remaining Task index findings are only expected `unused_index` INFO immediately after creation.

Security Advisor remained unchanged from the known baseline:

- Telegram service-only RLS/no-policy INFO x2;
- leaked-password protection setting warning.

### Runtime evidence

The first heartbeat after the Slice 3 runtime deployment changed the Cloudflare Worker version from:

`417eab3e-1485-4f0b-925b-25f1c0e0acd6`

to:

`84d19f06-ead7-4abe-b332-ba14309629d8`

with:

- `failed=0`;
- acquisition `SKIPPED`;
- dispatch `SKIPPED`;
- zero outbound Email/WhatsApp rows in the verification window;
- zero persisted Task/audit smoke fixtures.

A route-specific unauthenticated HTTP smoke could not be fetched from the current execution environment because its public DNS was unavailable there. Runtime deployment is therefore claimed from the new Worker heartbeat/version evidence, not from a fabricated HTTP result.

## 19. Next Phase 3 dependency — Deal / Pipeline normalization

Production evidence shows that the word "opportunity" is currently overloaded:

- `growth_opportunities` is acquisition/qualification routing evidence for external Businesses;
- `intent_opportunities` is detected external intent evidence;
- neither is a canonical CRM sales Deal;
- `leads.status` currently contains operational lead states such as `NEW`, `READY_TO_CONTACT`, `REPLIED`, and `HUMAN`;
- `sales_conversations.stage` currently contains conversation states such as `NEW`, `ACTIVE`, `NEEDS_HUMAN`, and `FOLLOW_UP_DUE`.

Those existing primitives must not be renamed or repurposed into sales-pipeline financial truth.

The next slice must therefore first produce a Deal/Pipeline Gap Map covering:

- pipeline definition and ordered stages;
- Deal as a separate commercial aggregate linked to existing Business/Lead;
- amount/currency and expected-close semantics;
- owner/assignee;
- WON/LOST terminal evidence and reason;
- stage-history/audit;
- idempotent creation/conversion from Lead only through an explicit command;
- no automatic Deal creation merely because a Lead or acquisition Opportunity exists;
- compatibility with future Quote/Booking/Payment modules.

No Person Contact model should be fabricated merely to unblock Deals.


## 20. Slice 4 — Deal + Pipeline Normalization

### Production Gap Map

Production evidence before this slice:

- 19 existing Leads, all Business-linked;
- 14 `growth_opportunities`, all acquisition/qualification routing evidence in `MUSCAT_LOCAL_GROWTH`;
- 12 of those 14 Growth Opportunities are tier A and marked `should_contact=true`;
- `intent_opportunities` currently contains zero rows;
- Lead statuses are operational (`NEW`, `READY_TO_CONTACT`, `REPLIED`, `HUMAN`);
- Conversation stages are operational (`NEW`, `ACTIVE`, `NEEDS_HUMAN`, `FOLLOW_UP_DUE`);
- no Production table matching Deal, Pipeline or Sales Stage exists;
- no existing primitive owns canonical commercial amount/currency, expected-close, owner or WON/LOST revenue truth.

Decision:

- **REUSE** `businesses` as Account/Company;
- **REUSE** `leads` as Lead foundation;
- **REUSE** existing Growth/Intent Opportunities as acquisition evidence only;
- **NEW** `crm_pipelines`, `crm_pipeline_stages`, `crm_deals`;
- **REUSE** `audit_logs` for immutable Deal stage history;
- no automatic Deal backfill or Opportunity->Deal reclassification.

### Commercial model

Deal aggregate state is:

```text
OPEN -> WON | LOST
```

Pipeline stages are configurable ordered labels and each stage is categorized as `OPEN`, `WON` or `LOST`. Every Pipeline requires at least one OPEN stage and exactly one WON and one LOST stage.

Deal owns:

- Business;
- optional Lead;
- Pipeline + Stage;
- amount + ISO-4217-style 3-letter currency pair;
- expected close;
- owner;
- terminal WON/LOST evidence;
- immutable source provenance;
- request-key idempotency;
- optimistic version.

Terminal commercial truth is frozen after WON/LOST.

### Lead conversion

Lead -> Deal is explicit through `create_crm_deal_from_lead(...)`.

The command:

- derives Business from the canonical Lead;
- preserves Lead provenance;
- requires an explicit Pipeline/Stage/owner;
- is idempotent by Organization + request key;
- does not mutate Lead state;
- does not create a Deal merely because a Lead or Growth Opportunity exists.

Manual Deals remain separately supported with `source_type=MANUAL`.

### Authorization

- Organization members read Pipelines/Stages/Deals;
- OWNER / ADMIN / SALES_MANAGER manage Pipeline definitions and Deals;
- SALES_AGENT may manage only self-owned Deals;
- VIEWER is read-only;
- no DELETE grants;
- signed-in Supabase session + underlying RLS only;
- no service-role browser path.

### History

`crm_deal_stage_history` is a SECURITY INVOKER read model over existing `audit_logs`. No second Deal event store is created.

### Non-scope

Slice 4 does not:

- rename `growth_opportunities` or `intent_opportunities`;
- convert every Lead to Deal;
- fabricate Person Contacts;
- add Quotes/Payments;
- add provider sends;
- seed tenant Pipelines in migration.


## 21. Slice 4 Production database verification

Slice 4 merged in PR #184 at:

`main@d416fcee020bc393a45096ee1330f8378bbd8e38`

Production migration:

- `0074_crm_deal_pipeline_foundation` -> version `20260922225908`

The exact migration blob promoted from main matches the exact PR head tested on PostgreSQL 17.

Production verification confirmed:

- `crm_pipelines`, `crm_pipeline_stages`, `crm_deals` exist with RLS enabled;
- each new commercial table has three authenticated RLS policies;
- browser/runtime grants are authenticated SELECT / INSERT / UPDATE only; no DELETE;
- no anon or service-role browser table grant was introduced;
- Pipeline/Deal helper, guard, command and query functions remain SECURITY INVOKER;
- `crm_deal_stage_history` is `security_invoker=true`;
- Pipeline, Stage and Deal composite tenant FKs are present;
- Production rows after migration are exactly 0 Pipelines / 0 Stages / 0 Deals / 0 Deal-history rows;
- migration fabricated no revenue/commercial truth;
- Supabase Security Advisor is unchanged from the known baseline;
- Supabase Performance Advisor reported no new `unindexed_foreign_keys` class after 0074; only expected `unused_index` INFO on empty/new tables;
- Shadow Mode and all send-safety controls remained unchanged;
- Email/WhatsApp outbound rows created by Slice 4 architecture verification: 0.

A rollback-only Production transaction smoke then verified the real authenticated/RLS path without leaving fixtures:

1. create a valid Pipeline through `create_crm_pipeline_with_stages(...)`;
2. create an explicit Deal from an existing canonical Lead;
3. verify Business lineage was derived from that Lead;
4. move the Deal OPEN -> WON;
5. verify `won_at` and optimistic version evidence;
6. verify Deal stage history contains create + stage-change evidence;
7. attempt to mutate terminal amount and confirm terminal commercial truth is rejected;
8. roll back the entire transaction.

Post-rollback counts remained 0 Pipelines / 0 Stages / 0 Deals / 0 Deal-history rows and 0 smoke audit residue.

### Runtime promotion gate

Database promotion is proven. Cloudflare application runtime must not be claimed as promoted until runtime evidence shows a Worker version change after PR #184 merge with `failed=0`.

At the last pre-closeout check, the heartbeat still reported Worker version:

`6d12f286-9584-4733-a168-eba61cf1a397`

Therefore this document deliberately records runtime promotion as **pending evidence**, not as complete.


## 20. Slice 4 Production runtime closeout

Slice 4 merged in PR #184 at `main@d416fcee020bc393a45096ee1330f8378bbd8e38`.

Production migration:

- `0074_crm_deal_pipeline_foundation` -> version `20260922225908`

Verified Production database state:

- `crm_pipelines`, `crm_pipeline_stages` and `crm_deals` have RLS enabled;
- stage history remains a SECURITY INVOKER view over the existing audit ledger;
- migration and rollback-only verification left exactly 0 Pipelines / 0 Stages / 0 Deals;
- no Growth/Intent Opportunity row was reclassified or auto-converted;
- zero architecture-test Email/WhatsApp outbound rows were created.

Cloudflare runtime promotion is now proven by a post-merge heartbeat with Worker version:

`47d22421-109e-4c1e-81e6-20bb273078e1`

Latest checked heartbeat evidence:

- `failed=0`;
- acquisition `SKIPPED`;
- dispatch `SKIPPED`;
- zero Email/WhatsApp outbound rows after PR #184 merge.

Slice 4 is therefore Production-verified across schema, runtime and safety evidence.
