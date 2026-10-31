import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadHumanFirstTouchContexts } from '@/lib/hunters/business/human-acquisition';

function setup(historyError = false) {
  const eq = vi.fn();
  const from = vi.fn((table: string) => {
    const data = table === 'growth_opportunities' ? [{ id: 'opportunity-1', business_id: 'business-1', priority_score: 87,
      prospect_tier: 'A', should_contact: true, recommended_acquisition_route: 'HYBRID_EMAIL_HUMAN_GCC', primary_service_id: 'business_website',
      message_hooks: ['No standalone website is currently known.'], businesses: { name: 'Test Clinic', country_code: 'OM', whatsapp: 'https://wa.me/96890000000' } }]
      : table === 'leads' ? [{ id: 'lead-1', business_id: 'business-1', status: 'NEW', agent_mode: 'AUTO' }]
        : table === 'outreach_messages' ? [{ lead_id: 'lead-1', status: 'DELIVERED' }] : [];
    const result = { data, error: historyError && table === 'outreach_messages' ? { message: 'History unavailable' } : null };
    const chain = { select: () => chain, eq: (...args: unknown[]) => { eq(...args); return chain; }, in: () => chain,
      order: () => chain, limit: () => chain, then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    return chain;
  });
  return { eq, load: () => loadHumanFirstTouchContexts({ organizationId: 'org-1', businessIds: ['business-1'], supabase: { from } as unknown as SupabaseClient }) };
}
describe('human queue canonical contact history', () => {
  it('marks the real queue context previously contacted after a confirmed outbound', async () => {
    const { eq, load } = setup();
    expect((await load()).get('business-1')).toEqual({ blockedReason: 'PREVIOUSLY_CONTACTED', leadId: 'lead-1' });
    expect(eq.mock.calls.filter(args => args[0] === 'organization_id')).toHaveLength(4);
  });
  it('fails closed when provider-confirmed history cannot be read', async () => {
    await expect(setup(true).load()).rejects.toThrow('contact history is unavailable');
  });
});
