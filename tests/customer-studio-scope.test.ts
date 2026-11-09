import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadAccess, createClient } = vi.hoisted(() => ({
  loadAccess: vi.fn(),
  createClient: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not found'); } }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('@/lib/access/customer-business-scope', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/access/customer-business-scope')>();
  return { ...actual, loadCustomerBusinessAccessContext: loadAccess };
});

import { loadStudioHistory, studioOwnerThread } from '@/lib/access/customer-studio';

const businessId = '11111111-1111-4111-8111-111111111111';
const threadId = '55555555-5555-4555-8555-555555555555';
const business = { id: businessId, organizationId: 'org', organizationRole: 'OWNER', businessRole: 'OWNER' } as const;

function fixture(projection: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    returns: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: projection, error: null }),
  };
  const client = { from: vi.fn().mockReturnValue(query) };
  return { query, client };
}

describe('Studio conversation scope', () => {
  beforeEach(() => { loadAccess.mockReset(); createClient.mockReset(); });

  it('blocks owner mutation without an exact scoped WhatsApp projection', async () => {
    const { query, client } = fixture();
    createClient.mockResolvedValue(client);
    loadAccess.mockResolvedValue({ selectedBusiness: business, userId: 'owner' });
    expect(await studioOwnerThread(businessId, threadId)).toBeNull();
    expect(query.eq.mock.calls).toEqual([
      ['organization_id', 'org'], ['tenant_business_id', businessId],
      ['sales_conversations.channel', 'WHATSAPP'], ['conversation_id', threadId],
    ]);
  });

  it('requires owner authority before looking up the conversation', async () => {
    const { client } = fixture();
    createClient.mockResolvedValue(client);
    loadAccess.mockResolvedValue({ selectedBusiness: { ...business, businessRole: 'VIEWER' }, userId: 'viewer' });
    expect(await studioOwnerThread(businessId, threadId)).toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('rejects history before requesting messages when the projection is missing', async () => {
    const { client } = fixture();
    const scope = { supabase: client, business, userId: 'owner' } as unknown as Parameters<typeof loadStudioHistory>[0];
    await expect(loadStudioHistory(scope, threadId)).rejects.toThrow('not found');
    expect(client.from.mock.calls).toEqual([['unified_inbox_conversation_projections']]);
  });
});
