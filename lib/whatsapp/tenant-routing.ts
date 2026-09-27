import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { MetaCloudWhatsAppProvider } from './meta-cloud';
import type { WhatsAppDestinationContext } from './webhook';

export type MetaWhatsAppRoute = {
  organizationId: string;
  tenantBusinessId: string;
  branchId: string | null;
  bindingId: string;
  integrationConnectionId: string;
  phoneNumberId: string;
  wabaId: string | null;
};

type DestinationRow = {
  organization_id: string;
  tenant_business_id: string;
  branch_id: string | null;
  binding_id: string;
  integration_connection_id: string;
  phone_number_id: string;
  waba_id: string | null;
};

type CredentialRow = {
  binding_id: string;
  integration_connection_id: string;
  phone_number_id: string;
  waba_id: string | null;
  access_token: string;
};

function one<T>(value: unknown): T | null {
  return Array.isArray(value) && value.length === 1 ? value[0] as T : null;
}

export async function resolveMetaWhatsAppDestination(input: {
  service: SupabaseClient;
  destination: WhatsAppDestinationContext;
}) {
  const phoneNumberId = input.destination.phoneNumberId?.trim();
  if (!phoneNumberId) {
    throw new Error('Meta WhatsApp webhook is missing destination phone_number_id');
  }
  const { data, error } = await input.service.rpc('resolve_meta_whatsapp_destination', {
    p_phone_number_id: phoneNumberId,
    p_waba_id: input.destination.wabaId?.trim() || null,
  });
  if (error) throw new Error(`Meta WhatsApp destination resolution failed: ${error.message}`);
  const row = one<DestinationRow>(data);
  if (!row) {
    throw new Error('Meta WhatsApp destination is not bound to exactly one active tenant');
  }
  return {
    organizationId: row.organization_id,
    tenantBusinessId: row.tenant_business_id,
    branchId: row.branch_id,
    bindingId: row.binding_id,
    integrationConnectionId: row.integration_connection_id,
    phoneNumberId: row.phone_number_id,
    wabaId: row.waba_id,
  } satisfies MetaWhatsAppRoute;
}

export async function resolveMetaWhatsAppProvider(input: {
  service: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  branchId?: string | null;
}) {
  const { data, error } = await input.service.rpc('resolve_meta_whatsapp_credential', {
    p_organization_id: input.organizationId,
    p_tenant_business_id: input.tenantBusinessId,
    p_branch_id: input.branchId ?? null,
  });
  if (error) throw new Error(`Meta WhatsApp credential resolution failed: ${error.message}`);
  const row = one<CredentialRow>(data);
  if (!row?.access_token || !row.phone_number_id) {
    throw new Error('Meta WhatsApp tenant credential is unavailable');
  }
  return {
    bindingId: row.binding_id,
    integrationConnectionId: row.integration_connection_id,
    phoneNumberId: row.phone_number_id,
    wabaId: row.waba_id,
    accessToken: row.access_token,
    provider: new MetaCloudWhatsAppProvider({
      token: row.access_token,
      phoneNumberId: row.phone_number_id,
    }),
  };
}
