import type { SupabaseClient } from '@supabase/supabase-js';

export type HumanAcquisitionOpportunity = {
  priority_score?: number | null;
  prospect_tier?: string | null;
  should_contact?: boolean | null;
  recommended_acquisition_route?: string | null;
  primary_service_id?: string | null;
  company_size?: string | null;
  revenue_potential_band?: string | null;
  businesses?: {
    country_code?: string | null;
    instagram?: string | null;
    whatsapp?: string | null;
    phone?: string | null;
    international_phone?: string | null;
    email?: string | null;
  } | Array<{
    country_code?: string | null;
    instagram?: string | null;
    whatsapp?: string | null;
    phone?: string | null;
    international_phone?: string | null;
    email?: string | null;
  }> | null;
};

const GCC = new Set(['OM', 'AE', 'SA', 'QA']);
const HUMAN_ROUTES = new Set(['GCC_HUMAN_IG_WA', 'HYBRID_EMAIL_HUMAN_GCC']);
const clean = (value: unknown) => String(value ?? '').trim();

export function humanFirstTouchBlockReason(input: {
  leadStatuses: string[];
  agentModes: string[];
  hasOutboundHistory: boolean;
  hasConversation?: boolean;
  hasPreparedOutbound?: boolean;
}) {
  if (input.leadStatuses.some(status => ['DO_NOT_CONTACT','DNC','SUPPRESSED','UNSUBSCRIBED','LOST','WON'].includes(status.toUpperCase()))) return 'LEAD_REQUIRES_REVIEW';
  if (input.leadStatuses.some(status => status.toUpperCase() === 'HUMAN')
    || input.agentModes.some(mode => ['HUMAN','PAUSED'].includes(mode.toUpperCase()))) return 'HUMAN_OR_PAUSED_CONVERSATION';
  if (input.leadStatuses.some(status => ['CONTACTED','REPLIED','INTERESTED','HOT'].includes(status.toUpperCase()))) return 'PREVIOUSLY_CONTACTED';
  if (input.hasOutboundHistory) return 'PREVIOUSLY_CONTACTED';
  if (input.hasPreparedOutbound) return 'EXISTING_OUTBOUND_ACTIVITY';
  if (input.hasConversation) return 'EXISTING_CONVERSATION';
  return null;
}

export function humanAcquisitionBusiness(row: HumanAcquisitionOpportunity) {
  return Array.isArray(row.businesses) ? row.businesses[0] ?? null : row.businesses ?? null;
}

export function isGccHumanAcquisitionCandidate(row: HumanAcquisitionOpportunity) {
  const business = humanAcquisitionBusiness(row);
  const market = clean(business?.country_code).toUpperCase();
  const route = clean(row.recommended_acquisition_route).toUpperCase();
  const hasHumanPath = Boolean(
    clean(business?.instagram)
    || clean(business?.whatsapp)
    || clean(business?.international_phone)
    || clean(business?.phone),
  );
  return GCC.has(market)
    && HUMAN_ROUTES.has(route)
    && hasHumanPath
    && clean(row.prospect_tier).toUpperCase() !== 'SKIP'
    && Number(row.priority_score ?? 0) > 0;
}

export function humanAcquisitionTier(priorityScore?: number | null) {
  const score = Number(priorityScore ?? 0);
  if (score >= 90) return 'A+' as const;
  if (score >= 80) return 'A' as const;
  if (score >= 70) return 'B' as const;
  return 'REVIEW' as const;
}

export function humanAcquisitionReason(row: HumanAcquisitionOpportunity) {
  const business = humanAcquisitionBusiness(row);
  if (!business) return 'No business linkage';
  const paths = [
    clean(business.instagram) ? 'Instagram' : '',
    clean(business.whatsapp) || clean(business.international_phone) || clean(business.phone) ? 'WhatsApp/phone' : '',
    clean(business.email) ? 'email' : '',
  ].filter(Boolean);
  return `${humanAcquisitionTier(row.priority_score)} priority; human first touch via ${paths.join(' + ') || 'review'}. Agent automation begins only after inbound/permission.`;
}

/** Read-only contact history; no send permission or second contact ledger is created. */
export async function loadHumanFirstTouchContexts(input: { supabase: SupabaseClient; organizationId: string; businessIds: string[] }) {
  const businessIds = [...new Set(input.businessIds)];
  const { supabase, organizationId } = input;
  const leadsResult = businessIds.length ? await supabase.from('leads').select('id,business_id,status,agent_mode')
    .eq('organization_id', organizationId).in('business_id', businessIds).limit(1000) : { data: [], error: null };
  if (leadsResult.error || (leadsResult.data?.length ?? 0) >= 1000) throw new Error('Human acquisition CRM history needs reconciliation before first-touch review.');
  const leads = leadsResult.data ?? [];
  const leadIds = leads.map(lead => String(lead.id));
  if (!leadIds.length) return new Map(businessIds.map(businessId => [businessId, { blockedReason: null, leadId: null }] as const));
  const history = await Promise.all([
    supabase.from('outreach_messages').select('lead_id,status').eq('organization_id', organizationId).in('lead_id', leadIds).eq('direction', 'OUTBOUND').limit(1000),
    supabase.from('conversation_messages').select('lead_id,status').eq('organization_id', organizationId).in('lead_id', leadIds).eq('direction', 'OUTBOUND').limit(1000),
    supabase.from('sales_conversations').select('lead_id,agent_mode').eq('organization_id', organizationId).in('lead_id', leadIds).limit(1000),
  ]);
  if (history.some(result => result.error || (result.data?.length ?? 0) >= 1000)) throw new Error('Human acquisition contact history is unavailable; no introduction is suggested.');
  const outbound = [...(history[0].data ?? []), ...(history[1].data ?? [])];
  const sentLeadIds = new Set(outbound.filter(row => ['SENT','DELIVERED','READ'].includes(String(row.status))).map(row => String(row.lead_id)));
  const preparedLeadIds = new Set(outbound.map(row => String(row.lead_id)));
  const conversations = history[2]?.data ?? [];

  return new Map(businessIds.map(businessId => {
    const businessLeads = leads.filter(lead => lead.business_id === businessId);
    const businessLeadIds = new Set(businessLeads.map(lead => String(lead.id)));
    const businessConversations = conversations.filter(conversation => businessLeadIds.has(String(conversation.lead_id)));
    const blockedReason = humanFirstTouchBlockReason({
      leadStatuses: businessLeads.map(lead => String(lead.status)),
      agentModes: [...businessLeads.map(lead => String(lead.agent_mode)), ...businessConversations.map(conversation => String(conversation.agent_mode))],
      hasOutboundHistory: businessLeads.some(lead => sentLeadIds.has(String(lead.id))),
      hasConversation: businessConversations.length > 0,
      hasPreparedOutbound: businessLeads.some(lead => preparedLeadIds.has(String(lead.id))),
    });
    return [businessId, { blockedReason, leadId: businessLeads[0]?.id ? String(businessLeads[0].id) : null }] as const;
  }));
}
