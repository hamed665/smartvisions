# Sahra first Chatwoot provisioning — owner approval proposal

Status: DRAFT / NOT AUTHORIZED. Do not merge or execute until the owner approves this exact Production change and the health gate is proven.

## Proposed change

Enable CHATWOOT_PROVISIONING_ENABLED only on smartvisions-growth-os-production. Candidate remains false, with no Chatwoot base URL, webhook origin, Platform token or scheduled trigger. Shadow remains true. The workflow validates the approved true value during Production promotion; all runtime OWNER, tenant, verified-binding, durable claim and reconciliation checks remain unchanged.

This is a Production-wide adapter gate, not a tenant-specific flag. First external execution is restricted operationally to Sahra Business c0db8ad8-04d5-40b8-843f-59b87a88bc0d and existing Account mapping 02262236-4989-4d72-94bd-bb63cacfaba0. No other Business projection is authorized.

## Authorized sequence requested

1. Require successful exact-head CI/review and current Production health readiness with zero activation blockers.
2. After explicit approval, merge and deploy this Production-only gate change through the normal workflow.
3. From the current authenticated Smart Core OWNER, use Finalize communication Inbox for existing binding 417d76e7-b228-4bfd-a20c-73dc660f8ebe.
4. Reconcile the existing mapping and deterministic marker before at-most-one external Sahra Account create. Activate the current OWNER administrator projection, then the existing Channel::Api Inbox path. Persist receipt-backed mapping activation and verify actual external state.
5. Stop for ambiguous acceptance or identity/role mismatch; never blindly repeat an external create.

No Meta Publish, phone registration, webhook/token replacement, public Chatwoot signup, synthetic hierarchy or customer/provider send is included. Exact-recipient controlled WhatsApp replies and consent remain a separate approval.

## Rollback

Restore the Production provisioning value and assertion to false, plus the disabled summary, and deploy normally. This stops new gated adapter operations; it does not delete already-created accounts, memberships, inboxes or audit evidence. Reconcile partial operations through the existing receipt path.

Issue: https://github.com/hamed665/smartvisions/issues/496
