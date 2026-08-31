import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processInboundMessage } from '@/lib/agents/pipeline';
import type { AgentContext } from '@/lib/agents/contracts';
import { deterministicAgentRuntime } from '@/lib/agents/runtime';
import { getConfiguredAgentRuntime } from '@/lib/agents/openai-runtime';
import { agentRunReplayState, normalizeIdempotencyKey } from '@/lib/agents/idempotency';
import { queueAgentWhatsAppShadowApproval, type AgentShadowResult, type WhatsAppShadowDeliveryContext } from '@/lib/agents/shadow-delivery';
import { assertRuntimeControlsAllow, getRuntimeSafetyControls } from '@/lib/reliability/runtime-safety';
import { requireInternalApiKey } from '@/lib/security/internal-api';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for idempotent AI processing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseDeliveryContext(value: unknown): WhatsAppShadowDeliveryContext | null {
  if (value == null) return null;
  if (!value || typeof value !== 'object') throw new Error('deliveryContext must be an object');
  const input = value as Record<string, unknown>;
  const required = ['conversationId', 'to', 'marketCode'] as const;
  for (const key of required) {
    if (typeof input[key] !== 'string' || !input[key].trim()) throw new Error(`deliveryContext.${key} is required`);
  }
  const optional = (key: string) => typeof input[key] === 'string' && input[key].trim() ? input[key].trim() : undefined;
  return {
    conversationId: String(input.conversationId).trim(),
    to: String(input.to).trim(),
    marketCode: String(input.marketCode).trim().toUpperCase(),
    leadTimezone: optional('leadTimezone'),
    lastCustomerMessageAt: optional('lastCustomerMessageAt'),
    templateName: optional('templateName'),
    templateLanguageCode: optional('templateLanguageCode'),
  };
}

function isAgentShadowResult(value: unknown): value is AgentShadowResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  const draft = result.draft as Record<string, unknown> | undefined;
  const trace = result.trace as Record<string, unknown> | undefined;
  return Boolean(
    draft && typeof draft.text === 'string' && typeof draft.language === 'string'
    && trace && ['SEND', 'REVIEW', 'BLOCK'].includes(String(trace.delivery))
    && Array.isArray(trace.agentResults),
  );
}

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as { context?: AgentContext; idempotencyKey?: string; deliveryContext?: unknown };
  if (!body.context?.message || !body.context.organizationId) {
    return NextResponse.json({ error: 'context.message and context.organizationId are required' }, { status: 400 });
  }

  let requestKey: string;
  let deliveryContext: WhatsAppShadowDeliveryContext | null;
  try {
    requestKey = normalizeIdempotencyKey(String(body.idempotencyKey ?? ''));
    deliveryContext = parseDeliveryContext(body.deliveryContext);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 });
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

  const reconcileApproval = async (result: unknown) => {
    if (!deliveryContext) return undefined;
    if (!isAgentShadowResult(result)) {
      return { queued: false, reconciliationRequired: true, error: 'Stored AI result cannot be reconciled to Shadow Approval' };
    }
    try {
      return await queueAgentWhatsAppShadowApproval({
        context: trustedContext,
        result,
        deliveryContext,
        requestKey,
      });
    } catch (error) {
      return {
        queued: false,
        reconciliationRequired: true,
        error: error instanceof Error ? error.message.slice(0, 600) : 'Shadow Approval reconciliation failed',
      };
    }
  };

  const readExisting = async () => supabase
    .from('agent_runs')
    .select('id,status,result_payload,started_at,completed_at')
    .eq('organization_id', organizationId)
    .eq('request_key', requestKey)
    .maybeSingle();

  const respondExisting = async (run: Awaited<ReturnType<typeof readExisting>>['data']) => {
    const state = agentRunReplayState(run);
    if (state === 'REPLAY') {
      const stored = (run?.result_payload ?? {}) as Record<string, unknown>;
      const approvalQueue = await reconcileApproval(stored);
      return NextResponse.json({ ...stored, ...(approvalQueue ? { approvalQueue } : {}), replayed: true });
    }
    if (state === 'IN_PROGRESS') return NextResponse.json({ error: 'This logical AI request is already processing; automatic retry is blocked', runId: run?.id }, { status: 409 });
    if (state === 'FAILED_LOCKED') return NextResponse.json({ error: 'This logical AI request previously failed; use a new explicit idempotency key only after review', runId: run?.id }, { status: 409 });
    return null;
  };

  const { data: existing, error: existingError } = await readExisting();
  if (existingError) return NextResponse.json({ error: `Agent run lookup failed: ${existingError.message}` }, { status: 500 });
  if (existing) return (await respondExisting(existing))!;

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
      if (raced.data) return (await respondExisting(raced.data))!;
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

    // The paid/AI boundary is complete before queueing. A queue failure must never turn a
    // successfully completed AI run into FAILED or cause the model to be called again.
    const approvalQueue = await reconcileApproval(payload);
    const responsePayload = { ...payload, ...(approvalQueue ? { approvalQueue } : {}), replayed: false, runId: claimed.id };
    if (approvalQueue && 'reconciliationRequired' in approvalQueue && approvalQueue.reconciliationRequired) {
      return NextResponse.json(responsePayload, { status: 202 });
    }
    return NextResponse.json(responsePayload);
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
