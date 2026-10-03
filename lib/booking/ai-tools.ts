import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentResult, AgentToolProposal } from '@/lib/agents/contracts';

export type BookingAiProposalAction =
  | 'NONE'
  | 'CHECK_AVAILABILITY'
  | 'CREATE'
  | 'RESCHEDULE'
  | 'CANCEL'
  | 'SCHEDULE_REMINDER'
  | 'ESCALATE'
  | 'DEPOSIT_REQUIREMENT';

export type BookingAiProposal = {
  action: BookingAiProposalAction;
  serviceId?: string;
  bookingId?: string;
  branchId?: string;
  startsAt?: string;
  from?: string;
  to?: string;
  reminderAt?: string;
  reason?: string;
  explicitCustomerRequest: boolean;
};

export type BookingAiToolResult = {
  action: BookingAiProposalAction;
  actionKey?: string;
  status: 'NO_ACTION'|'SUCCEEDED'|'SHADOW_BLOCKED'|'CLARIFICATION_REQUIRED'|'CONFIGURATION_REQUIRED'|'BLOCKED';
  executed: boolean;
  mutation: boolean;
  requiresReview: boolean;
  evidence?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
};

const ACTION_KEY: Record<Exclude<BookingAiProposalAction,'NONE'>, string> = {
  CHECK_AVAILABILITY: 'BOOKING_CHECK_AVAILABILITY',
  CREATE: 'BOOKING_CREATE',
  RESCHEDULE: 'BOOKING_RESCHEDULE',
  CANCEL: 'BOOKING_CANCEL',
  SCHEDULE_REMINDER: 'BOOKING_SCHEDULE_REMINDER',
  ESCALATE: 'BOOKING_ESCALATE',
  DEPOSIT_REQUIREMENT: 'BOOKING_DEPOSIT_REQUIREMENT',
};

const MUTATIONS = new Set<BookingAiProposalAction>(['CREATE','RESCHEDULE','CANCEL','SCHEDULE_REMINDER','ESCALATE']);
const ACTION_BY_KEY = Object.fromEntries(
  Object.entries(ACTION_KEY).map(([action, actionKey]) => [actionKey, action]),
) as Record<string, Exclude<BookingAiProposalAction, 'NONE'>>;
const EXPLICIT_REQUEST_ACTIONS = new Set<BookingAiProposalAction>(['CREATE','RESCHEDULE','CANCEL','SCHEDULE_REMINDER']);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optional(value: unknown, max = 500) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0,max) : undefined;
}

function normalizeText(value: unknown) {
  return String(value ?? '').replace(/\s+/g,' ').trim().toLocaleLowerCase();
}

