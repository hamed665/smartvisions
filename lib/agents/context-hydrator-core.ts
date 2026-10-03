import type { SupabaseClient } from '@supabase/supabase-js';
import { buildConversationMemory, customerMessages, sentReplies } from '@/lib/conversations/memory-read-model';
import { deriveSalesState } from '@/lib/conversations/sales-state';
import { matchPortfolio, type PortfolioItem } from '@/lib/portfolio/matcher';
import type {
  ActivePromptSnapshot,
  AgentContext,
  BookingContextSnapshot,
  AgentName,
  AgentSettingSnapshot,
  ContextEvidenceManifest,
  KnowledgeSnapshot,
  ServiceKnowledgeSnapshot,
} from './contracts';
import { CONVERSATION_STAGES } from './contracts';
import {
  buildContextEvidenceManifest,
  projectBusinessTwinContext,
  projectCustomerContext,
  projectMediaContext,
  projectMemoryContext,
  projectPermissionContext,
  projectToolAvailability,
} from './context-compiler';
import { parsePromptControlConfig, selectPromptForRuntime } from './prompt-control';

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
  mediaEvidenceCount: number;
  salesStateVersion?: number;
  promptVersions: Partial<Record<AgentName, number>>;
  knowledgeVersions: Record<string, number>;
  serviceKnowledgeCount: number;
  bookableServiceCount: number;
  activeBookingCount: number;
  portfolioCount: number;
  memoryCount: number;
  customerRelationshipCount: number;
  businessTwinSchemaVersion?: number;
  toolContractVersions: Record<string, number>;
  permissionActorType: 'SYSTEM' | 'USER';
  permissionScopeCount: number;
  contextEvidence: ContextEvidenceManifest;
};

