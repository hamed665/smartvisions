import { createClient } from '@supabase/supabase-js';
import type { ResendWebhookEvent } from './resend-webhook';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for email lifecycle');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function resolveEmailOrganizationId() {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('integration_connections')
    .select('organization_id')
    .eq('provider', 'EMAIL_PROVIDER')
    .eq('channel', 'EMAIL')
    .eq('enabled', true)
    .limit(2);
  if (error) throw new Error(`Email integration lookup failed: ${error.message}`);
  if (!data || data.length !== 1) throw new Error('Email webhook requires exactly one enabled EMAIL_PROVIDER/EMAIL integration');
  return String(data[0].organization_id);
}

function normalizeAddress(value?: string) {
  if (!value) return undefined;
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

export function shouldReplayEmailSideEffects(insertedCount: number) {
  return insertedCount >= 0;
}

async function fetchReceivedEmail(emailId: string) {
  const key = process.env.EMAIL_PROVIDER_API_KEY?.trim();
  if (!key) throw new Error('EMAIL_PROVIDER_API_KEY is required to retrieve inbound email content');
  const response = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend inbound retrieval failed (${response.status}): ${detail.slice(0, 500)}`);
  }
  return response.json() as Promise<{
    id: string;
    from?: string;
    to?: string[];
    subject?: string;
    text?: string | null;
    html?: string | null;
    message_id?: string;
    created_at?: string;
  }>;
}

async function matchLeadByEmail(organizationId: string, email: string) {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('businesses')
    .select('id,leads(id,status,agent_mode)')
    .eq('organization_id', organizationId)
    .ilike('email', email)
    .limit(2);
  if (error) throw new Error(`Email lead match failed: ${error.message}`);
  if (!data || data.length !== 1) return null;
  const leads = Array.isArray(data[0].leads) ? data[0].leads : [];
  if (leads.length !== 1) return null;
  return leads[0] as { id: string; status: string; agent_mode: string };
}

async function ensureConversation(organizationId: string, leadId: string) {
  const supabase = serviceClient();
  const { data: existing, error: existingError } = await supabase
    .from('sales_conversations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .eq('channel', 'EMAIL')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(`Email conversation lookup failed: ${existingError.message}`);
  if (existing) return String(existing.id);
  const { data, error } = await supabase
    .from('sales_conversations')
    .insert({ organization_id: organizationId, lead_id: leadId, channel: 'EMAIL' })
    .select('id')
    .single();
  if (error) throw new Error(`Email conversation create failed: ${error.message}`);
  return String(data.id);
}

async function cancelFollowups(organizationId: string, leadId: string) {
  const supabase = serviceClient();
  const { error } = await supabase
    .from('followup_jobs')
    .update({ status: 'CANCELLED', stop_reason: 'CUSTOMER_REPLIED' })
    .eq('organization_id', organizationId)
    .eq('lead_id', leadId)
    .eq('status', 'PENDING');
  if (error) throw new Error(`Email follow-up cancellation failed: ${error.message}`);
}

async function suppressEmail(organizationId: string, email: string, reason: string) {
  const supabase = serviceClient();
  const { data: existing, error: findError } = await supabase
    .from('suppression_list')
    .select('id')
    .eq('organization_id', organizationId)
    .ilike('email', email)
    .limit(1)
    .maybeSingle();
  if (findError) throw new Error(`Suppression lookup failed: ${findError.message}`);
  if (existing) return;
  const { error } = await supabase.from('suppression_list').insert({
    organization_id: organizationId,
    email,
    reason,
    source: 'RESEND_WEBHOOK',
  });
  if (error) throw new Error(`Suppression insert failed: ${error.message}`);
}

export async function persistResendWebhookEvent(event: ResendWebhookEvent) {
  const organizationId = await resolveEmailOrganizationId();
  const supabase = serviceClient();

  const { data: inserted, error: insertError } = await supabase
    .from('email_events')
    .upsert({
      organization_id: organizationId,
      provider: 'RESEND',
      provider_event_id: event.eventId,
      provider_message_id: event.providerMessageId ?? null,
      event_type: event.eventType,
      payload: event.raw,
      created_at: event.occurredAt,
    }, { onConflict: 'organization_id,provider,provider_event_id', ignoreDuplicates: true })
    .select('id');
  if (insertError) throw new Error(`Email event persistence failed: ${insertError.message}`);
  const duplicate = !inserted || inserted.length === 0;

  // A duplicate ledger row does not imply side effects completed. Every side effect below is
  // written idempotently, so webhook retries are deliberately replayed to recover from a
  // transient failure that happened after the durable event row was first inserted.
  if (event.eventType === 'email.received' && event.providerMessageId) {
    const received = await fetchReceivedEmail(event.providerMessageId);
    const from = normalizeAddress(received.from ?? event.from);
    if (!from) return { duplicate, organizationId, linked: false };
    const lead = await matchLeadByEmail(organizationId, from);
    if (!lead) return { duplicate, organizationId, linked: false };

    const conversationId = await ensureConversation(organizationId, lead.id);
    const body = received.text?.trim() || '[HTML email received]';
    const { error: messageError } = await supabase.from('outreach_messages').upsert({
      organization_id: organizationId,
      lead_id: lead.id,
      channel: 'EMAIL',
      direction: 'INBOUND',
      status: 'RECEIVED',
      provider_message_id: received.id,
      provider_thread_id: received.message_id ?? event.messageId ?? null,
      subject: received.subject ?? event.subject ?? null,
      body,
      idempotency_key: `resend:inbound:${received.id}`,
      received_at: received.created_at ?? event.occurredAt,
      metadata: {
        from,
        to: normalizeAddress(received.to?.[0] ?? event.to) ?? '',
        conversationId,
        hasHtml: Boolean(received.html),
      },
    }, { onConflict: 'organization_id,idempotency_key', ignoreDuplicates: true });
    if (messageError) throw new Error(`Inbound email message persistence failed: ${messageError.message}`);

    const { error: conversationError } = await supabase.from('sales_conversations').update({
      last_message_at: received.created_at ?? event.occurredAt,
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId).eq('organization_id', organizationId);
    if (conversationError) throw new Error(`Email conversation update failed: ${conversationError.message}`);

    if (!['WON','LOST','DO_NOT_CONTACT','HUMAN'].includes(lead.status)) {
      const { error: leadError } = await supabase
        .from('leads')
        .update({ status: 'REPLIED', updated_at: new Date().toISOString() })
        .eq('id', lead.id)
        .eq('organization_id', organizationId);
      if (leadError) throw new Error(`Email lead status update failed: ${leadError.message}`);
    }
    await cancelFollowups(organizationId, lead.id);
    return { duplicate, organizationId, linked: true, leadId: lead.id, conversationId };
  }

  if (event.providerMessageId) {
    const mappedStatus: Record<string, string> = {
      'email.sent': 'SENT',
      'email.delivered': 'DELIVERED',
      'email.bounced': 'BOUNCED',
      'email.complained': 'COMPLAINED',
      'email.failed': 'FAILED',
      'email.suppressed': 'SUPPRESSED',
    };
    const status = mappedStatus[event.eventType];
    if (status) {
      const { error } = await supabase
        .from('outreach_messages')
        .update({ status })
        .eq('organization_id', organizationId)
        .eq('provider_message_id', event.providerMessageId)
        .eq('direction', 'OUTBOUND');
      if (error) throw new Error(`Outbound email status update failed: ${error.message}`);
    }
  }

  const recipient = normalizeAddress(event.to);
  if (recipient && (event.eventType === 'email.bounced' || event.eventType === 'email.complained' || event.eventType === 'email.suppressed')) {
    await suppressEmail(organizationId, recipient, event.eventType.toUpperCase());
  }

  return { duplicate, organizationId, linked: false };
}
