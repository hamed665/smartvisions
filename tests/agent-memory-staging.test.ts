import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentContext } from '@/lib/agents/contracts';
import { stageCompletedRunMemory } from '@/lib/agents/memory-staging';

const context: AgentContext = { conversationId: 'conversation-1', message: 'Please explain your bilingual website package.',
  conversationHistory: [{ sourceId: 'inbound-1', source: 'CONVERSATION', scope: 'CONVERSATION', senderType: 'CUSTOMER',
    direction: 'INBOUND', status: 'RECEIVED', channel: 'WHATSAPP', body: 'Please explain your bilingual website package.', at: new Date().toISOString() }] };
function setup(error: unknown = null) {
  const rpc = vi.fn<(_name: string, _args: Record<string, string>) => Promise<{ data: never[]; error: unknown }>>(async () => ({ data: [], error }));
  const run = (candidate = context) => stageCompletedRunMemory({ supabase: { rpc } as unknown as SupabaseClient, organizationId: 'org-1', runId: 'run-1', context: candidate });
  return { rpc, run };
}
describe('completed-run governed Memory', () => {
  it('stages exact scoped evidence with expiry and stable replay identity, never approves it', async () => {
    const t = setup();
    expect(await t.run()).toEqual({ status: 'PENDING_REVIEW' });
    expect(t.rpc).toHaveBeenCalledExactlyOnceWith('stage_memory_item_v2', expect.objectContaining({
      p_actor_type: 'SYSTEM', p_source_type: 'AGENT_RUNTIME', p_source_ref: 'run-1', p_conversation_id: 'conversation-1',
      p_request_key: 'agent-memory:run-1', p_sensitivity: 'CONFIDENTIAL',
      p_payload: { text: context.message, interpretation: 'CUSTOMER_REPORTED_UNVERIFIED' },
    }));
    const args = t.rpc.mock.calls[0][1];
    expect(Date.parse(args.p_expires_at) - Date.parse(args.p_observed_at)).toBe(30 * 86400000);
  });
  it.each([{ ...context, conversationHistory: [] }, { ...context, message: 'Different caller-supplied text' }, { ...context, conversationId: undefined }])('ignores unscoped or unsupported context', async candidate => {
    const t = setup(); expect(await t.run(candidate)).toEqual({ status: 'SKIPPED' }); expect(t.rpc).not.toHaveBeenCalled();
  });
  it('reports Memory failure without throwing or retrying paid Agent work', async () => {
    const t = setup({ message: 'RPC rejected' });
    expect(await t.run()).toEqual({ status: 'RECONCILIATION_REQUIRED' });
    expect(t.rpc).toHaveBeenCalledTimes(1);
  });
});
