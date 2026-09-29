import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { runAutomationNotifications } from '@/lib/notifications/runtime';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({})) as {
    organizationId?: string;
    limit?: number;
  };
  const supabase = createSupabaseServiceClient();
  const limit = Number.isFinite(Number(body.limit))
    ? Math.max(1, Math.min(100, Math.round(Number(body.limit))))
    : 50;

  let organizationIds: string[] = [];
  if (body.organizationId) {
    organizationIds = [body.organizationId];
  } else {
    const { data, error } = await supabase.from('organizations')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 503 });
    organizationIds = (data ?? []).map((row) => String(row.id));
  }

  const results: Array<Record<string, unknown>> = [];
  let failed = 0;

  for (const organizationId of organizationIds) {
    try {
      const result = await runAutomationNotifications({
        supabase,
        organizationId,
        limit,
      });
      results.push({ organizationId, ok: true, ...result });
    } catch (error) {
      failed += 1;
      results.push({
        organizationId,
        ok: false,
        error: error instanceof Error ? error.message : 'Notification runtime failed',
      });
    }
  }

  return NextResponse.json({
    organizations: organizationIds.length,
    failed,
    results,
  }, { status: failed ? 207 : 200 });
}
