import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
const ensureProjection = vi.fn();

vi.mock('@/lib/supabase/service', () => ({
  createSupabaseServiceClient: () => ({ rpc, from }),
}));
vi.mock('@/lib/chatwoot/public-conversation-projection', () => ({
  ensureChatwootPublicConversationProjection: (...args: unknown[]) => ensureProjection(...args),
}));

import {
  createPublicWebChatSession,
  hashWebChatToken,
  persistPublicWebChatMessage,
} from '@/lib/web-chat/runtime';

describe('public Web Chat runtime', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    ensureProjection.mockReset();
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

  it('journals before projecting the same scoped message into Chatwoot and Smart Core', async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{
          organization_id: 'org',
          tenant_business_id: 'tenant',
          branch_id: 'branch',
          binding_id: 'binding',
          identity_id: 'identity',
          provider_message_id: '11111111-1111-4111-8111-111111111111:client_12345678',
          message_text: 'hello',
          event_inserted: true,
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          conversation_id: 'conversation',
          message_id: 'message',
          projection_id: 'projection',
          message_inserted: true,
        }],
        error: null,
      });

    ensureProjection.mockResolvedValueOnce({
      contact: { id: 51 },
      conversation: { id: 91, uuid: '22222222-2222-4222-8222-222222222222' },
      outcome: 'CREATED',
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
    expect(rpc.mock.calls[1]?.[0]).toBe('project_web_chat_inbound_message');
    expect(result).toEqual({
      accepted: true,
      clientMessageId: 'client_12345678',
      messageId: 'message',
      messageInserted: true,
    });
  });
});
