import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processInboundMessage } from '@/lib/agents/pipeline';
import type { AgentContext } from '@/lib/agents/contracts';
import { deterministicAgentRuntime } from '@/lib/agents/runtime';
import { getConfiguredAgentRuntime } from '@/lib/agents/openai-runtime';
import { agentRunReplayState, normalizeIdempotencyKey } from '@/lib/agents/idempotency';
import { assertRuntimeControlsAllow, getRuntimeSafetyControls } from '@/lib/reliability/runtime-safety';
import { requireInternalApiKey } from '@/lib/security/internal-api';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for idempotent AI processing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as { context?: AgentContext; idempotencyKey?: string };
  if (!body.context?.message || !body.context.organizationId) {
    return NextResponse.json({ error: 'context.message and context.organizationId are required' }, { status: 400 });
  }

  let requestKey: string;
  try {
    requestKey = normalizeIdempotencyKey(String(body.idempotencyKey ?? ''));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid idempotencyKey' }, { status: 400 });
  }

  const supabase = serviceClient();
  const organizationId = body.context.organizationId;
  let controls;
  try {
    controls = await getRuntimeSafetyControls(organizationId);
    assertRuntimeControlsAllow(controls, 'AI');
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'AI runtime controls blocked processing' }, { status: 423 });
  }
  const trustedContext: AgentContext = { ...body.context, shadowMode: controls.shadow_mode };

  const readExisting = async () => supabase
    .from('agent_runs')
    .select('id,status,result_payload,started_at,completed_at')
    .eq('organization_id', organizationId)
    .eq('request_key', requestKey)
    .maybeSingle();

  const { data: existing, error: existingError } = await readExisting();
  if (existingError) return NextResponse.json({ error: `Agent run lookup failed: ${existingError.message}` }, { status: 500 });

  const respondExisting = (run: typeof existing) => {
    const state = agentRunReplayState(run);
    if (state === 'REPLAY') return NextResponse.json({ ...(run?.result_payload as Record<string, unknown>), replayed: true });
    if (state === 'IN_PROGRESS') return NextResponse.json({ error: 'This logical AI request is already processing; automatic retry is blocked', runId: run?.id }, { status: 409 });
    if (state === 'FAILED_LOCKED') return NextResponse.json({ error: 'This logical AI request previously failed; use a new explicit idempotency key only after review', runId: run?.id }, { status: 409 });
    return null;
  };

  if (existing) return respondExisting(existing)!;

  const { data: claimed, error: claimError } = await supabase.from('agent_runs').insert({
    organization_id: organizationId,
    lead_id: trustedContext.leadId ?? null,
    input_message: trustedContext.message,
    routed_agents: [],
    status: 'PROCESSING',
    trace: {},
    request_key: requestKey,
  }).select('id,status,result_payload,started_at,completed_at').single();

  if (claimError) {
    if (claimError.code === '23505') {
      const raced = await readExisting();
      if (raced.error) return NextResponse.json({ error: `Agent run race lookup failed: ${raced.error.message}` }, { status: 500 });
      if (raced.data) return respondExisting(raced.data)!;
    }
    return NextResponse.json({ error: `Agent run claim failed: ${claimError.message}` }, { status: 500 });
  }

  const runtime = getConfiguredAgentRuntime() ?? deterministicAgentRuntime;
  const runtimeName = runtime === deterministicAgentRuntime ? 'deterministic' : 'openai_responses';

  try {
    const result = await processInboundMessage(trustedContext, { agentsPaused: controls.agents_paused }, runtime);
    const payload = { ...result, runtime: runtimeName };
    const completedAt = new Date().toISOString();
    const { error: completeError } = await supabase.from('agent_runs').update({
      status: 'COMPLETED',
      routed_agents: result.trace.routedAgents,
      trace: result.trace,
      result_payload: payload,
      completed_at: completedAt,
    }).eq('organization_id', organizationId).eq('id', claimed.id).eq('status', 'PROCESSING');
    if (completeError) {
      return NextResponse.json({ error: 'AI processing completed but result persistence requires reconciliation', runId: claimed.id, reconciliationRequired: true }, { status: 202 });
    }
    return NextResponse.json({ ...payload, replayed: false, runId: claimed.id });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 600) : 'Inbound AI processing failed';
    await supabase.from('agent_runs').update({
      status: 'FAILED',
      trace: { error: message, automatic_retry: false },
      completed_at: new Date().toISOString(),
    }).eq('organization_id', organizationId).eq('id', claimed.id).eq('status', 'PROCESSING');
    return NextResponse.json({ error: message, runId: claimed.id, automaticRetry: false }, { status: 502 });
  }
}
