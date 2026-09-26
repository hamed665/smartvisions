# COMM-UNIFIED-INBOX — verified gap audit and security split

Status: SECURITY BOUNDARY MERGED; RECONCILER PACKAGE IN IMPLEMENTATION

Verified on: 2026-09-26

## Authority order used

Runtime / Production evidence > current GitHub > current docs > handoff/chat memory.

This document records only facts verified for the COMM-UNIFIED-INBOX cursor. It does not reactivate COMM-TENANT-BRIDGE and does not authorize Production Chatwoot provisioning.

## Fresh reality checkpoint

- GitHub main before this work: `f5c9abe43443aa0595b1af75baee421b7923c4ee`.
- Open PRs before branch creation: 0.
- Exact-main CI: green.
- Exact-main Cloudflare Production Deploy: green.
- Production Worker version observed from the exact deploy: `0c0f8cf1-fca6-43d5-9fc6-7beca438ae6e`.
- Production deploy log states `CHATWOOT_PLATFORM_TOKEN` is not configured.
- `CHATWOOT_PROVISIONING_ENABLED=false`.
- Production Supabase migration head before this package: `20260926105514 / 0092_chatwoot_external_first_scoped_demotion`.
- Production hierarchy and Chatwoot projection row counts remain zero; no synthetic tenant data was created.
- Shadow Mode remains ON.
- Since the previous merged main checkpoint there was no new outbound delta in Email, WhatsApp or Outreach.
- Production Chatwoot `/health`: HTTP 200 with `{"status":"woot"}`.
- Production Chatwoot login: HTTP 200.
- Smart Core login: HTTP 200.
- OVH VPS is the canonical Production Chatwoot runtime. Railway is not part of the active Production path.

## Existing conversation surface

The existing Smart Core conversation surface is reused, not replaced:

- `app/conversations/page.tsx`
- `app/conversations/[id]/page.tsx`
- `app/conversations/[id]/live-conversation.tsx`
- `app/api/conversations/[id]/live/route.ts`
- `app/api/conversations/[id]/control/route.ts`
- `app/api/conversations/[id]/owner-reply/route.ts`
- `lib/conversations/memory-read-model.ts`

Current list/detail/live reads come from Smart Core `sales_conversations`, `conversation_messages`, `operator_briefs`, `agent_runs` and related CRM rows. They are not a Chatwoot-native inbox proxy.

The current owner manual reply route already sends through Smart Core authority and safety checks. It does not make the browser or Chatwoot the provider send authority. That path must remain intact.

## Verified security gap

Production RLS before this package uses Organization-member-wide `ALL` policies for:

- `sales_conversations`
- `conversation_messages`
- `operator_briefs`
- `agent_runs`
- `leads`
- `businesses`

CRM identity reads are also Organization-member-wide. The audit also found adjacent legacy Growth OS surfaces such as WhatsApp/Email event history, handoff/reply/outreach state and runtime-control tables that are still guarded only by Organization membership. Without an additional boundary, a scoped-only Supabase session could bypass the Inbox routes and query those Organization-wide surfaces directly.

This security package therefore adds a restrictive business-wide overlay to legacy surfaces that do not yet have their own canonical target-scope mapping. Scoped-only sessions fail closed on those surfaces, while existing business-wide operators retain their current access. Audit INSERT remains available for bounded operator actions, but the Organization-wide audit stream is hidden from scoped-only readers.

The existing `sales_conversations` row has no canonical tenant Business / Branch / Department / Team lineage and no Chatwoot Conversation mapping. Therefore a scoped-only operator cannot be secured by filtering React output or by a route-only predicate. Direct Data API access would remain broader than the intended scope.

That is an authorization/RLS/tenant-isolation critical change, so the delivery packaging standard requires it to be reviewed independently from the larger UI/API package.

## Security package boundary

Migration `0093_comm_unified_inbox_scope_boundary.sql` adds one Communication Plane projection:

`unified_inbox_conversation_projections`

It binds an existing Smart Core `sales_conversations.id` to:

- canonical Brand / tenant Business / Branch / optional Department / optional Team;
- existing communication channel binding;
- existing Chatwoot API Inbox mapping;
- optional existing Chatwoot Team mapping;
- Chatwoot Conversation display ID and UUID;
- non-canonical communication snapshots such as Chatwoot status, labels, assignee and last activity.

This is not a second Conversation source of truth and not a CRM table. It contains no provider credential and no provider send authority.

