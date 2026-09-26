import { describe, expect, it } from 'vitest';
import { parseChatwootUnifiedInboxEvent } from '@/lib/chatwoot/unified-inbox-event';

const EVENT_ID = '00000000-0000-4000-8000-000000009401';
const CONVERSATION_ID = '00000000-0000-4000-8000-000000009402';

function conversation(overrides: Record<string, unknown> = {}) {
  return {
    id: 441,
    status: 'open',
    labels: ['sales', 'vip', 'sales'],
    last_activity_at: 1790416800,
    updated_at: 1790416812.25,
    additional_attributes: {
      smartvisions_projection: true,
      smartvisions_projection_version: '1',
      smartvisions_conversation_id: CONVERSATION_ID,
    },
    meta: {
      sender: { id: 551 },
      assignee: { id: 661 },
      assignee_type: 'User',
      team: { id: 771 },
    },
    ...overrides,
  };
}

describe('Chatwoot Unified Inbox event parser', () => {
  it('normalizes a top-level conversation webhook into a bounded projection snapshot', () => {
    const result = parseChatwootUnifiedInboxEvent({
      id: EVENT_ID,
      event_type: 'conversation_updated',
      status: 'RECEIVED',
      payload: conversation(),
    });

    expect(result).toEqual({
      kind: 'RECONCILE',
      snapshot: {
        eventId: EVENT_ID,
        conversationId: CONVERSATION_ID,
        chatwootConversationDisplayId: 441,
        chatwootContactId: 551,
        chatwootAssigneeUserId: 661,
        chatwootTeamId: 771,
        chatwootStatus: 'open',
        labels: ['sales', 'vip'],
        lastActivityAt: '2026-09-26T10:00:00.000Z',
        chatwootUpdatedAt: '2026-09-26T10:00:12.250Z',
      },
    });
  });

  it('uses the nested conversation snapshot for message webhooks', () => {
    const result = parseChatwootUnifiedInboxEvent({
      id: EVENT_ID,
      event_type: 'message_created',
      status: 'RECEIVED',
      payload: { id: 991, content: 'hello', conversation: conversation({ id: 442 }) },
    });

    expect(result.kind).toBe('RECONCILE');
    if (result.kind === 'RECONCILE') {
      expect(result.snapshot.chatwootConversationDisplayId).toBe(442);
    }
  });

  it('does not guess Smart Core linkage when the signed projection marker is absent', () => {
    const result = parseChatwootUnifiedInboxEvent({
      id: EVENT_ID,
      event_type: 'conversation_created',
      status: 'RECEIVED',
      payload: conversation({ additional_attributes: {} }),
    });
    expect(result).toEqual({ kind: 'IGNORE', code: 'UNBOUND_CONVERSATION' });
  });

  it('ignores unrelated webhook classes and fails closed on malformed stateful payloads', () => {
    expect(parseChatwootUnifiedInboxEvent({
      id: EVENT_ID,
      event_type: 'conversation_typing_on',
      status: 'RECEIVED',
      payload: {},
    })).toEqual({ kind: 'IGNORE', code: 'UNSUPPORTED_EVENT' });

    expect(parseChatwootUnifiedInboxEvent({
      id: EVENT_ID,
      event_type: 'conversation_updated',
      status: 'RECEIVED',
      payload: conversation({ labels: ['ok', ''] }),
    })).toEqual({ kind: 'FAIL', code: 'INVALID_EVENT_PAYLOAD' });
  });
});
