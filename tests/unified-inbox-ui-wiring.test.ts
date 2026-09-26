import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Unified Inbox UI wiring', () => {
  it('uses the bounded read model on the inbox page instead of a direct list query', () => {
    const source = readFileSync('app/conversations/page.tsx', 'utf8');
    expect(source).toContain('loadUnifiedInboxPage');
    expect(source).toContain('parseUnifiedInboxQuery');
    expect(source).not.toContain(".from('sales_conversations')");
    expect(source).toContain('inbox.nextCursor');
    expect(source).toContain('inbox.counters.unread');
  });

  it('uses the read model for the conversation rail', () => {
    const source = readFileSync('app/conversations/[id]/page.tsx', 'utf8');
    expect(source).toContain('loadUnifiedInboxPage');
    expect(source).not.toContain(".select('id,channel,stage,unread_count,requires_human,agent_mode,persian_summary,last_message_at')");
  });

  it('wires governed operator actions, private notes, and scoped attachment downloads', () => {
    const source = readFileSync('app/conversations/[id]/live-conversation.tsx', 'utf8');
    expect(source).toContain('/actions');
    expect(source).toContain("applyOperatorAction('STATUS'");
    expect(source).toContain("applyOperatorAction('LABELS'");
    expect(source).toContain("applyOperatorAction('ASSIGNEE'");
    expect(source).toContain("applyOperatorAction('TEAM'");
    expect(source).toContain("applyOperatorAction('INTERNAL_NOTE'");
    expect(source).toContain('/attachments');
    expect(source).toContain('Safe download');
    expect(source).not.toContain('data_url');
  });

  it('marks an open conversation read without touching send/control paths', () => {
    const source = readFileSync('app/conversations/[id]/live-conversation.tsx', 'utf8');
    expect(source).toContain('/read');
    expect(source).toContain("method: 'POST'");
    expect(source).toContain('/owner-reply');
    expect(source).toContain('/control');
  });
});
