import { describe, expect, it } from 'vitest';
import {
  decodeUnifiedInboxCursor,
  encodeUnifiedInboxCursor,
  parseUnifiedInboxQuery,
} from '@/lib/conversations/unified-inbox-query';

const CONVERSATION_ID = '72000000-0000-4000-8000-000000009611';

describe('Unified Inbox query contract', () => {
  it('round-trips deterministic cursor payloads', () => {
    const token = encodeUnifiedInboxCursor({
      activityAt: '2026-09-26T12:34:56.000Z',
      conversationId: CONVERSATION_ID,
    });
    expect(decodeUnifiedInboxCursor(token)).toEqual({
      activityAt: '2026-09-26T12:34:56.000Z',
      conversationId: CONVERSATION_ID,
    });
  });

  it('rejects malformed cursors rather than silently restarting page one', () => {
    expect(() => decodeUnifiedInboxCursor('not@@base64')).toThrow('Invalid inbox cursor');
    expect(() => decodeUnifiedInboxCursor('e30')).toThrow('Invalid inbox cursor');
  });

  it('normalizes bounded list filters', () => {
    const params = new URLSearchParams({
      limit: '25',
      stage: 'active',
      channel: 'whatsapp',
      human: '1',
      unread: 'true',
      q: '  acme  ',
      branch: '30000000-0000-4000-8000-000000009611',
      team: '50000000-0000-4000-8000-000000009611',
      label: 'vip',
      chatwootStatus: 'OPEN',
    });

    expect(parseUnifiedInboxQuery(params)).toMatchObject({
      limit: 25,
      stage: 'ACTIVE',
      channel: 'WHATSAPP',
      humanOnly: true,
      unreadOnly: true,
      query: 'acme',
      branchId: '30000000-0000-4000-8000-000000009611',
      teamId: '50000000-0000-4000-8000-000000009611',
      label: 'vip',
      chatwootStatus: 'open',
    });
  });

  it('fails closed on oversized/invalid input', () => {
    expect(() => parseUnifiedInboxQuery(new URLSearchParams({ limit: '101' }))).toThrow();
    expect(() => parseUnifiedInboxQuery(new URLSearchParams({ q: 'x'.repeat(101) }))).toThrow();
    expect(() => parseUnifiedInboxQuery(new URLSearchParams({ branch: 'not-a-uuid' }))).toThrow();
  });
});
