# Existing Account attempt recovery

An existing committed Account claim can lack an external exact tenant marker after a pre-provider failure. The original claim must stay immutable; a scoped Platform Account list is not a complete-instance absence proof.

This extends the canonical Chatwoot Account plane with immutable observation receipts and one recovery command in the existing bridge command ledger. It creates no parallel Mapping, Account authority, queue or outbox. There is no automatic absence-review producer.

A trusted service operator must actually inspect the complete Super Admin inventory, verify the target Account is absent, and record the fresh review using `record_chatwoot_account_absence_review`. Record exact Mapping/version, current authorized OWNER, original claim (resolved by the RPC), origin, Platform App ID, observed inventory IDs and observed time. Never record a review from an empty scoped API list alone. The receipt expires after 15 minutes; this is separate from the disabled WhatsApp test clock.

Only that current OWNER can read/consume the receipt through RLS. Authenticated/anon clients cannot insert reviews; all receipts are immutable. All new functions are SECURITY INVOKER. The recovery RPC locks the original Mapping, validates live scope/review/original Claim, and inserts at most one `RECONCILE_ACCOUNT_EXTERNAL_CREATE` command. The original create Claim and request key stay untouched. Renewal of a review does not reset a spent recovery.

Existing OWNER Finalize/Reconcile first performs normal exact-marker reconciliation. If no exact target exists, only a fresh protected review can enable one recovery reservation. Before POST, the existing adapter re-lists and rechecks persisted OWNER, active Business, Mapping/version, provisioning gate and receipt validity. An exact concurrent match is adopted through the existing mapping command; duplicate/invalid markers fail closed. Ambiguous recovery outcomes are GET/reconciliation only; no second automatic POST.

The known old Account is never adopted by name or numeric ID. No Meta credential, sender, registration, public signup, Shadow Mode or WhatsApp outbound policy changes. Deployment and actual Account/OWNER/API Inbox receipts remain prerequisites for starting the consented test.

Validation uses isolated CI PostgreSQL fixtures only: original Claim preservation, protected review ACL/RLS, stale version/origin/original key, OWNER revocation, replay and twelve simultaneous reservation contenders. Mocked runtime tests assert no POST without a review, on replay, or after expiry/revocation. No live API/customer test is represented by these checks.