function validIso(value: string | undefined) {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

export function extractBookingAiProposal(results: AgentResult[]): BookingAiProposal | null {
  const orchestrator = results.find((row) => row.agent === 'decision_orchestrator');
  const raw = record(orchestrator?.data).booking_tool_proposal;
  const input = record(raw);
  const action = String(input.action ?? 'NONE').trim().toUpperCase() as BookingAiProposalAction;
  const allowed: BookingAiProposalAction[] = [
    'NONE','CHECK_AVAILABILITY','CREATE','RESCHEDULE','CANCEL',
    'SCHEDULE_REMINDER','ESCALATE','DEPOSIT_REQUIREMENT',
  ];
  if (!allowed.includes(action)) return null;
  return {
    action,
    serviceId: optional(input.serviceId,120),
    bookingId: optional(input.bookingId,80),
    branchId: optional(input.branchId,80),
    startsAt: optional(input.startsAt,80),
    from: optional(input.from,80),
    to: optional(input.to,80),
    reminderAt: optional(input.reminderAt,80),
    reason: optional(input.reason,500),
    explicitCustomerRequest: input.explicitCustomerRequest === true,
  };
}

export function bookingProposalToAgentToolProposal(
  proposal: BookingAiProposal | null,
): AgentToolProposal | null {
  if (!proposal || proposal.action === 'NONE') return null;
  const actionKey = ACTION_KEY[proposal.action];
  return {
    actionKey,
    proposedBy: 'decision_orchestrator',
    mutation: MUTATIONS.has(proposal.action),
    input: {
      action: proposal.action,
      ...(proposal.serviceId ? { serviceId: proposal.serviceId } : {}),
      ...(proposal.bookingId ? { bookingId: proposal.bookingId } : {}),
      ...(proposal.branchId ? { branchId: proposal.branchId } : {}),
      ...(proposal.startsAt ? { startsAt: proposal.startsAt } : {}),
      ...(proposal.from ? { from: proposal.from } : {}),
      ...(proposal.to ? { to: proposal.to } : {}),
      ...(proposal.reminderAt ? { reminderAt: proposal.reminderAt } : {}),
      ...(proposal.reason ? { reason: proposal.reason } : {}),
      explicitCustomerRequest: proposal.explicitCustomerRequest,
    },
  };
}

export function agentToolProposalToBookingProposal(
  proposal: AgentToolProposal,
): BookingAiProposal | null {
  const action = ACTION_BY_KEY[proposal.actionKey];
  if (!action || proposal.proposedBy !== 'decision_orchestrator') return null;
  const input = record(proposal.input);
  const declaredAction = String(input.action ?? action).trim().toUpperCase();
  if (declaredAction !== action) return null;
  return {
    action,
    serviceId: optional(input.serviceId, 120),
    bookingId: optional(input.bookingId, 80),
    branchId: optional(input.branchId, 80),
    startsAt: optional(input.startsAt, 80),
    from: optional(input.from, 80),
    to: optional(input.to, 80),
    reminderAt: optional(input.reminderAt, 80),
    reason: optional(input.reason, 500),
    explicitCustomerRequest: input.explicitCustomerRequest === true,
  };
}

async function canonicalConversation(input: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
}) {
  const {data: conversation,error} = await input.supabase.from('sales_conversations')
    .select('id,lead_id,person_id,channel')
    .eq('organization_id',input.organizationId)
    .eq('id',input.conversationId)
    .maybeSingle();
  if (error || !conversation) throw new Error(error?.message ?? 'Canonical conversation was not found');

  let personId = conversation.person_id ? String(conversation.person_id) : undefined;
  const leadId = conversation.lead_id ? String(conversation.lead_id) : undefined;
  if (!personId && leadId) {
    const lead = await input.supabase.from('leads')
      .select('person_id')
      .eq('organization_id',input.organizationId)
      .eq('id',leadId)
      .maybeSingle();
    if (lead.error) throw new Error(lead.error.message);
    personId = lead.data?.person_id ? String(lead.data.person_id) : undefined;
  }
  return {
    id:String(conversation.id),
    leadId,
    personId,
    channel:String(conversation.channel ?? '').toUpperCase(),
  };
}

async function matchingInboundEvidence(input: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
  leadId?: string;
  channel: string;
  message: string;
}) {
  const expected = normalizeText(input.message);
  if (!expected) return null;

  const messages = await input.supabase.from('conversation_messages')
    .select('id,original_text,transcript,created_at')
    .eq('organization_id',input.organizationId)
    .eq('conversation_id',input.conversationId)
    .eq('direction','INBOUND')
    .eq('status','RECEIVED')
    .order('created_at',{ascending:false})
    .limit(10);
  if (messages.error) throw new Error(messages.error.message);
  const messageMatch = (messages.data ?? []).find(row =>
    normalizeText(row.original_text) === expected || normalizeText(row.transcript) === expected
  );
  if (messageMatch) {
    return {source:'CONVERSATION_MESSAGE',sourceMessageId:String(messageMatch.id),createdAt:messageMatch.created_at};
  }

  if (!input.leadId) return null;
  const outreach = await input.supabase.from('outreach_messages')
    .select('id,body,received_at,created_at')
    .eq('organization_id',input.organizationId)
    .eq('lead_id',input.leadId)
    .eq('channel',input.channel)
    .eq('direction','INBOUND')
    .eq('status','RECEIVED')
    .order('created_at',{ascending:false})
    .limit(10);
  if (outreach.error) throw new Error(outreach.error.message);
  const outreachMatch = (outreach.data ?? []).find(row => normalizeText(row.body) === expected);
  return outreachMatch
    ? {source:'OUTREACH_MESSAGE',sourceMessageId:String(outreachMatch.id),createdAt:outreachMatch.received_at ?? outreachMatch.created_at}
    : null;
}

async function assertRegistry(input: {
  supabase: SupabaseClient;
  actionKey: string;
}) {
  const {data,error} = await input.supabase.from('tool_action_registry')
    .select('action_key,availability,metadata')
    .eq('action_key',input.actionKey)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? 'Booking AI action contract was not found');
  const metadata = record(data.metadata);
  const surfaces = Array.isArray(metadata.executionSurfaces) ? metadata.executionSurfaces.map(String) : [];
  if (data.availability !== 'AVAILABLE' || !surfaces.includes('AI')) {
    throw new Error('Booking AI action is not available on AI execution surface');
  }
}

