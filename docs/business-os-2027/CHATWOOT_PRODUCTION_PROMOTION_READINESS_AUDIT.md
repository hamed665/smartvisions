# Chatwoot Production Promotion Readiness Audit


> **Status update — 2026-09-26:** the promotion gate described by this audit has now been crossed and independently verified on a dedicated OVH VPS. The detailed pre-promotion matrix below is retained as historical gate evidence, not as the current runtime state.
>
> Production evidence now includes dedicated PostgreSQL/Redis, OVH S3 attachment storage with Versioning, off-host Paris 3-AZ database backups with checksum + isolated restore verification, immutable Community-only Chatwoot source, Caddy/Let's Encrypt TLS, public `https://inbox.smartvisionsai.com` health/login, private first-owner provisioning, account signup disabled, and no Smart Core provider credential copied into Chatwoot.
>
> Provider/API-Inbox/customer activation is **still not authorized by this infrastructure closeout**. Smart Core remains provider/action authority and the next governed continuation is `COMM-TENANT-BRIDGE`.


Date: 2026-09-25  
Section: `COMMUNICATION`  
Work Package: `COMM-CHATWOOT-SOURCE`  
Mode: **historical pre-promotion audit; Production infrastructure is now release-verified, while bridge/provider/customer activation remains separately gated**

## 1. Purpose

The isolated Chatwoot Candidate runtime has passed its runtime release gate. This audit defines the remaining evidence required before a separate, explicit Production-promotion authorization can create or activate a Production Chatwoot runtime.

This document does not create a Production project, database, Redis service, bucket, DNS record, public route, API Inbox, tenant mapping, provider channel, customer/contact record or message.

Smart Core remains the canonical source of truth for tenant/business/customer/CRM/consent/provider/billing/action safety. Chatwoot remains the Communication Plane.

## 2. Fresh evidence baseline

Canonical repository checkpoint at audit start:

- `main@9805c7dc6453d8179b4d2efcae9e5e0c2bdd3f6d`;
- exact-main CI is green;
- Cloudflare Production Deploy #727 is green on that exact main SHA, including isolated release-candidate smoke, exact-bundle Production promotion, route verification, routed Production smoke and safe API/webhook rejection smoke;
- Production Supabase migration head is `0090_chatwoot_fk_index_hardening`;
- Production safety controls remain:
  - Shadow Mode ON;
  - global Kill Switch OFF;
  - Email pause OFF;
  - WhatsApp AI pause OFF;
  - Agents pause OFF;
- the latest checked one-hour outbound window contains zero Outreach, WhatsApp and Email events.

Current Railway inventory contains only the isolated `smartvisions-chatwoot-candidate` project. No separate Production Chatwoot project exists.

Current Production tenant/bridge state is intentionally empty:

- Brands: 0;
- tenant Businesses: 0;
- Chatwoot Account mappings: 0;
- Chatwoot User mappings: 0;
- Chatwoot Account memberships: 0;
- Chatwoot Inbox mappings: 0;
- Chatwoot Team mappings: 0;
- communication channel bindings: 0;
- Chatwoot webhook events: 0;
- bridge command claims: 0;
- reconciliation receipts: 0.

This is a safe boundary: there is no hidden partial Production bridge to preserve or migrate.

## 3. Candidate evidence already satisfied

The following gates are already proven by the isolated Candidate and do not need to be reinvented for Production:

- Chatwoot Community `v4.18.0` pinned to upstream commit `9f920b549c14491a4e587687a3eed5d21c6ccc7d`;
- Community/Enterprise source boundary enforced;
- `DISABLE_ENTERPRISE=true`;
- immutable Candidate image:

  `ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-4987088dc4ba2e9212e196304ccebd69073ba536@sha256:c6e759a89867b41eae2230f5afcad75c7a54f421225d2e46c3e865bd401058ff`;

- dedicated Candidate PostgreSQL;
- dedicated password-protected persistent Redis;
- private S3-compatible Candidate storage;
- successful `db:chatwoot_prepare` and `SMARTVISIONS_CONFIGURE.rb`;
- Puma and Sidekiq runtime health;
- Sidekiq authenticated Redis connectivity;
- object-storage put/read verification;
- TLS-verified public Candidate `GET /health = 200` with `{"status":"woot"}`;
- TLS-verified Candidate `GET /app/login = 200`;
- logical PostgreSQL backup, checksum, private-object-storage upload and isolated restore verification;
- immutable deployment snapshots usable as application rollback evidence;
- no Production provider credential copied into Chatwoot;
- no native Chatwoot Email/WhatsApp connector activation;
- no API Inbox activation;
- no Production customer/contact/message import;
- no provider/customer send.

