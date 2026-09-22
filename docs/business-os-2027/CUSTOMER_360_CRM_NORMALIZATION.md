# Customer 360 + CRM Normalization — Evidence, Gap Map, and Identity Foundation

Status: **Phase 3 active — Slice 1 and Slice 2 Production-verified**  
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
