import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { serviceFactory } = vi.hoisted(() => ({
  serviceFactory: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: serviceFactory,
}));

import { processPendingChatwootInboxEvents } from '@/lib/chatwoot/unified-inbox-reconciler';

const EVENT_ID = '00000000-0000-4000-8000-000000009411';
const CONVERSATION_ID = '00000000-0000-4000-8000-000000009412';

function boundEvent() {
  return {
    id: EVENT_ID,
    event_type: 'conversation_updated',
    status: 'RECEIVED',
    received_at: '2026-09-26T10:00:13.000Z',
    payload: {
      id: 441,
      status: 'open',
      labels: ['sales'],
      last_activity_at: 1790416800,
      updated_at: 1790416812.25,
      additional_attributes: {
        smartvisions_projection: true,
        smartvisions_projection_version: '1',
        smartvisions_conversation_id: CONVERSATION_ID,
      },
      meta: { sender: { id: 551 }, assignee: null, assignee_type: null, team: null },
    },
  };
}

function serviceFor(events: unknown[]) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: events, error: null })),
  };
  const rpc = vi.fn(async (name: string) => {
    if (name === 'reconcile_unified_inbox_projection_event') {
      return {
        data: [{
          outcome: 'UPDATED',
          projection_id: '00000000-0000-4000-8000-000000009413',
          projection_version: 2,
          event_status: 'PROCESSED',
        }],
        error: null,
      };
    }
    return { data: {}, error: null };
  });
  const service = {
    from: vi.fn(() => builder),
    rpc,
  };
  return { service, rpc };
}

afterEach(() => {
  vi.restoreAllMocks();
  serviceFactory.mockReset();
});

describe('Unified Inbox webhook journal processor', () => {
  it('reconciles only normalized signed-journal state through the governed RPC', async () => {
    const { service, rpc } = serviceFor([boundEvent()]);
    serviceFactory.mockReturnValue(service);

    await expect(processPendingChatwootInboxEvents()).resolves.toEqual({
      discovered: 1,
      processed: 1,
      ignored: 0,
      failed: 0,
    });

    expect(rpc).toHaveBeenCalledWith(
      'reconcile_unified_inbox_projection_event',
      expect.objectContaining({
        p_event_id: EVENT_ID,
        p_conversation_id: CONVERSATION_ID,
        p_chatwoot_conversation_display_id: 441,
        p_chatwoot_status: 'open',
        p_labels: ['sales'],
      }),
    );
  });

  it('terminally ignores an unbound Chatwoot conversation instead of guessing linkage', async () => {
    const event = boundEvent();
    (event.payload.additional_attributes as Record<string, unknown>) = {};
    const { service, rpc } = serviceFor([event]);
    serviceFactory.mockReturnValue(service);

    await expect(processPendingChatwootInboxEvents()).resolves.toEqual({
      discovered: 1,
      processed: 0,
      ignored: 1,
      failed: 0,
    });

    expect(rpc).toHaveBeenCalledWith('finalize_chatwoot_webhook_event', {
      p_event_id: EVENT_ID,
      p_status: 'IGNORED',
      p_error_code: 'UNBOUND_CONVERSATION',
    });
    expect(rpc).not.toHaveBeenCalledWith(
      'reconcile_unified_inbox_projection_event',
      expect.anything(),
    );
  });

  it('marks malformed stateful payloads FAILED without crossing a provider boundary', async () => {
    const event = boundEvent();
    event.payload.labels = [''];
    const { service, rpc } = serviceFor([event]);
    serviceFactory.mockReturnValue(service);

    const result = await processPendingChatwootInboxEvents();
    expect(result.failed).toBe(1);
    expect(rpc).toHaveBeenCalledWith('finalize_chatwoot_webhook_event', {
      p_event_id: EVENT_ID,
      p_status: 'FAILED',
      p_error_code: 'INVALID_EVENT_PAYLOAD',
    });
  });
});
