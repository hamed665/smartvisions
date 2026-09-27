'use server';

import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { TelegramCustomerProvider } from '@/lib/telegram/customer-provider';
import { recordProviderRateLimitEvidence } from '@/lib/omnichannel/rate-limit-evidence';

function safeMessage(value: unknown) {
  const raw = value instanceof Error ? value.message : 'Telegram customer connection failed';
  return raw
    .replace(/[1-9][0-9]{4,19}:[A-Za-z0-9_-]{20,240}/g, '[telegram-token]')
    .replace(/https?:\/\/[^\s]+/g, '[url]')
    .slice(0, 240);
}

function uuid(value: FormDataEntryValue | null, field: string) {
  const normalized = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error(`${field} is invalid`);
  }
  return normalized;
}

function webhookOrigin() {
  const raw = String(
    process.env.TELEGRAM_CUSTOMER_WEBHOOK_ORIGIN
      || process.env.CHATWOOT_WEBHOOK_PUBLIC_ORIGIN
      || 'https://app.smartvisionsai.com',
  ).trim();
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Telegram customer webhook origin must be a clean HTTPS origin');
  }
  return url.origin;
}

function asObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function connectTelegramCustomerChannel(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const branchId = uuid(formData.get('telegram_branch_id'), 'Branch');
  const botToken = String(formData.get('telegram_bot_token') ?? '').trim();
  let destination = '/integrations';
  let integrationId: string | null = null;

  try {
    const { data: branch, error: branchError } = await ctx.supabase
      .from('branches')
      .select('id,tenant_business_id,status,tenant_businesses!inner(id,name,status)')
      .eq('organization_id', ctx.organizationId)
      .eq('id', branchId)
      .maybeSingle();
    if (branchError || !branch || branch.status !== 'ACTIVE') {
      throw new Error('An ACTIVE Branch in your Organization is required');
    }
    const business = Array.isArray(branch.tenant_businesses)
      ? branch.tenant_businesses[0]
      : branch.tenant_businesses;
    if (!business || business.status !== 'ACTIVE') {
      throw new Error('An ACTIVE tenant Business is required');
    }

    const provider = new TelegramCustomerProvider({ token: botToken });
    const verified = await provider.getMe();

    const { data: integration, error: integrationError } = await ctx.supabase
      .from('integration_connections')
      .select('id,config')
      .eq('organization_id', ctx.organizationId)
      .eq('provider', 'TELEGRAM')
      .eq('channel', 'TELEGRAM')
      .maybeSingle();
    if (integrationError || !integration) throw new Error('Telegram integration bootstrap row is unavailable');
    integrationId = String(integration.id);

    const checkedAt = new Date().toISOString();
    const config = {
      ...asObject(integration.config),
      customer_messaging: true,
      owner_assistant_separate: true,
      last_verified_bot_id: verified.id,
      last_verified_bot_username: verified.username,
    };
    const integrationUpdate = await ctx.supabase
      .from('integration_connections')
      .update({
        enabled: true,
        status: 'CONNECTED',
        account_label: 'Telegram customer Bots',
        config,
        last_checked_at: checkedAt,
        last_error: null,
        updated_at: checkedAt,
      })
      .eq('organization_id', ctx.organizationId)
      .eq('id', integrationId);
    if (integrationUpdate.error) throw integrationUpdate.error;

    const existing = await ctx.supabase
      .from('communication_channel_bindings')
      .select('id,version,status,provider_destination_id')
      .eq('organization_id', ctx.organizationId)
      .eq('tenant_business_id', branch.tenant_business_id)
      .eq('branch_id', branchId)
      .eq('channel', 'TELEGRAM')
      .eq('status', 'ACTIVE')
      .limit(2);
    if (existing.error) throw existing.error;
    if ((existing.data ?? []).length > 1) throw new Error('Telegram Branch binding is ambiguous');

    let binding = existing.data?.[0] ?? null;
    if (!binding) {
      const requestKey = `telegram-binding:${branch.tenant_business_id}:${branchId}`.slice(0, 200);
      const created = await ctx.supabase.rpc('create_communication_channel_binding', {
        p_organization_id: ctx.organizationId,
        p_tenant_business_id: branch.tenant_business_id,
        p_branch_id: branchId,
        p_integration_connection_id: integrationId,
        p_channel: 'TELEGRAM',
        p_request_key: requestKey,
      });
      if (created.error) throw new Error(`Telegram binding creation failed: ${created.error.message}`);
      binding = Array.isArray(created.data) ? created.data[0] : created.data;
    }
    if (!binding?.id || !binding.version) throw new Error('Telegram binding creation returned invalid state');

    const webhookSecret = randomBytes(32).toString('base64url');
    const configured = await ctx.supabase.rpc('configure_telegram_customer_binding', {
      p_organization_id: ctx.organizationId,
      p_binding_id: binding.id,
      p_expected_version: Number(binding.version),
      p_bot_id: verified.id,
      p_bot_username: verified.username,
      p_bot_token: botToken,
      p_webhook_secret: webhookSecret,
      p_request_key: `telegram-config:${binding.id}:${verified.id}`.slice(0, 200),
    });
    if (configured.error) throw new Error(`Telegram credential persistence failed: ${configured.error.message}`);

    const webhookUrl = `${webhookOrigin()}/api/telegram/customer/webhook/${binding.id}`;
    let setWebhookError: unknown = null;
    let webhookRateLimit = null;
    try {
      const setResult = await provider.setWebhook({ url: webhookUrl, secretToken: webhookSecret });
      webhookRateLimit = setResult.rateLimit;
    } catch (error) {
      setWebhookError = error;
    }

    let info;
    try {
      info = await provider.getWebhookInfo();
    } catch (error) {
      if (setWebhookError) throw new Error('Telegram webhook result is ambiguous and reconciliation failed');
      throw error;
    }
    const actualUrl = String(info.result.url ?? '').trim();
    if (actualUrl !== webhookUrl) {
      throw setWebhookError instanceof Error
        ? setWebhookError
        : new Error('Telegram webhook verification did not confirm the exact customer binding URL');
    }

    for (const evidence of [verified.rateLimit, webhookRateLimit, info.rateLimit]) {
      const audit = await recordProviderRateLimitEvidence({
        service: ctx.supabase,
        organizationId: ctx.organizationId,
        provider: 'TELEGRAM',
        channel: 'TELEGRAM',
        evidence,
        tenantBusinessId: String(branch.tenant_business_id),
        branchId,
        integrationConnectionId: integrationId,
      });
      if (!audit.recorded && audit.reason === 'AUDIT_PERSISTENCE_FAILED') {
        console.error('Telegram provider rate-limit telemetry persistence failed', audit.error);
      }
    }

    const { error: auditError } = await ctx.supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'TELEGRAM_CUSTOMER_CHANNEL_CONNECTED',
      entity_type: 'communication_channel_binding',
      entity_id: String(binding.id),
      tenant_business_id: String(branch.tenant_business_id),
      branch_id: branchId,
      after_data: {
        provider: 'TELEGRAM',
        channel: 'TELEGRAM',
        botId: verified.id,
        botUsername: verified.username,
        webhookUrl,
        webhookVerified: true,
        ownerAssistantSeparate: true,
        tokenPersistedInVault: true,
        rawTokenPersistedInAudit: false,
        outboundMessageSent: false,
      },
    });
    if (auditError) throw auditError;

    destination = `/integrations?telegram=connected&bot=${encodeURIComponent('@' + verified.username)}`;
  } catch (error) {
    const message = safeMessage(error);
    if (integrationId) {
      await ctx.supabase.from('integration_connections').update({
        enabled: false,
        status: 'ERROR',
        last_checked_at: new Date().toISOString(),
        last_error: message,
        updated_at: new Date().toISOString(),
      }).eq('organization_id', ctx.organizationId).eq('id', integrationId);
    }
    await ctx.supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      actor_type: 'USER',
      actor_id: ctx.userId,
      action: 'TELEGRAM_CUSTOMER_CHANNEL_CONNECT_FAILED',
      entity_type: 'integration',
      entity_id: integrationId ?? ctx.organizationId,
      after_data: {
        provider: 'TELEGRAM',
        channel: 'TELEGRAM',
        error: message,
        ownerAssistantSeparate: true,
        outboundMessageSent: false,
      },
    });
    destination = `/integrations?telegram=error&message=${encodeURIComponent(message)}`;
  }

  revalidatePath('/integrations');
  redirect(destination);
}
