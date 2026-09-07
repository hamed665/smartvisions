import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(), usage: vi.fn(), owner: vi.fn(), insert: vi.fn(), update: vi.fn(),
  revalidate: vi.fn(), send: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/supabase/org', () => ({ getCurrentOrganization: mocks.owner }));
vi.mock('@/lib/outreach/mailbox-usage', () => ({ countMailboxSendsLast24Hours: mocks.usage }));
vi.mock('@/lib/outreach/resend-provider', () => ({ ResendEmailProvider: class { sendEmail = mocks.send; } }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error('REDIRECT:' + url); } }));
import { verifyEmailIntegration } from '@/app/integration-health-actions';

describe('owner email evidence check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.invalid');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'test-only');
    vi.stubEnv('EMAIL_PROVIDER', 'RESEND');
    vi.stubEnv('EMAIL_PROVIDER_API_KEY', 'test-only');
    mocks.owner.mockResolvedValue({ organizationId: 'org', userId: 'owner' });
    mocks.usage.mockResolvedValue(0);
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => {
      const query = {
        select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
        insert: mocks.insert, update: mocks.update,
        maybeSingle: async () => ({ data: table === 'mailboxes' ? { id: 'mailbox', daily_limit: 5 }
          : { event_type: 'email.delivered', created_at: '2026-09-01T00:00:00Z' }, error: null }),
      };
      return query;
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('uses rolling quota and existing evidence without sending or refreshing connectivity', async () => {
    await expect(verifyEmailIntegration()).rejects.toThrow('email=checked');
    expect(mocks.owner).toHaveBeenCalledWith(true);
    expect(mocks.usage).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org', mailboxId: 'mailbox' }));
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      action: 'EMAIL_PROVIDER_EVIDENCE_CHECKED',
      after_data: expect.objectContaining({ providerCalls: 0, liveConnectivityTested: false, quotaUsedLast24Hours: 0 }),
    }));
  });
  it('does not claim a successful check if quota reconciliation failed', async () => {
    mocks.usage.mockRejectedValue(new Error('Usage unavailable'));
    await expect(verifyEmailIntegration()).rejects.toThrow('email=error');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
