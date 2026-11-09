'use server';

import { z } from 'zod';
import { customerStudioScope, loadStudioKnowledge } from '@/lib/access/customer-studio';
import { getConfiguredAgentRuntime } from '@/lib/agents/openai-runtime';
import { processInboundMessage } from '@/lib/agents/pipeline';
import { assertRuntimeOperationAllowed } from '@/lib/reliability/runtime-safety';

const turn = z.object({ from: z.enum(['customer', 'assistant']), text: z.string().trim().min(1).max(1200) });
const inputSchema = z.object({ history: z.array(turn).max(8), message: turn.shape.text });
type Turn = z.infer<typeof turn>;

export async function rehearseStudioAssistant(businessId: string, input: unknown): Promise<{
  turns?: Turn[];
  action?: string;
  error?: string;
}> {
  const { business, ...access } = await customerStudioScope(businessId);
  if (!['OWNER', 'ADMIN'].includes(business.organizationRole) || !['OWNER', 'ADMIN'].includes(business.businessRole)) {
    return { error: 'Only a business manager can rehearse the assistant.' };
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: 'Enter a test message of up to 1,200 characters.' };

  try {
    await assertRuntimeOperationAllowed(business.organizationId, 'AI');
    const versions = await loadStudioKnowledge({ business, ...access });
    const published = versions.find(version => version.active && version.approval_status === 'APPROVED');
    const text = published?.payload?.text;
    const runtime = getConfiguredAgentRuntime();
    if (!published || typeof text !== 'string') return { error: 'Publish a reviewed business profile first.' };
    if (!runtime) return { error: 'The assistant model is unavailable.' };

    const { history, message } = parsed.data;
    const result = await processInboundMessage({
      organizationId: business.organizationId,
      servingBusiness: { name: business.name, countryCode: business.countryCode ?? undefined },
      countryCode: business.countryCode ?? undefined,
      message,
      agentMode: 'AUTO',
      shadowMode: true,
      knowledgeContext: [{ key: published.knowledge_key, version: published.version, payload: { text }, scopeType: 'BUSINESS' }],
      conversationHistory: history.map(item => ({
        direction: item.from === 'customer' ? 'INBOUND' : 'OUTBOUND',
        senderType: item.from === 'customer' ? 'CUSTOMER' : 'AGENT',
        body: item.text,
      })),
    }, { signal: AbortSignal.timeout(40_000) }, runtime);

    const blocked = result.trace.delivery === 'BLOCK';
    const response = blocked ? 'This reply was blocked by a safety check.' : result.draft.text;
    if (!response?.trim()) return { error: 'The assistant did not produce a reviewable response.' };
    return {
      turns: [...history, { from: 'customer', text: message }, { from: 'assistant', text: response.slice(0, 1200) }].slice(-8) as Turn[],
      action: result.trace.decision.action,
    };
  } catch {
    return { error: 'The rehearsal could not finish. Check the model connection or try a shorter test.' };
  }
}
