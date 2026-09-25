# Chatwoot Source Release Runbook

Work Package: `COMM-CHATWOOT-SOURCE`

This runbook promotes the Chatwoot Communication Plane itself. It does not authorize provider-channel activation.

## Environment separation

### Development

- local/non-customer Chatwoot database;
- local/non-customer Redis;
- local or disposable object storage;
- no Production provider credentials;
- no Production Smart Core webhook secret;
- synthetic contacts/messages only.

### Candidate

- isolated candidate origin;
- isolated candidate PostgreSQL;
- isolated candidate Redis;
- isolated candidate object-storage prefix/bucket;
- immutable candidate image;
- no Production public route;
- no Production provider credentials;
- Smart Core bridge remains disabled or points to a non-provider test boundary.

### Production

Planned public surface: `inbox.smartvisionsai.com`.

Production requires:

- immutable GHCR image digest;
- dedicated Chatwoot PostgreSQL;
- dedicated Chatwoot Redis;
- durable S3-compatible storage;
- TLS/proxy;
- deployment secrets;
- backup evidence;
- source provenance;
- web + worker health.

The hostname is only canonical after deployment evidence exists.

## Build gate

The image must be produced by `.github/workflows/chatwoot-source-image.yml`.

Verify:

- upstream `v4.18.0`;
- exact upstream commit `9f920b549c14491a4e587687a3eed5d21c6ccc7d`;
- Smart Visions commit;
- no Smart Visions patch under `enterprise/`;
- upstream `enterprise/` removed before image build;
- `DISABLE_ENTERPRISE=true` retained as runtime defense in depth;
- source lock validation;
- successful source Docker build;
- `/app/.git_sha` equals the pinned upstream commit;
- `/app/SMARTVISIONS_SOURCE_PROVENANCE.json` exists;
- `/app/SMARTVISIONS_CONFIGURE.rb` exists.

## Candidate machine gate

Before creating or updating any Candidate service, validate the resolved environment:

```bash
node scripts/chatwoot/verify-runtime-contract.mjs \
  /secure/path/.env.candidate \
  --tier candidate
```

The gate fails closed unless:

- the image is the Smart Visions GHCR image pinned by an immutable `sha256` digest;
- Candidate uses an isolated HTTPS hostname, never `inbox.smartvisionsai.com`;
- Candidate PostgreSQL is not the Smart Core Supabase project;
- Redis and S3-compatible storage are configured;
- account signup and Enterprise runtime remain disabled;
- deployment secrets are resolved and Active Record encryption values are distinct;
- native WhatsApp/Meta/Twilio/SendGrid/Mailgun and SMTP credentials are absent;
- `CHATWOOT_WEBHOOK_PUBLIC_ORIGIN` remains empty before controlled bridge activation.

Candidate Compose uses one immutable image for a one-shot `chatwoot-prepare`, Rails web and Sidekiq worker. The one-shot service runs `db:chatwoot_prepare` followed by `SMARTVISIONS_CONFIGURE.rb`; web/worker do not start unless it succeeds. The web service has a local process healthcheck. External PostgreSQL, Redis and object storage remain independently managed.

The committed `.env.candidate.example` is a non-secret contract template only. Never deploy its placeholder values.

## Candidate database gate

Before candidate startup:

1. verify the target DB is the candidate Chatwoot DB;
2. run:

```bash
POSTGRES_STATEMENT_TIMEOUT=600s bundle exec rails db:chatwoot_prepare
```

3. run:

```bash
bundle exec rails runner /app/SMARTVISIONS_CONFIGURE.rb
```

4. start web and Sidekiq from the exact same image digest;
5. verify web health/login;
6. verify Sidekiq can connect to Redis;
7. verify attachment upload/read against candidate object storage;
8. verify installation name is `Smart Visions Inbox`;
9. verify no native Smart Visions WhatsApp/Email provider lane is configured.

## Candidate bridge safety gate

Until `COMM-TENANT-BRIDGE` and `COMM-ACTION-BRIDGE` are complete:

- do not configure Production API Inbox webhook URLs;
- do not add Production Chatwoot Platform/App tokens to Smart Core;
- do not import Production customer contacts;
- do not connect Meta/WhatsApp/Email provider credentials;
- do not send a live customer message.

A source-plane health test is not a reason to send provider traffic.

## Production promotion gate

Before Production:

