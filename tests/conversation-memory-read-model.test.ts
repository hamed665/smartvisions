import { describe, expect, it } from 'vitest';
import { buildConversationMemory } from '@/lib/conversations/memory-read-model';

const conversationId = '11111111-1111-4111-8111-111111111111';

function inbound(id: string, body: string, at: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    provider_message_id: `wamid-${id}`,
    channel: 'WHATSAPP',
    direction: 'INBOUND',
    status: 'RECEIVED',
    body,
    received_at: at,
    created_at: at,
    metadata: { conversation_id: conversationId, ...extra },
  };
}

function outbound(id: string, body: string, at: string, status = 'SENT', metadata: Record<string, unknown> = {}) {
  return {
    id,
    conversation_id: conversationId,
    provider_message_id: `wamid-out-${id}`,
    channel: 'WHATSAPP',
    direction: 'OUTBOUND',
    status,
    original_text: body,
    sent_at: status === 'SENT' ? at : null,
    created_at: at,
    metadata,
  };
}

describe('conversation memory read model', () => {
  it('merges real inbound with actually sent outbound in chronological order', () => {
    const history = buildConversationMemory({
      conversationId,
      channel: 'WHATSAPP',
      outreachRows: [inbound('2', 'Second customer', '2026-09-01T10:02:00Z'), inbound('1', 'First customer', '2026-09-01T10:00:00Z')],
      conversationRows: [outbound('1', 'Agent answer', '2026-09-01T10:01:00Z')],
    });
    expect(history.map((item) => item.body)).toEqual(['First customer', 'Agent answer', 'Second customer']);
    expect(history.map((item) => item.senderType)).toEqual(['CUSTOMER', 'AGENT', 'CUSTOMER']);
  });

  it.each(['APPROVAL_REQUIRED', 'BLOCKED', 'FAILED', 'PROCESSING', 'READY', 'APPROVED'])(
    'never treats %s outbound as customer-visible memory',
    (status) => {
      const history = buildConversationMemory({
        conversationId,
        channel: 'WHATSAPP',
        conversationRows: [outbound('x', 'not sent', '2026-09-01T10:00:00Z', status)],
      });
      expect(history).toEqual([]);
    },
  );

  it('labels owner manual SENT reply as HUMAN', () => {
    const history = buildConversationMemory({
      conversationId,
      channel: 'WHATSAPP',
      conversationRows: [outbound('human', 'Owner reply', '2026-09-01T10:00:00Z', 'SENT', { source: 'OWNER_MANUAL_REPLY' })],
    });
    expect(history[0]).toMatchObject({ senderType: 'HUMAN', status: 'SENT' });
  });

  it('excludes a different conversation for the same lead', () => {
    const history = buildConversationMemory({
      conversationId,
      channel: 'WHATSAPP',
      outreachRows: [{ ...inbound('other', 'wrong thread', '2026-09-01T10:00:00Z'), metadata: { conversation_id: '22222222-2222-4222-8222-222222222222' } }],
      conversationRows: [{ ...outbound('other', 'wrong outbound', '2026-09-01T10:01:00Z'), conversation_id: '22222222-2222-4222-8222-222222222222' }],
    });
    expect(history).toEqual([]);
  });

  it('excludes an unconfirmed cross-channel message', () => {
    const history = buildConversationMemory({
      conversationId,
      channel: 'WHATSAPP',
      outreachRows: [{ ...inbound('email', 'email thread', '2026-09-01T10:00:00Z'), channel: 'EMAIL' }],
    });
    expect(history).toEqual([]);
  });

  it('deduplicates replayed provider message ids and prefers conversation journal evidence', () => {
    const provider = 'same-provider-id';
    const history = buildConversationMemory({
      conversationId,
      channel: 'WHATSAPP',
      outreachRows: [{ ...inbound('dup-in', 'same inbound', '2026-09-01T10:00:00Z'), provider_message_id: provider }],
      conversationRows: [{
        id: 'dup-conv', conversation_id: conversationId, provider_message_id: provider,
        channel: 'WHATSAPP', direction: 'INBOUND', status: 'RECEIVED', original_text: 'same inbound',
        created_at: '2026-09-01T10:00:00Z', metadata: {},
      }],
    });
    expect(history).toHaveLength(1);
    expect(history[0].source).toBe('CONVERSATION');
  });

  it('keeps only the configured rolling window', () => {
    const rows = Array.from({ length: 40 }, (_, index) => inbound(String(index), `m${index}`, `2026-09-01T10:${String(index).padStart(2, '0')}:00Z`));
    const history = buildConversationMemory({ conversationId, channel: 'WHATSAPP', outreachRows: rows, limit: 30 });
    expect(history).toHaveLength(30);
    expect(history[0].body).toBe('m10');
    expect(history.at(-1)?.body).toBe('m39');
  });
});
