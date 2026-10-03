import type {
  FounderAttentionItem,
  FounderEvidenceSource,
  FounderStatusSnapshotV1,
} from './contracts';

type FounderStatusInput = {
  nowIso: string;
  controls: {
    globalKillSwitch?: boolean | null;
    agentsPaused?: boolean | null;
    shadowMode?: boolean | null;
    updatedAt?: string | null;
  } | null;
  costGuard: {
    monthlyBudgetUsd?: number | null;
    updatedAt?: string | null;
  } | null;
  counts: {
    leads: number;
    qualifiedLeads: number;
    wonLeads: number;
    conversations: number;
    tasks: number;
    activeBookings: number;
    quotes: number;
    orders: number;
    invoices: number;
    paymentTransactions: number;
    activeKnowledgeVersions: number;
    activeMemoryItems: number;
    pendingMemoryItems: number;
    agentRuns30d: number;
    failedAgentRuns30d: number;
  };
  monthSpendUsd: number;
  integrations: Array<{
    enabled: boolean;
    status: string;
    lastCheckedAt?: string | null;
  }>;
  toolActions: Array<{
    availability: string;
    metadata: unknown;
  }>;
};

const NEGATIVE_INTEGRATION_STATES = new Set([
  'ERROR',
  'FAILED',
  'BLOCKED',
  'DISCONNECTED',
  'REVOKED',
  'EXPIRED',
]);

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function latestIso(values: Array<string | null | undefined>) {
  const timestamps = values
    .map((value) => value ? Date.parse(value) : Number.NaN)
    .filter(Number.isFinite);
  if (!timestamps.length) return undefined;
  return new Date(Math.max(...timestamps)).toISOString();
}

function executionSurfaces(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const value = (metadata as Record<string, unknown>).executionSurfaces;
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toUpperCase());
}

function evidence(input: FounderStatusInput): FounderEvidenceSource[] {
  const queriedAt = input.nowIso;
  const latestIntegrationCheck = latestIso(input.integrations.map((item) => item.lastCheckedAt));
  return [
    {
      authority: 'SYSTEM_CONTROLS',
      quality: input.controls ? 'VERIFIED' : 'MISSING',
      observedAt: input.controls?.updatedAt ?? queriedAt,
      detail: 'Canonical runtime safety controls.',
    },
    {
      authority: 'COST_GUARD',
      quality: input.costGuard ? 'VERIFIED' : 'MISSING',
      observedAt: input.costGuard?.updatedAt ?? queriedAt,
      detail: 'Canonical monthly provider/AI budget guard.',
    },
    {
      authority: 'INTEGRATION_CONNECTIONS',
      quality: 'VERIFIED',
      count: input.integrations.length,
      observedAt: latestIntegrationCheck ?? queriedAt,
      detail: 'Current enabled/status evidence from canonical integration connections.',
    },
    {
      authority: 'TOOL_ACTION_REGISTRY',
      quality: 'VERIFIED',
      count: input.toolActions.length,
      observedAt: queriedAt,
      detail: 'Capability metadata only. It does not grant execution authority.',
    },
    {
      authority: 'CRM_PIPELINE',
      quality: 'VERIFIED',
      count: input.counts.leads,
      observedAt: queriedAt,
      detail: 'Current Lead/Conversation/Task aggregate evidence.',
    },
    {
      authority: 'COMMERCE',
      quality: 'VERIFIED',
      count: input.counts.quotes + input.counts.orders + input.counts.invoices + input.counts.paymentTransactions,
      observedAt: queriedAt,
      detail: 'Current Booking/Quote/Order/Invoice/Payment aggregate evidence.',
    },
    {
      authority: 'AI_KNOWLEDGE_MEMORY',
      quality: 'VERIFIED',
      count: input.counts.activeKnowledgeVersions + input.counts.activeMemoryItems,
      observedAt: queriedAt,
      detail: 'Current approved Knowledge and active derived Memory aggregate evidence.',
    },
  ];
}