async function assertBookingLinked(input: {
  supabase: SupabaseClient;
  organizationId: string;
  bookingId: string;
  personId?: string;
}) {
  if (!input.personId) throw new Error('Canonical CRM Person linkage is required for Booking action');
  const {data,error} = await input.supabase.from('bookings')
    .select('id,service_id,status,person_id,branch_id,starts_at')
    .eq('organization_id',input.organizationId)
    .eq('id',input.bookingId)
    .eq('person_id',input.personId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? 'Booking is not linked to the current customer');
  return data;
}

async function audit(input: {
  supabase: SupabaseClient;
  organizationId: string;
  actionKey: string;
  conversationId: string;
  entityId?: string;
  requestKey: string;
  evidence: Record<string,unknown>;
  result: BookingAiToolResult;
}) {
  const {error} = await input.supabase.rpc('record_booking_ai_tool_audit',{
    p_organization_id:input.organizationId,
    p_action_key:input.actionKey,
    p_conversation_id:input.conversationId,
    p_entity_id:input.entityId ?? null,
    p_request_key:input.requestKey,
    p_evidence:input.evidence,
    p_result:input.result,
  });
  if (error && error.code !== 'PGRST202') throw new Error(`Booking AI audit failed: ${error.message}`);
}

function clarification(action: BookingAiProposalAction, actionKey: string, message: string): BookingAiToolResult {
  return {action,actionKey,status:'CLARIFICATION_REQUIRED',executed:false,mutation:MUTATIONS.has(action),requiresReview:false,error:message};
}

