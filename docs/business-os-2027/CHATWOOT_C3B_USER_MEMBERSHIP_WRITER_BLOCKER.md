# COMM-TENANT-BRIDGE / C3B — transactional User/AccountUser writer blocker

Status: **BLOCKER RECORDED / stacked Draft only. No external membership activation.**

Reviewed against Draft PR #208 and its current Smart Core IAM/RLS contracts. Runtime/Production evidence remains authoritative over this note.

## What was proven

The Business-wide Candidate role resolver can be read-only and server-only: authenticate the current Smart caller first, then use the existing server-side service client for tightly scoped canonical reads. That is acceptable for a Candidate read because the result is explicitly not mutation authority.

The required User/AccountUser writer is different. Its contract requires a fresh canonical role recomputation at the mutation boundary, under the same governed request/version/claim transaction that persists Smart Core mapping state. A prior service-role read cannot be promoted into that authorization decision without a time-of-check/time-of-use gap.

Current database facts:

- `organization_members` is the Organization-role source of truth.
- its authenticated RLS read contract is self-read only;
- `member_scope_assignments` allows Organization OWNER reads, but that does not supply the target Organization role;
- `public.is_org_owner(uuid)` was changed by migration `0017_owner_function_security.sql` to SECURITY INVOKER and reads `organization_members`;
- therefore using `is_org_owner()` inside a new SELECT policy on `organization_members` would recurse through the same table's RLS;
- restoring SECURITY DEFINER solely to bypass that recursion would reverse an explicit hardening decision;
- running the writer as service_role would bypass the caller-bound RLS/identity boundary and is not an acceptable substitute;
- the existing command claim ledger provides idempotency/replay semantics, not missing IAM read authority.

## Consequence

Do **not** activate external Chatwoot User/AccountUser membership mutation yet.

Do not:

- grant service_role direct INSERT/UPDATE authority as the solution;
- use the #208 Candidate role result as a mutation ticket;
- reintroduce SECURITY DEFINER just to read another member;
- add a parallel role/source-of-truth table;
- weaken `organization_members` RLS with a recursive policy;
- call Chatwoot or create a scheduler/route while this blocker exists.

The previously drafted 0082 User/AccountUser writer experiment was removed from the active #209 branch after this blocker was found. Its design is not a promotion candidate.

## What a future solution must prove before implementation

A reviewed design must provide all of these properties using the existing Smart Core authority model:

1. current authenticated OWNER authority and the target member's canonical Organization role are verified at the transactional mutation boundary;
2. BRAND/BUSINESS scope resolution is recomputed from canonical Smart Core state, with conditional assignments fail-closed unless trusted policy attributes exist;
3. the mutation stays SECURITY INVOKER unless an explicitly reviewed security-boundary change supersedes the current hardening;
4. the existing command-claim ledger, stable request key, expected version, bounded audit and command-path guard remain canonical;
5. OWNER demotion cannot leave a live Chatwoot administrator projection; OWNER to VIEWER requires external membership removal before the Smart role reduction can commit;
6. direct service_role mapping writes remain unavailable;
7. PostgreSQL 17 rollback smoke proves cross-tenant denial, replay/version behavior, role demotion ordering and absence of privilege escalation;
8. exact-head runner-backed CI must execute real steps successfully before promotion.

Until then, User/AccountUser external membership remains disabled and no Production migration is authorized.