- candidate image digest is known;
- source provenance is known;
- candidate source/build checks are green;
- Chatwoot database backup exists;
- object-storage backup/versioning policy is known;
- rollback image digest is known;
- migration impact reviewed;
- no unresolved P0/P1 Chatwoot source/deployment defect;
- Production environment variables contain no provider credential that belongs to Smart Core;
- account signup remains disabled.

Promotion:

1. stop/coordinate write traffic if the migration requires it;
2. run `db:chatwoot_prepare` using the new immutable image;
3. run `SMARTVISIONS_CONFIGURE.rb`;
4. start new web and worker containers;
5. verify source provenance from the running image;
6. verify login/dashboard;
7. verify Redis/Sidekiq;
8. verify object storage;
9. verify DB migration state;
10. attach public route only after health passes.

## Rollback

Application rollback:

- restore previous immutable image digest;
- run only if the database schema remains backward compatible.

Database rollback:

- never improvise a reverse migration in Production;
- when the upstream migration is not backward compatible, use the reviewed backup/restore plan.

Object storage:

- do not delete attachments merely to make rollback easier;
- preserve attachment keys/versioning according to retention policy.

## Upgrade procedure

For every upstream Chatwoot version:

1. audit current Chatwoot release/tag;
2. update `source.lock.json` on an isolated branch;
3. run source/license verification;
4. refresh Community-safe patches;
5. reject any patch touching `enterprise/`;
6. build candidate image;
7. inspect upstream DB migrations;
8. candidate DB migration + smoke;
9. bridge regression tests;
10. controlled Production promotion;
11. record image digest/runtime version;
12. reconcile handoff docs.

No floating-tag auto-upgrade is permitted.

## Source-plane completion evidence

`COMM-CHATWOOT-SOURCE` can only be called fully Production-verified when all of these exist:

- immutable source image;
- real deployed origin;
- real dedicated Chatwoot DB;
- real dedicated Redis;
- real object storage;
- source provenance endpoint/evidence;
- backup/rollback evidence;
- healthy web/worker evidence.

If hosting credentials/runtime are not yet provisioned, record the work package as **source-build verified / deployment pending**, not complete.


## Railway Candidate runtime lessons — verified 2026-09-25

The isolated Railway Candidate proved several deployment details that are now part of the release discipline:

- treat the Railway project as Candidate even if Railway names its default environment `production`; this does not authorize or identify the Smart Visions Production Communication Plane;
- verify the deployment snapshot actually contains the current command/environment after every service-config mutation. A service-level configuration change and an older green deployment are not equivalent evidence;
- for Redis commands that reference `$REDIS_PASSWORD`, ensure the runtime command is executed by a shell that expands the variable (or use an equivalent host-native secret mechanism). Never rely on a literal unexpanded `$REDIS_PASSWORD` argument;
- require runtime startup evidence for both Puma and Sidekiq, not only a green hosting card;
- require an external HTTPS request to `/health` returning HTTP 200 with `{"status":"woot"}` and a successful `/app/login` request after the exact current deployment;
- object storage verification must perform a real put -> get -> byte-compare -> delete against the Candidate bucket;
- backup evidence must include an actual restore into an isolated temporary database and post-restore comparison, not only successful dump creation;
- when PostgreSQL client/server majors differ, do not assume a dump is portable. The Candidate exercise exposed a newer-client `transaction_timeout` directive that PostgreSQL 16 rejected. Production backup tooling must use a server-compatible client or a reviewed compatibility procedure;
- Railway Hobby has no native volume-backup guarantee for this Candidate. The verified fallback is a logical PostgreSQL backup stored in isolated Candidate object storage and restore-tested before relying on it;
- a hosting platform's rollback-capable deployment record is useful evidence, but it is not proof that a destructive rollback has been executed. Preserve the immutable image digest and reviewed database restore plan.

The 2026-09-25 Candidate verification used the immutable Community image built from Chatwoot `v4.18.0@9f920b549c14491a4e587687a3eed5d21c6ccc7d`:

`ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-4987088dc4ba2e9212e196304ccebd69073ba536@sha256:c6e759a89867b41eae2230f5afcad75c7a54f421225d2e46c3e865bd401058ff`

Candidate runtime verification does **not** authorize Production Chatwoot promotion, provider credentials, native Email/WhatsApp connectors, API Inbox activation, customer imports or live sends. Those remain separate explicit release gates.
