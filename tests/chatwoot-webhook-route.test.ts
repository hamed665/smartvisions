import { afterEach, describe, expect, it, vi } from 'vitest';

const { persist, processProjection, WebhookError, ProjectionError } = vi.hoisted(() => {
  class WebhookError extends Error {
    constructor(
      public readonly code:
        | 'INVALID_REQUEST'
        | 'UNAUTHORIZED'
        | 'NOT_READY'
        | 'PERSISTENCE_FAILED',
      message: string,
    ) {
      super(message);
      this.name = 'ChatwootWebhookError';
    }
  }

  class ProjectionError extends Error {
    constructor(
      public readonly code:
        | 'INVALID_EVENT'
        | 'MAPPING_MISSING'
        | 'PERSISTENCE_FAILED',
      message: string,
    ) {
      super(message);
      this.name = 'ChatwootProjectionError';
    }
  }

  return {
    persist: vi.fn(),
    processProjection: vi.fn(),
    WebhookError,
    ProjectionError,
  };
});

vi.mock('@/lib/chatwoot/webhook-receiver', () => ({
  ChatwootWebhookError: WebhookError,
  persistSignedChatwootWebhook: persist,
}));
vi.mock('@/lib/chatwoot/webhook-projection', () => ({
  ChatwootProjectionError: ProjectionError,
  processChatwootWebhookProjection: processProjection,
}));

import { POST } from '@/app/api/chatwoot/webhook/[mappingId]/route';

const MAPPING_ID = '00000000-0000-4000-8000-000000001101';
const DELIVERY_ID = '00000000-0000-4000-8000-000000001102';

function request(input?: {
  body?: string;
  headers?: Record<string, string>;
}) {
  return new Request(
    `https://app.example.com/api/chatwoot/webhook/${MAPPING_ID}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-chatwoot-delivery': DELIVERY_ID,
        'x-chatwoot-timestamp': '1797000000',
        'x-chatwoot-signature': 'sha256=' + 'a'.repeat(64),
        ...input?.headers,
      },
      body: input?.body ?? '{"event":"message_created","inbox":{"id":701}}',
    },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  persist.mockReset();
  processProjection.mockReset();
});

describe('Chatwoot webhook route', () => {
  it('ACKs only after the verified journal event is projected or intentionally ignored', async () => {
    persist.mockResolvedValueOnce({
      accepted: true,
      replayed: false,
      eventId: '00000000-0000-4000-8000-000000001103',
      status: 'RECEIVED',
      eventType: 'message_created',
    });
    processProjection.mockResolvedValueOnce({
      eventId: '00000000-0000-4000-8000-000000001103',
      status: 'PROCESSED',
      replayed: false,
    });

    const response = await POST(request(), {
      params: Promise.resolve({ mappingId: MAPPING_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accepted: true,
      replayed: false,
      status: 'RECEIVED',
      projectionStatus: 'PROCESSED',
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0]?.[0]).toMatchObject({
      mappingId: MAPPING_ID,
      deliveryId: DELIVERY_ID,
      timestamp: '1797000000',
      signature: 'sha256=' + 'a'.repeat(64),
    });
  });

  it('returns retryable 503 when durable projection fails after journaling', async () => {
    persist.mockResolvedValueOnce({
      accepted: true,
      replayed: false,
      eventId: '00000000-0000-4000-8000-000000001103',
      status: 'RECEIVED',
      eventType: 'message_created',
    });
    processProjection.mockRejectedValueOnce(
      new ProjectionError('PERSISTENCE_FAILED', 'internal projection detail'),
    );

    const response = await POST(request(), {
      params: Promise.resolve({ mappingId: MAPPING_ID }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Chatwoot webhook projection temporarily unavailable',
    });
    expect(JSON.stringify(await Promise.resolve({}))).not.toContain(
      'internal projection detail',
    );
  });

  it('rejects non-JSON content before receiver work', async () => {
    const response = await POST(
      request({ headers: { 'content-type': 'text/plain' } }),
      { params: Promise.resolve({ mappingId: MAPPING_ID }) },
    );

    expect(response.status).toBe(415);
    expect(persist).not.toHaveBeenCalled();
  });

  it('rejects oversized declared bodies before reading/receiver work', async () => {
    const response = await POST(
      request({ headers: { 'content-length': String(1024 * 1024 + 1) } }),
      { params: Promise.resolve({ mappingId: MAPPING_ID }) },
    );

    expect(response.status).toBe(413);
    expect(persist).not.toHaveBeenCalled();
  });

  it('stream-caps oversized bodies even without content-length', async () => {
    const oversized = 'x'.repeat(1024 * 1024 + 1);
    const response = await POST(
      request({
        body: oversized,
        headers: {
          'content-type': 'application/json',
        },
      }),
      { params: Promise.resolve({ mappingId: MAPPING_ID }) },
    );

    expect(response.status).toBe(413);
    expect(persist).not.toHaveBeenCalled();
  });

  it('maps invalid signed requests to bounded 400/401 responses', async () => {
    for (const [code, expected] of [
      ['INVALID_REQUEST', 400],
      ['UNAUTHORIZED', 401],
    ] as const) {
      persist.mockRejectedValueOnce(
        new WebhookError(code, 'internal detail must not escape'),
      );

      const response = await POST(request(), {
        params: Promise.resolve({ mappingId: MAPPING_ID }),
      });

      expect(response.status).toBe(expected);
      const payload = await response.json();
      expect(JSON.stringify(payload)).not.toContain('internal detail');
    }
  });

  it('returns retryable 503 for Vault/persistence failures without leaking details', async () => {
    for (const code of ['NOT_READY', 'PERSISTENCE_FAILED'] as const) {
      persist.mockRejectedValueOnce(
        new WebhookError(code, 'sensitive internal failure'),
      );

      const response = await POST(request(), {
        params: Promise.resolve({ mappingId: MAPPING_ID }),
      });

      expect(response.status).toBe(503);
      const payload = await response.json();
      expect(payload).toEqual({
        error: 'Chatwoot webhook temporarily unavailable',
      });
    }
  });

  it('normalizes unexpected receiver exceptions to retryable 503', async () => {
    persist.mockRejectedValueOnce(new Error('unexpected'));

    const response = await POST(request(), {
      params: Promise.resolve({ mappingId: MAPPING_ID }),
    });

    expect(response.status).toBe(503);
  });
});
