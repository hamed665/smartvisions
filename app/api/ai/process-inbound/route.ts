import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processInboundMessage } from '@/lib/agents/pipeline';
import type { AgentContext } from '@/lib/agents/contracts';
import { hydrateAgentContext, type HydratedRuntimeEvidence } from '@/lib/agents/context-hydrator';
import { deterministicAgentRuntime } from '@/lib/agents/runtime';
import { getConfiguredAgentRuntime } from '@/lib/agents/openai-runtime';
import { buildSelectiveRoutePlan } from '@/lib/agents/selective-routing';
import { agentRunReplayState, normalizeIdempotencyKey } from '@/lib/agents/idempotency';
import { queueAgentWhatsAppShadowApproval, type AgentShadowResult, type WhatsAppShadowDeliveryContext } from '@/lib/agents/shadow-delivery';
import { evaluateAiRunQuota, getCostGuardState } from '@/lib/reliability/cost-guard';
import { assertRuntimeControlsAllow, getRuntimeSafetyControls } from '@/lib/reliability/runtime-safety';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { notifyTelegramOwner } from '@/lib/telegram/notifications';
import { buildSalesTelegramAlert } from '@/lib/telegram/sales-alerts';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for idempotent AI processing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type RequestedWhatsAppDeliveryContext = Omit<WhatsAppShadowDeliveryContext, 'lastCustomerMessageAt'>;

function parseDeliveryContext(value: unknown): RequestedWhatsAppDeliveryContext | null {
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
    templateName: optional('templateName'),
    templateLanguageCode: optional('templateLanguageCode'),
  };
}

