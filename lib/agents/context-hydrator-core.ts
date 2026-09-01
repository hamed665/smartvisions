import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ActivePromptSnapshot,
  AgentContext,
  AgentName,
  AgentSettingSnapshot,
  ConversationMemoryItem,
  KnowledgeSnapshot,
  ServiceKnowledgeSnapshot,
} from './contracts';

const AGENT_NAMES: AgentName[] = [
  'intent_discovery',
  'conversation_psychology',
  'business_analyst',
  'culture_locale',
  'sales_marketing',
  'evidence_checker',
  'preview_director',
  'decision_orchestrator',
  'secretary',
  'relevance_checker',
];

const clip = (value: unknown, max = 1400) => String(value ?? '').trim().slice(0, max);
const numberOrZero = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

function safeRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stageValue(value: unknown): AgentContext['stage'] | undefined {
  const stage = String(value ?? '').toUpperCase();
  return ['NEW','CONTACTED','REPLIED','INTERESTED','HOT','HUMAN','WON','LOST'].includes(stage)
    ? stage as AgentContext['stage']
    : undefined;
}

function modeValue(value: unknown): AgentContext['agentMode'] | undefined {
  const mode = String(value ?? '').toUpperCase();
  return ['AUTO','PAUSED','HUMAN'].includes(mode) ? mode as AgentContext['agentMode'] : undefined;
}

export type HydratedRuntimeEvidence = {
  conversationId?: string;
  historyCount: number;
  promptVersions: Partial<Record<AgentName, number>>;
  knowledgeVersions: Record<string, number>;
  serviceKnowledgeCount: number;
};

