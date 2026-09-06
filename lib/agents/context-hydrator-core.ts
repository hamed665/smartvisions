import type { SupabaseClient } from '@supabase/supabase-js';
import { buildConversationMemory, customerMessages, sentReplies } from '@/lib/conversations/memory-read-model';
import { deriveSalesState } from '@/lib/conversations/sales-state';
import { matchPortfolio, type PortfolioItem } from '@/lib/portfolio/matcher';
import type {
  ActivePromptSnapshot,
  AgentContext,
  AgentName,
  AgentSettingSnapshot,
  KnowledgeSnapshot,
  ServiceKnowledgeSnapshot,
} from './contracts';
import { CONVERSATION_STAGES } from './contracts';

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

export function stageValue(value: unknown): AgentContext['stage'] | undefined {
  const stage = String(value ?? '').toUpperCase();
  return (CONVERSATION_STAGES as readonly string[]).includes(stage)
    ? stage as AgentContext['stage']
    : undefined;
}

function modeValue(value: unknown): AgentContext['agentMode'] | undefined {
  const mode = String(value ?? '').toUpperCase();
  return ['AUTO','PAUSED','HUMAN'].includes(mode) ? mode as AgentContext['agentMode'] : undefined;
}

function stringTags(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
}

export type HydratedRuntimeEvidence = {
  conversationId?: string;
  historyCount: number;
  customerMessageCount: number;
  sentReplyCount: number;
  salesStateVersion?: number;
  promptVersions: Partial<Record<AgentName, number>>;
  knowledgeVersions: Record<string, number>;
  serviceKnowledgeCount: number;
  portfolioCount: number;
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
  const conversationSelect = 'id,lead_id,channel,summary,persian_summary,stage,agent_mode,detected_language,detected_dialect,last_message_at,sales_state,sales_state_updated_at';
  if (input.trustedConversationId) {
    const result = await supabase
      .from('sales_conversations')
      .select(conversationSelect)
      .eq('organization_id', organizationId)
      .eq('id', input.trustedConversationId)
      .maybeSingle();
    if (result.error) throw new Error(`Conversation memory lookup failed: ${result.error.message}`);
    conversation = result.data as Record<string, unknown> | null;
  } else if (base.leadId) {
    const result = await supabase
      .from('sales_conversations')
      .select(conversationSelect)
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

  let lead: Record<string, unknown> | null = null;
  if (authoritativeLeadId) {
    const result = await supabase
      .from('leads')
      .select('id,business_id,status,agent_mode,opportunity_score,intent_score,recommended_offer')
      .eq('organization_id', organizationId)
      .eq('id', authoritativeLeadId)
      .maybeSingle();
    if (result.error) throw new Error(`Canonical lead context lookup failed: ${result.error.message}`);
    lead = result.data as Record<string, unknown> | null;
  }

  let business: Record<string, unknown> | null = null;
  const businessId = clip(lead?.business_id, 80);
  if (businessId) {
    const result = await supabase
      .from('businesses')
      .select('id,name,country_code,category')
      .eq('organization_id', organizationId)
      .eq('id', businessId)
      .maybeSingle();
    if (result.error) throw new Error(`Canonical business context lookup failed: ${result.error.message}`);
    business = result.data as Record<string, unknown> | null;
  }

  const countryCode = (clip(business?.country_code, 8) || clip(base.countryCode, 8)).toUpperCase() || undefined;
  const industry = clip(business?.category, 240) || base.industry;
  const businessName = clip(business?.name, 240) || base.businessName;
  const recommendedOffer = clip(lead?.recommended_offer, 120) || base.quotedService;
  const conversationId = clip(conversation?.id, 80) || input.trustedConversationId || base.conversationId;
  const conversationChannel = clip(conversation?.channel, 40).toUpperCase();

  const [outreachMessagesResult, conversationMessagesResult, knowledgeResult, promptsResult, settingsResult, servicesResult, pricesResult, portfolioResult] = await Promise.all([
    authoritativeLeadId && conversationId && conversationChannel
      ? supabase
        .from('outreach_messages')
        .select('id,provider_message_id,direction,channel,status,body,received_at,sent_at,created_at,metadata')
        .eq('organization_id', organizationId)
        .eq('lead_id', authoritativeLeadId)
        .eq('channel', conversationChannel)
        .in('status', ['RECEIVED','SENT'])
        .contains('metadata', { conversation_id: conversationId })
        .order('created_at', { ascending: false })
        .limit(40)
      : Promise.resolve({ data: [], error: null }),
    conversationId && conversationChannel
      ? supabase
        .from('conversation_messages')
        .select('id,conversation_id,provider_message_id,direction,channel,status,original_text,transcript,sent_at,created_at,metadata')
        .eq('organization_id', organizationId)
        .eq('conversation_id', conversationId)
        .eq('channel', conversationChannel)
        .in('status', ['RECEIVED','SENT'])
        .order('created_at', { ascending: false })
        .limit(40)
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
    countryCode
      ? supabase
        .from('service_prices')
        .select('service_id,country_code,currency,price,minimum_price,max_auto_discount_pct,max_discount_with_approval_pct')
        .eq('organization_id', organizationId)
        .eq('country_code', countryCode)
      : Promise.resolve({ data: [], error: null }),
    (industry || countryCode || recommendedOffer)
      ? supabase
        .from('portfolio_items')
        .select('id,title,service_id,industry,country_code,approved,public_url,tags')
        .eq('organization_id', organizationId)
        .eq('approved', true)
        .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError = [outreachMessagesResult, conversationMessagesResult, knowledgeResult, promptsResult, settingsResult, servicesResult, pricesResult, portfolioResult]
    .map((result) => result.error)
    .find(Boolean);
  if (firstError) throw new Error(`Agent context hydration failed: ${firstError.message}`);

  const conversationHistory = conversationId
    ? buildConversationMemory({
      conversationId,
      channel: conversationChannel,
      outreachRows: outreachMessagesResult.data ?? [],
      conversationRows: conversationMessagesResult.data ?? [],
      limit: 30,
    })
    : [];

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

  const portfolioItems: PortfolioItem[] = ((portfolioResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: clip(row.id, 80),
    title: clip(row.title, 240),
    serviceId: clip(row.service_id, 120) || undefined,
    industry: clip(row.industry, 160) || undefined,
    countryCode: clip(row.country_code, 8).toUpperCase() || undefined,
    approved: row.approved === true,
    publicUrl: clip(row.public_url, 600) || undefined,
    tags: stringTags(row.tags),
  }));
  const portfolioMatches = matchPortfolio({
    items: portfolioItems,
    serviceId: recommendedOffer || undefined,
    industry,
    countryCode,
    limit: 3,
  });
  const approvedPortfolio = portfolioMatches.map(({ item }) => item.publicUrl ? `${item.title} — ${item.publicUrl}` : item.title);

  const promptVersions: Partial<Record<AgentName, number>> = {};
  for (const [agent, prompt] of Object.entries(activePrompts) as Array<[AgentName, ActivePromptSnapshot]>) {
    promptVersions[agent] = prompt.version;
  }
  const knowledgeVersions = Object.fromEntries(knowledgeContext.map((item) => [item.key, item.version]));
  const stage = stageValue(conversation?.stage) ?? base.stage;
  const conversationLanguage = clip(conversation?.detected_language, 80) || base.language || undefined;
  const salesState = deriveSalesState({
    previous: conversation?.sales_state,
    history: conversationHistory,
    stage,
    language: conversationLanguage,
  });
  const persistedSummary = clip(conversation?.summary, 3000) || clip(conversation?.persian_summary, 3000) || base.conversationSummary;
  const conversationSummary = [persistedSummary, salesState.rollingSummary ? `Current sales state: ${salesState.rollingSummary}` : '']
    .filter(Boolean)
    .join('\n')
    .slice(0, 3600) || undefined;

  return {
    context: {
      ...base,
      leadId: authoritativeLeadId,
      conversationId,
      businessName,
      countryCode,
      industry,
      conversationSummary,
      conversationHistory,
      salesState,
      knowledgeContext,
      serviceKnowledge,
      activePrompts,
      agentSettings,
      approvedPortfolio,
      stage,
      agentMode: modeValue(lead?.agent_mode) ?? modeValue(conversation?.agent_mode) ?? base.agentMode,
      intentScore: lead?.intent_score == null ? base.intentScore : numberOrZero(lead.intent_score),
      opportunityScore: lead?.opportunity_score == null ? base.opportunityScore : numberOrZero(lead.opportunity_score),
      language: conversationLanguage,
      dialect: clip(conversation?.detected_dialect, 120) || base.dialect || undefined,
    },
    evidence: {
      conversationId,
      historyCount: conversationHistory.length,
      customerMessageCount: customerMessages(conversationHistory).length,
      sentReplyCount: sentReplies(conversationHistory).length,
      salesStateVersion: salesState.version,
      promptVersions,
      knowledgeVersions,
      serviceKnowledgeCount: serviceKnowledge.length,
      portfolioCount: approvedPortfolio.length,
    },
  };
}