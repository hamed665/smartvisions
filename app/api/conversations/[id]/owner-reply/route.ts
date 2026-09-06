import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getCurrentOrganization } from '@/lib/supabase/org';
import {
  evaluateOwnerManualReplyAccess,
  normalizeOwnerReplyText,
  ownerManualReplyIdempotencyKey,
} from '@/lib/outreach/owner-manual-reply';
import {
  assertCanonicalSendAllowed,
  normalizeCanonicalPhone,
} from '@/lib/outreach/canonical-send-gate';
import { MetaCloudWhatsAppProvider } from '@/lib/whatsapp/meta-cloud';
import {
  assertPaidOperationAllowed,
  getCostGuardState,
  recordUsage,
} from '@/lib/reliability/cost-guard';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for owner manual replies');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function validRequestId(value: unknown) {
  if (typeof value !== 'string') return null;
  const requestId = value.trim();
  return /^[A-Za-z0-9:_-]{8,160}$/.test(requestId) ? requestId : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let organizationId: string | null = null;
  let userId: string | null = null;
  let messageId: string | null = null;
  let providerAccepted = false;
  let providerMessageId: string | null = null;

  try {
    const { id: conversationId } = await params;
    const owner = await getCurrentOrganization(true);
    organizationId = owner.organizationId;
    userId = owner.userId;

    const body = await request.json() as { text?: unknown; requestId?: unknown };
    const text = normalizeOwnerReplyText(body.text);
    const requestId = validRequestId(body.requestId);
    if (!requestId) {
      return NextResponse.json({ error: 'A valid requestId is required' }, { status: 400 });
    }

    const supabase = serviceClient();
    const { data: existing, error: existingError } = await supabase
      .from('conversation_messages')
      .select('id,status,provider_message_id,approval_reason')
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversationId)
      .contains('metadata', { source: 'OWNER_MANUAL_REPLY', owner_request_id: requestId })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(`Owner reply idempotency lookup failed: ${existingError.message}`);
    if (existing) {
      const sent = existing.status === 'SENT';
      return NextResponse.json({
        sent,
        replayed: true,
        messageId: existing.id,
        status: existing.status,
        providerMessageId: existing.provider_message_id,
        error: sent ? undefined : existing.approval_reason ?? 'This request was already claimed and will not be retried automatically',
      }, { status: sent ? 200 : 409 });
    }

    const { data: conversation, error: conversationError } = await supabase
      .from('sales_conversations')
      .select('id,lead_id,channel,stage,agent_mode,requires_human,detected_language,detected_dialect')
      .eq('organization_id', organizationId)
      .eq('id', conversationId)
      .maybeSingle();
    if (conversationError || !conversation) {
      return NextResponse.json({ error: conversationError?.message ?? 'Conversation not found' }, { status: 404 });
    }
    if (!conversation.lead_id) {
      return NextResponse.json({ error: 'Conversation has no linked lead' }, { status: 409 });
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id,business_id,status,agent_mode')
      .eq('organization_id', organizationId)
      .eq('id', conversation.lead_id)
      .maybeSingle();
    if (leadError || !lead) {
      return NextResponse.json({ error: leadError?.message ?? 'Linked lead not found' }, { status: 409 });
    }
    if (!lead.business_id) {
      return NextResponse.json({ error: 'Linked lead has no canonical business' }, { status: 409 });
    }

    const access = evaluateOwnerManualReplyAccess({
      channel: conversation.channel,
      leadStatus: lead.status,
      leadAgentMode: lead.agent_mode,
      conversationStage: conversation.stage,
      conversationAgentMode: conversation.agent_mode,
      conversationRequiresHuman: Boolean(conversation.requires_human),
    });
    if (!access.allowed) {
      return NextResponse.json({ error: 'Owner manual reply is not allowed', blocks: access.blocks }, { status: 409 });
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id,country_code,whatsapp,phone')
      .eq('organization_id', organizationId)
      .eq('id', lead.business_id)
      .maybeSingle();
    if (businessError || !business) {
      return NextResponse.json({ error: businessError?.message ?? 'Canonical business not found' }, { status: 409 });
    }

    const recipient = normalizeCanonicalPhone(business.whatsapp) || normalizeCanonicalPhone(business.phone);
    if (recipient.length < 8) {
      return NextResponse.json({ error: 'Canonical WhatsApp recipient is unavailable' }, { status: 409 });
    }

    const { data: providerConnection, error: providerError } = await supabase
      .from('integration_connections')
      .select('enabled,status,last_error')
      .eq('organization_id', organizationId)
      .eq('provider', 'META')
      .eq('channel', 'WHATSAPP')
      .maybeSingle();
    if (providerError || !providerConnection || !providerConnection.enabled || providerConnection.status !== 'CONNECTED') {
      return NextResponse.json({
        error: providerError?.message ?? 'WhatsApp provider is not production-verified CONNECTED',
        providerStatus: providerConnection?.status ?? 'MISSING',
      }, { status: 409 });
    }

    const preflight = await assertCanonicalSendAllowed({
      supabase,
      organizationId,
      leadId: lead.id,
      conversationId,
      channel: 'WHATSAPP',
      recipient,
      ownerManualSendVerified: true,
    });
    if (!preflight.whatsappPolicy?.allowed || preflight.whatsappPolicy.mode !== 'FREEFORM') {
      return NextResponse.json({ error: 'Owner manual WhatsApp reply requires an open 24-hour customer service window' }, { status: 409 });
    }

    const costState = await getCostGuardState(organizationId);
    assertPaidOperationAllowed(costState, 'NORMAL');

    const idempotencyKey = ownerManualReplyIdempotencyKey(conversationId, requestId);
    const { data: inserted, error: insertError } = await supabase
      .from('conversation_messages')
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        lead_id: lead.id,
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        media_type: 'TEXT',
        original_text: text,
        reply_language: conversation.detected_language ?? null,
        reply_dialect: conversation.detected_dialect ?? null,
        requires_approval: false,
        status: 'PROCESSING',
        processed_at: new Date().toISOString(),
        metadata: {
          source: 'OWNER_MANUAL_REPLY',
          owner_request_id: requestId,
          idempotency_key: idempotencyKey,
          owner_user_id: userId,
          send_context: {
            to: recipient,
            market_code: preflight.marketCode,
            last_customer_message_at: preflight.lastInboundAt,
          },
        },
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      const { data: raced } = await supabase
        .from('conversation_messages')
        .select('id,status,provider_message_id,approval_reason')
        .eq('organization_id', organizationId)
        .eq('conversation_id', conversationId)
        .contains('metadata', { source: 'OWNER_MANUAL_REPLY', owner_request_id: requestId })
        .limit(1)
        .maybeSingle();
      if (raced) {
        return NextResponse.json({
          sent: raced.status === 'SENT',
          replayed: true,
          messageId: raced.id,
          status: raced.status,
          providerMessageId: raced.provider_message_id,
          error: raced.status === 'SENT' ? undefined : raced.approval_reason ?? 'This request is already in progress or failed; no automatic retry was attempted',
        }, { status: raced.status === 'SENT' ? 200 : 409 });
      }
      throw new Error(`Owner reply journal insert failed: ${insertError?.message ?? 'no row returned'}`);
    }
    messageId = inserted.id;

    // Re-check every canonical safety condition immediately before crossing the provider boundary.
    const finalGate = await assertCanonicalSendAllowed({
      supabase,
      organizationId,
      leadId: lead.id,
      conversationId,
      channel: 'WHATSAPP',
      recipient,
      ownerManualSendVerified: true,
    });
    if (!finalGate.whatsappPolicy?.allowed || finalGate.whatsappPolicy.mode !== 'FREEFORM') {
      throw new Error('WhatsApp canonical 24-hour policy blocks this owner manual reply');
    }
    const finalCostState = await getCostGuardState(organizationId);
    assertPaidOperationAllowed(finalCostState, 'NORMAL');

    const provider = new MetaCloudWhatsAppProvider();
    const result = await provider.sendText({ to: recipient, text });
    providerAccepted = true;
    providerMessageId = result.providerMessageId;

    const accepted = await supabase
      .from('conversation_messages')
      .update({
        status: 'SENT',
        provider_message_id: providerMessageId,
        sent_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        approval_reason: null,
      })
      .eq('organization_id', organizationId)
      .eq('id', messageId)
      .eq('status', 'PROCESSING');
    if (accepted.error) {
      return NextResponse.json({
        sent: true,
        providerAccepted: true,
        providerMessageId,
        messageId,
        warning: `Provider accepted the message but local reconciliation needs attention: ${accepted.error.message}`,
        retryPolicy: 'RECONCILIATION_ONLY',
      }, { status: 202 });
    }

    const eventWrite = await supabase.from('whatsapp_events').upsert({
      organization_id: organizationId,
      lead_id: lead.id,
      conversation_id: conversationId,
      provider_message_id: providerMessageId,
      direction: 'OUTBOUND',
      event_type: 'TEXT_SENT',
      payload: { source: 'OWNER_MANUAL_REPLY', owner_request_id: requestId },
    }, { onConflict: 'organization_id,provider_message_id,direction,event_type', ignoreDuplicates: true });

    const now = new Date().toISOString();
    const conversationUpdate = await supabase
      .from('sales_conversations')
      .update({
        last_outbound_at: now,
        last_message_at: now,
        awaiting_party: 'CUSTOMER',
        unread_count: 0,
        updated_at: now,
      })
      .eq('organization_id', organizationId)
      .eq('id', conversationId);

    const auditWrite = await supabase.from('audit_logs').insert({
      organization_id: organizationId,
      actor_type: 'USER',
      actor_id: userId,
      action: 'OWNER_MANUAL_REPLY_SENT',
      entity_type: 'conversation_message',
      entity_id: messageId,
      after_data: {
        conversation_id: conversationId,
        lead_id: lead.id,
        channel: 'WHATSAPP',
        provider_message_id: providerMessageId,
        character_count: text.length,
        owner_request_id: requestId,
      },
    });

    let usageError: string | null = null;
    try {
      await recordUsage({
        organizationId,
        provider: 'WHATSAPP',
        operation: 'SEND_TEXT',
        costUsd: 0,
        units: 1,
        leadId: lead.id,
        metadata: {
          source: 'OWNER_MANUAL_REPLY',
          pricing_status: 'PENDING_RECONCILIATION',
          canonical_last_inbound_at: finalGate.lastInboundAt,
        },
      });
    } catch (error) {
      usageError = error instanceof Error ? error.message : 'Usage reconciliation failed';
    }

    const reconciliationWarnings = [
      eventWrite.error ? `whatsapp_events: ${eventWrite.error.message}` : null,
      conversationUpdate.error ? `conversation: ${conversationUpdate.error.message}` : null,
      auditWrite.error ? `audit: ${auditWrite.error.message}` : null,
      usageError ? `usage: ${usageError}` : null,
    ].filter(Boolean);

    return NextResponse.json({
      sent: true,
      providerAccepted: true,
      providerMessageId,
      messageId,
      requestId,
      retryPolicy: 'NO_AUTOMATIC_RETRY',
      ...(reconciliationWarnings.length ? { reconciliationWarnings } : {}),
    }, { status: reconciliationWarnings.length ? 202 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Owner manual reply failed';

    if (organizationId && messageId && !providerAccepted) {
      const supabase = serviceClient();
      await supabase
        .from('conversation_messages')
        .update({
          status: 'FAILED',
          approval_reason: message.slice(0, 500),
          processed_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .eq('id', messageId)
        .eq('status', 'PROCESSING');
    }

    return NextResponse.json({
      error: message,
      providerAccepted,
      providerMessageId,
      messageId,
      retryPolicy: providerAccepted ? 'RECONCILIATION_ONLY' : 'NO_AUTOMATIC_RETRY',
    }, { status: providerAccepted ? 202 : 409 });
  }
}