export async function executeBookingAiTool(input: {
  supabase: SupabaseClient;
  organizationId: string;
  conversationId: string;
  leadId?: string;
  message: string;
  requestKey: string;
  shadowMode: boolean;
  proposal: BookingAiProposal;
}): Promise<BookingAiToolResult> {
  const proposal=input.proposal;
  if (proposal.action==='NONE') {
    return {action:'NONE',status:'NO_ACTION',executed:false,mutation:false,requiresReview:false};
  }

  const actionKey=ACTION_KEY[proposal.action];
  const mutation=MUTATIONS.has(proposal.action);
  let evidence:Record<string,unknown>={};
  let entityId=proposal.bookingId;
  try {
    await assertRegistry({supabase:input.supabase,actionKey});
    const conversation=await canonicalConversation({
      supabase:input.supabase,
      organizationId:input.organizationId,
      conversationId:input.conversationId,
    });
    if (input.leadId && conversation.leadId && input.leadId!==conversation.leadId) {
      throw new Error('Booking AI lead/conversation linkage mismatch');
    }

    const inbound=await matchingInboundEvidence({
      supabase:input.supabase,
      organizationId:input.organizationId,
      conversationId:input.conversationId,
      leadId:conversation.leadId,
      channel:conversation.channel,
      message:input.message,
    });
    evidence={
      explicitCustomerRequest:proposal.explicitCustomerRequest,
      inboundVerified:Boolean(inbound),
      source:inbound?.source ?? null,
      sourceMessageId:inbound?.sourceMessageId ?? null,
      conversationId:input.conversationId,
      agentRequestKey:input.requestKey,
    };

    if (EXPLICIT_REQUEST_ACTIONS.has(proposal.action)
        && (!proposal.explicitCustomerRequest || !inbound)) {
      const result:BookingAiToolResult={
        action:proposal.action,actionKey,status:'BLOCKED',executed:false,mutation,
        requiresReview:true,evidence,error:'Explicit current customer request evidence is required',
      };
      await audit({...input,actionKey,entityId,evidence,result});
      return result;
    }

    if (mutation && input.shadowMode) {
      const result:BookingAiToolResult={
        action:proposal.action,actionKey,status:'SHADOW_BLOCKED',executed:false,mutation:true,
        requiresReview:true,evidence,error:'Shadow Mode blocks autonomous Booking mutation',
      };
      await audit({...input,actionKey,entityId,evidence,result});
      return result;
    }

    if (proposal.action==='CHECK_AVAILABILITY') {
      if (!proposal.serviceId || !validIso(proposal.from) || !validIso(proposal.to)) {
        return clarification(proposal.action,actionKey,'serviceId, from and to are required for availability');
      }
      const from=Date.parse(proposal.from!);
      const to=Date.parse(proposal.to!);
      if (to<=from || to-from>31*24*60*60*1000) {
        return clarification(proposal.action,actionKey,'Availability window must be positive and at most 31 days');
      }
      const query=await input.supabase.rpc('get_booking_availability',{
        p_organization_id:input.organizationId,
        p_service_id:proposal.serviceId,
        p_branch_id:proposal.branchId ?? null,
        p_from:proposal.from,
        p_to:proposal.to,
        p_limit:50,
      });
      if (query.error) throw new Error(query.error.message);
      const result:BookingAiToolResult={
        action:proposal.action,actionKey,status:'SUCCEEDED',executed:true,mutation:false,requiresReview:false,evidence,
        result:{slots:query.data ?? [],count:(query.data ?? []).length},
      };
      await audit({...input,actionKey,entityId:input.conversationId,evidence,result});
      return result;
    }

    if (proposal.action==='DEPOSIT_REQUIREMENT') {
      if (!proposal.serviceId) return clarification(proposal.action,actionKey,'serviceId is required for deposit policy');
      const query=await input.supabase.rpc('get_booking_deposit_requirement',{
        p_organization_id:input.organizationId,
        p_service_id:proposal.serviceId,
      });
      if (query.error) throw new Error(query.error.message);
      const result:BookingAiToolResult={
        action:proposal.action,actionKey,status:'SUCCEEDED',executed:true,mutation:false,requiresReview:false,evidence,
        result:record(query.data),
      };
      await audit({...input,actionKey,entityId:input.conversationId,evidence,result});
      return result;
    }

    if (proposal.action==='CREATE') {
      if (!conversation.personId || !proposal.serviceId || !validIso(proposal.startsAt)) {
        return clarification(proposal.action,actionKey,'Canonical person, serviceId and startsAt are required to create Booking');
      }
      const call=await input.supabase.rpc('execute_booking_ai_create',{
        p_organization_id:input.organizationId,
        p_conversation_id:input.conversationId,
        p_person_id:conversation.personId,
        p_lead_id:conversation.leadId ?? null,
        p_service_id:proposal.serviceId,
        p_branch_id:proposal.branchId ?? null,
        p_starts_at:proposal.startsAt,
        p_request_key:input.requestKey,
        p_evidence:evidence,
      });
      if (call.error) throw new Error(call.error.message);
      const payload=record(call.data);
      entityId=optional(payload.bookingId,80);
      const result:BookingAiToolResult={
        action:proposal.action,actionKey,status:'SUCCEEDED',executed:true,mutation:true,requiresReview:true,evidence,result:payload,
      };
      await audit({...input,actionKey,entityId,evidence,result});
      return result;
    }

    if (proposal.action==='RESCHEDULE') {
      if (!proposal.bookingId || !validIso(proposal.startsAt)) {
        return clarification(proposal.action,actionKey,'bookingId and startsAt are required to reschedule');
      }
      const booking=await assertBookingLinked({
        supabase:input.supabase,organizationId:input.organizationId,
        bookingId:proposal.bookingId,personId:conversation.personId,
      });
      const call=await input.supabase.rpc('execute_booking_ai_reschedule',{
        p_organization_id:input.organizationId,
        p_conversation_id:input.conversationId,
        p_booking_id:proposal.bookingId,
        p_branch_id:proposal.branchId ?? booking.branch_id ?? null,
        p_starts_at:proposal.startsAt,
        p_reason:proposal.reason ?? 'CUSTOMER_REQUEST_VIA_AI',
        p_request_key:input.requestKey,
        p_evidence:evidence,
      });
      if (call.error) throw new Error(call.error.message);
      const result:BookingAiToolResult={
        action:proposal.action,actionKey,status:'SUCCEEDED',executed:true,mutation:true,requiresReview:true,evidence,result:record(call.data),
      };
      await audit({...input,actionKey,entityId:proposal.bookingId,evidence,result});
      return result;
    }

    if (proposal.action==='CANCEL') {
      if (!proposal.bookingId) return clarification(proposal.action,actionKey,'bookingId is required to cancel');
      await assertBookingLinked({
        supabase:input.supabase,organizationId:input.organizationId,
        bookingId:proposal.bookingId,personId:conversation.personId,
      });
      const call=await input.supabase.rpc('execute_booking_ai_cancel',{
        p_organization_id:input.organizationId,
        p_conversation_id:input.conversationId,
        p_booking_id:proposal.bookingId,
        p_reason:proposal.reason ?? 'CUSTOMER_REQUEST_VIA_AI',
        p_request_key:input.requestKey,
        p_evidence:evidence,
      });
      if (call.error) throw new Error(call.error.message);
      const result:BookingAiToolResult={
        action:proposal.action,actionKey,status:'SUCCEEDED',executed:true,mutation:true,requiresReview:true,evidence,result:record(call.data),
      };
      await audit({...input,actionKey,entityId:proposal.bookingId,evidence,result});
      return result;
    }

    if (proposal.action==='SCHEDULE_REMINDER') {
      if (!proposal.bookingId || !validIso(proposal.reminderAt)) {
        return clarification(proposal.action,actionKey,'bookingId and reminderAt are required');
      }
      const booking=await assertBookingLinked({
        supabase:input.supabase,organizationId:input.organizationId,
        bookingId:proposal.bookingId,personId:conversation.personId,
      });
      const reminderAt=Date.parse(proposal.reminderAt!);
      if (reminderAt<=Date.now() || (booking.starts_at && reminderAt>=Date.parse(String(booking.starts_at)))) {
        return clarification(proposal.action,actionKey,'Reminder must be in the future and before Booking start');
      }
      const sourceEventKey=`${input.requestKey}:booking-reminder`;
      const call=await input.supabase.rpc('enqueue_automation_runtime_event',{
        p_organization_id:input.organizationId,
        p_trigger_key:'SCHEDULE_DUE',
        p_source_event_key:sourceEventKey,
        p_subject_type:'CONVERSATION',
        p_subject_id:input.conversationId,
        p_trigger_payload:{
          kind:'BOOKING_REMINDER',
          bookingId:proposal.bookingId,
          bookingStatus:booking.status,
          bookingStartsAt:booking.starts_at,
          serviceId:booking.service_id,
        },
        p_scheduled_at:proposal.reminderAt,
      });
      if (call.error) throw new Error(call.error.message);
      const payload=record(call.data);
      const enqueued=Number(payload.enqueued ?? 0);
      const result:BookingAiToolResult={
        action:proposal.action,actionKey,
        status:enqueued>0?'SUCCEEDED':'CONFIGURATION_REQUIRED',
        executed:enqueued>0,mutation:false,requiresReview:false,evidence,
        result:{...payload,scheduled:enqueued>0,providerSendAuthority:'SEND_FOLLOWUP'},
        ...(enqueued>0?{}:{error:'No enabled SCHEDULE_DUE workflow matched; no reminder send was scheduled'}),
      };
      await audit({...input,actionKey,entityId:proposal.bookingId,evidence,result});
      return result;
    }

    if (proposal.action==='ESCALATE') {
      if (!proposal.bookingId) return clarification(proposal.action,actionKey,'bookingId is required to escalate');
      await assertBookingLinked({
        supabase:input.supabase,organizationId:input.organizationId,
        bookingId:proposal.bookingId,personId:conversation.personId,
      });
      const call=await input.supabase.rpc('create_automation_operator_brief',{
        p_organization_id:input.organizationId,
        p_conversation_id:input.conversationId,
        p_message_id:inbound?.source==='CONVERSATION_MESSAGE' ? inbound.sourceMessageId : null,
        p_request_key:`${input.requestKey}:booking-escalate`,
        p_brief_type:'HANDOFF',
        p_title:'Booking requires operator attention',
        p_summary:(proposal.reason ?? 'Booking request requires human review').slice(0,4000),
        p_details:{bookingId:proposal.bookingId,source:'BOOKING_AI'},
        p_requires_action:true,
      });
      if (call.error) throw new Error(call.error.message);
      const payload=record(call.data);
      const result:BookingAiToolResult={
        action:proposal.action,actionKey,status:'SUCCEEDED',executed:true,mutation:false,requiresReview:true,evidence,result:payload,
      };
      await audit({...input,actionKey,entityId:proposal.bookingId,evidence,result});
      return result;
    }

    return {action:proposal.action,actionKey,status:'NO_ACTION',executed:false,mutation:false,requiresReview:false};
  } catch (error) {
    const result:BookingAiToolResult={
      action:proposal.action,actionKey,status:'BLOCKED',executed:false,mutation,requiresReview:true,evidence,
      error:error instanceof Error ? error.message.slice(0,800) : 'Booking AI action failed closed',
    };
    try { await audit({...input,actionKey,entityId,evidence,result}); } catch {}
    return result;
  }
}
