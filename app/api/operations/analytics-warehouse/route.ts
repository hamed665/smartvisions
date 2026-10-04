import { NextResponse } from 'next/server';

import { syncAnalyticsWarehouse } from '@/lib/analytics/warehouse';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

type RequestBody = {
  organizationId?: string;
  endAt?: string;
  backfillFrom?: string | null;
  limit?: number;
};

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json().catch(() => ({})) as RequestBody;
  const requestedOrganizationId = String(body.organizationId ?? '').trim() || null;
  const supabase = createSupabaseServiceClient();

  let organizationQuery = supabase
    .from('system_controls')
    .select('organization_id')
    .order('organization_id', { ascending: true })
    .limit(25);

  if (requestedOrganizationId) {
    organizationQuery = organizationQuery.eq('organization_id', requestedOrganizationId);
  }

  const { data: controls, error: organizationError } = await organizationQuery;
  if (organizationError) {
    return NextResponse.json(
      { error: `Analytics warehouse organization lookup failed: ${organizationError.message}` },
      { status: 503 },
    );
  }

  const organizationIds = [
    ...new Set((controls ?? []).map((row) => String(row.organization_id)).filter(Boolean)),
  ];
  if (requestedOrganizationId && !organizationIds.length) {
    return NextResponse.json({ error: 'Organization is not enabled for scheduled operations' }, { status: 404 });
  }

  const results: Array<{
    organizationId: string;
    ok: boolean;
    inserted?: number;
    caughtUp?: boolean;
    lagSeconds?: number | null;
    mode?: string;
    error?: string;
  }> = [];

  for (const organizationId of organizationIds) {
    try {
      const result = await syncAnalyticsWarehouse(supabase, {
        organizationId,
        endAt: body.endAt,
        backfillFrom: body.backfillFrom,
        limit: body.limit,
      });
      results.push({
        organizationId,
        ok: true,
        inserted: Number(result.inserted ?? 0),
        caughtUp: result.caughtUp === true,
        lagSeconds: result.lagSeconds ?? null,
        mode: result.mode,
      });
    } catch (error) {
      results.push({
        organizationId,
        ok: false,
        error: (error instanceof Error ? error.message : 'Analytics warehouse sync failed').slice(0, 1000),
      });
    }
  }

  const failed = results.filter((row) => !row.ok).length;
  const inserted = results.reduce((sum, row) => sum + Number(row.inserted ?? 0), 0);
  const caughtUp = results.filter((row) => row.ok && row.caughtUp).length;

  return NextResponse.json(
    {
      organizations: organizationIds.length,
      inserted,
      caughtUp,
      failed,
      results,
    },
    { status: failed === organizationIds.length && failed > 0 ? 503 : 200 },
  );
}