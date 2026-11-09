import 'server-only';

import { DateTime } from 'luxon';
import { notFound } from 'next/navigation';
import {
  CustomerBusinessAccessError,
  loadCustomerBusinessAccessContext,
  normalizeCustomerBusinessId,
} from '@/lib/access/customer-business-scope';
import { effectiveOpportunityScore } from '@/lib/crm/lead-scoring';
import { createClient } from '@/lib/supabase/server';

export type StudioQuery = { businessId?: string; thread?: string; page?: string; focus?: string; before?: string };

export async function customerStudioScope(requestedBusinessId?: string) {
  const supabase = await createClient();
  try {
    const { selectedBusiness: business, userId } = await loadCustomerBusinessAccessContext({
      requestedBusinessId,
      supabase,
    });
    if (!business) notFound();
    return { supabase, business, userId };
  } catch (error) {
    if (error instanceof CustomerBusinessAccessError &&
      (error.code === 'INVALID_BUSINESS' || error.code === 'BUSINESS_NOT_ACCESSIBLE')) notFound();
    throw error;
  }
}

type Scope = Awaited<ReturnType<typeof customerStudioScope>>;

type Lead = {
  id: string;
  opportunity_score: number;
  scoring_source: string | null;
  score_reasons: unknown;
  manual_score_override: number | null;
  manual_score_override_expires_at: string | null;
  businesses: { name: string } | null;
};

type Projection = {
  conversation_id: string;
  last_activity_at: string | null;
  sales_conversations: {
    stage: string;
    requires_human: boolean;
    agent_mode: string | null;
    awaiting_party: string;
    last_inbound_at: string | null;
    last_message_at: string | null;
    detected_language: string | null;
    intent_label: string | null;
    leads: Lead | null;
  };
};

const threadColumns = 'conversation_id,last_activity_at,sales_conversations!conversation_id!inner(stage,requires_human,agent_mode,awaiting_party,last_inbound_at,last_message_at,detected_language,intent_label,leads!lead_id(id,opportunity_score,scoring_source,score_reasons,manual_score_override,manual_score_override_expires_at,businesses!business_id(name)))';

function businessThreads(scope: Scope, columns: string, countOnly = false) {
  const { supabase, business } = scope;
  return supabase.from('unified_inbox_conversation_projections')
    .select(columns, countOnly ? { count: 'exact', head: true } : undefined)
    .eq('organization_id', business.organizationId)
    .eq('tenant_business_id', business.id)
    .in('lifecycle_status', ['ACTIVE', 'DEGRADED'])
    .eq('sales_conversations.channel', 'WHATSAPP');
}

export function studioTimeZone(timezone: string | null) {
  return timezone && DateTime.now().setZone(timezone).isValid ? timezone : 'UTC';
}

function localDay(scope: Scope) {
  const start = DateTime.now().setZone(studioTimeZone(scope.business.timezone)).startOf('day');
  return { start: start.toUTC().toISO()!, end: start.plus({ days: 1 }).toUTC().toISO()! };
}

const countColumns = 'conversation_id,sales_conversations!conversation_id!inner(channel)';
export async function loadStudioToday(scope: Scope) {
  const { start, end } = localDay(scope);
  const [received, waiting, human] = await Promise.all([
    businessThreads(scope, countColumns, true).gte('sales_conversations.last_inbound_at', start)
      .lt('sales_conversations.last_inbound_at', end),
    businessThreads(scope, countColumns, true).eq('sales_conversations.awaiting_party', 'US'),
    businessThreads(scope, countColumns, true).eq('sales_conversations.requires_human', true),
  ]);
  if (received.error || waiting.error || human.error) throw new Error('Unable to load workspace activity');
  return { received: received.count ?? 0, waiting: waiting.count ?? 0, human: human.count ?? 0 };
}

function projectThread(row: Projection) {
  const details = row.sales_conversations;
  const lead = details.leads;
  const override = lead?.manual_score_override != null &&
    (!lead.manual_score_override_expires_at || Date.parse(lead.manual_score_override_expires_at) > Date.now());
  return {
    id: row.conversation_id,
    name: lead?.businesses?.name ?? 'WhatsApp contact',
    activity: row.last_activity_at ?? details.last_message_at,
    stage: details.stage,
    requiresHuman: details.requires_human,
    humanControl: details.requires_human && details.agent_mode === 'HUMAN',
    awaitingParty: details.awaiting_party,
    language: details.detected_language,
    intent: details.intent_label,
    score: lead && (lead.scoring_source || override) ? effectiveOpportunityScore({
      opportunityScore: lead.opportunity_score,
      manualOverride: lead.manual_score_override,
      manualOverrideExpiresAt: lead.manual_score_override_expires_at,
    }) : null,
    scoreReasons: Array.isArray(lead?.score_reasons)
      ? lead.score_reasons.filter((reason): reason is string => typeof reason === 'string').slice(0, 4)
      : [],
  };
}

