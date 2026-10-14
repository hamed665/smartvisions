import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findProjectedWhatsAppConversation } from '@/lib/whatsapp/lifecycle';

function service(rows: { id: string; agent_mode: string }[], error: { message: string } | null = null) {
  const chain = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: rows, error }),
  };
  return { client: { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient, chain };
}

describe('projected WhatsApp conversation selection', () => {
  const scope = { tenantBusinessId: 'tenant', branchId: null, bindingId: 'binding' };
  it('selects the established exact-scope CRM conversation before unprojected attempts', async () => {
    const { client, chain } = service([{ id: 'established', agent_mode: 'HUMAN' }]);
    await expect(findProjectedWhatsAppConversation(client, 'org', 'lead', scope))
      .resolves.toMatchObject({ id: 'established', agent_mode: 'HUMAN' });
    expect(chain.select).toHaveBeenCalledWith('id,agent_mode,unified_inbox_conversation_projections!inner(id)');
    for (const filter of [
      ['organization_id', 'org'], ['lead_id', 'lead'], ['channel', 'WHATSAPP'],
      ['unified_inbox_conversation_projections.organization_id', 'org'],
      ['unified_inbox_conversation_projections.tenant_business_id', 'tenant'],
      ['unified_inbox_conversation_projections.communication_channel_binding_id', 'binding'],
    ]) expect(chain.eq).toHaveBeenCalledWith(...filter);
    expect(chain.is).toHaveBeenCalledWith('unified_inbox_conversation_projections.branch_id', null);
    expect(chain.limit).toHaveBeenCalledWith(2);
  });
  it('preserves exact branch scope and returns null when no projection exists', async () => {
    const { client, chain } = service([]);
    await expect(findProjectedWhatsAppConversation(client, 'org', 'lead', { ...scope, branchId: 'branch' })).resolves.toBeNull();
    expect(chain.eq).toHaveBeenCalledWith('unified_inbox_conversation_projections.branch_id', 'branch');
  });
  it('does not guess when two projections or a read failure exist', async () => {
    await expect(findProjectedWhatsAppConversation(service([{ id: 'a', agent_mode: 'AUTO' }, { id: 'b', agent_mode: 'AUTO' }]).client, 'org', 'lead', scope)).rejects.toThrow('Multiple scoped');
    await expect(findProjectedWhatsAppConversation(service([], { message: 'read failed' }).client, 'org', 'lead', scope)).rejects.toThrow('lookup failed');
  });
});
