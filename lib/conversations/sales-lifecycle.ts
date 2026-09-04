import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyReply } from '@/lib/outreach/replies';

export type SalesLifecycleSupabase = SupabaseClient;

const replyActivatedStages = new Set(['NEW', 'WAITING_CUSTOMER', 'UNANSWERED', 'FOLLOW_UP_DUE']);

export function isDoNotContactReply(text: string) {
  return classifyReply(text) === 'unsubscribe';
}

export function shouldPersistHumanHandoff(result: unknown) {
  if (!result || typeof result !== 'object') return false;
  return String((result as Record<string, unknown>).nextAgentMode ?? '').toUpperCase() === 'HUMAN';
}

export function humanHandoffReasons(result: unknown) {
  if (!result || typeof result !== 'object') return [] as string[];
  const trace = (result as Record<string, unknown>).trace;
  if (!trace || typeof trace !== 'object') return [] as string[];
  const reasons = (trace as Record<string, unknown>).handoffReasons;
  return Array.isArray(reasons) ? reasons.map(String).filter(Boolean) : [];
}

export function conversationStageAfterCustomerReply(stage?: string | null) {
  const current = String(stage ?? '').trim().toUpperCase();
  if (!current) return 'ACTIVE';
  return replyActivatedStages.has(current) ? 'ACTIVE' : current;
}

