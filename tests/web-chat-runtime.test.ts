import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  rpc,
  from,
  ensureProjection,
  createIncoming,
  claimSync,
  finalizeSync,
} = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  ensureProjection: vi.fn(),
  createIncoming: vi.fn(),
  claimSync: vi.fn(),
  finalizeSync: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({ rpc, from }),
}));
vi.mock('@/lib/chatwoot/public-conversation-projection', () => ({
  ensureChatwootPublicConversationProjection: (...args: unknown[]) => ensureProjection(...args),
  createChatwootPublicIncomingMessage: (...args: unknown[]) => createIncoming(...args),
}));
vi.mock('@/lib/web-chat/chatwoot-inbound-sync', () => ({
  claimWebChatChatwootSync: (...args: unknown[]) => claimSync(...args),
  finalizeWebChatChatwootSync: (...args: unknown[]) => finalizeSync(...args),
}));

import {
  createPublicWebChatSession,
  hashWebChatToken,
  persistPublicWebChatMessage,
} from '@/lib/web-chat/runtime';

const journalRow = {
  organization_id: 'org',
  tenant_business_id: 'tenant',
  branch_id: 'branch',
  binding_id: 'binding',
  identity_id: 'identity',
  provider_message_id: '11111111-1111-4111-8111-111111111111:client_12345678',
  message_text: 'hello',
  event_inserted: true,
};

const projectedRow = {
  conversation_id: 'conversation',
  message_id: 'message',
  projection_id: 'projection',
  message_inserted: true,
};

function mockProjection() {
  ensureProjection.mockResolvedValueOnce({
    contact: { id: 51 },
    conversation: { id: 91, uuid: '22222222-2222-4222-8222-222222222222' },
    outcome: 'CREATED',
  });
}

