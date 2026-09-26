import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import {
  ChatwootProjectionError,
  processChatwootWebhookProjection,
} from '@/lib/chatwoot/webhook-projection';

const EVENT = '00000000-0000-4000-8000-000000003001';
const ORG = '00000000-0000-4000-8000-000000003002';
const BUSINESS = '00000000-0000-4000-8000-000000003003';
const INBOX_MAPPING = '00000000-0000-4000-8000-000000003004';
const ACCOUNT_MAPPING = '00000000-0000-4000-8000-000000003005';
const CONTACT_MAPPING = '00000000-0000-4000-8000-000000003006';
const CONVERSATION_MAPPING = '00000000-0000-4000-8000-000000003007';
const TEAM_MAPPING = '00000000-0000-4000-8000-000000003008';

type Row = Record<string, unknown>;

function service(input?: {
  eventType?: string;
  eventStatus?: string;
  payload?: Row;
  teamMapping?: boolean;
  contactRpcError?: boolean;
}) {
  const updates: Array<{ table: string; value: Row }> = [];
  const rpc = vi.fn(async (name: string, args: Row) => {
    if (name === 'upsert_chatwoot_contact_projection') {
      if (input?.contactRpcError) {
        return { data: null, error: { message: 'db failed' } };
      }
      return {
        data: {
          id: CONTACT_MAPPING,
          chatwoot_contact_id: args.p_chatwoot_contact_id,
          resolution_status: 'UNRESOLVED',
        },
        error: null,
      };
    }
    if (name === 'upsert_chatwoot_conversation_projection') {
      return {
        data: {
          id: CONVERSATION_MAPPING,
          chatwoot_conversation_display_id:
            args.p_chatwoot_conversation_display_id,
        },
        error: null,
      };
    }
    throw new Error('unexpected rpc ' + name);
  });

  const defaultConversation = {
    id: 81,
    inbox_id: 701,
    status: 'open',
    priority: 'high',
    unread_count: 2,
    can_reply: true,
    last_activity_at: 1797000000,
    meta: {
      sender: {
        id: 901,
        name: 'Must not be copied into projection',
        email: 'private@example.com',
      },
      ...(input?.teamMapping ? { team: { id: 951, name: 'Support' } } : {}),
    },
  };

  const eventRow = {
    id: EVENT,
    organization_id: ORG,
    tenant_business_id: BUSINESS,
    chatwoot_inbox_mapping_id: INBOX_MAPPING,
    chatwoot_inbox_id: 701,
    event_type: input?.eventType ?? 'message_created',
    payload:
      input?.payload ??
      ({
        event: input?.eventType ?? 'message_created',
        id: 991,
        content: 'sensitive message text that must not enter mapping rows',
        conversation: defaultConversation,
      } as Row),
    status: input?.eventStatus ?? 'RECEIVED',
  };

  const from = vi.fn((table: string) => {
    let updateValue: Row | null = null;
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.update = vi.fn((value: Row) => {
      updateValue = value;
      updates.push({ table, value });
      return builder;
    });
    builder.single = vi.fn(async () => {
      if (table === 'chatwoot_webhook_events') {
        return { data: eventRow, error: null };
      }
      if (table === 'chatwoot_inbox_mappings') {
        return {
          data: {
            id: INBOX_MAPPING,
            organization_id: ORG,
            tenant_business_id: BUSINESS,
            chatwoot_account_mapping_id: ACCOUNT_MAPPING,
            chatwoot_inbox_id: 701,
            status: 'ACTIVE',
          },
          error: null,
        };
      }
      if (table === 'chatwoot_team_mappings') {
        return input?.teamMapping
          ? {
              data: {
                id: TEAM_MAPPING,
                organization_id: ORG,
                tenant_business_id: BUSINESS,
                chatwoot_account_mapping_id: ACCOUNT_MAPPING,
                chatwoot_team_id: '951',
                status: 'ACTIVE',
              },
              error: null,
            }
          : { data: null, error: { code: 'PGRST116' } };
      }
      throw new Error('unexpected table ' + table);
    });
    builder.then = (
      resolve: (value: { data: null; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: null, error: null }).then(resolve, reject);

    return builder;
  });

  return {
    client: { from, rpc } as unknown as SupabaseClient,
    rpc,
    updates,
  };
}

describe('Chatwoot Contact/Conversation webhook projection', () => {
  it('projects only external IDs and operational conversation state from message_created', async () => {
    const fake = service();

    const result = await processChatwootWebhookProjection({
      eventId: EVENT,
      service: fake.client,
    });

    expect(result).toMatchObject({
      status: 'PROCESSED',
      contactMappingId: CONTACT_MAPPING,
      conversationMappingId: CONVERSATION_MAPPING,
    });

    expect(fake.rpc).toHaveBeenNthCalledWith(
      1,
      'upsert_chatwoot_contact_projection',
      {
        p_organization_id: ORG,
        p_tenant_business_id: BUSINESS,
        p_chatwoot_account_mapping_id: ACCOUNT_MAPPING,
        p_chatwoot_contact_id: '901',
        p_source_event_id: EVENT,
      },
    );

    expect(fake.rpc).toHaveBeenNthCalledWith(
      2,
      'upsert_chatwoot_conversation_projection',
      expect.objectContaining({
        p_chatwoot_conversation_display_id: 81,
        p_status: 'open',
        p_priority: 'high',
        p_unread_count: 2,
        p_can_reply: true,
        p_chatwoot_team_mapping_id: null,
      }),
    );

    const serialized = JSON.stringify(fake.rpc.mock.calls);
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('sensitive message text');
    expect(fake.updates.at(-1)).toMatchObject({
      table: 'chatwoot_webhook_events',
      value: { status: 'PROCESSED', error_code: null },
    });
  });

  it('binds an external Team only through an ACTIVE canonical Team mapping', async () => {
    const fake = service({ teamMapping: true });

    await processChatwootWebhookProjection({
      eventId: EVENT,
      service: fake.client,
    });

    expect(fake.rpc.mock.calls[1]?.[1]).toMatchObject({
      p_chatwoot_team_mapping_id: TEAM_MAPPING,
    });
  });

  it('ignores unsupported signed events without creating projection rows', async () => {
    const fake = service({
      eventType: 'webwidget_triggered',
      payload: {
        event: 'webwidget_triggered',
        inbox: { id: 701 },
      },
    });

    const result = await processChatwootWebhookProjection({
      eventId: EVENT,
      service: fake.client,
    });

    expect(result.status).toBe('IGNORED');
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.updates.at(-1)).toMatchObject({
      table: 'chatwoot_webhook_events',
      value: { status: 'IGNORED', error_code: null },
    });
  });

  it('replays terminal events without rewriting projections', async () => {
    const fake = service({ eventStatus: 'PROCESSED' });

    const result = await processChatwootWebhookProjection({
      eventId: EVENT,
      service: fake.client,
    });

    expect(result).toEqual({
      eventId: EVENT,
      status: 'PROCESSED',
      replayed: true,
    });
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(fake.updates).toHaveLength(0);
  });

  it('marks the durable event FAILED when projection persistence fails', async () => {
    const fake = service({ contactRpcError: true });

    await expect(
      processChatwootWebhookProjection({
        eventId: EVENT,
        service: fake.client,
      }),
    ).rejects.toBeInstanceOf(ChatwootProjectionError);

    expect(fake.updates.at(-1)).toMatchObject({
      table: 'chatwoot_webhook_events',
      value: {
        status: 'FAILED',
        error_code: 'PERSISTENCE_FAILED',
      },
    });
  });
});
