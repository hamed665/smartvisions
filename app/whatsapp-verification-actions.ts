'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { MetaCloudWhatsAppProvider } from '@/lib/whatsapp/meta-cloud';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { assertPaidOperationAllowed, getCostGuardState, recordUsage } from '@/lib/reliability/cost-guard';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for WhatsApp verification');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function normalizeRecipient(value: FormDataEntryValue | null) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) throw new Error('A valid WhatsApp test number is required');
  return digits;
}

function whatsappCredentialsReady() {
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN?.trim() || process.env.META_WHATSAPP_TOKEN?.trim();
  return Boolean(token && process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim());
}

function safeMessage(value: unknown) {
  return (value instanceof Error ? value.message : 'WhatsApp verification failed')
    .replace(/https?:\/\/[^\s]+/g, '[url]')
    .slice(0, 220);
}

export async function verifyWhatsAppIntegration(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const db = serviceClient();
  let destination = '/integrations';
  const startedAt = Date.now();

  const { data: currentIntegration } = await db
    .from('integration_connections')
    .select('status,enabled')
    .eq('organization_id', ctx.organizationId)
    .eq('provider', 'META')
    .eq('channel', 'WHATSAPP')
    .maybeSingle();
  const preservedEnabled = currentIntegration?.enabled === true;

  try {
    const recipient = normalizeRecipient(formData.get('test_whatsapp'));
    if (!whatsappCredentialsReady()) throw new Error('Meta WhatsApp credentials are not fully configured');

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: inbound, error: inboundError } = await db
      .from('whatsapp_events')
      .select('id,created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('direction', 'INBOUND')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1);
    if (inboundError) throw inboundError;
    if (!inbound?.length) throw new Error('No successful inbound WhatsApp webhook was recorded in the last 24 hours');

    const costState = await getCostGuardState(ctx.organizationId);
    assertPaidOperationAllowed(costState, 'NORMAL');

    const result = await new MetaCloudWhatsAppProvider().sendText({
      to: recipient,
      text: 'Smart Visions WhatsApp production verification. This is a controlled test reply; no action is required.',
    });

    await recordUsage({
      organizationId: ctx.organizationId,
      provider: 'WHATSAPP',
      operation: 'WHATSAPP_PROVIDER_VERIFICATION',
      costUsd: 0,
      units: 1,
      metadata: {
        source: 'OWNER_CONTROLLED_INTEGRATION_VERIFICATION',
        pricing_status: 'PENDING_RECONCILIATION',
        provider_message_id: result.providerMessageId,
      },
    });

    const checkedAt = new Date().toISOString();
    const latencyMs = Date.now() - startedAt;
    const { error: integrationError } = await db.from('integration_connections').update({
      status: 'CONNECTED',
      enabled: preservedEnabled,
      last_checked_at: checkedAt,
      last_error: null,
      updated_at: checkedAt,
    }).eq('organization_id', ctx.organizationId).eq('provider', 'META').eq('channel', 'WHATSAPP');
    if (integrationError) throw integrationError;

    const { error: auditError } = await db.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'META_WHATSAPP_CONTROLLED_VERIFICATION_SENT',
      entity_type: 'integration',
      entity_id: ctx.organizationId,
      after_data: {
        provider: 'META',
        channel: 'WHATSAPP',
        providerMessageId: result.providerMessageId,
        latencyMs,
        providerCalls: 1,
        inboundWebhookConfirmed: true,
        usageRecorded: true,
        outreachTriggered: false,
        integrationEnabled: preservedEnabled,
      },
    });
    if (auditError) throw auditError;

    destination = `/integrations?whatsapp=sent&latencyMs=${latencyMs}`;
  } catch (error) {
    const message = safeMessage(error);
    const checkedAt = new Date().toISOString();
    await db.from('integration_connections').update({
      status: currentIntegration?.status === 'CONNECTED' ? 'CONNECTED' : 'ERROR',
      enabled: preservedEnabled,
      last_checked_at: checkedAt,
      last_error: message,
      updated_at: checkedAt,
    }).eq('organization_id', ctx.organizationId).eq('provider', 'META').eq('channel', 'WHATSAPP');
    await db.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'META_WHATSAPP_CONTROLLED_VERIFICATION_FAILED',
      entity_type: 'integration',
      entity_id: ctx.organizationId,
      after_data: { provider: 'META', channel: 'WHATSAPP', error: message, outreachTriggered: false },
    });
    destination = `/integrations?whatsapp=error&message=${encodeURIComponent(message)}`;
  }

  revalidatePath('/integrations');
  redirect(destination);
}
