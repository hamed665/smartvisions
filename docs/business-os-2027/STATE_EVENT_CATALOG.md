# Initial State Machine and Event Catalog

This catalog establishes names and semantics. Implementation PRs may extend it through reviewed versioning; they must not silently invent competing statuses.

## Conversation

States:

`NEW -> OPEN -> AI_ACTIVE | HUMAN_ACTIVE | WAITING_CUSTOMER | WAITING_INTERNAL -> RESOLVED -> CLOSED`

Reopen: `RESOLVED/CLOSED -> OPEN` when policy allows.

Important events:

- conversation.created.v1
- conversation.message.received.v1
- conversation.message.sent.v1
- conversation.human_takeover.started.v1
- conversation.human_takeover.ended.v1
- conversation.ai_paused.v1
- conversation.resolved.v1
- conversation.reopened.v1

## Booking

States:

`DRAFT -> HELD -> CONFIRMED -> CHECKED_IN -> COMPLETED`

Alternative terminal states:

`CANCELLED | NO_SHOW | EXPIRED`

Events:

- booking.created.v1
- booking.held.v1
- booking.confirmed.v1
- booking.rescheduled.v1
- booking.cancelled.v1
- booking.completed.v1
- booking.no_show.v1

## Payment

States:

`CREATED -> PENDING -> AUTHORIZED -> CAPTURED`

Other states:

`FAILED | PARTIAL_REFUND | REFUNDED | DISPUTED | VOIDED`

Events:

- payment.created.v1
- payment.authorized.v1
- payment.captured.v1
- payment.failed.v1
- payment.refunded.v1
- payment.disputed.v1

## Deal

Aggregate states:

`OPEN -> WON | LOST`

`WON` and `LOST` are terminal commercial states.

Pipeline stages are configurable ordered labels. A typical default pipeline may use:

`NEW -> QUALIFIED -> OPPORTUNITY -> PROPOSAL -> NEGOTIATION -> WON | LOST`

Every stage carries a category:

- `OPEN`
- `WON`
- `LOST`

Exactly one WON and one LOST stage are required per active Pipeline. Moving a Deal into a terminal stage sets the aggregate state and terminal evidence. Closed commercial truth such as amount/currency/owner/expected close/loss reason is immutable after terminal transition.

Events:

- deal.created.v1
- deal.stage_changed.v1
- deal.won.v1
- deal.lost.v1

## Quote

States:

`DRAFT -> REVIEW -> SENT -> VIEWED -> ACCEPTED | REJECTED | EXPIRED`

Optional path:

`ACCEPTED -> PAYMENT_PENDING -> CONVERTED`

## Campaign

States:

`DRAFT -> REVIEW -> SCHEDULED -> RUNNING -> PAUSED | COMPLETED | FAILED | CANCELLED`

## Subscription

States:

`TRIAL -> ACTIVE -> PAST_DUE -> GRACE_PERIOD -> SUSPENDED -> CANCELED | EXPIRED`

Transitions from PAST_DUE back to ACTIVE are allowed after successful recovery.

## Agent deployment

States:

`DRAFT -> TESTING -> SHADOW -> CANARY -> ACTIVE -> RETIRED`

Rollback may move CANARY/ACTIVE to a prior ACTIVE version without mutating historical evidence.

## Knowledge

States:

`DRAFT -> REVIEW -> APPROVED -> PUBLISHED -> DEPRECATED -> EXPIRED`

## Memory candidate

States:

`CANDIDATE -> EVIDENCE_ACCUMULATING -> VALIDATED -> PUBLISHED | REJECTED | EXPIRED`

Business Truth publication requires validation policy.

## Action request

States:

`CREATED -> POLICY_CHECK -> APPROVAL_PENDING? -> EXECUTING -> VERIFYING -> SUCCEEDED`

Failure outcomes:

`BLOCKED | REJECTED | FAILED | COMPENSATING | COMPENSATED | MANUAL_REVIEW`

## CRM Task

Task is actionable human work. Historical activity remains immutable evidence in Customer 360 and must not be rewritten into Task rows.

States:

`OPEN -> IN_PROGRESS | BLOCKED | DONE | CANCELED`

Additional allowed transitions:

- `IN_PROGRESS -> OPEN | BLOCKED | DONE | CANCELED`
- `BLOCKED -> OPEN | IN_PROGRESS | DONE | CANCELED`
- `DONE -> OPEN` only as an explicit reopen/correction
- `CANCELED` is terminal

Events:

- crm.task.created.v1
- crm.task.assigned.v1
- crm.task.updated.v1
- crm.task.status_changed.v1
- crm.task.completed.v1
- crm.task.reopened.v1
- crm.task.canceled.v1

Task source provenance is immutable. A historical Follow-up, Handoff, Reply, Approval or Operator Brief may create/link a Task only through an explicit idempotent command; activity is never auto-converted merely because it exists.

## Event envelope

All future domain events use:

```text
event_id
event_name
schema_version
occurred_at

organization_id
business_id
branch_id

aggregate_type
aggregate_id

actor_type
actor_id

correlation_id
causation_id

data_classification
payload
```

Events are immutable facts. Corrections are new events, not edits to historical events.
