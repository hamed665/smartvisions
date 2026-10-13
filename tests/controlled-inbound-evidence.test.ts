import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { controlledInboundEvidence, controlledInboundId } from '@/lib/whatsapp/controlled-inbound-evidence';

describe('controlled inbound persisted receipt boundary', () => {
  it('never derives live authority from a prefix without an exact UUID', () => {
    expect(controlledInboundId('agent:whatsapp-pilot:live:forged:shadow')).toBeNull();
    expect(controlledInboundId('agent:whatsapp-pilot:live:10000000-0000-4000-8000-00000000ca01:shadow'))
      .toBe('10000000-0000-4000-8000-00000000ca01');
  });
  it.each([null, {}, { allowed: false, reason: 'EXPIRED' }])('fails closed for missing or denied evidence %#', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    const result = await controlledInboundEvidence({ supabase: { rpc } as unknown as SupabaseClient,
      organizationId: 'org-fixture', inboundId: 'inbound-fixture', recipient: '96890000001' });
    expect(result.allowed).toBe(false);
    expect(rpc.mock.calls[0][1].p_claim).toBe(false);
  });
  it('uses atomic admission and rechecks the exact conversation rather than accepting caller safety flags', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { allowed: true, reason: 'CLAIMED' }, error: null });
    expect(await controlledInboundEvidence({ supabase: { rpc } as unknown as SupabaseClient,
      organizationId: 'org-fixture', inboundId: 'inbound-fixture', recipient: '96890000001',
      conversationId: 'conversation-fixture', claim: true })).toEqual({ allowed: true, reason: 'CLAIMED' });
    expect(rpc).toHaveBeenCalledWith('verify_or_claim_whatsapp_controlled_inbound', {
      p_organization_id: 'org-fixture', p_inbound_id: 'inbound-fixture', p_recipient: '96890000001',
      p_conversation_id: 'conversation-fixture', p_claim: true,
    });
  });
});
