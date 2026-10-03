export type FounderEvidenceQuality = 'VERIFIED' | 'STALE' | 'MISSING';
export type FounderAttentionLevel = 'BLOCKED' | 'WATCH' | 'INFO';

export type FounderEvidenceSource = {
  authority: string;
  quality: FounderEvidenceQuality;
  count?: number;
  observedAt?: string;
  detail?: string;
};

export type FounderAttentionItem = {
  key: string;
  level: FounderAttentionLevel;
  title: string;
  detail: string;
  evidence: string[];
};

export type FounderStatusSnapshotV1 = {
  schemaVersion: 1;
  mode: 'READ_ONLY';
  generatedAt: string;
  operatingMode: 'KILL_SWITCH' | 'AGENTS_PAUSED' | 'SHADOW' | 'LIVE';
  product: {
    enabledIntegrations: number;
    unhealthyEnabledIntegrations: number;
    aiRegisteredActions: number;
    activeKnowledgeVersions: number;
    activeMemoryItems: number;
    pendingMemoryItems: number;
    agentRuns30d: number;
    failedAgentRuns30d: number;
  };
  sales: {
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
  };
  finance: {
    monthSpendUsd: number;
    monthlyBudgetUsd: number | null;
    budgetUtilizationPct: number | null;
  };
  attention: FounderAttentionItem[];
  evidence: FounderEvidenceSource[];
};
