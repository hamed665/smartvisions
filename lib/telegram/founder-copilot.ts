import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { analyzeFounderQuestion } from '@/lib/founder/intelligence';
import type { FounderConversationTurn, FounderIntelligenceResult } from '@/lib/founder/intelligence-core';
import { founderOsV1Enabled, loadFounderStatusV1 } from '@/lib/founder/server';
import { loadFounderFinanceV1 } from '@/lib/founder/finance-server';
import { loadFounderInvestorWorkspaceV1 } from '@/lib/founder/investor-server';
import { loadFounderCapitalWorkspaceV1 } from '@/lib/founder/capital-server';
import { loadFounderStrategyWorkspaceV1 } from '@/lib/founder/strategy-server';
import { formatTelegramFounderResult } from './founder-copilot-core';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function historicalQuestion(value: unknown) {
  return String(value ?? '')
    .replace(/^\/(?:founder|investor)(?:@[A-Za-z0-9_]+)?\s*/i, '')
    .trim()
    .slice(0, 1_200);
}

function historicalAnswer(value: unknown) {
  const row = record(value);
  return String(row.answer ?? '')
    .trim()
    .slice(0, 1_200);
}

export async function runTelegramFounderQuestion(input: {
  supabase: SupabaseClient;
  organizationId: string;
  currentRunId: string;
  question: string;
  signal?: AbortSignal;
}): Promise<{ result: FounderIntelligenceResult; text: string }> {
  const flag = await founderOsV1Enabled({
    supabase: input.supabase,
    organizationId: input.organizationId,
  });
  if (!flag.enabled) throw new Error('Founder OS is not enabled');

  const [status, finance, investor, capital, strategy, historyResult] = await Promise.all([
    loadFounderStatusV1({
      supabase: input.supabase,
      organizationId: input.organizationId,
    }),
    loadFounderFinanceV1({
      supabase: input.supabase,
      organizationId: input.organizationId,
    }),
    loadFounderInvestorWorkspaceV1({ supabase: input.supabase, organizationId: input.organizationId }),
    loadFounderCapitalWorkspaceV1({ supabase: input.supabase, organizationId: input.organizationId }),
    loadFounderStrategyWorkspaceV1({ supabase: input.supabase, organizationId: input.organizationId }),
    input.supabase
      .from('telegram_command_runs')
      .select('raw_text,result,created_at')
      .eq('organization_id', input.organizationId)
      .eq('command_type', 'FOUNDER_ASK')
      .eq('status', 'COMPLETED')
      .neq('id', input.currentRunId)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);
  if (historyResult.error) {
    throw new Error(`Founder Telegram history read failed: ${historyResult.error.message}`);
  }

  const history: FounderConversationTurn[] = [];
  for (const row of [...(historyResult.data ?? [])].reverse()) {
    const question = historicalQuestion(row.raw_text);
    const answer = historicalAnswer(row.result);
    if (question) history.push({ role: 'user', text: question });
    if (answer) history.push({ role: 'assistant', text: answer });
  }

  const result = await analyzeFounderQuestion({
    organizationId: input.organizationId,
    question: input.question,
    status,
    finance,
    investor,
    capital,
    strategy,
    history: history.slice(-6),
    signal: input.signal,
  });

  return {
    result,
    text: formatTelegramFounderResult(result),
  };
}