export async function hydrateAgentContext(input: {
  supabase: SupabaseClient;
  context: AgentContext;
  trustedConversationId?: string;
}): Promise<{ context: AgentContext; evidence: HydratedRuntimeEvidence }> {
  const { supabase } = input;
  const base = input.context;
  const organizationId = base.organizationId;
  if (!organizationId) throw new Error('organizationId is required to hydrate agent context');

  let conversation: Record<string, unknown> | null = null;
  if (input.trustedConversationId) {
    const result = await supabase
      .from('sales_conversations')
      .select('id,lead_id,summary,persian_summary,stage,agent_mode,detected_language,detected_dialect,last_message_at')
      .eq('organization_id', organizationId)
      .eq('id', input.trustedConversationId)
      .maybeSingle();
    if (result.error) throw new Error(`Conversation memory lookup failed: ${result.error.message}`);
    conversation = result.data as Record<string, unknown> | null;
  } else if (base.leadId) {
    const result = await supabase
      .from('sales_conversations')
      .select('id,lead_id,summary,persian_summary,stage,agent_mode,detected_language,detected_dialect,last_message_at')
      .eq('organization_id', organizationId)
      .eq('lead_id', base.leadId)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw new Error(`Conversation memory lookup failed: ${result.error.message}`);
    conversation = result.data as Record<string, unknown> | null;
  }

  const authoritativeLeadId = clip(conversation?.lead_id, 80) || base.leadId;
  if (base.leadId && authoritativeLeadId && base.leadId !== authoritativeLeadId) {
    throw new Error('Conversation memory lead does not match requested lead');
  }

  const [messagesResult, knowledgeResult, promptsResult, settingsResult, servicesResult, pricesResult] = await Promise.all([
    authoritativeLeadId
      ? supabase
        .from('outreach_messages')
        .select('direction,channel,body,received_at,sent_at,created_at')
        .eq('organization_id', organizationId)
        .eq('lead_id', authoritativeLeadId)
        .in('direction', ['INBOUND','OUTBOUND'])
        .order('created_at', { ascending: false })
        .limit(14)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('knowledge_versions')
      .select('knowledge_key,version,payload,created_at')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(16),
    supabase
      .from('prompt_versions')
      .select('agent_name,version,prompt_text,created_at')
      .eq('organization_id', organizationId)
      .eq('active', true)
      .order('version', { ascending: false }),
    supabase
      .from('agent_settings')
      .select('agent_name,enabled,model,confidence_threshold,config')
      .eq('organization_id', organizationId),
    supabase
      .from('services')
      .select('id,name,enabled,config')
      .eq('organization_id', organizationId)
      .eq('enabled', true),
    base.countryCode
      ? supabase
        .from('service_prices')
        .select('service_id,country_code,currency,price,minimum_price,max_auto_discount_pct,max_discount_with_approval_pct')
        .eq('organization_id', organizationId)
        .eq('country_code', base.countryCode.toUpperCase())
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError = [messagesResult, knowledgeResult, promptsResult, settingsResult, servicesResult, pricesResult]
    .map((result) => result.error)
    .find(Boolean);
  if (firstError) throw new Error(`Agent context hydration failed: ${firstError.message}`);

  const conversationHistory: ConversationMemoryItem[] = ((messagesResult.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      direction: String(row.direction) === 'OUTBOUND' ? 'OUTBOUND' as const : 'INBOUND' as const,
      channel: clip(row.channel, 40) || undefined,
      body: clip(row.body),
      at: clip(row.received_at ?? row.sent_at ?? row.created_at, 80) || undefined,
    }))
    .filter((item) => item.body)
    .reverse();

  const knowledgeContext: KnowledgeSnapshot[] = ((knowledgeResult.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({ key: clip(row.knowledge_key, 120), version: numberOrZero(row.version), payload: row.payload }))
    .filter((item) => item.key && item.version > 0);

  const activePrompts: Partial<Record<AgentName, ActivePromptSnapshot>> = {};
  for (const row of (promptsResult.data ?? []) as Array<Record<string, unknown>>) {
    const agent = clip(row.agent_name, 80) as AgentName;
    if (!AGENT_NAMES.includes(agent) || activePrompts[agent]) continue;
    const text = clip(row.prompt_text, 7000);
    if (!text) continue;
    activePrompts[agent] = { version: numberOrZero(row.version), text };
  }

  const agentSettings: Partial<Record<AgentName, AgentSettingSnapshot>> = {};
  for (const row of (settingsResult.data ?? []) as Array<Record<string, unknown>>) {
    const agent = clip(row.agent_name, 80) as AgentName;
    if (!AGENT_NAMES.includes(agent)) continue;
    agentSettings[agent] = {
      enabled: row.enabled !== false,
      model: clip(row.model, 120) || undefined,
      confidenceThreshold: row.confidence_threshold == null ? undefined : numberOrZero(row.confidence_threshold),
      config: safeRecord(row.config),
    };
  }

  const priceByService = new Map<string, Record<string, unknown>>();
  for (const row of (pricesResult.data ?? []) as Array<Record<string, unknown>>) {
    priceByService.set(clip(row.service_id, 120), row);
  }

  const serviceKnowledge: ServiceKnowledgeSnapshot[] = ((servicesResult.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => {
      const id = clip(row.id, 120);
      const price = priceByService.get(id);
      return {
        id,
        name: clip(row.name, 240),
        config: safeRecord(row.config),
        ...(price ? {
          marketPrice: {
            countryCode: clip(price.country_code, 8),
            currency: clip(price.currency, 12),
            price: numberOrZero(price.price),
            minimumPrice: numberOrZero(price.minimum_price),
            maxAutoDiscountPct: numberOrZero(price.max_auto_discount_pct),
            maxDiscountWithApprovalPct: numberOrZero(price.max_discount_with_approval_pct),
          },
        } : {}),
      };
    })
    .filter((service) => service.id && service.name);

  const promptVersions: Partial<Record<AgentName, number>> = {};
  for (const [agent, prompt] of Object.entries(activePrompts) as Array<[AgentName, ActivePromptSnapshot]>) {
    promptVersions[agent] = prompt.version;
  }
  const knowledgeVersions = Object.fromEntries(knowledgeContext.map((item) => [item.key, item.version]));
  const conversationSummary = clip(conversation?.summary, 3000) || clip(conversation?.persian_summary, 3000) || base.conversationSummary;

  return {
    context: {
      ...base,
      leadId: authoritativeLeadId,
      conversationId: clip(conversation?.id, 80) || input.trustedConversationId || base.conversationId,
      conversationSummary,
      conversationHistory,
      knowledgeContext,
      serviceKnowledge,
      activePrompts,
      agentSettings,
      stage: stageValue(conversation?.stage) ?? base.stage,
      agentMode: modeValue(conversation?.agent_mode) ?? base.agentMode,
      language: base.language || clip(conversation?.detected_language, 80) || undefined,
      dialect: base.dialect || clip(conversation?.detected_dialect, 120) || undefined,
    },
    evidence: {
      conversationId: clip(conversation?.id, 80) || input.trustedConversationId || base.conversationId,
      historyCount: conversationHistory.length,
      promptVersions,
      knowledgeVersions,
      serviceKnowledgeCount: serviceKnowledge.length,
    },
  };
}
