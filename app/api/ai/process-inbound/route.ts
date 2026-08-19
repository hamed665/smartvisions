import { NextResponse } from 'next/server';
import { processInboundMessage } from '@/lib/agents/pipeline';
import type { AgentContext } from '@/lib/agents/contracts';
import { requireInternalApiKey } from '@/lib/security/internal-api';

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as { context?: AgentContext; agentsPaused?: boolean };
  if (!body.context?.message) {
    return NextResponse.json({ error: 'context.message is required' }, { status: 400 });
  }

  const result = await processInboundMessage(body.context, { agentsPaused: body.agentsPaused });
  return NextResponse.json(result);
}