These facts prove the architecture and deployment contract. They do **not** prove Production capacity, Production DR, Production DNS, Production secrets or a Production bridge.

## 4. Production promotion gate matrix

| Gate | Current state | Required evidence before activation |
| --- | --- | --- |
| Immutable source/image | **PASS** for Candidate baseline | Reconfirm exact source/image identity at promotion time; no floating tag |
| Candidate runtime | **PASS** | Preserve the same contract; do not redesign during promotion |
| Production hosting target | **OPEN / NOT AUTHORIZED** | Explicitly approved Production hosting/project and cost boundary |
| Dedicated Production PostgreSQL | **NOT PROVISIONED** | Independent Chatwoot DB, durable persistence, capacity and backup evidence |
| Dedicated Production Redis | **NOT PROVISIONED** | Private persistent Redis, auth, Sidekiq verification; no Smart Core Redis reuse |
| Production object storage | **NOT PROVISIONED** | Durable S3-compatible storage, retention/versioning/backup policy and restore evidence |
| Production secrets | **NOT PROVISIONED** | Deployment-secret store, unique Rails/encryption secrets; no Smart Core provider credentials in Chatwoot |
| Production DNS/TLS | **NOT ATTACHED** | Healthy origin first; then DNS/TLS/route evidence for the approved hostname |
| Planned public hostname | **RESERVED IN RUNBOOK ONLY** | `inbox.smartvisionsai.com` becomes canonical only after real deployment evidence |
| Signup | **MUST REMAIN DISABLED** | `ENABLE_ACCOUNT_SIGNUP=false` verified at runtime |
| Enterprise code | **PROHIBITED WITHOUT LICENSE** | Community-only build/runtime unless an intentional valid Enterprise license is adopted |
| Web/worker health | **CANDIDATE PASS / PRODUCTION PENDING** | Production Puma + Sidekiq + Redis + HTTPS/login evidence |
| DB migration state | **PRODUCTION CHATWOOT PENDING** | Run `db:chatwoot_prepare` using the approved immutable image and verify resulting schema state |
| Backup/restore | **CANDIDATE PASS / PRODUCTION PENDING** | Production backup policy, retention, restore test and reviewed DB rollback procedure |
| Application rollback | **DESIGNED / PRODUCTION PENDING** | Previous immutable digest recorded and DB backward-compatibility decision documented |
| Provider boundary | **PASS BY DESIGN; MUST BE RE-VERIFIED** | No Meta/WhatsApp/Email/Twilio/SendGrid/Mailgun/Smart Core provider secret in Chatwoot |
| API Inbox / bridge activation | **OFF** | Remains off during infrastructure promotion; activation is a later governed bridge gate |
| Real tenant provisioning | **NOT READY / ZERO TENANT BUSINESS** | No Production Chatwoot Account may be fabricated; requires evidence-backed real tenant Business scope |
| Customer/contact/conversation projection | **OFF** | Requires active governed parent mappings and channel binding first |
| Shadow Mode | **ON** | Must remain ON through Production infrastructure promotion and verification |

## 5. Production topology contract

A Production deployment must preserve the already-approved boundary:

```text
Smart Core Production
  != Chatwoot PostgreSQL
  != Chatwoot Redis
  != Chatwoot attachment/object storage

Chatwoot web + Sidekiq
  -> dedicated Chatwoot PostgreSQL
  -> dedicated Chatwoot Redis
  -> durable Chatwoot object storage

Smart Core provider credentials and provider send authority
  remain in Smart Core
```

Do not point Chatwoot Rails migrations at the Smart Core Supabase PostgreSQL database. Do not reuse a Smart Core Redis as Chatwoot application state.

## 6. Production DR gate

Candidate recovery evidence is useful but is not sufficient Production DR evidence.

Before a Production public route exists, record and verify:

