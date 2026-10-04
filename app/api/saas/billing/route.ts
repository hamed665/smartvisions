import { NextResponse } from 'next/server';

import { loadSaasBillingOverview } from '@/lib/saas/billing';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const current = await getCurrentOrganization();
    if (!['OWNER', 'ADMIN'].includes(String(current.role))) {
      return NextResponse.json({ error: 'Billing admin permission required' }, { status: 403 });
    }

    const overview = await loadSaasBillingOverview({
      supabase: current.supabase,
      organizationId: current.organizationId,
    });

    return NextResponse.json(
      { overview },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SaaS billing lookup failed';
    const status = /Authentication required|membership required/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message.slice(0, 600) }, { status });
  }
}