export type StudioThread = ReturnType<typeof projectThread>;

const PAGE_SIZE = 24;

export async function loadStudioThreads(scope: Scope, options: Pick<StudioQuery, 'page' | 'focus'> = {}) {
  const rawPage = Number(options.page ?? 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 1000 ? rawPage : 1;
  let query = businessThreads(scope, threadColumns);
  if (options.focus === 'waiting') query = query.eq('sales_conversations.awaiting_party', 'US');
  if (options.focus === 'human') query = query.eq('sales_conversations.requires_human', true);
  if (options.focus === 'received') {
    const { start, end } = localDay(scope);
    query = query.gte('sales_conversations.last_inbound_at', start).lt('sales_conversations.last_inbound_at', end);
  }
  const offset = (page - 1) * PAGE_SIZE;
  const { data, error } = await query.order('last_activity_at', { ascending: false, nullsFirst: false })
    .order('conversation_id').range(offset, offset + PAGE_SIZE).returns<Projection[]>();
  if (error) throw new Error('Unable to load workspace conversations');
  return { items: (data ?? []).slice(0, PAGE_SIZE).map(projectThread), page, hasMore: (data?.length ?? 0) > PAGE_SIZE && page < 1000 };
}

export function isStudioRequestOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const host = request.headers.get('host') ?? new URL(request.url).host;
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin && parsed.host === host.toLowerCase();
  } catch {
    return false;
  }
}

export async function studioOwnerThread(businessId: unknown, threadId: string) {
  const normalized = normalizeCustomerBusinessId(businessId);
  if (!normalized || !normalizeCustomerBusinessId(threadId)) return null;
  const supabase = await createClient();
  let context;
  try {
    context = await loadCustomerBusinessAccessContext({ requestedBusinessId: normalized, supabase });
  } catch (error) {
    if (error instanceof CustomerBusinessAccessError && error.code !== 'DATABASE') return null;
    throw error;
  }
  const business = context.selectedBusiness;
  if (!business || business.organizationRole !== 'OWNER' || business.businessRole !== 'OWNER') return null;
  const scope = { supabase, business, userId: context.userId };
  const { data, error } = await businessThreads(scope, countColumns).eq('conversation_id', threadId).maybeSingle();
  if (error) throw new Error('Unable to verify workspace conversation');
  return data ? { supabase, organizationId: business.organizationId, userId: context.userId } : null;
}

export async function loadStudioHistory(scope: Scope, threadId: string, before?: string) {
  if (!normalizeCustomerBusinessId(threadId)) notFound();
  const { data, error } = await businessThreads(scope, threadColumns).eq('conversation_id', threadId)
    .returns<Projection[]>().maybeSingle();
  if (error) throw new Error('Unable to load conversation');
  if (!data) notFound();

  // The independently authorized projection is required before any message read.
  let query = scope.supabase.from('conversation_messages')
    .select('id,created_at,direction,media_type,original_text,transcript,status')
    .eq('organization_id', scope.business.organizationId)
    .eq('conversation_id', threadId)
    .eq('channel', 'WHATSAPP');
  if (before) {
    const [timestamp, id] = before.split('|');
    const parsed = DateTime.fromISO(timestamp, { setZone: true });
    if (!parsed.isValid || !normalizeCustomerBusinessId(id)) notFound();
    const iso = parsed.toUTC().toISO();
    query = query.or('created_at.lt.'+iso+',and(created_at.eq.'+iso+',id.lt.'+id+')');
  }
  const result = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(51);
  if (result.error) throw new Error('Unable to load message history');
  const messages = (result.data ?? []).slice(0, 50);
  const last = messages.at(-1);
  return {
    thread: projectThread(data),
    messages: messages.reverse(),
    older: result.data && result.data.length > 50 && last ? last.created_at+'|'+last.id : null,
  };
}

export async function loadStudioKnowledge(scope: Scope) {
  const { data, error } = await scope.supabase.from('knowledge_versions')
    .select('id,knowledge_key,version,approval_status,active,created_at,payload')
    .eq('organization_id', scope.business.organizationId)
    .eq('scope_type', 'BUSINESS')
    .eq('tenant_business_id', scope.business.id)
    .eq('knowledge_key', 'studio-business-profile')
    .or('approval_status.eq.PENDING_REVIEW,and(approval_status.eq.APPROVED,active.eq.true)')
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) throw new Error('Unable to load business knowledge');
  return data ?? [];
}
