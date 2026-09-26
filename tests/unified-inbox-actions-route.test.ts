import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Unified Inbox action route wiring', () => {
  it('uses the governed action bridge and not direct provider/send logic', () => {
    const source = readFileSync('app/api/conversations/[id]/actions/route.ts', 'utf8');
    expect(source).toContain('performUnifiedInboxConversationAction');
    expect(source).toContain('parseUnifiedInboxConversationActionBody');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('service_role');
    expect(source).not.toContain('MetaCloudWhatsAppProvider');
  });

  it('keeps provider mutation and exact reconciliation in the server bridge', () => {
    const source = readFileSync('lib/chatwoot/conversation-actions.ts', 'utf8');
    expect(source).toContain('claim_unified_inbox_action');
    expect(source).toContain('ambiguousMutationOutcome');
    expect(source).toContain('readExternalConversation');
    expect(source).toContain('CHATWOOT_CONVERSATION_ACTION_VERIFIED');
    expect(source).toContain("resourcePath: '/labels'");
  });
});