1. exact immutable image/source identity;
2. Production PostgreSQL backup method and retention;
3. object-storage retention/versioning/backup policy;
4. deployment-secret/config recovery procedure;
5. restore into an isolated verification target;
6. checksum/integrity verification;
7. previous immutable application digest;
8. whether the target DB schema is backward compatible with application rollback;
9. reviewed restore plan when it is not backward compatible;
10. recovery owner and runbook location.

Do not invent reverse migrations in Production.

No RPO/RTO value is asserted by this audit. Those service objectives require an explicit operational decision before Production promotion.

## 7. DNS and route gate

The planned public surface remains:

`inbox.smartvisionsai.com`

The hostname must **not** be attached merely because it is written in a document.

Required order:

1. provision the isolated Production runtime without customer/provider traffic;
2. run prepare/configure;
3. start web/worker;
4. verify source provenance;
5. verify DB/Redis/storage;
6. verify web/login health on the isolated Production origin;
7. verify backup/restore and rollback evidence;
8. only then attach the approved public DNS/TLS route;
9. re-run public HTTPS health/login smoke;
10. keep API Inbox/provider/customer traffic disabled until the separate bridge activation gate.

## 8. Bridge activation remains a later gate

Production infrastructure promotion does not authorize tenant or provider activation.

Current Production has zero real `brands`, zero `tenant_businesses` and zero Chatwoot mapping rows. Therefore:

- do not fabricate a Business merely to make Chatwoot look populated;
- do not map Growth/Hunter `public.businesses` as tenant Businesses;
- do not create a real Chatwoot Account without an evidence-backed real tenant Business;
- do not activate an API Inbox during infrastructure promotion;
- do not enable native Chatwoot provider connectors;
- do not move provider credentials;
- do not backfill historical conversations into guessed tenant ownership.

After the Production source plane is provisioned and independently release-verified, governed bridge activation continues under `COMM-TENANT-BRIDGE`.

## 9. Exact promotion sequence after explicit authorization

When a separate Production-promotion gate is explicitly authorized, execute in this order:

1. re-read `AGENTS.md`, current `main`, open PRs, CI, review threads, Production Supabase/safety/outbound and current Railway inventory;
2. verify/approve the Production hosting target, capacity and cost boundary before creating resources;
3. create a **separate Production Chatwoot project/runtime**, never reuse the Candidate resources;
4. create dedicated Production PostgreSQL;
5. create dedicated private/authenticated Production Redis;
6. create durable Production S3-compatible storage with the approved retention/versioning policy;
7. generate Production-only Chatwoot application/encryption secrets in the deployment secret store;
8. keep all Smart Core provider credentials absent;
9. deploy one-shot prepare with the approved immutable image;
10. start Production web and worker without a public customer route;
11. verify provenance, DB state, Redis/Sidekiq, storage, login and origin health;
12. create and restore a Production backup into an isolated verification target;
13. record rollback image digest and DB compatibility decision;
14. attach the public route only after all prior gates pass;
15. verify public TLS, `/health` and login;
16. re-verify Smart Core Shadow Mode and zero unintended outbound activity;
17. reconcile evidence through a small exact-head PR and post-merge exact-main/Cloudflare/Supabase verification;
18. leave API Inbox, provider channels and customer data disabled until the governed bridge gate is separately authorized.

## 10. Stop conditions

Stop promotion immediately if any of these occur:

- image/source identity differs from the approved immutable identity without a reviewed upgrade;
- Enterprise source appears without an intentional valid license;
- a proposed DB/Redis/storage resource is shared with Smart Core;
- a Production provider credential appears in Chatwoot;
- signup becomes enabled;
- backup/restore evidence is missing;
- public route would be attached before health/DR verification;
- a migration is not understood or rollback/restore compatibility is unknown;
- tenant scope would have to be fabricated;
- any test would send a real provider/customer message merely to prove architecture;
- Shadow Mode or canonical send gates would have to be weakened.

## 11. Readiness decision

`COMM-CHATWOOT-SOURCE` is now:

**CANDIDATE RUNTIME VERIFIED / PRODUCTION PROMOTION GATED**

No Production Chatwoot runtime currently exists. The next mutating action is intentionally blocked on a separate explicit Production-promotion authorization plus the Production hosting/capacity/cost and DR decisions described above.

Until that gate is crossed, the correct state is to preserve the verified Candidate and keep provider/tenant/customer activation off.
