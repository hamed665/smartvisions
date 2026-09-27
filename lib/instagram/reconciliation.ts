import type { NormalizedInstagramEvent } from './webhook';
import type { InstagramTenantRoute } from './tenant-routing';

type ServiceClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

function receiptMessageIds(event: NormalizedInstagramEvent) {
  if (event.eventType === 'DELIVERY') {
    const delivery = event.payload.delivery as { mids?: unknown[] } | null | undefined;
    return (delivery?.mids ?? []).filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map(value => value.trim());
  }
  if (event.eventType === 'READ') {
    const read = event.payload.read as { mid?: unknown } | null | undefined;
    return typeof read?.mid === 'string' && read.mid.trim() ? [read.mid.trim()] : [];
  }
  return [];
}

export async function reconcileInstagramReceipt(input: {
  service: ServiceClient;
  route: InstagramTenantRoute;
  event: NormalizedInstagramEvent;
}) {
  if (input.event.eventType !== 'DELIVERY' && input.event.eventType !== 'READ') {
    return { reconciled: 0, unmatched: 0, skipped: true as const };
  }

  const ids = Array.from(new Set(receiptMessageIds(input.event)));
  if (ids.length === 0) {
    // Keep the signed provider event in instagram_events, but never guess a
    // message from watermark/time alone.
    return { reconciled: 0, unmatched: 0, skipped: true as const };
  }

  let reconciled = 0;
  let unmatched = 0;
  for (const providerMessageId of ids) {
    const { data, error } = await input.service.rpc('reconcile_instagram_message_receipt', {
      p_organization_id: input.route.organizationId,
      p_provider_message_id: providerMessageId,
      p_receipt_type: input.event.eventType,
      p_occurred_at: input.event.occurredAt ?? null,
    });
    if (error) throw new Error(`Instagram receipt reconciliation failed: ${error.message}`);
    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) unmatched += 1;
    else reconciled += 1;
  }
  return { reconciled, unmatched, skipped: false as const };
}
