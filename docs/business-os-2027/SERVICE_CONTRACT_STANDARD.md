# Service / Domain Contract Standard

Every new domain or extracted service must have this contract before implementation.

## 1. Identity

- Domain name:
- Owner:
- Purpose:
- Non-goals:
- Upstream dependencies:
- Downstream consumers:

## 2. Source of truth

List every entity/fact owned by this domain.

A fact may have exactly one canonical owner.

## 3. Data scope

Every persisted record must declare applicable scope:

- organization_id
- brand_id
- business_id
- branch_id
- customer/contact ID
- region
- retention class
- sensitivity class

## 4. Commands

For each command define:

- name;
- request schema/version;
- caller permissions;
- preconditions;
- idempotency key;
- state transition;
- synchronous result;
- side effects;
- audit event;
- billable usage event, if any;
- failure modes;
- compensation.

## 5. Queries

For each query define:

- name;
- filters;
- authorization;
- pagination;
- freshness;
- consistency expectation;
- caching;
- PII filtering.

## 6. Events produced

Naming:

`domain.entity.action.vN`

Every event must define:

- immutable event_id;
- occurred_at;
- tenant/business scope;
- correlation_id;
- causation_id;
- aggregate/entity ID;
- schema version;
- payload;
- sensitivity classification.

## 7. Events consumed

For each event:

- reason;
- idempotency/dedupe key;
- retry policy;
- poison-event/DLQ behavior;
- ordering requirement;
- replay behavior.

## 8. State machine

Enumerate states, allowed transitions, forbidden transitions and terminal states.

No hidden state transition inside UI code.

## 9. Security and policy

Define:

- roles;
- ABAC attributes;
- high-risk actions;
- approval rules;
- data classes;
- secrets used;
- cross-tenant invariants.

## 10. External boundaries

For every provider:

- adapter contract;
- rate limits;
- timeout;
- provider request ID;
- ambiguous success handling;
- retry ceiling;
- reconciliation strategy;
- webhook verification;
- health evidence.

## 11. Reliability

Define:

- idempotency;
- timeout;
- retry/backoff;
- circuit breaker;
- queue/backpressure behavior;
- compensation;
- RPO/RTO if stateful;
- graceful degradation.

## 12. Billing

Define usage classes:

- BILLABLE
- NON_BILLABLE
- SYSTEM_RETRY
- CACHED
- PROMOTIONAL
- INTERNAL

No provider call becomes customer-billable merely because money was spent internally.

## 13. Observability

Required:

- structured logs;
- metrics;
- traces/correlation IDs;
- audit records;
- provider evidence;
- SLO indicators.

## 14. Data lifecycle

Define:

- retention;
- archive;
- deletion;
- legal hold;
- export;
- right-to-delete behavior;
- regional constraints.

## 15. Test contract

Minimum:

- unit;
- state transition;
- permission;
- tenant isolation;
- idempotency;
- retry;
- failure recovery;
- contract;
- provider mock/reconciliation;
- audit;
- billing;
- migration/rollback where applicable.
