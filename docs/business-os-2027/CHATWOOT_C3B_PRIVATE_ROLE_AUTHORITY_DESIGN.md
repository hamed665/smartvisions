# COMM-TENANT-BRIDGE / C3B — private canonical-role authority design

Status: **DESIGN + ROLLBACK SMOKE ONLY / stacked Draft after #209**.

This unit does not add a Production migration, a Chatwoot call, a User/AccountUser writer, a route, a scheduler, or any provider/customer send.

## Problem being solved

The eventual User/AccountUser writer must stay caller-bound and `SECURITY INVOKER`, while recomputing the target user's canonical Organization/Brand/Business role at the mutation boundary.

Current Smart Core facts:

- `organization_members` is canonical for Organization role;
- authenticated RLS on that table is self-read only;
- `public.is_org_owner(uuid)` is intentionally `SECURITY INVOKER`;
- a same-table OWNER-read policy that calls `is_org_owner` would recurse through `organization_members` RLS;
- a prior service-role read cannot become a mutation ticket without a TOCTOU gap;
- direct service-role writes are not allowed.

## Source-backed narrow design

Supabase documents a specific pattern for breaking RLS recursion: place a narrowly scoped `SECURITY DEFINER` helper in a non-exposed private schema, set `search_path = ''`, fully qualify every relation, revoke default execution, and grant only the role that needs the helper.

References reviewed during this audit:

- Supabase Row Level Security / “Use security definer functions”
- Supabase Database Functions / function privileges and pinned search path
- Supabase guidance that private-schema helpers do not need to be exposed through PostgREST

This does **not** revert `public.is_org_owner` to SECURITY DEFINER and does not make the eventual writer SECURITY DEFINER.

Proposed boundary:

`authenticated OWNER -> public SECURITY INVOKER writer -> private read-only authority helper -> canonical Smart Core tables`

The private helper:

1. reads `auth.uid()`;
2. proves that actor is current OWNER of the exact Organization;
3. proves the requested tenant Business belongs to that Organization and has ACTIVE Brand/Business lineage;
4. reads the target member's current Organization role;
5. resolves only BRAND/BUSINESS scope assignments relevant to that exact Business;
6. treats conditional assignments as non-granting when no trusted policy attributes are supplied;
7. returns only the effective role, never arbitrary member rows or PII;
8. performs no INSERT/UPDATE/DELETE and has no provider side effect.

## Security properties required

- helper lives outside exposed `public` schema;
- `SECURITY DEFINER` is limited to this canonical read primitive;
- `search_path = ''`;
- all relation/function names are schema-qualified;
- EXECUTE is revoked from PUBLIC, anon and service_role;
- authenticated receives only schema USAGE + this exact function EXECUTE;
- a non-OWNER call fails closed;
- cross-tenant target/business calls fail closed;
- caller cannot supply an effective role;
- `public.is_org_owner` remains SECURITY INVOKER;
- no direct service-role mapping mutation is introduced.

## Semantics must match effectiveRoleForScope

For Business-wide Chatwoot membership:

- canonical Organization OWNER always resolves OWNER;
- otherwise exact BUSINESS assignment outranks BRAND;
- only assignments with no unsatisfied conditional attributes are applicable;
- without trusted policy attributes, a non-empty assignment `attributes` object does not grant;
- fallback is the canonical Organization role;
- VIEWER maps later to no Chatwoot Account membership;
- OWNER alone may later map to Chatwoot administrator.

## This Draft's verification boundary

A PostgreSQL 17 rollback-only smoke may create the private schema/function inside a transaction and prove:

- target-member RLS remains self-read for the caller;
- OWNER can resolve the target canonical role through only the private primitive;
- non-OWNER and cross-tenant calls fail;
- BUSINESS > BRAND precedence;
- conditional attributes fail closed;
- function/search-path/grants are narrow;
- existing `public.is_org_owner` hardening remains intact;
- the entire proof rolls back.

Passing that smoke is only evidence for the read primitive. It is **not permission to activate User/AccountUser writes**.

## Follow-on gate

Only after exact-head runner-backed CI executes this rollback smoke successfully may a separate Draft implement the governed writer using:

- `SECURITY INVOKER` mutation RPCs;
- the existing command claim ledger;
- stable request keys and expected versions;
- bounded audit;
- canonical role re-read through this reviewed primitive;
- reverse-role demotion rules from #209;
- no live Chatwoot or Production activation until the dependency stack is fully verified.