function attention(input: FounderStatusInput, unhealthyEnabledIntegrations: number): FounderAttentionItem[] {
  const items: FounderAttentionItem[] = [];
  if (!input.controls) {
    items.push({
      key: 'runtime-controls-missing',
      level: 'BLOCKED',
      title: 'Runtime control evidence is missing',
      detail: 'Founder Status cannot infer autonomous runtime state without canonical system_controls evidence. The status therefore fails closed.',
      evidence: ['SYSTEM_CONTROLS'],
    });
  } else if (input.controls.globalKillSwitch) {
    items.push({
      key: 'kill-switch',
      level: 'BLOCKED',
      title: 'Global Kill Switch is active',
      detail: 'Autonomous execution must remain blocked until the canonical runtime control is deliberately changed.',
      evidence: ['SYSTEM_CONTROLS'],
    });
  } else if (input.controls?.agentsPaused) {
    items.push({
      key: 'agents-paused',
      level: 'BLOCKED',
      title: 'AI agents are paused',
      detail: 'Founder Status remains read-only; no autonomous action should be inferred from this snapshot.',
      evidence: ['SYSTEM_CONTROLS'],
    });
  }

  if (unhealthyEnabledIntegrations > 0) {
    items.push({
      key: 'integration-health',
      level: 'WATCH',
      title: 'Enabled integrations need attention',
      detail: `${unhealthyEnabledIntegrations} enabled integration connection(s) report an unhealthy terminal state.`,
      evidence: ['INTEGRATION_CONNECTIONS'],
    });
  }

  if (input.counts.agentRuns30d > 0) {
    const failureRate = input.counts.failedAgentRuns30d / input.counts.agentRuns30d;
    if (failureRate >= 0.1) {
      items.push({
        key: 'agent-failure-rate',
        level: 'WATCH',
        title: 'Agent failure rate is elevated',
        detail: `${Math.round(failureRate * 100)}% of recorded Agent runs in the last 30 days are FAILED.`,
        evidence: ['AI_KNOWLEDGE_MEMORY'],
      });
    }
  }

  if (input.counts.qualifiedLeads > 0 && input.counts.wonLeads === 0) {
    items.push({
      key: 'qualified-no-wins',
      level: 'WATCH',
      title: 'Qualified pipeline has no observed wins yet',
      detail: 'Founder Status reports the evidence gap only; it does not claim acquisition or conversion causality.',
      evidence: ['CRM_PIPELINE'],
    });
  }

  if (input.counts.pendingMemoryItems > 0) {
    items.push({
      key: 'memory-review',
      level: 'INFO',
      title: 'Derived Memory is waiting for review',
      detail: `${input.counts.pendingMemoryItems} Memory item(s) remain PENDING_REVIEW and are not treated as approved Founder evidence.`,
      evidence: ['AI_KNOWLEDGE_MEMORY'],
    });
  }

  if (input.controls?.shadowMode) {
    items.push({
      key: 'shadow-mode',
      level: 'INFO',
      title: 'Shadow Mode remains active',
      detail: 'This is compatible with Founder OS V1: the slice is read-only and does not relax existing execution gates.',
      evidence: ['SYSTEM_CONTROLS'],
    });
  }

  if (!items.length) {
    items.push({
      key: 'no-forced-action',
      level: 'INFO',
      title: 'No forced action generated',
      detail: 'The snapshot is evidence-only. Later Founder intelligence may propose actions, but execution will still require canonical authorization and approval.',
      evidence: ['SYSTEM_CONTROLS', 'CRM_PIPELINE'],
    });
  }
  return items;
}

export function buildFounderStatusV1(input: FounderStatusInput): FounderStatusSnapshotV1 {
  const enabledIntegrations = input.integrations.filter((item) => item.enabled).length;
  const unhealthyEnabledIntegrations = input.integrations.filter((item) =>
    item.enabled && NEGATIVE_INTEGRATION_STATES.has(item.status.trim().toUpperCase())
  ).length;
  const aiRegisteredActions = input.toolActions.filter((item) =>
    item.availability.trim().toUpperCase() === 'AVAILABLE' &&
    executionSurfaces(item.metadata).includes('AI')
  ).length;

  const monthlyBudgetUsd = input.costGuard?.monthlyBudgetUsd;
  const normalizedBudget = monthlyBudgetUsd == null || !Number.isFinite(Number(monthlyBudgetUsd))
    ? null
    : Math.max(0, Number(monthlyBudgetUsd));
  const monthSpendUsd = Math.max(0, finite(input.monthSpendUsd));
  const budgetUtilizationPct = normalizedBudget && normalizedBudget > 0
    ? Number(((monthSpendUsd / normalizedBudget) * 100).toFixed(2))
    : null;

  const operatingMode = !input.controls
    ? 'UNKNOWN'
    : input.controls.globalKillSwitch
      ? 'KILL_SWITCH'
      : input.controls.agentsPaused
        ? 'AGENTS_PAUSED'
        : input.controls.shadowMode
          ? 'SHADOW'
          : 'LIVE';

  return {
    schemaVersion: 1,
    mode: 'READ_ONLY',
    generatedAt: input.nowIso,
    operatingMode,
    product: {
      enabledIntegrations,
      unhealthyEnabledIntegrations,
      aiRegisteredActions,
      activeKnowledgeVersions: input.counts.activeKnowledgeVersions,
      activeMemoryItems: input.counts.activeMemoryItems,
      pendingMemoryItems: input.counts.pendingMemoryItems,
      agentRuns30d: input.counts.agentRuns30d,
      failedAgentRuns30d: input.counts.failedAgentRuns30d,
    },
    sales: {
      leads: input.counts.leads,
      qualifiedLeads: input.counts.qualifiedLeads,
      wonLeads: input.counts.wonLeads,
      conversations: input.counts.conversations,
      tasks: input.counts.tasks,
      activeBookings: input.counts.activeBookings,
      quotes: input.counts.quotes,
      orders: input.counts.orders,
      invoices: input.counts.invoices,
      paymentTransactions: input.counts.paymentTransactions,
    },
    finance: {
      monthSpendUsd,
      monthlyBudgetUsd: normalizedBudget,
      budgetUtilizationPct,
    },
    attention: attention(input, unhealthyEnabledIntegrations),
    evidence: evidence(input),
  };
}
