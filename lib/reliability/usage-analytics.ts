export type UsageAnalyticsRow = {
  provider?: string | null;
  operation?: string | null;
  cost_usd?: number | string | null;
  lead_id?: string | null;
  units?: number | string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export type LeadOutcomeRow = { id: string; status: string };

export type UsageAnalyticsSettings = {
  monthly_total_budget_usd: number | string;
  warning_pct: number | string;
  hard_stop_pct: number | string;
};

function add(target: Record<string, number>, key: string, value: number) {
  target[key] = (target[key] ?? 0) + value;
}

function pricingClass(row: UsageAnalyticsRow): 'RECONCILED' | 'CONSERVATIVE' | 'PENDING' | 'UNCLASSIFIED' {
  const status = String(row.metadata?.pricing_status ?? '').trim().toUpperCase();
  if (status.startsWith('PENDING_') || status === 'PENDING_RECONCILIATION') return 'PENDING';
  if (status.startsWith('CONSERVATIVE_')) return 'CONSERVATIVE';
  if (status.startsWith('FINAL_') || status.startsWith('TOKEN_METERED_') || status.startsWith('RECONCILED_')) return 'RECONCILED';
  return 'UNCLASSIFIED';
}

export function buildUsageAnalytics(
  rows: UsageAnalyticsRow[],
  leads: LeadOutcomeRow[],
  settings: UsageAnalyticsSettings,
  now = new Date(),
) {
  const providerSpend: Record<string, number> = {};
  const operationSpend: Record<string, number> = {};
  const daySpend: Record<string, number> = {};
  const leadSpend: Record<string, number> = {};
  const campaignSpend: Record<string, number> = {};
  const pendingByProvider: Record<string, number> = {};
  let totalSpend = 0;
  let reconciledEvents = 0;
  let conservativeEvents = 0;
  let conservativeSpend = 0;
  let pendingEvents = 0;
  let pendingUnits = 0;
  let unclassifiedEvents = 0;

  for (const row of rows) {
    const cost = Math.max(0, Number(row.cost_usd ?? 0));
    const provider = String(row.provider ?? 'OTHER').toUpperCase();
    totalSpend += cost;
    add(providerSpend, provider, cost);
    add(operationSpend, String(row.operation ?? 'UNKNOWN'), cost);
    add(daySpend, row.created_at.slice(0, 10), cost);
    if (row.lead_id) add(leadSpend, row.lead_id, cost);
    const campaignId = String(row.metadata?.campaign_id ?? '').trim();
    if (campaignId) add(campaignSpend, campaignId, cost);

    const quality = pricingClass(row);
    if (quality === 'RECONCILED') reconciledEvents += 1;
    else if (quality === 'CONSERVATIVE') {
      conservativeEvents += 1;
      conservativeSpend += cost;
    } else if (quality === 'PENDING') {
      pendingEvents += 1;
      pendingUnits += Math.max(1, Number(row.units ?? 1) || 1);
      add(pendingByProvider, provider, 1);
    } else {
      unclassifiedEvents += 1;
    }
  }

  const qualifiedStatuses = new Set(['QUALIFIED','READY_TO_CONTACT','CONTACTED','REPLIED','INTERESTED','HOT','HUMAN','WON']);
  const contactedStatuses = new Set(['CONTACTED','REPLIED','INTERESTED','HOT','HUMAN','WON']);
  const repliedStatuses = new Set(['REPLIED','INTERESTED','HOT','HUMAN','WON']);
  const wonStatuses = new Set(['WON']);
  const counts = {
    qualified: leads.filter((lead) => qualifiedStatuses.has(lead.status)).length,
    contacted: leads.filter((lead) => contactedStatuses.has(lead.status)).length,
    replied: leads.filter((lead) => repliedStatuses.has(lead.status)).length,
    won: leads.filter((lead) => wonStatuses.has(lead.status)).length,
  };
  const costPer = {
    qualified: counts.qualified ? totalSpend / counts.qualified : null,
    contacted: counts.contacted ? totalSpend / counts.contacted : null,
    replied: counts.replied ? totalSpend / counts.replied : null,
    won: counts.won ? totalSpend / counts.won : null,
  };

  const monthBudget = Math.max(0, Number(settings.monthly_total_budget_usd ?? 0));
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const dailyBudgetPace = daysInMonth ? monthBudget / daysInMonth : monthBudget;
  const todayKey = now.toISOString().slice(0, 10);
  const todaySpend = daySpend[todayKey] ?? 0;
  const warningPct = Math.max(1, Number(settings.warning_pct ?? 70));
  const hardStopPct = Math.max(warningPct, Number(settings.hard_stop_pct ?? 100));
  const configuredSpikeMultiplier = hardStopPct / warningPct;
  const priorDayValues = Object.entries(daySpend).filter(([day]) => day !== todayKey).map(([, value]) => value);
  const trailingAverage = priorDayValues.length ? priorDayValues.reduce((sum, value) => sum + value, 0) / priorDayValues.length : 0;
  const baseline = Math.max(dailyBudgetPace, trailingAverage);
  const spendSpike = baseline > 0 && todaySpend > baseline * configuredSpikeMultiplier;
  const noOutcomeSpend = totalSpend > 0 && counts.qualified === 0;

  return {
    totalSpend,
    providerSpend,
    operationSpend,
    daySpend,
    leadSpend,
    campaignSpend,
    counts,
    costPer,
    costQuality: {
      reconciledEvents,
      conservativeEvents,
      conservativeSpend,
      pendingEvents,
      pendingUnits,
      pendingByProvider,
      unclassifiedEvents,
    },
    anomalies: {
      spendSpike,
      noOutcomeSpend,
      todaySpend,
      dailyBudgetPace,
      trailingAverage,
      configuredSpikeMultiplier,
    },
  };
}
