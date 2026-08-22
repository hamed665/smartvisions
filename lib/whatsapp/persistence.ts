import { createClient } from '@supabase/supabase-js';
import type { NormalizedWhatsAppInbound, NormalizedWhatsAppStatus } from './webhook';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for WhatsApp webhook persistence');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function resolveWhatsAppOrganizationId() {
  const configured = process.env.WHATSAPP_ORGANIZATION_ID?.trim();
  if (configured) return configured;

  const supabase = serviceClient();
  const { data, error } = await supabase
    .from('integration_connections')
    .select('organization_id')
    .eq('provider', 'META')
    .eq('channel', 'WHATSAPP')
    .eq('enabled', true)
    .limit(2);
  if (error) throw new Error(`WhatsApp integration lookup failed: ${error.message}`);
  if (!data || data.length !== 1) {
    throw new Error('WhatsApp webhook requires exactly one enabled META/WHATSAPP integration or WHATSAPP_ORGANIZATION_ID');
  }
  return String(data[0].organization_id);
}

export async function persistWhatsAppWebhookEvents(input: {
  inbound: NormalizedWhatsAppInbound[];
  statuses: NormalizedWhatsAppStatus[];
}) {
  if (input.inbound.length === 0 && input.statuses.length === 0) return { inserted: 0, duplicates: 0 };

  const organizationId = await resolveWhatsAppOrganizationId();
  const supabase = serviceClient();
  const rows = [
    ...input.inbound.map(event => ({
      organization_id: organizationId,
      provider_message_id: event.providerMessageId,
      direction: 'INBOUND',
      event_type: event.type.toUpperCase(),
      payload: event,
    })),
    ...input.statuses.map(event => ({
      organization_id: organizationId,
      provider_message_id: event.providerMessageId,
      direction: 'STATUS',
      event_type: event.status.toUpperCase(),
      payload: event,
    })),
  ];

  const { data, error } = await supabase
    .from('whatsapp_events')
    .upsert(rows, {
      onConflict: 'organization_id,provider_message_id,direction,event_type',
      ignoreDuplicates: true,
    })
    .select('id');
  if (error) throw new Error(`WhatsApp event persistence failed: ${error.message}`);

  const inserted = data?.length ?? 0;
  return { inserted, duplicates: Math.max(0, rows.length - inserted), organizationId };
}
