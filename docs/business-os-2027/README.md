# Smart Visions AI Business OS 2027

This directory is the implementation bridge from the existing **Smart Visions Growth OS** runtime to the owner-approved **AI Business Operating System 2027**.

## Non-negotiable rule

This program **extends existing canonical Growth OS primitives**. It does not duplicate the current CRM, Agent framework, Knowledge/Prompt versioning, Cost Guard, outbound safety gate, webhook journals, Hunter, automation primitives, conversation memory, or provider accounting without a proven production blocker.

Production changes are promoted only after the repository's safety, CI, migration, review, and production-verification gates pass. Phase 1 has now passed those gates and is live; later phases must repeat the same discipline.

## Documents

1. [MASTER_ARCHITECTURE.md](./MASTER_ARCHITECTURE.md) — target product/domain architecture.
2. [IMPLEMENTATION_MAP.md](./IMPLEMENTATION_MAP.md) — dependency-ordered execution history and phase map.
3. [MASTER_PROGRAM_SECTIONS.md](./MASTER_PROGRAM_SECTIONS.md) — stable future execution program using Sections/Work Package IDs instead of future PR numbers.
4. [SERVICE_CONTRACT_STANDARD.md](./SERVICE_CONTRACT_STANDARD.md) — required contract for every domain/service.
5. [STATE_EVENT_CATALOG.md](./STATE_EVENT_CATALOG.md) — initial canonical state machines and event naming.
6. [MIGRATION_FROM_GROWTH_OS.md](./MIGRATION_FROM_GROWTH_OS.md) — reuse/extend/replace decisions for existing production primitives.
7. [CONTROL_PLANE_FOUNDATION.md](./CONTROL_PLANE_FOUNDATION.md) — Production-evidence Gap Map, compatibility decisions, and Phase 1 domain contract.
8. [OMNICHANNEL_ADAPTER_BOUNDARY.md](./OMNICHANNEL_ADAPTER_BOUNDARY.md) — Phase 2 evidence, Gap Map, capability matrix and semantic adapter contract.
9. [CUSTOMER_360_CRM_NORMALIZATION.md](./CUSTOMER_360_CRM_NORMALIZATION.md) — Phase 3 Production evidence, CRM Gap Map, identity-resolution contract and compatibility plan.
10. [CUSTOM_FIELD_GOVERNANCE_GAP_AUDIT.md](./CUSTOM_FIELD_GOVERNANCE_GAP_AUDIT.md) — Phase 3 Slice 5 governed Custom Field contract and Production evidence.
11. [SEGMENT_GOVERNANCE_GAP_AUDIT.md](./SEGMENT_GOVERNANCE_GAP_AUDIT.md) — Phase 3 Slice 6 Segment decisions, implementation boundaries and Production closeout.
12. [CHATWOOT_SOURCE_GAP_AUDIT.md](./CHATWOOT_SOURCE_GAP_AUDIT.md) — source/license/deployment/provider-ownership audit for the Chatwoot Communication Plane.
13. [CHATWOOT_TENANT_BRIDGE_GAP_AUDIT.md](./CHATWOOT_TENANT_BRIDGE_GAP_AUDIT.md) — deterministic tenant/business/user/account/inbox/team/contact/conversation mapping audit.
14. [NEXT_CHAT_HANDOFF.md](./NEXT_CHAT_HANDOFF.md) — canonical instructions for continuing the project in a new chat/session.

## Phase 0 exit criteria

Phase 0 is complete only when:

- domain ownership is explicit;
- source-of-truth ownership is explicit;
- state machines exist for critical entities;
- command/query/event contracts are versioned;
- policy/action/billing/audit boundaries are explicit;
- existing Growth OS primitives have a reuse/extend decision;
- no production subsystem is duplicated by accident;
- the first implementation slice can be built without inventing architecture during coding.


## Current implementation status — 2026-09-23

