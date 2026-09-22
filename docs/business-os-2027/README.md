# Smart Visions AI Business OS 2027

This directory is the implementation bridge from the existing **Smart Visions Growth OS** runtime to the owner-approved **AI Business Operating System 2027**.

## Non-negotiable rule

This program **extends existing canonical Growth OS primitives**. It does not duplicate the current CRM, Agent framework, Knowledge/Prompt versioning, Cost Guard, outbound safety gate, webhook journals, Hunter, automation primitives, conversation memory, or provider accounting without a proven production blocker.

Production changes are promoted only after the repository's safety, CI, migration, review, and production-verification gates pass. Phase 1 has now passed those gates and is live; later phases must repeat the same discipline.

## Documents

1. [MASTER_ARCHITECTURE.md](./MASTER_ARCHITECTURE.md) — target product/domain architecture.
2. [IMPLEMENTATION_MAP.md](./IMPLEMENTATION_MAP.md) — dependency-ordered execution plan.
3. [SERVICE_CONTRACT_STANDARD.md](./SERVICE_CONTRACT_STANDARD.md) — required contract for every domain/service.
4. [STATE_EVENT_CATALOG.md](./STATE_EVENT_CATALOG.md) — initial canonical state machines and event naming.
5. [MIGRATION_FROM_GROWTH_OS.md](./MIGRATION_FROM_GROWTH_OS.md) — reuse/extend/replace decisions for existing production primitives.
6. [CONTROL_PLANE_FOUNDATION.md](./CONTROL_PLANE_FOUNDATION.md) — Production-evidence Gap Map, compatibility decisions, and Phase 1 domain contract.
7. [OMNICHANNEL_ADAPTER_BOUNDARY.md](./OMNICHANNEL_ADAPTER_BOUNDARY.md) — Phase 2 evidence, Gap Map, capability matrix and semantic adapter contract.
8. [CUSTOMER_360_CRM_NORMALIZATION.md](./CUSTOMER_360_CRM_NORMALIZATION.md) — Phase 3 Production evidence, CRM Gap Map, identity-resolution contract and compatibility plan.
9. [NEXT_CHAT_HANDOFF.md](./NEXT_CHAT_HANDOFF.md) — canonical instructions for continuing the project in a new chat/session.

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


## Current implementation status — 2026-09-22

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
- Phase 3 Slice 2 Customer 360 Timeline is active in PR #179 on `feat/business-os-customer-360-timeline`. It adds a SECURITY INVOKER read model and signed-in/RLS API over existing canonical CRM/message/provider evidence without creating a second event store.
- Verified implementation head `3f25b41d052519ddffb8a5ce7f8f8503d38fa97f` passed lint, typecheck, full Vitest, PostgreSQL 17 timeline migration/RLS/dedupe/cursor smoke, Next build, Vinext build and Cloudflare scheduled verification before final documentation reconciliation.
