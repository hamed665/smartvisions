import type { SupabaseClient } from '@supabase/supabase-js';

export type CustomerTimelineVisibility = 'CUSTOMER' | 'INTERNAL';

export type CustomerTimelineKind =
  | 'MESSAGE_INBOUND'
  | 'MESSAGE_OUTBOUND'
  | 'MESSAGE_APPROVAL_REQUIRED'
  | 'MESSAGE_BLOCKED'
  | 'MESSAGE_FAILED'
  | 'MESSAGE_INTERNAL'
  | 'OUTREACH_INTERNAL'
  | 'FOLLOWUP_JOB'
  | 'HUMAN_HANDOFF'
  | 'REPLY_CLASSIFIED'
  | 'OPERATOR_BRIEF';

export type CustomerTimelineItem = {
  itemId: string;
  organizationId: string;
  businessId: string;
  leadId: string;
  conversationId: string | null;
  source: string;
  sourceId: string;
  kind: CustomerTimelineKind;
  visibility: CustomerTimelineVisibility;
  channel: string | null;
  direction: string | null;
  status: string | null;
  deliveryStatus: string | null;
  providerMessageId: string | null;
  occurredAt: string;
  recordedAt: string;
  subject: string | null;
  body: string | null;
  title: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
};

export type CustomerTimelineCursor = {
  occurredAt: string;
  itemId: string;
};

export type CustomerTimelinePage = {
  businessId: string;
  items: CustomerTimelineItem[];
  nextCursor: CustomerTimelineCursor | null;
};

type TimelineRow = {
  item_id: string;
  organization_id: string;
  business_id: string;
  lead_id: string;
  conversation_id: string | null;
  source: string;
  source_id: string;
  kind: CustomerTimelineKind;
  visibility: CustomerTimelineVisibility;
  channel: string | null;
  direction: string | null;
  status: string | null;
  delivery_status: string | null;
  provider_message_id: string | null;
  occurred_at: string;
  recorded_at: string;
  subject: string | null;
  body: string | null;
  title: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
};

function parsePositiveLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 50;
  return Math.min(Math.max(Math.trunc(value ?? 50), 1), 100);
}

function parseIsoTimestamp(value: string | undefined | null) {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

export function isTimelineItemId(value: string | undefined | null) {
  return typeof value === 'string'
    && /^(conversation_message|outreach_message|followup_job|handoff_event|reply_event|operator_brief):[0-9a-f-]{36}$/i.test(value);
}

export function normalizeTimelineCursor(
  cursor: CustomerTimelineCursor | null | undefined,
): CustomerTimelineCursor | null {
  if (!cursor) return null;
  const occurredAt = parseIsoTimestamp(cursor.occurredAt);
  if (!occurredAt || !isTimelineItemId(cursor.itemId)) return null;
  return { occurredAt, itemId: cursor.itemId };
}

function mapTimelineRow(row: TimelineRow): CustomerTimelineItem {
  return {
    itemId: row.item_id,
    organizationId: row.organization_id,
    businessId: row.business_id,
    leadId: row.lead_id,
    conversationId: row.conversation_id,
    source: row.source,
    sourceId: row.source_id,
    kind: row.kind,
    visibility: row.visibility,
    channel: row.channel,
    direction: row.direction,
    status: row.status,
    deliveryStatus: row.delivery_status,
    providerMessageId: row.provider_message_id,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    subject: row.subject,
    body: row.body,
    title: row.title,
    summary: row.summary,
    metadata: row.metadata ?? {},
  };
}

export async function getCustomerTimeline(input: {
  supabase: SupabaseClient;
  organizationId: string;
  businessId: string;
  limit?: number;
  cursor?: CustomerTimelineCursor | null;
  includeInternal?: boolean;
}): Promise<CustomerTimelinePage | null> {
  const limit = parsePositiveLimit(input.limit);
  const cursor = normalizeTimelineCursor(input.cursor);

  const { data: business, error: businessError } = await input.supabase
    .from('businesses')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('id', input.businessId)
    .maybeSingle();

  if (businessError) {
    throw new Error(`Customer timeline Business lookup failed: ${businessError.message}`);
  }
  if (!business) return null;

  const { data, error } = await input.supabase.rpc('get_crm_customer_timeline', {
    p_organization_id: input.organizationId,
    p_business_id: input.businessId,
    p_limit: limit + 1,
    p_before_at: cursor?.occurredAt ?? null,
    p_before_item_id: cursor?.itemId ?? null,
    p_include_internal: input.includeInternal !== false,
  });

  if (error) {
    throw new Error(`Customer timeline query failed: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as TimelineRow[];
  const hasMore = rows.length > limit;
  const visibleRows = rows.slice(0, limit);
  const items = visibleRows.map(mapTimelineRow);
  const last = hasMore ? visibleRows.at(-1) : null;

  return {
    businessId: input.businessId,
    items,
    nextCursor: last
      ? { occurredAt: last.occurred_at, itemId: last.item_id }
      : null,
  };
}