- Phase 0 architecture foundation was merged in PR #172 at `main@144906c8f72c368851f8c4efb3e85dff8627f863`.
- Phase 1 Control Plane Foundation was merged in PR #173 at `main@01d74f7c8d333c017f8f4790d7bc3e4a7d1f6ca4`.
- Production migration `0068_business_os_control_plane_foundation` was applied successfully as migration version `20260922100907`.
- Production verification confirmed all new tables, RLS, grants, SECURITY INVOKER functions, fail-closed usage classification, required indexes, unchanged safety controls, and no seeded commercial data.
- Post-promotion Supabase security advisor findings are unchanged from the pre-0068 baseline.
- Follow-up migration `0069_business_os_control_plane_fk_indexes` is live as Production migration version `20260922101641`; it cleared all 15 post-0068 unindexed-FK advisor findings without changing runtime behavior.
- Current Growth OS CRM/Hunter `businesses` remains unchanged; tenant-owned Business hierarchy uses `tenant_businesses`.
- Phase 2 Omnichannel Adapter Boundary is complete for the two Production-proven channels. PR #175 added the side-effect-free semantic adapter/status layer and PR #176 added fail-closed provider identity plus reconciliation contracts; final Phase 2 main is `a5396156afc58a22cdf78baf7a495fb07ec38b40`.
- Production verification after PR #176 showed Shadow Mode ON, heartbeat `failed=0`, acquisition/dispatch SKIPPED, and zero Email/WhatsApp outbound messages after the merge.
- Phase 2 keeps the canonical Email/WhatsApp send gate, journals and providers unchanged and does not claim native-app human activity where provider evidence is unavailable.
- Phase 3 Slice 1 CRM Identity Foundation merged in PR #178 at `main@27e980e417ec52c64055c029b8ffa6c6c77ab961` and is live in Production as migration `0070_crm_identity_foundation` version `20260922164110`.
- Production verification after PR #178 confirmed 47 CRM identities, 47 identity links, zero conflicts, zero cross-tenant mismatches, Shadow Mode ON, heartbeat `failed=0`, and zero Email/WhatsApp outbound rows after the merge. Cloudflare runtime evidence shows Worker version `562c495f-ceeb-4021-b2d9-122ddc04021b`.
- Phase 3 Slice 2 Customer 360 Timeline merged in PR #179 at `main@efcf979ff15d32062b48928672a25128c521987a` and is live in Production as migration `0071_customer_360_timeline` version `20260922202957`.
- Production verification confirmed a SECURITY INVOKER timeline view/RPC, authenticated-only access, preserved service-role restrictions, 85 timeline items across 9 Businesses, 65 customer-visible interactions, 20 internal items, zero duplicate customer provider IDs, zero provider-journal standalone rows and zero customer-visible unsent rows.
- Cloudflare Production Deploy #332 promoted the exact green main bundle and reported Production Worker version `a78567d8-e4f9-484e-a62b-2bd8e47b8583`; route, routed smoke and safe API/webhook smoke all passed with no provider send invoked.
- Phase 3 Slice 3 CRM Task Foundation is Production-verified in PR #181 / migration 0072, with advisor cleanup PR #182 / migration 0073. `crm_tasks` owns actionable human work only; Customer 360 remains the historical Activity read model. Post-promotion verification kept Task rows at zero, cleared all new unindexed-FK findings, preserved Shadow Mode and produced zero architecture-test outbound sends. Cloudflare heartbeat evidence shows Worker version `84d19f06-ead7-4abe-b332-ba14309629d8`.
- Existing `growth_opportunities` / `intent_opportunities` remain acquisition/intent evidence and must not be repurposed as canonical CRM Deals.

- Phase 3 Slice 4 Deal/Pipeline Foundation merged in PR #184 at `main@d416fcee020bc393a45096ee1330f8378bbd8e38`; Production migration 0074 is database-verified with zero seeded commercial rows and zero new unindexed-FK findings. Cloudflare runtime promotion is intentionally still evidence-gated until a post-merge Worker version is observed.


- Phase 3 Slice 5 Custom Field Governance is Production-verified in PR #188 / migration 0075 version `20260923012557`.
- Phase 3 Slice 6 Segment Governance audit merged in PR #190; governed Dynamic Lead Segments merged in PR #191 at `main@a34bfd243d2f95e2ccad9895d5a753ef902a4299`.
- Production migration `0076_crm_segment_governance` is live as version `20260923093619`, with zero persistent Segment rows after rollback-only verification and no provider-send delta.
- Slice 6 deliberately remains LEAD-only + DYNAMIC-only. Snapshot/current-membership persistence and broader entity segmentation remain deferred.
- Implementation-runtime Cloudflare checkpoint after PR #191 (before docs-only closeout) is `b6ad6482-11e1-4658-97e8-7f5d1a842318`; latest checked heartbeat failed=0 with acquisition/evidence/auto-dispatch SKIPPED and Shadow Mode remained ON.


## Stable continuation model

Future work is no longer identified by projected PR numbers.

Use:

`SECTION -> WORK PACKAGE ID -> actual PR evidence`

The current planned continuation cursor is `SECTION COMMUNICATION / COMM-CHATWOOT-SOURCE`, subject to fresh Production verification before implementation.

Chatwoot is explicitly planned as a **source-based Community Edition communication plane**, with Smart Core retaining canonical business truth and provider-action safety. See `MASTER_ARCHITECTURE.md` and `MASTER_PROGRAM_SECTIONS.md`.


## Communication Plane continuation

`COMM-CHATWOOT-SOURCE` gap audit is complete.

Approved source baseline:

- Chatwoot Community `v4.18.0`
- exact upstream commit `9f920b549c14491a4e587687a3eed5d21c6ccc7d`
- separate Chatwoot runtime/database/Redis/storage boundary
- existing Smart Core WhatsApp/Email providers remain canonical
- first bridge uses Chatwoot API Inbox projections, not duplicated native provider ownership
- `tenant_business -> Chatwoot Account` tenancy projection

Next action remains `COMM-CHATWOOT-SOURCE`, now moving from audit to source-foundation implementation.


## Tenant Bridge continuation

The `COMM-TENANT-BRIDGE` gap audit is complete but intentionally stacked behind `COMM-CHATWOOT-SOURCE`.

Production currently has zero Brands and zero tenant Businesses. No Chatwoot Account may be provisioned from Growth/Hunter `public.businesses` as a substitute.

Slice A is now implemented on stacked Draft PR #197:

`COMM-TENANT-BRIDGE / Slice A — Tenant/channel + Account mapping contract`

It remains **unmerged and unapplied to Production** because PR #195 source-build verification and repository GitHub-hosted runner allocation are still blocked. No persistent Production Brand, tenant Business, bridge row or Chatwoot Account has been fabricated.
