import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/chatwoot/vault', () => ({
  readChatwootVaultSecret: vi.fn().mockResolvedValue('hmac-secret'),
}));

import { ensureChatwootPublicConversationProjection } from '@/lib/chatwoot/public-conversation-projection';

function service() {
  const result = { data: {
    id: 'map-1',
    organization_id: 'org',
    tenant_business_id: 'biz',
    communication_channel_binding_id: 'binding',
    chatwoot_channel_identifier: 'inbox-identifier',
    hmac_token_ref: 'vault://token',
    status: 'ACTIVE',
  }, error: null };
  const chain: any = {
    select: () => chain, eq: () => chain, single: async () => result,
  };
  return { from: () => chain } as any;
}

describe('Chatwoot public conversation projection', () => {
  beforeEach(() => {
    process.env.CHATWOOT_BASE_URL = 'https://inbox.smartvisionsai.com';
  });

  it('reuses deterministic contact and active conversation without mutations', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ source_id: 'sv:binding:identity' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 41, status: 'open' }]), { status: 200 }));

    const result = await ensureChatwootPublicConversationProjection({
      service: service(), organizationId: 'org', tenantBusinessId: 'biz',
      bindingId: 'binding', canonicalIdentityId: 'identity', fetchImpl: fetchImpl as any,
    });

    expect(result.outcome).toBe('RECONCILED_EXISTING');
    expect(result.conversation.id).toBe(41);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reconciles an ambiguous conversation create instead of blind retrying', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ source_id: 'sv:binding:identity' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockRejectedValueOnce(new TypeError('network lost after upstream acceptance'))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 42, status: 'open' }]), { status: 200 }));

    const result = await ensureChatwootPublicConversationProjection({
      service: service(), organizationId: 'org', tenantBusinessId: 'biz',
      bindingId: 'binding', canonicalIdentityId: 'identity', fetchImpl: fetchImpl as any,
    });

    expect(result.outcome).toBe('RECONCILED_AFTER_AMBIGUOUS_CREATE');
    expect(result.conversation.id).toBe(42);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('fails closed when canonical identity has multiple active conversations', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ source_id: 'sv:binding:identity' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 1, status: 'open' }, { id: 2, status: 'pending' }]), { status: 200 }));

    await expect(ensureChatwootPublicConversationProjection({
      service: service(), organizationId: 'org', tenantBusinessId: 'biz',
      bindingId: 'binding', canonicalIdentityId: 'identity', fetchImpl: fetchImpl as any,
    })).rejects.toThrow('Multiple active Chatwoot conversations');
  });
});