The projection's tenant/channel identity is immutable and direct mutation is dormant behind `smartvisions.unified_inbox_projection_command`. Department/Team assignment snapshots are intentionally reconcilable so future assignment/transfer does not require a second Conversation row. This package grants no INSERT/UPDATE/DELETE path to authenticated or service_role. The idempotent runtime reconciler is intentionally deferred to the next coherent package.

## Scope semantics

The database scope resolver preserves the existing canonical scope precedence:

TEAM > DEPARTMENT > BRANCH > BUSINESS > BRAND > Organization fallback.

OWNER remains OWNER. Business-wide ADMIN / SALES_MANAGER / SALES_AGENT retain their existing Organization-wide Smart Core read surface. A Business-wide VIEWER with no lower-scope assignment is also read-only Organization-wide inside Smart Core; C5 still denies that role native Chatwoot AccountUser/SSO.

The established scoped-only representation is different: Organization VIEWER plus one or more lower-scope assignments. For that user, the deepest applicable assignment wins. Outside all explicit assignments the resolver returns no role instead of falling back to Organization VIEWER, so a Branch-only user cannot see another Branch.

VIEWER is a valid Unified Inbox read role. It remains non-mutating at the direct authenticated RLS boundary. A deeper TEAM VIEWER can therefore reduce a broader BRANCH SALES_AGENT without accidentally losing the ability to read that Team.

ABAC assignment attributes fail closed in this database boundary when an applicable assignment requires non-empty attributes. Trusted policy-attribute contexts remain a server concern; SQL does not invent them.

Scoped-only conversation visibility requires an ACTIVE/DEGRADED projection matching canonical scope. Legacy/unprojected rows remain visible to OWNER and business-wide Organization operators for backward compatibility, but they do not become an implicit scope grant for scoped-only staff.

## Contact truth

The package does not create Chatwoot Contacts as canonical customers.

Scoped CRM visibility is derived through the already-authoritative Smart Core chain:

accessible projected conversation
→ existing Smart Core lead
→ existing Smart Core business/customer record
→ existing CRM identity links/identities.

This prevents the Unified Inbox from becoming a second CRM while avoiding broader direct Data API contact visibility for scoped-only staff.

## Test gate

CI must run the migration and a PostgreSQL 17 smoke test that proves:

- OWNER retains intended current conversation visibility;
- scoped-only Branch staff see only the projected Branch conversation and its messages/contact truth;
- a different Branch does not leak;
- TEAM VIEWER overrides a broader BRANCH SALES_AGENT assignment while retaining read-only visibility;
- scoped-only sessions cannot escape through raw Organization-wide communication/event surfaces;
- scoped staff cannot mutate the conversation;
- Business-wide ADMIN preserves its existing Organization-wide read surface, including legacy rows;
- Business-wide VIEWER with no lower-scope assignment retains read-only Organization-wide visibility;
- no authenticated/service-role projection writer is opened by this security package.

## Deliberately not implemented in this security package

The following remain in the next COMM-UNIFIED-INBOX vertical package:

- signed webhook/API reconciliation into the projection;
- durable idempotent projection mutation claims;
- bounded Chatwoot read adapter for scoped users;
- deterministic cursor pagination/search/filter counters;
- per-user read/unread state;
- status/labels/assignment/team transfer reconciliation;
- internal notes;
- attachment read bounds;
- audit hooks for operator read/write actions;
- existing UI extension and mobile/accessibility/i18n-ready contracts.

No Production Chatwoot token, provisioning flag, Shadow Mode, provider credential or outbound safety control is changed here.


## Reconciler package cursor

The next vertical package is journal-first:

signed API Inbox webhook
→ existing `chatwoot_webhook_events`
→ service-role-only idempotent reconciler
→ existing `unified_inbox_conversation_projections`.

It does not add another queue, another Conversation table, or another CRM. The
Smart Core link must come from the signed
`additional_attributes.smartvisions_conversation_id` projection marker;
missing markers are ignored instead of guessed from contact or message data.

Projection reconciliation is monotonic on Chatwoot `updated_at`: older signed
events are terminally ignored and cannot regress status, labels, assignment or
Team state. Chatwoot Team IDs must resolve through the existing governed
`chatwoot_team_mappings` and canonical Department/Branch lineage.

Public webhook acknowledgement remains journal-only. The existing Cloudflare
production scheduler drains a bounded set of RECEIVED journal rows through an
internal-only endpoint. No provider send authority, Platform token,
provisioning flag or Shadow Mode setting is touched.
