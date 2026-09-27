import { createClient } from '@supabase/supabase-js';
import { resolveMetaInstagramDestination } from './tenant-routing';
import type { NormalizedInstagramEvent } from './webhook';

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

  const rows = routed.map(({ event, route }) => ({
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
    },
  }));

  const { data, error } = await supabase.from('instagram_events').upsert(rows, {
    onConflict: 'organization_id,provider_event_id,event_type',
    ignoreDuplicates: true,
  }).select('id');
  if (error) throw new Error(`Instagram event persistence failed: ${error.message}`);

  return {
    inserted: data?.length ?? 0,
    duplicates: Math.max(0, rows.length - (data?.length ?? 0)),
    organizationIds: Array.from(new Set(routed.map(item => item.route.organizationId))),
  };
}
