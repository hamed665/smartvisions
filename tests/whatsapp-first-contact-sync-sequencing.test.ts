import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('WhatsApp first-contact Inbox race guard', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(),'lib/whatsapp/chatwoot-inbound-sync.ts'),'utf8',
  );
  it('uses exact organization, Business, binding and sender as the concurrency scope', () => {
    expect(source).toContain("const sourceKey = [organizationId,routing.tenantBusinessId,routing.bindingId,event.from].join(':')");
    expect(source).toContain('recentlySyncedSources.has(sourceKey)');
    expect(source).toContain('recentlySyncedSources.add(sourceKey)');
    expect(source.indexOf('if (recentlySyncedSources.has(sourceKey))')).toBeLessThan(
      source.indexOf('const result = await syncWhatsAppInboundToChatwoot({',source.indexOf('if (recentlySyncedSources.has(sourceKey))')),
    );
  });
  it('keeps follow-up pending if its same-sender conversation has no active signed Inbox projection', () => {
    expect(source).toContain(".eq('organization_id',organizationId)");
    expect(source).toContain(".eq('tenant_business_id',routing.tenantBusinessId)");
    expect(source).toContain(".eq('communication_channel_binding_id',routing.bindingId)");
    expect(source).toContain(".eq('conversation_id',conversationId)");
    expect(source).toContain(".eq('lifecycle_status','ACTIVE')");
    expect(source).toMatch(/if \(!projection\.data\?\.id\) \{\s*summary\.pending \+= 1;\s*continue;/);
  });
  it('never performs a second provider send or moves an unverified state directly to accepted', () => {
    expect(source).not.toContain('runInternalTestLiveReply');
    expect(source).not.toContain('sendWhatsAppMessage');
    expect(source).not.toContain('UPDATE whatsapp_events');
    expect(source).toContain("result.outcome === 'SYNCED'");
    expect(source).toContain("result.outcome === 'RECONCILIATION_REQUIRED'");
  });
});
