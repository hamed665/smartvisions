import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Web Chat operator attachment delivery and activation readiness', () => {
  const migration = readFileSync('supabase/migrations/0118_web_chat_outbound_attachments_readiness.sql', 'utf8');
  const runtime = readFileSync('lib/web-chat/runtime.ts', 'utf8');
  const route = readFileSync('app/api/web-chat/attachments/[attachmentId]/route.ts', 'utf8');
  const widget = readFileSync('app/api/web-chat/widget/route.ts', 'utf8');
  const health = readFileSync('lib/web-chat/health.ts', 'utf8');

  it('projects signed outgoing attachments without copying storage URLs into canonical messages', () => {
    expect(migration).toContain("e.payload->'attachments'");
    expect(migration).toContain("'messageId',v_message_id");
    expect(migration).toContain("'accountId',am.chatwoot_account_id");
    expect(migration).toContain("'direct_storage_url_exposed',false");
    expect(migration).not.toContain("'data_url'");
    expect(migration).toContain("v_existing.metadata->'attachments'");
  });

  it('requires real session, inbound, outbound, media and reconciliation evidence for acceptance', () => {
    expect(migration).toContain('create table public.web_chat_activation_acceptance_receipts');
    expect(migration).toContain("we.chatwoot_sync_status='ACCEPTED'");
    expect(migration).toContain("cm.direction='INBOUND'");
    expect(migration).toContain("cm.direction='OUTBOUND'");
    expect(migration).toContain("cm.metadata->>'source'='CHATWOOT_SIGNED_WEBHOOK'");
    expect(migration).toContain('real Web Chat media evidence required');
    expect(migration).toContain("we.chatwoot_sync_status='RECONCILIATION_REQUIRED'");
    expect(migration).toContain('LIVE_ACCEPTANCE_EVIDENCE_MISSING');
    expect(migration).not.toMatch(/p_(accepted|verified|ready)\\s+boolean/i);
  });

  it('keeps privileged readiness and receipt mutation service-role only', () => {
    expect(migration).toContain('revoke all on function public.web_chat_activation_readiness(uuid,uuid,uuid) from public,anon,authenticated,service_role');
    expect(migration).toContain('grant execute on function public.web_chat_activation_readiness(uuid,uuid,uuid) to service_role');
    expect(migration).toContain('revoke all on function public.record_web_chat_activation_acceptance(uuid,uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role');
    expect(migration).toContain('security definer');
    expect(migration).toContain('set search_path=public,pg_catalog');
  });

  it('authorizes each browser download against session, canonical conversation, signed event, message and account scope', () => {
    expect(runtime).toContain(".eq('token_hash', hashWebChatToken(input.sessionToken))");
    expect(runtime).toContain(".eq('conversation_id', session.data.conversation_id)");
    expect(runtime).toContain(".eq('communication_channel_binding_id', session.data.communication_channel_binding_id)");
    expect(runtime).toContain(".eq('provider_message_id'");
    expect(runtime).toContain('chatwoot:');
    expect(runtime).toContain("canonicalMetadata?.source !== 'CHATWOOT_SIGNED_WEBHOOK'");
    expect(runtime).toContain('positiveChatwootId(value.accountId) === accountId');
    expect(runtime).toContain('positiveChatwootId(value.message_id) === messageId');
    expect(runtime).toContain('positiveChatwootId(value.account_id) === accountId');
    expect(runtime).toContain('isSafeChatwootAttachmentUrl(rawAttachment.data_url)');
    expect(runtime).toContain('MAX_PUBLIC_ATTACHMENT_BYTES = 10 * 1024 * 1024');
    expect(runtime).not.toContain('return { dataUrl:');
  });

  it('serves browser bytes only through the bounded Smart Core proxy', () => {
    expect(route).toContain("'Cache-Control': 'private, no-store'");
    expect(route).toContain("'X-Content-Type-Options': 'nosniff'");
    expect(route).toContain("'Content-Security-Policy': \"default-src 'none'; sandbox\"");
    expect(route).toContain("request.headers.get('x-web-chat-session-id')");
    expect(route).toContain("request.headers.get('x-web-chat-session-token')");
    expect(widget).toContain("base+'/api/web-chat/attachments/'");
    expect(widget).toContain("'X-WebChat-Session-Id':state.sessionId");
    expect(widget).toContain("'X-WebChat-Session-Token':state.sessionToken");
    expect(widget).not.toContain('CHATWOOT_BASE_URL');
    expect(widget).not.toContain('data_url');
  });

  it('derives Connection Center status from canonical Web Chat readiness', () => {
    expect(health).toContain("service.rpc('web_chat_activation_readiness'");
    expect(health).toContain('reconciliationCount');
    expect(health).toContain('lastAcceptanceAt');
    expect(health).toContain('chatwootInboxStatus');
    expect(health).not.toContain("from('integration_connections')");
  });
});
