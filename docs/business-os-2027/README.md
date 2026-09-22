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
8. [NEXT_CHAT_HANDOFF.md](./NEXT_CHAT_HANDOFF.md) — canonical instructions for continuing the project in a new chat/session.

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
- Phase 2 Omnichannel Adapter Boundary semantic slice merged in PR #175 at `main@5d812eee8a0e15dac658247b254660ae8f09aacd`.
- Production heartbeat after PR #175 was healthy with Shadow Mode ON, dispatch/acquisition SKIPPED and zero Email/WhatsApp outbound sends in the verification window.
- Phase 2 reconciliation/provider-identity slice is active on `feat/business-os-omnichannel-reconciliation`.
- Phase 2 continues to reuse the canonical Email/WhatsApp send gate, journals and providers; adapters remain side-effect free.
