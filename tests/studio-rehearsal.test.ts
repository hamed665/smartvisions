import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  scope: vi.fn(), knowledge: vi.fn(), runtime: vi.fn(), pipeline: vi.fn(), assertRuntime: vi.fn(),
}));
vi.mock('@/lib/access/customer-studio', () => ({
  customerStudioScope: mocks.scope, loadStudioKnowledge: mocks.knowledge,
}));
vi.mock('@/lib/agents/openai-runtime', () => ({ getConfiguredAgentRuntime: mocks.runtime }));
vi.mock('@/lib/agents/pipeline', () => ({ processInboundMessage: mocks.pipeline }));
vi.mock('@/lib/reliability/runtime-safety', () => ({ assertRuntimeOperationAllowed: mocks.assertRuntime }));

import { rehearseStudioAssistant } from '@/app/customer/ai/rehearsal-action';

const business = {
  id: 'business', organizationId: 'org', name: 'Palm Clinic', countryCode: 'OM',
  businessRole: 'OWNER', organizationRole: 'OWNER',
};

describe('Studio private rehearsal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scope.mockResolvedValue({ business, userId: 'owner', supabase: {} });
    mocks.runtime.mockReturnValue({ run: vi.fn() });
    mocks.knowledge.mockResolvedValue([
      { active: false, approval_status: 'PENDING_REVIEW', knowledge_key: 'profile', version: 3, payload: { text: 'Unapproved prices' } },
      { active: true, approval_status: 'APPROVED', knowledge_key: 'profile', version: 2, payload: { text: 'Verified service description' } },
    ]);
    mocks.pipeline.mockResolvedValue({
      draft: { text: 'هل تقصد خدمة التنظيف؟' }, trace: { delivery: 'REVIEW', decision: { action: 'ASK' } },
    });
  });

  it('passes the prior turn and only published knowledge to the canonical pipeline without mutation hooks', async () => {
    const history = [{ from: 'customer', text: 'أريد أعرف عن التنظيف' }, { from: 'assistant', text: 'متوفر عندنا نوعين.' }];
    const outcome = await rehearseStudioAssistant('business', { history, message: 'بكم؟' });
    expect(outcome).toMatchObject({ action: 'ASK', turns: [...history,
      { from: 'customer', text: 'بكم؟' }, { from: 'assistant', text: 'هل تقصد خدمة التنظيف؟' }] });
    const [context, control] = mocks.pipeline.mock.calls[0];
    expect(context).toMatchObject({ shadowMode: true, knowledgeContext: [{ version: 2, payload: { text: 'Verified service description' } }],
      conversationHistory: [{ direction: 'INBOUND', body: history[0].text }, { direction: 'OUTBOUND', body: history[1].text }] });
    expect(control.signal).toBeInstanceOf(AbortSignal);
    expect(mocks.pipeline.mock.calls[0]).toHaveLength(3);
  });

  it('requires a manager and does not rehearse a pending profile', async () => {
    mocks.scope.mockResolvedValueOnce({ business: { ...business, businessRole: 'VIEWER' } });
    expect((await rehearseStudioAssistant('business', { history: [], message: 'Hi' })).error).toMatch(/manager/);
    mocks.knowledge.mockResolvedValueOnce([]);
    expect((await rehearseStudioAssistant('business', { history: [], message: 'Hi' })).error).toMatch(/Publish/);
    expect(mocks.pipeline).not.toHaveBeenCalled();
  });
});