export async function hydrateAgentContext(input: {
  supabase: SupabaseClient;
  context: AgentContext;
  trustedConversationId?: string;
  actorUserId?: string;
}): Promise<{ context: AgentContext; evidence: HydratedRuntimeEvidence }> {
  const { supabase } = input;
  const base = input.context;
  const organizationId = base.organizationId;
  if (!organizationId) throw new Error('organizationId is required to hydrate agent context');

  let conversation: Record<string, unknown> | null = null;
  const conversationSelect = 'id,lead_id,person_id,channel,summary,persian_summary,stage,agent_mode,detected_language,detected_dialect,last_message_at,sales_state,sales_state_updated_at';
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
      .select('id,business_id,person_id,status,agent_mode,opportunity_score,intent_score,recommended_offer')
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
  const personId = clip(conversation?.person_id, 80) || clip(lead?.person_id, 80) || undefined;

  const [
    outreachMessagesResult,
    conversationMessagesResult,
    knowledgeResult,
    promptsResult,
    settingsResult,
    servicesResult,
    bookingProfilesResult,
    pricesResult,
    portfolioResult,
    businessTwinResult,
    memoryResult,
    customerPersonResult,
    customerRelationshipsResult,
    toolRegistryResult,
    membershipResult,
    scopeAssignmentsResult,
    targetScopeResult,
  ] = await Promise.all([
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
        .select('id,conversation_id,provider_message_id,direction,channel,status,media_type,original_text,transcript,sent_at,created_at,metadata')
        .eq('organization_id', organizationId)
        .eq('conversation_id', conversationId)
        .eq('channel', conversationChannel)
        .in('status', ['RECEIVED','SENT'])
        .order('created_at', { ascending: false })
        .limit(40)
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc('get_knowledge_context_v2', {
      p_organization_id: organizationId,
      p_tenant_business_id: null,
      p_branch_id: null,
      p_include_stale: false,
      p_limit: 16,
    }),
    supabase
      .from('prompt_versions')
      .select('agent_name,version,prompt_text,active,created_at')
      .eq('organization_id', organizationId)
      .order('version', { ascending: false })
      .limit(100),
    supabase
      .from('agent_settings')
      .select('agent_name,enabled,model,confidence_threshold,config')
      .eq('organization_id', organizationId),
    supabase
      .from('services')
      .select('id,name,enabled,config')
      .eq('organization_id', organizationId)
      .eq('enabled', true),
    supabase
      .from('service_booking_profiles')
      .select('service_id,booking_enabled,duration_minutes,location_mode,booking_rules')
      .eq('organization_id', organizationId)
      .eq('booking_enabled', true),
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
    supabase.rpc('compile_business_twin_v2', {
      p_organization_id: organizationId,
    }),
    supabase.rpc('get_memory_context_v2', {
      p_organization_id: organizationId,
      p_person_id: personId ?? null,
      p_business_id: businessId || null,
      p_conversation_id: conversationId || null,
      p_include_stale: false,
      p_include_expired: false,
      p_limit: 24,
    }),
    personId
      ? supabase
        .from('crm_people')
        .select('id,display_name,status')
        .eq('organization_id', organizationId)
        .eq('id', personId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    personId
      ? supabase
        .from('crm_person_business_relationships')
        .select('id,business_id,relationship_type,job_title,verification_method,status,last_seen_at')
        .eq('organization_id', organizationId)
        .eq('person_id', personId)
        .eq('status', 'ACTIVE')
        .order('last_seen_at', { ascending: false })
        .limit(8)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('tool_action_registry')
      .select('action_key,tool_key,authority_key,contract_version,permission_key,scope_type,cost_class,side_effect_class,approval_requirement,approval_policy_key,verifier_key,availability,required_work_packages,metadata')
      .order('action_key', { ascending: true })
      .limit(32),
    input.actorUserId
      ? supabase
        .from('organization_members')
        .select('organization_id,user_id,role')
        .eq('organization_id', organizationId)
        .eq('user_id', input.actorUserId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.actorUserId
      ? supabase
        .from('member_scope_assignments')
        .select('id,scope_type,role,brand_id,tenant_business_id,branch_id,department_id,team_id,attributes')
        .eq('organization_id', organizationId)
        .eq('user_id', input.actorUserId)
        .order('scope_type', { ascending: true })
        .limit(16)
      : Promise.resolve({ data: [], error: null }),
    conversationId
      ? supabase
        .from('unified_inbox_conversation_projections')
        .select('brand_id,tenant_business_id,branch_id,department_id,team_id,lifecycle_status')
        .eq('organization_id', organizationId)
        .eq('conversation_id', conversationId)
        .in('lifecycle_status', ['ACTIVE', 'DEGRADED'])
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const firstError = [
    outreachMessagesResult,
    conversationMessagesResult,
    knowledgeResult,
    promptsResult,
    settingsResult,
    servicesResult,
    bookingProfilesResult,
    pricesResult,
    portfolioResult,
    businessTwinResult,
    memoryResult,
    customerPersonResult,
    customerRelationshipsResult,
    toolRegistryResult,
    membershipResult,
    scopeAssignmentsResult,
    targetScopeResult,
  ]
    .map((result) => result.error)
    .find(Boolean);
  if (firstError) throw new Error(`Agent context hydration failed: ${firstError.message}`);

  const targetScopeRow = targetScopeResult.data as Record<string, unknown> | null;
  const targetScope = {
    brandId: clip(targetScopeRow?.brand_id, 80) || undefined,
    tenantBusinessId: clip(targetScopeRow?.tenant_business_id, 80) || undefined,
    branchId: clip(targetScopeRow?.branch_id, 80) || undefined,
    departmentId: clip(targetScopeRow?.department_id, 80) || undefined,
    teamId: clip(targetScopeRow?.team_id, 80) || undefined,
  };
  let effectiveRole: string | undefined;
  if (input.actorUserId) {
    if (!membershipResult.data) {
      throw new Error('AI actor is not a member of the requested Organization');
    }
    const roleResult = await supabase.rpc('unified_inbox_actor_effective_role', {
      p_organization_id: organizationId,
      p_user_id: input.actorUserId,
      p_brand_id: targetScope.brandId ?? null,
      p_tenant_business_id: targetScope.tenantBusinessId ?? null,
      p_branch_id: targetScope.branchId ?? null,
      p_department_id: targetScope.departmentId ?? null,
      p_team_id: targetScope.teamId ?? null,
    });
    if (roleResult.error) {
      throw new Error(`AI actor scope evaluation failed: ${roleResult.error.message}`);
    }
    effectiveRole = clip(roleResult.data, 40).toUpperCase() || undefined;
    if (!effectiveRole) {
      throw new Error('AI actor is outside the canonical target scope');
    }
  }

  const conversationHistory = conversationId
    ? buildConversationMemory({
      conversationId,
      channel: conversationChannel,
      outreachRows: outreachMessagesResult.data ?? [],
      conversationRows: conversationMessagesResult.data ?? [],
      limit: 30,
    })
    : [];
  const mediaContext = projectMediaContext(
    (conversationMessagesResult.data ?? []) as Array<Record<string, unknown>>,
  );

  const knowledgeContext: KnowledgeSnapshot[] = ((knowledgeResult.data ?? []) as Array<Record<string, unknown>>)
    .map((row) => ({
      key: clip(row.knowledge_key, 120),
      version: numberOrZero(row.version),
      payload: row.payload,
      sourceType: clip(row.source_type, 40) || undefined,
      sourceLocator: clip(row.source_locator, 1000) || undefined,
      provenance: safeRecord(row.provenance),
      sensitivity: clip(row.sensitivity, 40) || undefined,
      scopeType: clip(row.scope_type, 40) || undefined,
      stale: row.stale === true,
      conflictState: clip(row.conflict_state, 40) || undefined,
      confidence: row.confidence == null ? undefined : numberOrZero(row.confidence),
      reviewState: clip(row.review_state, 40) || undefined,
    }))
    .filter((item) => item.key && item.version > 0);

  const customerContext = projectCustomerContext({
    person: customerPersonResult.data as Record<string, unknown> | null,
    relationships: (customerRelationshipsResult.data ?? []) as Array<Record<string, unknown>>,
  });
  const memoryContext = projectMemoryContext(
    (memoryResult.data ?? []) as Array<Record<string, unknown>>,
  );
  const businessTwinContext = projectBusinessTwinContext(businessTwinResult.data);
  const toolAvailability = projectToolAvailability(
    (toolRegistryResult.data ?? []) as Array<Record<string, unknown>>,
  );
  const permissionContext = projectPermissionContext({
    actorUserId: input.actorUserId,
    membership: membershipResult.data as Record<string, unknown> | null,
    scopeAssignments: (scopeAssignmentsResult.data ?? []) as Array<Record<string, unknown>>,
    effectiveRole,
    targetScope,
  });

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

  const promptRows = (promptsResult.data ?? []) as Array<Record<string, unknown>>;
  const activePrompts: Partial<Record<AgentName, ActivePromptSnapshot>> = {};
  for (const agent of AGENT_NAMES) {
    const rows = promptRows.filter((row) => clip(row.agent_name, 80) === agent);
    const baselineRow = rows.find((row) => row.active === true);
    const control = parsePromptControlConfig(agentSettings[agent]?.config);
    const candidateRow = control.candidateVersion
      ? rows.find((row) => numberOrZero(row.version) === control.candidateVersion && row.active !== true)
      : undefined;
    const baseline = baselineRow ? {
      version: numberOrZero(baselineRow.version),
      text: clip(baselineRow.prompt_text, 7000),
    } : undefined;
    const candidate = candidateRow ? {
      version: numberOrZero(candidateRow.version),
      text: clip(candidateRow.prompt_text, 7000),
    } : undefined;
    const selected = selectPromptForRuntime({
      baseline: baseline?.version && baseline.text ? baseline : undefined,
      candidate: candidate?.version && candidate.text ? candidate : undefined,
      control,
      rolloutKey: [
        organizationId,
        conversationId || authoritativeLeadId || businessId || 'organization',
        agent,
      ].join(':'),
    });
    if (selected) activePrompts[agent] = selected;
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

  const bookingProfileByService = new Map<string, Record<string, unknown>>();
  for (const row of (bookingProfilesResult.data ?? []) as Array<Record<string, unknown>>) {
    bookingProfileByService.set(clip(row.service_id, 120), row);
  }
  const bookableServices: BookingContextSnapshot['bookableServices'] = serviceKnowledge
    .flatMap((service) => {
      const profile = bookingProfileByService.get(service.id);
      if (!profile) return [];
      const durationMinutes = profile.duration_minutes == null ? undefined : numberOrZero(profile.duration_minutes);
      return [{
        serviceId: service.id,
        name: service.name,
        ...(durationMinutes == null ? {} : { durationMinutes }),
        locationMode: clip(profile.location_mode, 40),
        bookingRules: safeRecord(profile.booking_rules) ?? {},
      }];
    });

  let activeBookings: BookingContextSnapshot['activeBookings'] = [];
  if (personId) {
    const bookingResult = await supabase.from('bookings')
      .select('id,booking_reference,service_id,status,branch_id,staff_user_id,starts_at,ends_at')
      .eq('organization_id', organizationId)
      .eq('person_id', personId)
      .in('status', ['REQUESTED','HELD','CONFIRMED','RESCHEDULED'])
      .order('updated_at', { ascending: false })
      .limit(20);
    if (bookingResult.error) throw new Error(`Canonical Booking context lookup failed: ${bookingResult.error.message}`);
    activeBookings = ((bookingResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      bookingId: clip(row.id, 80),
      bookingReference: clip(row.booking_reference, 80),
      serviceId: clip(row.service_id, 120),
      status: clip(row.status, 40),
      branchId: clip(row.branch_id, 80) || undefined,
      staffUserId: clip(row.staff_user_id, 80) || undefined,
      startsAt: clip(row.starts_at, 80) || undefined,
      endsAt: clip(row.ends_at, 80) || undefined,
    }));
  }
  const bookingContext: BookingContextSnapshot = {
    nowIso: new Date().toISOString(),
    personId,
    bookableServices,
    activeBookings,
  };

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

  const toolContractVersions = Object.fromEntries(
    toolAvailability.map((item) => [item.actionKey, item.contractVersion]),
  );
  const contextEvidence = buildContextEvidenceManifest([
    {
      authority: 'CONVERSATION',
      count: conversationHistory.length,
      refs: conversationId ? [conversationId] : [],
    },
    {
      authority: 'MEDIA_EVIDENCE',
      count: mediaContext.length,
    },
    {
      authority: 'CRM_CUSTOMER',
      count: customerContext?.relationships.length ?? 0,
      refs: customerContext?.person?.id ? [customerContext.person.id] : [],
    },
    {
      authority: 'SALES_STATE',
      version: salesState.version,
      refs: conversationId ? [conversationId] : [],
    },
    {
      authority: 'BUSINESS_TWIN',
      version: businessTwinContext?.schemaVersion,
      count: businessTwinContext?.policyConfiguration.length ?? 0,
      refs: businessTwinContext?.authority ? [businessTwinContext.authority] : [],
    },
    {
      authority: 'KNOWLEDGE',
      count: knowledgeContext.length,
      refs: knowledgeContext.map((item) => `${item.key}@${item.version}`),
    },
    {
      authority: 'MEMORY',
      count: memoryContext.length,
      refs: memoryContext.map((item) => `${item.type}:${item.key}@${item.version}`),
    },
    {
      authority: 'SERVICE_PRICING',
      count: serviceKnowledge.filter((item) => item.marketPrice).length,
      refs: serviceKnowledge.filter((item) => item.marketPrice).map((item) => item.id),
    },
    {
      authority: 'TOOL_ACTION_REGISTRY',
      count: toolAvailability.length,
      refs: toolAvailability.map((item) => `${item.actionKey}@${item.contractVersion}`),
    },
    {
      authority: 'TOOL_PERMISSION_METADATA',
      count: toolAvailability.length,
      refs: toolAvailability.map((item) => item.permissionKey),
    },
    {
      authority: 'IAM_PERMISSION_CONTEXT',
      count: permissionContext.scopeAssignments.length,
      refs: [
        permissionContext.actorType,
        permissionContext.organizationRole ?? '',
        permissionContext.effectiveRole ?? '',
        ...(permissionContext.userId ? [permissionContext.userId] : []),
        ...Object.values(permissionContext.targetScope).filter((value): value is string => Boolean(value)),
      ],
    },
  ]);

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
      mediaContext,
      salesState,
      knowledgeContext,
      serviceKnowledge,
      bookingContext,
      customerContext,
      memoryContext,
      businessTwinContext,
      toolAvailability,
      permissionContext,
      contextEvidence,
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
      mediaEvidenceCount: mediaContext.length,
      salesStateVersion: salesState.version,
      promptVersions,
      knowledgeVersions,
      serviceKnowledgeCount: serviceKnowledge.length,
      bookableServiceCount: bookableServices.length,
      activeBookingCount: activeBookings.length,
      portfolioCount: approvedPortfolio.length,
      memoryCount: memoryContext.length,
      customerRelationshipCount: customerContext?.relationships.length ?? 0,
      businessTwinSchemaVersion: businessTwinContext?.schemaVersion,
      toolContractVersions,
      permissionActorType: permissionContext.actorType,
      permissionScopeCount: permissionContext.scopeAssignments.length,
      contextEvidence,
    },
  };
}
