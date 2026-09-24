import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { serviceFactory, vaultRead } = vi.hoisted(() => ({
  serviceFactory: vi.fn(),
  vaultRead: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: serviceFactory,
}));

vi.mock('@/lib/chatwoot/vault', () => ({
  readChatwootVaultSecret: vaultRead,
}));

import {
  ChatwootWebhookError,
  persistSignedChatwootWebhook,
  verifyChatwootWebhookSignature,
} from '@/lib/chatwoot/webhook-receiver';

const MAPPING_ID = '00000000-0000-4000-8000-000000001001';
const ORG_ID = '00000000-0000-4000-8000-000000001002';
const BUSINESS_ID = '00000000-0000-4000-8000-000000001003';
const EVENT_ID = '00000000-0000-4000-8000-000000001004';
const DELIVERY_ID = '00000000-0000-4000-8000-000000001005';
const SECRET = 'webhook-secret-value';
const NOW_MS = 1_797_000_000_000;
const TIMESTAMP = String(Math.floor(NOW_MS / 1000));

async function sign(rawBody: string, timestamp = TIMESTAMP) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `sha256=${hex}`;
}

function setupService(input?: {
  rpcData?: unknown;
  rpcError?: { message: string } | null;
  mapping?: Partial<Record<string, unknown>>;
}) {
  const mapping = {
    id: MAPPING_ID,
    organization_id: ORG_ID,
    tenant_business_id: BUSINESS_ID,
    chatwoot_inbox_id: 701,
    webhook_secret_ref:
      'secretref://supabase-vault/00000000-0000-4000-8000-000000001006',
    status: 'ACTIVE',
    channel_type: 'Channel::Api',
    ...input?.mapping,
  };

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    single: vi.fn(async () => ({ data: mapping, error: null })),
  };

  const rpc = vi.fn(async () => ({
    data:
      input?.rpcData ??
      {
        is_new: true,
        event_id: EVENT_ID,
        event_status: 'RECEIVED',
      },
    error: input?.rpcError ?? null,
  }));

  const service = {
    from: vi.fn((table: string) => {
      if (table !== 'chatwoot_inbox_mappings') {
        throw new Error(`unexpected table ${table}`);
      }
      return builder;
    }),
    rpc,
  };

  serviceFactory.mockReturnValue(service);
  vaultRead.mockResolvedValue(SECRET);

  return { service, builder, rpc };
}

afterEach(() => {
  vi.restoreAllMocks();
  serviceFactory.mockReset();
  vaultRead.mockReset();
});

