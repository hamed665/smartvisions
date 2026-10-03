import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { buildFounderStatusV1 } from './status';
import type { FounderStatusSnapshotV1 } from './contracts';

const FLAG_KEY = 'FOUNDER_OS_V1';

function count(result: { count: number | null; error: { message: string } | null }, label: string) {
  if (result.error) throw new Error(`Founder Status ${label} count failed: ${result.error.message}`);
  return result.count ?? 0;
}

export async function founderOsV1Enabled(input: {
  supabase: SupabaseClient;
  organizationId: string;
}) {
  const { data, error } = await input.supabase
    .from('feature_flag_overrides')
    .select('enabled,updated_at')
    .eq('organization_id', input.organizationId)
    .eq('scope_type', 'ORGANIZATION')
    .eq('flag_key', FLAG_KEY)
    .is('brand_id', null)
    .is('tenant_business_id', null)
    .is('branch_id', null)
    .is('department_id', null)
    .is('team_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Founder OS feature flag read failed: ${error.message}`);
  return {
    enabled: data?.enabled === true,
    updatedAt: data?.updated_at ? String(data.updated_at) : null,
  };
}

export async function loadFounderStatusV1(input: {
  supabase: SupabaseClient;
  organizationId: string;
  now?: Date;
}): Promise<FounderStatusSnapshotV1> {
  const now = input.now ?? new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const org = input.organizationId;
  const db = input.supabase;

  const [
    controlsResult,
    costGuardResult,
    leadsResult,
    qualifiedLeadsResult,
    wonLeadsResult,
    conversationsResult,
    tasksResult,
    bookingsResult,
    quotesResult,
    ordersResult,
    invoicesResult,
    paymentTransactionsResult,
    knowledgeResult,
    memoryActiveResult,
    memoryPendingResult,
    agentRunsResult,
    failedAgentRunsResult,
    integrationsResult,
    toolsResult,
    usageResult,
  ] = await Promise.all([
    db.from('system_controls')
      .select('global_kill_switch,agents_paused,shadow_mode,updated_at')
      .eq('organization_id', org).maybeSingle(),
    db.from('cost_guard_settings')
      .select('monthly_total_budget_usd,updated_at')
      .eq('organization_id', org).maybeSingle(),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', org)
      .in('status', ['QUALIFIED', 'READY_TO_CONTACT']),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('status', 'WON'),
    db.from('sales_conversations').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db.from('crm_tasks').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db.from('bookings').select('id', { count: 'exact', head: true }).eq('organization_id', org)
      .in('status', ['REQUESTED', 'HELD', 'CONFIRMED', 'RESCHEDULED']),
    db.from('quotes').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db.from('orders').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db.from('invoices').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db.from('payment_transactions').select('id', { count: 'exact', head: true }).eq('organization_id', org),
    db.from('knowledge_versions').select('id', { count: 'exact', head: true }).eq('organization_id', org)
      .eq('active', true).eq('retrieval_enabled', true),
    db.from('memory_items').select('id', { count: 'exact', head: true }).eq('organization_id', org)
      .eq('state', 'ACTIVE').eq('retrieval_enabled', true),
    db.from('memory_items').select('id', { count: 'exact', head: true }).eq('organization_id', org)
      .eq('state', 'PENDING_REVIEW'),
    db.from('agent_runs').select('id', { count: 'exact', head: true }).eq('organization_id', org)
      .gte('started_at', thirtyDaysAgo.toISOString()),
    db.from('agent_runs').select('id', { count: 'exact', head: true }).eq('organization_id', org)
      .eq('status', 'FAILED').gte('started_at', thirtyDaysAgo.toISOString()),
    db.from('integration_connections').select('enabled,status,last_checked_at').eq('organization_id', org),
    db.from('tool_action_registry').select('availability,metadata'),
    db.from('usage_events').select('cost_usd').eq('organization_id', org)
      .gte('created_at', monthStart.toISOString()),
  ]);

  const firstError = [
    controlsResult.error,
    costGuardResult.error,
    integrationsResult.error,
    toolsResult.error,
    usageResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(`Founder Status read failed: ${firstError.message}`);

  const monthSpendUsd = (usageResult.data ?? [])
    .reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);

  return buildFounderStatusV1({
    nowIso: now.toISOString(),
    controls: controlsResult.data ? {
      globalKillSwitch: controlsResult.data.global_kill_switch,
      agentsPaused: controlsResult.data.agents_paused,
      shadowMode: controlsResult.data.shadow_mode,
      updatedAt: controlsResult.data.updated_at,
    } : null,
    costGuard: costGuardResult.data ? {
      monthlyBudgetUsd: Number(costGuardResult.data.monthly_total_budget_usd ?? 0),
      updatedAt: costGuardResult.data.updated_at,
    } : null,
    counts: {
      leads: count(leadsResult, 'Lead'),
      qualifiedLeads: count(qualifiedLeadsResult, 'qualified Lead'),
      wonLeads: count(wonLeadsResult, 'won Lead'),
      conversations: count(conversationsResult, 'Conversation'),
      tasks: count(tasksResult, 'Task'),
      activeBookings: count(bookingsResult, 'active Booking'),
      quotes: count(quotesResult, 'Quote'),
      orders: count(ordersResult, 'Order'),
      invoices: count(invoicesResult, 'Invoice'),
      paymentTransactions: count(paymentTransactionsResult, 'Payment transaction'),
      activeKnowledgeVersions: count(knowledgeResult, 'active Knowledge'),
      activeMemoryItems: count(memoryActiveResult, 'active Memory'),
      pendingMemoryItems: count(memoryPendingResult, 'pending Memory'),
      agentRuns30d: count(agentRunsResult, 'Agent run'),
      failedAgentRuns30d: count(failedAgentRunsResult, 'failed Agent run'),
    },
    monthSpendUsd,
    integrations: (integrationsResult.data ?? []).map((row) => ({
      enabled: row.enabled === true,
      status: String(row.status ?? ''),
      lastCheckedAt: row.last_checked_at ? String(row.last_checked_at) : null,
    })),
    toolActions: (toolsResult.data ?? []).map((row) => ({
      availability: String(row.availability ?? ''),
      metadata: row.metadata,
    })),
  });
}
