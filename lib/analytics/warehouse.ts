import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export type WarehouseSyncInput = {
  organizationId: string;
  endAt?: string | Date;
  backfillFrom?: string | Date | null;
  limit?: number;
};

export type WarehouseSyncResult = {
  organizationId: string;
  mode?: 'INCREMENTAL' | 'BACKFILL';
  locked?: boolean;
  windowStart?: string;
  windowEnd?: string;
  inserted?: number;
  remainingInWindow?: boolean;
  lastInsertedOccurredAt?: string | null;
  lastCompleteThrough?: string | null;
  lastSourceEventAt?: string | null;
  caughtUp?: boolean;
  lagSeconds?: number | null;
};

export type WarehouseReadInput = {
  organizationId: string;
  startAt: string | Date;
  endAt: string | Date;
  eventNames?: string[];
  tenantBusinessId?: string | null;
  branchId?: string | null;
  limit?: number;
};

export type WarehouseFact = {
  organization_id: string;
  tenant_business_id: string | null;
  branch_id: string | null;
  event_id: string;
  event_name: string;
  event_version: number;
  source_table: string;
  source_event_type: string;
  evidence_class: string;
  entity_type: string;
  entity_id: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  occurred_at: string;
  numeric_value: number | string | null;
  numeric_unit: string | null;
  dimensions: Record<string, unknown>;
  projected_at: string;
};

function requiredId(value: string, label: string) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function iso(value: string | Date, label: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} must be a valid date-time`);
  return date.toISOString();
}

function eventNames(values: string[] | undefined) {
  if (values == null) return null;
  const normalized = [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
  if (normalized.length > 64) throw new Error('Analytics warehouse event filter is limited to 64 event names');
  if (normalized.some((name) => name.length > 180)) throw new Error('Analytics warehouse event name is too long');
  return normalized.length ? normalized : null;
}

export function normalizeWarehouseSyncInput(input: WarehouseSyncInput) {
  const organizationId = requiredId(input.organizationId, 'organizationId');
  const endAt = input.endAt == null ? new Date().toISOString() : iso(input.endAt, 'endAt');
  const backfillFrom = input.backfillFrom == null ? null : iso(input.backfillFrom, 'backfillFrom');
  if (backfillFrom) {
    const span = Date.parse(endAt) - Date.parse(backfillFrom);
    if (span <= 0) throw new Error('Analytics warehouse backfill window is invalid');
    if (span > 31 * 24 * 60 * 60 * 1000) throw new Error('Analytics warehouse backfill window exceeds 31 days');
  }
  const limit = Math.min(5000, Math.max(1, Math.trunc(Number(input.limit ?? 5000) || 5000)));
  return {
    p_organization_id: organizationId,
    p_end_at: endAt,
    p_backfill_from: backfillFrom,
    p_limit: limit,
  };
}

export function normalizeWarehouseReadInput(input: WarehouseReadInput) {
  const organizationId = requiredId(input.organizationId, 'organizationId');
  const startAt = iso(input.startAt, 'startAt');
  const endAt = iso(input.endAt, 'endAt');
  const span = Date.parse(endAt) - Date.parse(startAt);
  if (span <= 0) throw new Error('Analytics warehouse read window is invalid');
  if (span > 366 * 24 * 60 * 60 * 1000) throw new Error('Analytics warehouse read window exceeds 366 days');
  return {
    p_organization_id: organizationId,
    p_start_at: startAt,
    p_end_at: endAt,
    p_event_names: eventNames(input.eventNames),
    p_tenant_business_id: input.tenantBusinessId ? String(input.tenantBusinessId) : null,
    p_branch_id: input.branchId ? String(input.branchId) : null,
    p_limit: Math.min(10000, Math.max(1, Math.trunc(Number(input.limit ?? 5000) || 5000))),
  };
}

export async function syncAnalyticsWarehouse(
  supabase: SupabaseClient,
  input: WarehouseSyncInput,
) {
  const args = normalizeWarehouseSyncInput(input);
  const { data, error } = await supabase.rpc('sync_analytics_warehouse_v1', args);
  if (error) throw new Error(`Analytics warehouse sync failed: ${error.message}`);
  return (data ?? {}) as WarehouseSyncResult;
}

export async function readAnalyticsWarehouse(
  supabase: SupabaseClient,
  input: WarehouseReadInput,
) {
  const args = normalizeWarehouseReadInput(input);
  const { data, error } = await supabase.rpc('read_analytics_warehouse_v1', args);
  if (error) throw new Error(`Analytics warehouse read failed: ${error.message}`);
  return (data ?? []) as WarehouseFact[];
}