describe('Chatwoot signed webhook receiver', () => {
  it('verifies the pinned Chatwoot HMAC contract and timestamp window', async () => {
    const rawBody = JSON.stringify({
      event: 'message_created',
      inbox: { id: 701 },
    });
    const signature = await sign(rawBody);

    await expect(
      verifyChatwootWebhookSignature({
        rawBody,
        timestamp: TIMESTAMP,
        signature,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).resolves.toBe(true);

    await expect(
      verifyChatwootWebhookSignature({
        rawBody: rawBody + ' ',
        timestamp: TIMESTAMP,
        signature,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).resolves.toBe(false);

    await expect(
      verifyChatwootWebhookSignature({
        rawBody,
        timestamp: TIMESTAMP,
        signature,
        secret: SECRET,
        nowMs: NOW_MS + 301_000,
      }),
    ).resolves.toBe(false);
  });

  it('verifies mapping + Vault secret + inbox binding before journaling', async () => {
    const { rpc } = setupService();
    const rawBody = JSON.stringify({
      event: 'message_created',
      inbox: { id: 701 },
      conversation: { id: 81, inbox_id: 701 },
      id: 91,
      content: 'hello',
    });
    const signature = await sign(rawBody);

    const result = await persistSignedChatwootWebhook({
      mappingId: MAPPING_ID,
      rawBody,
      deliveryId: DELIVERY_ID,
      timestamp: TIMESTAMP,
      signature,
      nowMs: NOW_MS,
    });

    expect(result).toMatchObject({
      accepted: true,
      replayed: false,
      eventId: EVENT_ID,
      status: 'RECEIVED',
      eventType: 'message_created',
    });
    expect(vaultRead).toHaveBeenCalledWith(
      'secretref://supabase-vault/00000000-0000-4000-8000-000000001006',
    );
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[0]).toBe('record_chatwoot_webhook_event');
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_organization_id: ORG_ID,
      p_tenant_business_id: BUSINESS_ID,
      p_chatwoot_inbox_mapping_id: MAPPING_ID,
      p_chatwoot_inbox_id: 701,
      p_delivery_id: DELIVERY_ID,
      p_event_type: 'message_created',
    });
    expect(String(rpc.mock.calls[0]?.[1]?.p_raw_body_sha256)).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it('accepts an exact delivery replay without inventing a second event', async () => {
    setupService({
      rpcData: {
        is_new: false,
        event_id: EVENT_ID,
        event_status: 'PROCESSED',
      },
    });
    const rawBody = JSON.stringify({
      event: 'conversation_updated',
      inbox_id: 701,
      id: 42,
    });

    const result = await persistSignedChatwootWebhook({
      mappingId: MAPPING_ID,
      rawBody,
      deliveryId: DELIVERY_ID,
      timestamp: TIMESTAMP,
      signature: await sign(rawBody),
      nowMs: NOW_MS,
    });

    expect(result).toMatchObject({
      accepted: true,
      replayed: true,
      eventId: EVENT_ID,
      status: 'PROCESSED',
    });
  });

  it('fails closed before journaling when payload inbox does not match the canonical mapping', async () => {
    const { rpc } = setupService();
    const rawBody = JSON.stringify({
      event: 'message_created',
      inbox: { id: 999 },
    });

    await expect(
      persistSignedChatwootWebhook({
        mappingId: MAPPING_ID,
        rawBody,
        deliveryId: DELIVERY_ID,
        timestamp: TIMESTAMP,
        signature: await sign(rawBody),
        nowMs: NOW_MS,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed before JSON parsing/journaling for a bad signature', async () => {
    const { rpc } = setupService();
    const rawBody = '{"event":"message_created","inbox":{"id":701}}';

    await expect(
      persistSignedChatwootWebhook({
        mappingId: MAPPING_ID,
        rawBody,
        deliveryId: DELIVERY_ID,
        timestamp: TIMESTAMP,
        signature: 'sha256=' + '0'.repeat(64),
        nowMs: NOW_MS,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns NOT_READY rather than accepting unsigned work when Vault is unavailable', async () => {
    const { rpc } = setupService();
    vaultRead.mockRejectedValueOnce(new Error('vault unavailable'));
    const rawBody = JSON.stringify({
      event: 'message_created',
      inbox: { id: 701 },
    });

    await expect(
      persistSignedChatwootWebhook({
        mappingId: MAPPING_ID,
        rawBody,
        deliveryId: DELIVERY_ID,
        timestamp: TIMESTAMP,
        signature: await sign(rawBody),
        nowMs: NOW_MS,
      }),
    ).rejects.toMatchObject({ code: 'NOT_READY' });

    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects invalid delivery/mapping identity before service or Vault access', async () => {
    setupService();

    await expect(
      persistSignedChatwootWebhook({
        mappingId: 'not-a-uuid',
        rawBody: '{}',
        deliveryId: DELIVERY_ID,
        timestamp: TIMESTAMP,
        signature: 'sha256=' + '0'.repeat(64),
        nowMs: NOW_MS,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(serviceFactory).not.toHaveBeenCalled();
    expect(vaultRead).not.toHaveBeenCalled();
  });

  it('normalizes service persistence failures to a bounded receiver error', async () => {
    setupService({ rpcError: { message: 'db unavailable' } });
    const rawBody = JSON.stringify({
      event: 'message_created',
      inbox: { id: 701 },
    });

    await expect(
      persistSignedChatwootWebhook({
        mappingId: MAPPING_ID,
        rawBody,
        deliveryId: DELIVERY_ID,
        timestamp: TIMESTAMP,
        signature: await sign(rawBody),
        nowMs: NOW_MS,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ChatwootWebhookError>>({
        code: 'PERSISTENCE_FAILED',
      }),
    );
  });
});
