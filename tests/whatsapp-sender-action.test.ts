import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ owner: vi.fn(), inspect: vi.fn(), insert: vi.fn(), update: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('REDIRECT'); }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/org', () => ({ getCurrentOrganization: mocks.owner }));
vi.mock('@/lib/whatsapp/meta-cloud', () => ({ MetaCloudWhatsAppProvider: class { inspectSender = mocks.inspect; } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { id: 'integration-1', config: { existing: 'preserved' } }, error: null }),
    insert: mocks.insert, update: (value: unknown) => { mocks.update(value); return chain; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
  return chain;
} }) }));
import { inspectWhatsAppSender } from '@/app/whatsapp-verification-actions';

describe('owner-only sender identity action', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co'); vi.stubEnv('SUPABASE_SECRET_KEY', 'test');
    mocks.owner.mockResolvedValue({ organizationId: 'org-1', userId: 'owner-1' });
    mocks.insert.mockResolvedValue({ error: null });
  });
  const form = () => { const f = new FormData(); f.set('expected_sender_phone', '+96877402910'); return f; };
  it('requires owner authorization before reading provider identity', async () => {
    mocks.owner.mockRejectedValueOnce(new Error('Owner permission required'));
    await expect(inspectWhatsAppSender(form())).rejects.toThrow('Owner permission');
    expect(mocks.owner).toHaveBeenCalledWith(true); expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it('persists mismatch evidence while preserving connection state and routing', async () => {
    mocks.inspect.mockResolvedValueOnce({ phoneNumberId: '123', displayPhoneNumber: '+96893191993', verifiedName: 'Sahra', matchesExpected: false });
    await expect(inspectWhatsAppSender(form())).rejects.toThrow('REDIRECT');
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ existing: 'preserved', sender_identity: expect.objectContaining({ status: 'MISMATCH', providerSendTriggered: false }) }) }));
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('status');
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('enabled');
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ actor_id: 'owner-1', organization_id: 'org-1', action: 'META_WHATSAPP_SENDER_IDENTITY_CHECKED' }));
  });
  it('records verification failure without persisting a provider secret', async () => {
    mocks.inspect.mockRejectedValueOnce(new Error('private-provider-secret'));
    await expect(inspectWhatsAppSender(form())).rejects.toThrow('REDIRECT');
    expect(JSON.stringify(mocks.update.mock.calls)).not.toContain('private-provider-secret');
    expect(mocks.update.mock.calls[0][0].config.sender_identity.status).toBe('UNVERIFIED');
  });
});
