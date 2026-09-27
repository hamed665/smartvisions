import type { SupabaseClient } from '@supabase/supabase-js';
import { TelegramCustomerProvider } from './customer-provider';

export type TelegramCustomerWebhookContext = {
  organizationId: string;
  tenantBusinessId: string;
  branchId: string;
  bindingId: string;
  integrationConnectionId: string;
  botId: string;
  botUsername: string | null;
  botToken: string;
  webhookSecret: string;
};

type WebhookRow = {
  organization_id: string;
  tenant_business_id: string;
  branch_id: string;
  binding_id: string;
  integration_connection_id: string;
  bot_id: string;
  bot_username: string | null;
  bot_token: string;
  webhook_secret: string;
};

type CredentialRow = {
  binding_id: string;
  integration_connection_id: string;
  bot_id: string;
  bot_username: string | null;
  bot_token: string;
  webhook_secret: string;
};

function one<T>(value: unknown): T | null {
  return Array.isArray(value) && value.length === 1 ? value[0] as T : null;
}

export async function resolveTelegramCustomerWebhookContext(input: {
  service: SupabaseClient;
  bindingId: string;
}): Promise<TelegramCustomerWebhookContext> {
  const { data, error } = await input.service.rpc('resolve_telegram_customer_webhook', {
    p_binding_id: input.bindingId,
  });
  if (error) throw new Error('Telegram customer webhook binding resolution failed');
  const row = one<WebhookRow>(data);
  if (!row?.bot_token || !row.webhook_secret || !row.branch_id) {
    throw new Error('Telegram customer webhook binding is unavailable');
  }
  return {
    organizationId: row.organization_id,
    tenantBusinessId: row.tenant_business_id,
    branchId: row.branch_id,
    bindingId: row.binding_id,
    integrationConnectionId: row.integration_connection_id,
    botId: row.bot_id,
    botUsername: row.bot_username,
    botToken: row.bot_token,
    webhookSecret: row.webhook_secret,
  };
}

export async function resolveTelegramCustomerProvider(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  branchId?: string | null;
  fetchImpl?: typeof fetch;
}) {
  const { data, error } = await input.service.rpc('resolve_telegram_customer_credential', {
    p_organization_id: input.organizationId,
    p_tenant_business_id: input.tenantBusinessId,
    p_branch_id: input.branchId ?? null,
  });
  if (error) throw new Error('Telegram tenant credential resolution failed');
  const row = one<CredentialRow>(data);
  if (!row?.bot_token || !row.bot_id) throw new Error('Telegram tenant credential is unavailable');
  return {
    bindingId: row.binding_id,
    integrationConnectionId: row.integration_connection_id,
    botId: row.bot_id,
    botUsername: row.bot_username,
    webhookSecret: row.webhook_secret,
    provider: new TelegramCustomerProvider({ token: row.bot_token, fetchImpl: input.fetchImpl }),
  };
}
