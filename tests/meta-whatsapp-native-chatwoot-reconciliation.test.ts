import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/chatwoot/conversation-actions', () => ({
  mirrorCanonicalWhatsAppOutboundToChatwoot: vi.fn(),
}));

import { mirrorCanonicalWhatsAppOutboundToChatwoot } from '@/lib/chatwoot/conversation-actions';
import { syncWhatsAppNativeEchoToChatwoot } from '@/lib/whatsapp/chatwoot-inbound-sync';

const canonical = {
  id: '40000000-0000-4000-8000-000000016801',
  conversation_id: '30000000-0000-4000-8000-000000016801',
  lead_id: '20000000-0000-4000-8000-000000016801',
  provider_message_id: 'wamid.native-1',
  channel: 'WHATSAPP',
  direction: 'OUTBOUND',
  status: 'SENT',
  original_text: 'human reply',
  provenance: 'HUMAN_NATIVE_WHATSAPP',
  source_plane: 'META_WHATSAPP',
  source_message_id: 'wamid.native-1',
};

function serviceWithRpc(rpcResults: Array<{ data: unknown; error: null | { message: string } }>) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: canonical, error: null }));

  const rpc = vi.fn();
  for (const result of rpcResults) rpc.mockResolvedValueOnce(result);

  return {
    service: {
      from: vi.fn(() => query),
      rpc,
    } as unknown as SupabaseClient,
    rpc,
  };
}

describe('WhatsApp native Chatwoot reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mirrors a claimed canonical native-human message once and finalizes ACCEPTED', async () => {
    const { service, rpc } = serviceWithRpc([
      {
        data: [{
          event_id: '80000000-0000-4000-8000-000000016801',
          claimed: true,
          sync_status: 'PROCESSING',
          chatwoot_message_id: null,
          lead_id: canonical.lead_id,
          conversation_id: canonical.conversation_id,
        }],
        error: null,
      },
      {
        data: [{ sync_status: 'ACCEPTED', chatwoot_message_id: 701 }],
        error: null,
      },
    ]);
    vi.mocked(mirrorCanonicalWhatsAppOutboundToChatwoot).mockResolvedValue({
      chatwootMessageId: '701',
      outcome: 'CREATED',
    });

    const result = await syncWhatsAppNativeEchoToChatwoot({
      service,
      organizationId: '00000000-0000-4000-8000-000000016801',
      providerMessageId: 'wamid.native-1',
      conversationId: canonical.conversation_id,
      leadId: canonical.lead_id,
      canonicalMessageId: canonical.id,
    });

    expect(result).toEqual({ outcome: 'SYNCED', chatwootMessageId: '701' });
    expect(mirrorCanonicalWhatsAppOutboundToChatwoot).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalMessageId: canonical.id,
        providerMessageId: 'wamid.native-1',
        provenance: 'HUMAN_NATIVE_WHATSAPP',
      }),
    );
    expect(rpc).toHaveBeenNthCalledWith(1, 'claim_whatsapp_native_chatwoot_sync', expect.any(Object));
    expect(rpc).toHaveBeenNthCalledWith(2, 'finalize_whatsapp_native_chatwoot_sync', expect.objectContaining({
      p_status: 'ACCEPTED',
      p_chatwoot_message_id: '701',
    }));
  });

  it('does not mirror again when the durable native journal is already ACCEPTED', async () => {
    const { service } = serviceWithRpc([{
      data: [{
        event_id: '80000000-0000-4000-8000-000000016801',
        claimed: false,
        sync_status: 'ACCEPTED',
        chatwoot_message_id: 701,
        lead_id: canonical.lead_id,
        conversation_id: canonical.conversation_id,
      }],
      error: null,
    }]);

    const result = await syncWhatsAppNativeEchoToChatwoot({
      service,
      organizationId: '00000000-0000-4000-8000-000000016801',
      providerMessageId: 'wamid.native-1',
      conversationId: canonical.conversation_id,
      leadId: canonical.lead_id,
      canonicalMessageId: canonical.id,
    });

    expect(result).toEqual({ outcome: 'REPLAY', chatwootMessageId: 701 });
    expect(mirrorCanonicalWhatsAppOutboundToChatwoot).not.toHaveBeenCalled();
  });

  it('marks ambiguous external mirror outcomes for reconciliation instead of blind retry', async () => {
    const { service, rpc } = serviceWithRpc([
      {
        data: [{
          event_id: '80000000-0000-4000-8000-000000016801',
          claimed: true,
          sync_status: 'PROCESSING',
          chatwoot_message_id: null,
          lead_id: canonical.lead_id,
          conversation_id: canonical.conversation_id,
        }],
        error: null,
      },
      {
        data: [{ sync_status: 'RECONCILIATION_REQUIRED', chatwoot_message_id: null }],
        error: null,
      },
    ]);
    vi.mocked(mirrorCanonicalWhatsAppOutboundToChatwoot).mockRejectedValue(new Error('ambiguous Chatwoot create'));

    await expect(syncWhatsAppNativeEchoToChatwoot({
      service,
      organizationId: '00000000-0000-4000-8000-000000016801',
      providerMessageId: 'wamid.native-1',
      conversationId: canonical.conversation_id,
      leadId: canonical.lead_id,
      canonicalMessageId: canonical.id,
    })).rejects.toThrow('ambiguous Chatwoot create');

    expect(rpc).toHaveBeenNthCalledWith(2, 'finalize_whatsapp_native_chatwoot_sync', expect.objectContaining({
      p_status: 'RECONCILIATION_REQUIRED',
      p_chatwoot_message_id: null,
    }));
  });
});
