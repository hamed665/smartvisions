# Sahra controlled inbound demonstration

Refs #496. This package does not activate a test window or claim handset verification.

## Canonical implementation

The existing `WHATSAPP_OUTBOUND` Approval Rule owns the private configuration. The existing
`audit_logs` ledger owns immutable consent references and conservative admission receipts.
A service-only SECURITY INVOKER RPC serializes admissions by Organization transaction advisory
lock before checking the total window count and inserting one receipt. No queue, outbox,
recipient authority, credential store or persisted counter is added.

The signed Meta webhook persists and ACKs; the existing Production scheduled tick consumes
canonical inbound messages. Controlled text/voice intake uses the same Agent request key,
channel guard, successful tenant-bound media transcription, Shadow draft and approved-send
handler. Voice produces text output. A newer inbound fails closed before transcription;
failed/processing voice is never treated as customer speech. Claims are conservative: a
failed attempt consumes its slot and does not trigger automatic replay.
Voice verification requires the existing canonical `media_analysis` success receipt
(`VOICE_TRANSCRIPTION`, `SUCCEEDED`, source ID), as well as a nonempty exact transcript;
bare text in the transcript column cannot activate the exception.

Both initial approval and the final provider boundary verify private consent, exact recipient,
Business/Binding, current real inbound, active communication projection/Inbox/Account, durable
claim, enabled test, window, cap, Shadow, pauses, Kill Switch, DNC/human state and suppression.
The canonical provider gate and Cost Guard remain authoritative. Text-only output excludes
catalog, template and generated audio artifacts. These reply keys do not schedule Growth
first-touch follow-ups.
Automatic approval uses the existing `decide_message_approval` authority, authorized by the
USER/OWNER on the immutable consent audit. It never directly changes pending approval status.
A separate SYSTEM audit identifies automated execution and explicitly records that there was
no manual reviewer click. Current OWNER membership is required again at the provider boundary.

## Private configuration contract

`internalTestLiveReply`: `enabled`, `allowVerifiedOmanInbound`, `inboundOnly`,
`tenantBusinessId`, `bindingId`, `consentAuditId`, `recipients`, `startsAt`, `endsAt`,
`maxRepliesTotal` and `deliveryMode: TEXT`. Participant values belong only in private
canonical settings and the consent audit, never in this file, PR text or public logs.

Maximum window: 90 minutes; total conservative admission ceiling: 20. The provider timestamp
must be inside the window, not in the future, and no older than five minutes at admission/send.
The active rule must keep global approval required. New windows cannot reuse old receipts.

## Deployment and rollback

Ship the migration and runtime as one package only after exact-head CI (including PG17
concurrent admissions), reviews, Next/Vinext and scheduled bundle verification. Apply the
reviewed migration through the normal governed Supabase migration path; verify service-only
ACLs and the disabled policy without creating Production fixtures. Keep the exception disabled
until real existing Sahra Account, OWNER and Inbox readiness receipts are present.

Rollback: disable the private exception first; retain all audit/claim history. A code rollback
must not re-enable the previous broad Oman policy. Shadow and global approval stay ON.

## Observed external blocker — 2026-10-13

Main baseline: `d8ec28a88d81ea88296efa43be020f0803524b49`.
Work Browser recovered; authenticated OWNER Integrations selected the existing Sahra destination.
One existing Finalize/Reconcile returned `AUTH_FAILED`, HTTP 401, support
`3aa3d180-b075-46f6-bc04-728354080801`. Super Admin retained one Account, one User, zero Inboxes;
Platform App `Smart Visions Core`, ID 1, exists. Supabase retained PROVISIONING Account Mapping
v1 / external ID NULL, zero Sahra memberships/Inboxes; binding ACTIVE v3 / error NULL.

A secure same-token transfer was prepared without reading/printing its value. Automatic browser
approval review rejected final submission to the existing GitHub Actions Secret, citing a
security-sensitive repository access change requiring action-time confirmation. The Secret was
not changed; the unsaved field and clipboard were cleared. No credential rotation, second App,
Account replay/reset, Meta change or WhatsApp message occurred.

The request adapter now also sends the same secret in `api-access-token`, alongside the documented
underscore header, to the same verified origin. Chatwoot v4.18.0's
`app/controllers/concerns/access_token_auth_helper.rb` explicitly accepts `HTTP_API_ACCESS_TOKEN`;
Rails v7.1.6 `ActionDispatch::Http::Headers#env_name` maps the hyphen form to that exact Rack key.
This is transport compatibility, not authentication bypass or proof that the installed proxy
drops underscores. Reconcile must still establish actual privileged API success after deployment.

Disposition: implementation pending exact-head CI/deployment; actual Chatwoot authentication and
handset text/voice/takeover verification BLOCKED_EXTERNAL. Live exception remains NOT_ACTIVE.
