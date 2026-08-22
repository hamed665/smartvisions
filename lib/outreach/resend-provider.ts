import { createClient } from '@supabase/supabase-js';
import type { DeliveryEvent, EmailProvider, InboundReply, OutboundMessage } from './provider';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for email provider operations');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function apiKey() {
  const provider = (process.env.EMAIL_PROVIDER || '').trim().toUpperCase();
  const key = process.env.EMAIL_PROVIDER_API_KEY?.trim();
  if (provider !== 'RESEND') throw new Error('EMAIL_PROVIDER must be RESEND');
  if (!key) throw new Error('EMAIL_PROVIDER_API_KEY is required');
  return key;
}

async function resolveMailbox(mailboxId: string) {
  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('mailboxes')
    .select('id,organization_id,address,enabled')
    .eq('id', mailboxId)
    .maybeSingle();
  if (error) throw new Error(`Mailbox lookup failed: ${error.message}`);
  if (!data) throw new Error('Mailbox not found');
  if (!data.enabled) throw new Error('Mailbox is disabled');
  return data;
}

function statusFromEventType(eventType: string): DeliveryEvent['status'] | null {
  switch (eventType) {
    case 'email.sent': return 'sent';
    case 'email.delivered': return 'delivered';
    case 'email.bounced': return 'bounced';
    case 'email.complained': return 'complained';
    case 'email.failed': return 'failed';
    case 'email.scheduled': return 'queued';
    default: return null;
  }
}

export class ResendEmailProvider implements EmailProvider {
  async sendEmail(input: OutboundMessage): Promise<{ providerMessageId: string }> {
    if (!input.subject?.trim()) throw new Error('Email subject is required');
    if (!input.idempotencyKey?.trim()) throw new Error('Email idempotency key is required');

    const mailbox = await resolveMailbox(input.mailboxId);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from: mailbox.address,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        headers: {
          'X-Smart-Visions-Mailbox-Id': mailbox.id,
          'X-Smart-Visions-Organization-Id': mailbox.organization_id,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Resend send failed (${response.status}): ${detail.slice(0, 500)}`);
    }
    const body = await response.json() as { id?: string };
    if (!body.id) throw new Error('Resend response did not include an email id');
    return { providerMessageId: body.id };
  }

  async fetchReplies(since: Date): Promise<InboundReply[]> {
    const supabase = serviceClient();
    const { data, error } = await supabase
      .from('outreach_messages')
      .select('provider_message_id,provider_thread_id,subject,body,received_at,metadata')
      .eq('channel', 'EMAIL')
      .eq('direction', 'INBOUND')
      .gte('received_at', since.toISOString())
      .order('received_at', { ascending: true });
    if (error) throw new Error(`Inbound email lookup failed: ${error.message}`);

    return (data ?? []).map(row => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      return {
        providerMessageId: String(row.provider_message_id ?? ''),
        threadId: row.provider_thread_id ? String(row.provider_thread_id) : undefined,
        from: String(metadata.from ?? ''),
        to: String(metadata.to ?? ''),
        subject: row.subject ? String(row.subject) : undefined,
        text: String(row.body ?? ''),
        receivedAt: String(row.received_at ?? new Date().toISOString()),
      };
    }).filter(reply => reply.providerMessageId && reply.from);
  }

  async getDeliveryStatus(providerMessageId: string): Promise<DeliveryEvent[]> {
    const supabase = serviceClient();
    const { data, error } = await supabase
      .from('email_events')
      .select('event_type,created_at,payload')
      .eq('provider_message_id', providerMessageId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Email delivery event lookup failed: ${error.message}`);
    return (data ?? []).flatMap(row => {
      const status = statusFromEventType(String(row.event_type));
      if (!status) return [];
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      return [{ providerMessageId, status, occurredAt: String(row.created_at), detail: typeof payload.detail === 'string' ? payload.detail : undefined }];
    });
  }

  async getBounce(providerMessageId: string) {
    return (await this.getDeliveryStatus(providerMessageId)).find(event => event.status === 'bounced') ?? null;
  }

  async getComplaint(providerMessageId: string) {
    return (await this.getDeliveryStatus(providerMessageId)).find(event => event.status === 'complained') ?? null;
  }

  async unsubscribe(address: string): Promise<void> {
    const normalized = address.trim().toLowerCase();
    if (!normalized) return;
    const supabase = serviceClient();
    const { data: rows, error: integrationError } = await supabase
      .from('integration_connections')
      .select('organization_id')
      .eq('provider', 'EMAIL_PROVIDER')
      .eq('channel', 'EMAIL')
      .eq('enabled', true)
      .limit(2);
    if (integrationError) throw new Error(`Email integration lookup failed: ${integrationError.message}`);
    if (!rows || rows.length !== 1) throw new Error('Email unsubscribe requires exactly one enabled email integration');
    const { error } = await supabase.from('suppression_list').insert({
      organization_id: rows[0].organization_id,
      email: normalized,
      reason: 'UNSUBSCRIBED',
      source: 'EMAIL_PROVIDER',
    });
    if (error && error.code !== '23505') throw new Error(`Email suppression insert failed: ${error.message}`);
  }

  async health() {
    try {
      apiKey();
      return { ok: true, detail: 'Resend credentials are configured; production verification still requires a controlled provider check.' };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : 'Unknown email provider configuration error' };
    }
  }
}
