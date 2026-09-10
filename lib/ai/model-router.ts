import type { BudgetMode, CostGuardSettings } from '@/lib/reliability/cost-guard';

export type AiTaskClass = 'CLASSIFY' | 'TRANSLATE' | 'SUMMARIZE' | 'TRANSCRIBE' | 'REPLY' | 'NEGOTIATE' | 'PROPOSAL' | 'CLOSING' | 'OWNER_ASSISTANT' | 'OWNER_ANALYSIS';

export type ModelRoute = {
  tier: 'LOW_COST' | 'HIGH_REASONING';
  modelOverride?: string;
  maxContextMessages: number;
  allowDeepReasoning: boolean;
};

const highReasoningTasks = new Set<AiTaskClass>(['NEGOTIATE', 'PROPOSAL', 'CLOSING', 'OWNER_ANALYSIS']);

export function routeAiTask(task: AiTaskClass, budgetMode: BudgetMode, settings: Pick<CostGuardSettings,'model_routing_enabled'|'low_cost_model'|'high_reasoning_model'>): ModelRoute {
  const expensiveTask = highReasoningTasks.has(task);
  const forceLowCost = budgetMode === 'THROTTLED' || budgetMode === 'CRITICAL';
  const useHighReasoning = settings.model_routing_enabled && expensiveTask && !forceLowCost;

  if (useHighReasoning) {
    return {
      tier: 'HIGH_REASONING',
      modelOverride: settings.high_reasoning_model || undefined,
      maxContextMessages: 10,
      allowDeepReasoning: true,
    };
  }

  return {
    tier: 'LOW_COST',
    modelOverride: settings.low_cost_model || undefined,
    maxContextMessages: budgetMode === 'CRITICAL' ? 4 : 8,
    allowDeepReasoning: false,
  };
}

export function shouldReuseCachedAudit(retrievedAt: Date | string | null | undefined, cacheDays: number, now = new Date()): boolean {
  if (!retrievedAt || cacheDays <= 0) return false;
  const fetched = typeof retrievedAt === 'string' ? new Date(retrievedAt) : retrievedAt;
  if (Number.isNaN(fetched.getTime())) return false;
  return now.getTime() - fetched.getTime() < cacheDays * 86_400_000;
}
