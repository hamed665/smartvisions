import { createClient } from '@supabase/supabase-js';
import { resolveMetaInstagramDestination } from './tenant-routing';
import type { NormalizedInstagramEvent } from './webhook';
import { projectMatchedInstagramInbound, resolveInstagramInboundBusiness } from './lifecycle';
import { reconcileInstagramReceipt } from './reconciliation';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for Instagram webhook persistence');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function persistInstagramWebhookEvents(events: NormalizedInstagramEvent[]) {
  if (events.length === 0) return { inserted: 0, duplicates: 0, organizationIds: [] as string[] };

  const supabase = serviceClient();
  const routed = await Promise.all(events.map(async (event) => ({
    event,
    route: await resolveMetaInstagramDestination({ service: supabase, destinationId: event.destinationId }),
  })));

  const resolved = await Promise.all(routed.map(async ({ event, route }) => ({
    event,
    route,
    identity: await resolveInstagramInboundBusiness({ service: supabase, route, event }),
  })));

  const rows = resolved.map(({ event, route, identity }) => ({
    organization_id: route.organizationId,
    provider_event_id: event.providerEventId,
    provider_destination_id: route.destinationId,
    event_type: event.eventType,
    payload: {
      ...event,
      routing: {
        tenantBusinessId: route.tenantBusinessId,
        branchId: route.branchId,
        bindingId: route.bindingId,
        integrationConnectionId: route.integrationConnectionId,
        providerAccountId: route.providerAccountId,
      },
      canonicalIdentity: identity.status === 'MATCH' ? {
        businessId: identity.businessId,
        identityId: identity.identityId,
        resolution: 'MATCH',
      } : { resolution: 'NO_MATCH' },
    },
  }));

  const { data, error } = await supabase.from('instagram_events').upsert(rows, {
    onConflict: 'organization_id,provider_event_id,event_type',
    ignoreDuplicates: true,
  }).select('id');
  if (error) throw new Error(`Instagram event persistence failed: ${error.message}`);

  const receipts = await Promise.all(resolved.map(item => reconcileInstagramReceipt({ service: supabase, route: item.route, event: item.event })));

  const lifecycle = await Promise.all(resolved.map(async (item) => {
    if (item.identity.status !== 'MATCH') return { projected: false as const, reason: 'NO_CANONICAL_IDENTITY' as const };
    return projectMatchedInstagramInbound({
      service: supabase,
      route: item.route,
      event: item.event,
      identity: item.identity,
    });
  }));

  return {
    inserted: data?.length ?? 0,
    duplicates: Math.max(0, rows.length - (data?.length ?? 0)),
    organizationIds: Array.from(new Set(resolved.map(item => item.route.organizationId))),
    projectedMessages: lifecycle.filter(item => item.projected).length,
    reconciledReceipts: receipts.reduce((sum, item) => sum + item.reconciled, 0),
    unmatchedReceipts: receipts.reduce((sum, item) => sum + item.unmatched, 0),
  };
}
