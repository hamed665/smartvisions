# Smart Visions AI Business OS 2027

This directory is the implementation bridge from the existing **Smart Visions Growth OS** runtime to the owner-approved **AI Business Operating System 2027**.

## Non-negotiable rule

This program **extends existing canonical Growth OS primitives**. It does not duplicate the current CRM, Agent framework, Knowledge/Prompt versioning, Cost Guard, outbound safety gate, webhook journals, Hunter, automation primitives, conversation memory, or provider accounting without a proven production blocker.

Current production remains untouched until a later implementation PR passes the repository's normal safety, CI, migration, deployment, and production-verification gates.

## Documents

1. [MASTER_ARCHITECTURE.md](./MASTER_ARCHITECTURE.md) — target product/domain architecture.
2. [IMPLEMENTATION_MAP.md](./IMPLEMENTATION_MAP.md) — dependency-ordered execution plan.
3. [SERVICE_CONTRACT_STANDARD.md](./SERVICE_CONTRACT_STANDARD.md) — required contract for every domain/service.
4. [STATE_EVENT_CATALOG.md](./STATE_EVENT_CATALOG.md) — initial canonical state machines and event naming.
5. [MIGRATION_FROM_GROWTH_OS.md](./MIGRATION_FROM_GROWTH_OS.md) — reuse/extend/replace decisions for existing production primitives.\n6. [NEXT_CHAT_HANDOFF.md](./NEXT_CHAT_HANDOFF.md) — canonical instructions for continuing the project in a new chat/session.

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
