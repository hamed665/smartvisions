import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { loadDataDashboard } from '@/lib/analytics/dashboard';
import {
  makeDataExportArtifact,
  normalizeDataExportFormat,
  type DataExportArtifact,
  type DataExportFormat,
} from '@/lib/analytics/export-core';

export async function buildGovernedDataExport(input: {
  supabase: SupabaseClient;
  organizationId: string;
  format: DataExportFormat;
  days?: unknown;
  requestedTenantBusinessId?: string | null;
  requestedBranchId?: string | null;
}): Promise<DataExportArtifact> {
  const snapshot = await loadDataDashboard({
    supabase: input.supabase,
    organizationId: input.organizationId,
    days: Number(input.days ?? 30),
    requestedTenantBusinessId: input.requestedTenantBusinessId ?? null,
    requestedBranchId: input.requestedBranchId ?? null,
  });
  return makeDataExportArtifact(snapshot, input.format);
}

export { normalizeDataExportFormat };
export type { DataExportFormat };
