import 'server-only';

import type { AiTaskClass } from '@/lib/ai/model-router';
import { routeAiTask } from '@/lib/ai/model-router';
import { estimateOpenAiCostUsd, estimateOpenAiReservationUsd } from '@/lib/ai/openai-pricing';
import {
  assertPaidOperationAllowed,
  finalizeCostGuardUsage,
  getCostGuardState,
  reserveCostGuardUsage,
} from '@/lib/reliability/cost-guard';
import { assertRuntimeOperationAllowed } from '@/lib/reliability/runtime-safety';

type JsonSchema = Record<string, unknown>;

function extractOutputText(response: unknown) {
  const body = response as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  return (body.output ?? []).flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text).join('');
}

function extractUsage(response: unknown) {
  const body = response as {
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  };
  return {
    inputTokens: Math.max(0, Number(body.usage?.input_tokens ?? 0)),
    outputTokens: Math.max(0, Number(body.usage?.output_tokens ?? 0)),
    cachedInputTokens: Math.max(0, Number(body.usage?.input_tokens_details?.cached_tokens ?? 0)),
  };
}

export async function runOwnerJsonModel<T>(input: {
  organizationId: string;
  task: Extract<AiTaskClass, 'OWNER_ASSISTANT' | 'OWNER_ANALYSIS'>;
  operation: string;
  instructions: string;
  payload: unknown;
  schemaName: string;
  schema: JsonSchema;
  maxOutputTokens?: number;
}): Promise<{ data: T; model: string; tier: 'LOW_COST' | 'HIGH_REASONING' }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI is not configured for owner intelligence');

  await assertRuntimeOperationAllowed(input.organizationId, 'AI');
  const costState = await getCostGuardState(input.organizationId);
  if (!costState) throw new Error('Cost Guard state unavailable; owner intelligence blocked');

  const priority = input.task === 'OWNER_ANALYSIS' ? 'HIGH' : 'NORMAL';
  assertPaidOperationAllowed(costState, priority);
  if ((costState.providerSpendUsd.OPENAI ?? 0) >= Number(costState.settings.openai_budget_usd)) {
    throw new Error('OpenAI provider budget reached');
  }

  const route = routeAiTask(input.task, costState.mode, costState.settings);
  const model = route.modelOverride || (route.tier === 'HIGH_REASONING' ? 'gpt-5.6-terra' : 'gpt-5.6-luna');
  const maxOutputTokens = Math.max(200, Math.min(input.maxOutputTokens ?? (route.allowDeepReasoning ? 900 : 600), 1_200));
  const supportsReasoningControls = /^gpt-(?:5|6)(?:\.|-|$)/i.test(model);

  const requestBody = JSON.stringify({
    model,
    store: false,
    ...(supportsReasoningControls ? { reasoning: { effort: route.allowDeepReasoning ? 'medium' : 'none' } } : {}),
    max_output_tokens: maxOutputTokens,
    instructions: input.instructions,
    input: JSON.stringify(input.payload),
    text: {
      format: {
        type: 'json_schema',
        name: input.schemaName,
        strict: true,
        schema: input.schema,
      },
    },
  });

  const reserved = estimateOpenAiReservationUsd(
    model,
    new TextEncoder().encode(requestBody).byteLength,
    maxOutputTokens,
  );
  const reservation = await reserveCostGuardUsage({
    organizationId: input.organizationId,
    provider: 'OPENAI',
    operation: input.operation,
    reservedUsd: reserved,
    metadata: {
      task: input.task,
      model,
      tier: route.tier,
      ownerIntelligenceGateway: true,
      automaticRetry: false,
    },
  });

  // A network failure is ambiguous once request bytes may have left the Worker.
  // Keep the reservation for reconciliation instead of retrying a paid request.
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: requestBody,
  });

  if (!response.ok) {
    const detail = await response.text();
    if ([400, 401, 403, 404, 422, 429].includes(response.status)) {
      await finalizeCostGuardUsage({
        organizationId: input.organizationId,
        reservationKey: reservation.key,
        state: 'RELEASED',
        metadata: { releaseReason: `OPENAI_HTTP_${response.status}` },
      }).catch(() => undefined);
    }
    throw new Error(`Owner intelligence OpenAI request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const raw = await response.json();
  const usage = extractUsage(raw);
  await finalizeCostGuardUsage({
    organizationId: input.organizationId,
    reservationKey: reservation.key,
    state: 'SETTLED',
    actualCostUsd: estimateOpenAiCostUsd(model, usage),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    metadata: {
      task: input.task,
      model,
      tier: route.tier,
      cachedInputTokens: usage.cachedInputTokens,
      ownerIntelligenceGateway: true,
    },
  });

  const output = extractOutputText(raw);
  if (!output) throw new Error('Owner intelligence response did not contain output_text');

  return {
    data: JSON.parse(output) as T,
    model,
    tier: route.tier,
  };
}
