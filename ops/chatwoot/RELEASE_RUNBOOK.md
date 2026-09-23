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