describe('public Web Chat runtime', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    ensureProjection.mockReset();
    createIncoming.mockReset();
    claimSync.mockReset();
    finalizeSync.mockReset();
  });

  it('stores only a SHA-256 token hash when creating a session', async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        session_id: '11111111-1111-4111-8111-111111111111',
        expires_at: '2026-09-28T00:00:00.000Z',
        max_message_chars: 4000,
      }],
      error: null,
    });

    const result = await createPublicWebChatSession({
      publicKey: 'wc_123456789012345678901234',
      origin: 'https://example.com',
      consentAccepted: true,
    });

    expect(result.sessionToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(hashWebChatToken(result.sessionToken)).toMatch(/^[0-9a-f]{64}$/);
    expect(rpc).toHaveBeenCalledWith('create_web_chat_session', expect.objectContaining({
      p_widget_public_key: 'wc_123456789012345678901234',
      p_origin: 'https://example.com',
      p_consent_accepted: true,
      p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(result.sessionToken);
  });

  it('journals, crosses Chatwoot once, records acceptance, then projects Smart Core', async () => {
    rpc
      .mockResolvedValueOnce({ data: [journalRow], error: null })
      .mockResolvedValueOnce({ data: [projectedRow], error: null });
    mockProjection();
    claimSync.mockResolvedValueOnce({
      eventId: '00000000-0000-4000-8000-000000001117',
      claimed: true,
      syncStatus: 'PROCESSING',
      chatwootMessageId: null,
    });
    createIncoming.mockResolvedValueOnce({
      chatwootMessageId: 701,
      conversationDisplayId: 91,
      content: 'hello',
      attachmentCount: 0,
    });
    finalizeSync.mockResolvedValueOnce({
      syncStatus: 'ACCEPTED',
      chatwootMessageId: 701,
    });

    const result = await persistPublicWebChatMessage({
      publicKey: 'wc_123456789012345678901234',
      origin: 'https://example.com',
      sessionId: '11111111-1111-4111-8111-111111111111',
      sessionToken: 'opaque-session-token',
      clientMessageId: 'client_12345678',
      text: 'hello',
    });

    expect(rpc.mock.calls[0]?.[0]).toBe('journal_web_chat_inbound_message');
    expect(ensureProjection).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org',
      tenantBusinessId: 'tenant',
      bindingId: 'binding',
      canonicalIdentityId: 'identity',
      contactDisplayName: 'Website visitor',
    }));
    expect(claimSync).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org',
      sessionId: '11111111-1111-4111-8111-111111111111',
      providerMessageId: journalRow.provider_message_id,
    }));
    expect(createIncoming).toHaveBeenCalledTimes(1);
    expect(createIncoming).toHaveBeenCalledWith(expect.objectContaining({
      conversationDisplayId: 91,
      requestId: 'webchat:client_12345678',
      content: 'hello',
      attachments: [],
    }));
    expect(finalizeSync).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ACCEPTED',
      chatwootMessageId: 701,
    }));
    expect(rpc.mock.calls[1]?.[0]).toBe('project_web_chat_inbound_message');
    expect(createIncoming.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[1]);
    expect(finalizeSync.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[1]);
    expect(result).toEqual({
      accepted: true,
      clientMessageId: 'client_12345678',
      messageId: 'message',
      messageInserted: true,
    });
  });

  it('does not cross Chatwoot again when the journal already proves provider acceptance', async () => {
    rpc
      .mockResolvedValueOnce({ data: [journalRow], error: null })
      .mockResolvedValueOnce({ data: [projectedRow], error: null });
    mockProjection();
    claimSync.mockResolvedValueOnce({
      eventId: '00000000-0000-4000-8000-000000001117',
      claimed: false,
      syncStatus: 'ACCEPTED',
      chatwootMessageId: 701,
    });

    await expect(persistPublicWebChatMessage({
      publicKey: 'wc_123456789012345678901234',
      origin: 'https://example.com',
      sessionId: '11111111-1111-4111-8111-111111111111',
      sessionToken: 'opaque-session-token',
      clientMessageId: 'client_12345678',
      text: 'hello',
    })).resolves.toMatchObject({ accepted: true, messageId: 'message' });

    expect(createIncoming).not.toHaveBeenCalled();
    expect(finalizeSync).not.toHaveBeenCalled();
    expect(rpc.mock.calls[1]?.[0]).toBe('project_web_chat_inbound_message');
  });

  it('marks an ambiguous Chatwoot result reconciliation-only and never retries the provider call', async () => {
    rpc.mockResolvedValueOnce({ data: [journalRow], error: null });
    mockProjection();
    claimSync.mockResolvedValueOnce({
      eventId: '00000000-0000-4000-8000-000000001117',
      claimed: true,
      syncStatus: 'PROCESSING',
      chatwootMessageId: null,
    });
    createIncoming.mockRejectedValueOnce(new Error('network result ambiguous'));
    finalizeSync.mockResolvedValueOnce({
      syncStatus: 'RECONCILIATION_REQUIRED',
      chatwootMessageId: null,
    });

    await expect(persistPublicWebChatMessage({
      publicKey: 'wc_123456789012345678901234',
      origin: 'https://example.com',
      sessionId: '11111111-1111-4111-8111-111111111111',
      sessionToken: 'opaque-session-token',
      clientMessageId: 'client_12345678',
      text: 'hello',
    })).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });

    expect(createIncoming).toHaveBeenCalledTimes(1);
    expect(finalizeSync).toHaveBeenCalledWith(expect.objectContaining({
      status: 'RECONCILIATION_REQUIRED',
    }));
    expect(finalizeSync.mock.calls[0]?.[0]).not.toHaveProperty('chatwootMessageId');

    claimSync.mockResolvedValueOnce({
      eventId: '00000000-0000-4000-8000-000000001117',
      claimed: false,
      syncStatus: 'RECONCILIATION_REQUIRED',
      chatwootMessageId: null,
    });
    rpc.mockResolvedValueOnce({ data: [journalRow], error: null });
    mockProjection();

    await expect(persistPublicWebChatMessage({
      publicKey: 'wc_123456789012345678901234',
      origin: 'https://example.com',
      sessionId: '11111111-1111-4111-8111-111111111111',
      sessionToken: 'opaque-session-token',
      clientMessageId: 'client_12345678',
      text: 'hello',
    })).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' });

    expect(createIncoming).toHaveBeenCalledTimes(1);
  });
});