async function resolveTrustedDeliveryContext(input: {
  supabase: ReturnType<typeof serviceClient>;
  organizationId: string;
  leadId?: string;
  requested: RequestedWhatsAppDeliveryContext | null;
}): Promise<WhatsAppShadowDeliveryContext | null> {
  if (!input.requested) return null;

  const { data: conversation, error: conversationError } = await input.supabase
    .from('sales_conversations')
    .select('id,lead_id,channel')
    .eq('organization_id', input.organizationId)
    .eq('id', input.requested.conversationId)
    .maybeSingle();
  if (conversationError) throw new Error(`Delivery conversation lookup failed: ${conversationError.message}`);
  if (!conversation) throw new Error('Delivery conversation not found');
  if (conversation.channel !== 'WHATSAPP') throw new Error('deliveryContext conversation must be WHATSAPP');
  if (!conversation.lead_id) throw new Error('WhatsApp delivery conversation must be linked to a lead');
  if (input.leadId && input.leadId !== conversation.lead_id) throw new Error('deliveryContext conversation does not match context.leadId');

  const { data: inbound, error: inboundError } = await input.supabase
    .from('outreach_messages')
    .select('received_at')
    .eq('organization_id', input.organizationId)
    .eq('lead_id', conversation.lead_id)
    .eq('channel', 'WHATSAPP')
    .eq('direction', 'INBOUND')
    .not('received_at', 'is', null)
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inboundError) throw new Error(`Latest WhatsApp inbound lookup failed: ${inboundError.message}`);

  return {
    ...input.requested,
    lastCustomerMessageAt: inbound?.received_at ? String(inbound.received_at) : undefined,
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

function maxVersion(values: Array<number | undefined>) {
  const usable = values.filter((value): value is number => Number.isFinite(value) && Number(value) > 0);
  return usable.length ? Math.max(...usable) : null;
}

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as { context?: AgentContext; idempotencyKey?: string; deliveryContext?: unknown };
  if (!body.context?.message || !body.context.organizationId) {
    return NextResponse.json({ error: 'context.message and context.organizationId are required' }, { status: 400 });
  }

  let requestKey: string;
  let requestedDeliveryContext: RequestedWhatsAppDeliveryContext | null;
  try {
    requestKey = normalizeIdempotencyKey(String(body.idempotencyKey ?? ''));
    requestedDeliveryContext = parseDeliveryContext(body.deliveryContext);
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
  let effectiveContext = trustedContext;

  let deliveryContext: WhatsAppShadowDeliveryContext | null;
  try {
    deliveryContext = await resolveTrustedDeliveryContext({
      supabase,
      organizationId,
      leadId: trustedContext.leadId,
      requested: requestedDeliveryContext,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'WhatsApp delivery evidence lookup failed' }, { status: 409 });
  }

  const reconcileApproval = async (result: unknown) => {
    if (!deliveryContext) return undefined;
    if (!isAgentShadowResult(result)) {
      return { queued: false, reconciliationRequired: true, error: 'Stored AI result cannot be reconciled to Shadow Approval' };
    }
    try {
      return await queueAgentWhatsAppShadowApproval({
        context: effectiveContext,
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

  let runtimeEvidence: HydratedRuntimeEvidence;
  try {
    const hydrated = await hydrateAgentContext({
      supabase,
      context: trustedContext,
      trustedConversationId: deliveryContext?.conversationId ?? requestedDeliveryContext?.conversationId,
    });
    effectiveContext = { ...hydrated.context, shadowMode: controls.shadow_mode };
    runtimeEvidence = hydrated.evidence;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Agent context hydration failed' }, { status: 409 });
  }

  const routePlan = buildSelectiveRoutePlan(effectiveContext);
  if (routePlan.tier !== 'ZERO_COST') {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    try {
      const [costState, quotaResult] = await Promise.all([
        getCostGuardState(organizationId),
        supabase.rpc('get_ai_run_quota_usage', {
          p_organization_id: organizationId,
          p_lead_id: effectiveContext.leadId ?? null,
          p_day_start: dayStart.toISOString(),
        }),
      ]);
      if (!costState) throw new Error('Cost Guard settings are unavailable');
      if (quotaResult.error) throw new Error(`AI quota usage unavailable: ${quotaResult.error.message}`);
      const quotaRow = quotaResult.data?.[0] as { lead_run_count?: number | string; daily_deep_run_count?: number | string } | undefined;
      const quota = evaluateAiRunQuota({
        reasoningTier: routePlan.tier,
        leadRunCount: effectiveContext.leadId ? Number(quotaRow?.lead_run_count ?? 0) : null,
        dailyDeepRunCount: Number(quotaRow?.daily_deep_run_count ?? 0),
        settings: costState.settings,
      });
      if (!quota.allowed) {
        return NextResponse.json({
          error: `Paid AI run blocked by configured quota (${quota.reason})`,
          quota,
          reasoningTier: routePlan.tier,
          automaticRetry: false,
        }, { status: 429 });
      }
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'AI quota preflight unavailable; paid operation blocked',
      }, { status: 503 });
    }
  }

  const promptVersion = maxVersion(Object.values(runtimeEvidence.promptVersions));
  const knowledgeVersion = maxVersion(Object.values(runtimeEvidence.knowledgeVersions));

  const { data: claimed, error: claimError } = await supabase.from('agent_runs').insert({
    organization_id: organizationId,
    lead_id: effectiveContext.leadId ?? null,
    conversation_id: effectiveContext.conversationId ?? null,
    input_message: effectiveContext.message,
    routed_agents: [],
    status: 'PROCESSING',
    trace: {
      reasoningTier: routePlan.tier,
      routeReasons: routePlan.reasons,
      estimatedLlmCalls: routePlan.estimatedLlmCalls,
      quotaPreflight: routePlan.tier !== 'ZERO_COST',
    },
    prompt_version: promptVersion,
    knowledge_version: knowledgeVersion,
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
    const result = await processInboundMessage(effectiveContext, { agentsPaused: controls.agents_paused }, runtime);
    const payload = {
      ...result,
      runtime: runtimeName,
      runtimeContext: runtimeEvidence,
    };
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

    // Telegram is an owner-side operational notification only. A Telegram failure must never
    // fail the already-completed Agent run, trigger an AI retry, or change customer delivery.
    try {
      const alert = buildSalesTelegramAlert({ context: effectiveContext, trace: result.trace, runId: claimed.id });
      if (alert) await notifyTelegramOwner({ ...alert, supabase });
    } catch {
      // Notification journal is fail-closed/no-auto-retry; the sales run remains authoritative.
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
      trace: { error: message, automatic_retry: false, runtimeContext: runtimeEvidence },
      completed_at: new Date().toISOString(),
    }).eq('organization_id', organizationId).eq('id', claimed.id).eq('status', 'PROCESSING');
    return NextResponse.json({ error: message, runId: claimed.id, automaticRetry: false }, { status: 502 });
  }
}
