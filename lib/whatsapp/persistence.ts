import { createClient } from '@supabase/supabase-js';
import { applyWhatsAppInboundLifecycle, applyWhatsAppStatusLifecycle } from './lifecycle';
import { resolveMetaWhatsAppDestination } from './tenant-routing';
import type { NormalizedWhatsAppInbound, NormalizedWhatsAppStatus } from './webhook';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for WhatsApp webhook persistence');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function persistWhatsAppWebhookEvents(input: {
  inbound: NormalizedWhatsAppInbound[];
  statuses: NormalizedWhatsAppStatus[];
}) {
  if (input.inbound.length === 0 && input.statuses.length === 0) {
    return {
      inserted: 0,
      duplicates: 0,
      linkedInbound: 0,
      statusUpdates: 0,
      organizationIds: [] as string[],
    };
  }

  const supabase = serviceClient();
  const routedInbound = await Promise.all(input.inbound.map(async (event) => ({
    event,
    route: await resolveMetaWhatsAppDestination({ service: supabase, destination: event.destination }),
  })));
  const routedStatuses = await Promise.all(input.statuses.map(async (event) => ({
    event,
    route: await resolveMetaWhatsAppDestination({ service: supabase, destination: event.destination }),
  })));

  const rows = [
    ...routedInbound.map(({ event, route }) => ({
      organization_id: route.organizationId,
      provider_message_id: event.providerMessageId,
      direction: 'INBOUND',
      event_type: event.type.toUpperCase(),
      chatwoot_sync_status: 'PENDING',
      payload: {
        ...event,
        routing: {
          tenantBusinessId: route.tenantBusinessId,
          branchId: route.branchId,
          bindingId: route.bindingId,
          integrationConnectionId: route.integrationConnectionId,
          phoneNumberId: route.phoneNumberId,
          wabaId: route.wabaId,
        },
      },
    })),
    ...routedStatuses.map(({ event, route }) => ({
      organization_id: route.organizationId,
      provider_message_id: event.providerMessageId,
      direction: 'STATUS',
      event_type: event.status.toUpperCase(),
      payload: {
        ...event,
        routing: {
          tenantBusinessId: route.tenantBusinessId,
          branchId: route.branchId,
          bindingId: route.bindingId,
          integrationConnectionId: route.integrationConnectionId,
          phoneNumberId: route.phoneNumberId,
          wabaId: route.wabaId,
        },
      },
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

  let linkedInbound = 0;
  for (const { event, route } of routedInbound) {
    const lifecycle = await applyWhatsAppInboundLifecycle(route.organizationId, event, {
      tenantBusinessId: route.tenantBusinessId,
      branchId: route.branchId,
      bindingId: route.bindingId,
      integrationConnectionId: route.integrationConnectionId,
      phoneNumberId: route.phoneNumberId,
      wabaId: route.wabaId,
    });
    if (lifecycle.linked) linkedInbound += 1;
  }

  let statusUpdates = 0;
  for (const { event, route } of routedStatuses) {
    const lifecycle = await applyWhatsAppStatusLifecycle(route.organizationId, event, {
      tenantBusinessId: route.tenantBusinessId,
      branchId: route.branchId,
      bindingId: route.bindingId,
      integrationConnectionId: route.integrationConnectionId,
      phoneNumberId: route.phoneNumberId,
      wabaId: route.wabaId,
    });
    statusUpdates += lifecycle.matched;
  }

  const inserted = data?.length ?? 0;
  const organizationIds = Array.from(new Set([
    ...routedInbound.map(item => item.route.organizationId),
    ...routedStatuses.map(item => item.route.organizationId),
  ]));

  return {
    inserted,
    duplicates: Math.max(0, rows.length - inserted),
    organizationIds,
    linkedInbound,
    statusUpdates,
  };
}
