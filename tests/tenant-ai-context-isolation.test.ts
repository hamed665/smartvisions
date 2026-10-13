import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hydrateAgentContext } from '@/lib/agents/context-hydrator-core';
import { buildProviderAgentInputForRuntime } from '@/lib/agents/openai-runtime-core';

function setup(options: { scoped?: boolean; active?: boolean; knowledge?: boolean; branch?: boolean; validBranch?: boolean } = {}) {
  const scoped = options.scoped !== false;
  const from = vi.fn((table: string) => {
    const data = table === 'sales_conversations'
      ? { id: 'conversation-1', channel: 'WHATSAPP', stage: 'ACTIVE', agent_mode: 'AUTO' }
      : table === 'unified_inbox_conversation_projections'
        ? scoped ? { tenant_business_id: 'tenant-1', branch_id: options.branch ? 'branch-1' : null } : null
        : table === 'tenant_businesses'
          ? { id: 'tenant-1', name: 'Sahra', status: options.active === false ? 'ARCHIVED' : 'ACTIVE', country_code: 'OM', timezone: 'Asia/Muscat' }
          : table === 'branches'
            ? options.validBranch === false ? null : { id: 'branch-1', status: 'ACTIVE' }
            : [];
    const result = { data, error: null };
    const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), in: vi.fn(() => chain),
      contains: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => result), then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
    return chain;
  });
  const rpc = vi.fn(async (name: string) => ({ error: null, data: name === 'get_knowledge_context_v2'
    ? [{ knowledge_key: 'platform_brand', version: 1, scope_type: 'ORGANIZATION', payload: { text: 'Sell Smart Visions software' } },
      ...(options.knowledge === false ? [] : [{ knowledge_key: 'sahra_services', version: 1, scope_type: 'BUSINESS', payload: { text: 'Sahra reported car-care categories; prices require confirmation' } }])]
    : name === 'compile_business_twin_v2' ? { organization: { name: 'Smart Visions' } } : [] }));
  const run = () => hydrateAgentContext({ supabase: { from, rpc } as unknown as SupabaseClient,
    trustedConversationId: 'conversation-1', context: { organizationId: 'org-1', countryCode: 'OM',
      message: 'How much is PPF?', servingBusiness: { name: 'Untrusted caller brand' }, quotedPrice: 149 } });
  return { from, rpc, run };
}

describe('canonical serving Business context', () => {
  it('uses scoped knowledge and keeps platform identity, catalog, prices, prompts and portfolio out of tenant replies', async () => {
    const t = setup();
    const { context } = await t.run();
    expect(context.servingBusiness?.name).toBe('Sahra');
    expect(context.knowledgeContext?.map(k => k.key)).toEqual(['sahra_services']);
    expect(context.serviceKnowledge).toEqual([]);
    expect(context.activePrompts).toEqual({});
    expect(context.approvedPortfolio).toEqual([]);
    expect(context.businessTwinContext).toBeUndefined();
    expect(context.quotedPrice).toBeUndefined();
    for (const table of ['services','service_prices','service_booking_profiles','prompt_versions','portfolio_items']) {
      expect(t.from).not.toHaveBeenCalledWith(table);
    }
    expect(t.rpc).not.toHaveBeenCalledWith('compile_business_twin_v2', expect.anything());
    expect(t.rpc).toHaveBeenCalledWith('get_knowledge_context_v2', expect.objectContaining({ p_tenant_business_id: 'tenant-1' }));
    const provider = buildProviderAgentInputForRuntime('secretary', context, 10);
    expect(provider).toMatchObject({ servingBusiness: { name: 'Sahra' } });
    expect(JSON.stringify(provider)).not.toContain('tenant-1');
    expect(JSON.stringify(provider)).not.toContain('platform_brand');
  });
  it.each([{ active: false }, { knowledge: false }, { branch: true, validBranch: false }])('fails closed when tenant authority is unavailable: %j', async options => {
    await expect(setup(options).run()).rejects.toThrow();
  });
  it('does not adopt caller-supplied tenant identity for an unscoped organization conversation', async () => {
    const t = setup({ scoped: false });
    const { context } = await t.run();
    expect(context.servingBusiness).toBeUndefined();
    expect(t.from).toHaveBeenCalledWith('services');
    expect(t.rpc).toHaveBeenCalledWith('compile_business_twin_v2', { p_organization_id: 'org-1' });
  });
});