export async function persistCustomerReplyConversationState(input: {
  supabase: SalesLifecycleSupabase;
  organizationId: string;
  leadId: string;
  conversationId: string;
}) {
  const { data: conversation, error: lookupError } = await input.supabase
    .from('sales_conversations')
    .select('stage,agent_mode,requires_human')
    .eq('organization_id', input.organizationId)
    .eq('id', input.conversationId)
    .eq('lead_id', input.leadId)
    .maybeSingle();
  if (lookupError) throw new Error(`Conversation reply-state lookup failed: ${lookupError.message}`);
  if (!conversation) throw new Error('Conversation reply-state target not found');

  const agentMode = String(conversation.agent_mode ?? '').toUpperCase();
  if (conversation.requires_human || agentMode === 'HUMAN' || agentMode === 'PAUSED') {
    return { updated: false as const, stage: String(conversation.stage ?? '') };
  }

  const nextStage = conversationStageAfterCustomerReply(conversation.stage);
  if (!nextStage || nextStage === String(conversation.stage ?? '').toUpperCase()) {
    return { updated: false as const, stage: nextStage };
  }

  const { error: updateError } = await input.supabase
    .from('sales_conversations')
    .update({
      stage: nextStage,
      stage_reason: 'CUSTOMER_REPLIED',
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', input.organizationId)
    .eq('id', input.conversationId)
    .eq('lead_id', input.leadId);
  if (updateError) throw new Error(`Conversation reply-state update failed: ${updateError.message}`);

  return { updated: true as const, stage: nextStage };
}

function normalizePhone(value?: string | null) {
  return String(value ?? '').replace(/\D/g, '');
}

async function persistSuppression(input: {
  supabase: SalesLifecycleSupabase;
  organizationId: string;
  email?: string;
  phone?: string;
  source: string;
}) {
  const email = input.email?.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  if (!email && phone.length < 8) return { suppressed: false as const, reason: 'NO_CANONICAL_CONTACT' as const };

  const lookup = email
    ? input.supabase.from('suppression_list').select('id').eq('organization_id', input.organizationId).ilike('email', email).limit(1).maybeSingle()
    : input.supabase.from('suppression_list').select('id').eq('organization_id', input.organizationId).eq('phone', phone).limit(1).maybeSingle();
  const { data: existing, error: lookupError } = await lookup;
  if (lookupError) throw new Error(`Suppression lookup failed: ${lookupError.message}`);
  if (existing) return { suppressed: true as const, duplicate: true as const };

  const { error: insertError } = await input.supabase.from('suppression_list').insert({
    organization_id: input.organizationId,
    email: email ?? null,
    phone: email ? null : phone,
    reason: 'CUSTOMER_DO_NOT_CONTACT',
    source: input.source,
  });
  if (insertError) throw new Error(`Suppression insert failed: ${insertError.message}`);
  return { suppressed: true as const, duplicate: false as const };
}

export async function persistCustomerDoNotContact(input: {
  supabase: SalesLifecycleSupabase;
  organizationId: string;
  leadId: string;
  conversationId: string;
  email?: string;
  phone?: string;
  source: string;
}) {
  const now = new Date().toISOString();
  const { error: leadError } = await input.supabase.from('leads').update({
    status: 'DO_NOT_CONTACT',
    agent_mode: 'PAUSED',
    updated_at: now,
  }).eq('organization_id', input.organizationId).eq('id', input.leadId);
  if (leadError) throw new Error(`DNC lead persistence failed: ${leadError.message}`);

  const { error: conversationError } = await input.supabase.from('sales_conversations').update({
    stage: 'DO_NOT_CONTACT',
    agent_mode: 'PAUSED',
    requires_human: false,
    awaiting_party: 'NONE',
    stage_reason: 'CUSTOMER_DO_NOT_CONTACT',
    updated_at: now,
  }).eq('organization_id', input.organizationId).eq('id', input.conversationId).eq('lead_id', input.leadId);
  if (conversationError) throw new Error(`DNC conversation persistence failed: ${conversationError.message}`);

  const { error: followupError } = await input.supabase.from('followup_jobs').update({
    status: 'CANCELLED',
    stop_reason: 'DO_NOT_CONTACT',
  }).eq('organization_id', input.organizationId).eq('lead_id', input.leadId).eq('status', 'PENDING');
  if (followupError) throw new Error(`DNC follow-up cancellation failed: ${followupError.message}`);

  const suppression = await persistSuppression(input);
  return { persisted: true as const, suppression };
}

export async function persistHumanHandoff(input: {
  supabase: SalesLifecycleSupabase;
  organizationId: string;
  leadId?: string | null;
  conversationId?: string | null;
  reasons?: string[];
}) {
  if (!input.leadId && !input.conversationId) {
    throw new Error('Human handoff requires durable lead or conversation linkage');
  }

  let terminal = false;
  if (input.leadId) {
    const { data: lead, error: leadLookupError } = await input.supabase.from('leads')
      .select('id,status')
      .eq('organization_id', input.organizationId)
      .eq('id', input.leadId)
      .maybeSingle();
    if (leadLookupError) throw new Error(`Human handoff lead lookup failed: ${leadLookupError.message}`);
    if (!lead) throw new Error('Human handoff lead not found');
    terminal = ['DO_NOT_CONTACT', 'WON', 'LOST'].includes(String(lead.status));
  }

  if (terminal) return { persisted: false as const, terminal: true as const };

  const now = new Date().toISOString();
  if (input.leadId) {
    const { error: leadError } = await input.supabase.from('leads').update({
      status: 'HUMAN',
      agent_mode: 'HUMAN',
      updated_at: now,
    }).eq('organization_id', input.organizationId).eq('id', input.leadId);
    if (leadError) throw new Error(`Human handoff lead persistence failed: ${leadError.message}`);
  }

  if (input.conversationId) {
    const { error: conversationError } = await input.supabase.from('sales_conversations').update({
      stage: 'NEEDS_HUMAN',
      agent_mode: 'HUMAN',
      requires_human: true,
      awaiting_party: 'HUMAN',
      stage_reason: (input.reasons ?? []).length ? `HANDOFF:${input.reasons!.join(',')}`.slice(0, 500) : 'HANDOFF',
      updated_at: now,
    }).eq('organization_id', input.organizationId).eq('id', input.conversationId);
    if (conversationError) throw new Error(`Human handoff conversation persistence failed: ${conversationError.message}`);
  }

  if (input.leadId) {
    const { error: followupError } = await input.supabase.from('followup_jobs').update({
      status: 'CANCELLED',
      stop_reason: 'HUMAN_TAKEOVER',
    }).eq('organization_id', input.organizationId).eq('lead_id', input.leadId).eq('status', 'PENDING');
    if (followupError) throw new Error(`Human handoff follow-up cancellation failed: ${followupError.message}`);
  }

  return { persisted: true as const, terminal: false as const };
}
