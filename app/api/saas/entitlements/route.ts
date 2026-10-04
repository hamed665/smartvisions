import { NextResponse } from 'next/server';

import { loadSaasEntitlementSnapshot } from '@/lib/saas/entitlements';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const current = await getCurrentOrganization();
    const snapshot = await loadSaasEntitlementSnapshot({
      supabase: current.supabase,
      organizationId: current.organizationId,
    });

    return NextResponse.json(
      { snapshot },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SaaS entitlement lookup failed';
    const status = /Authentication required|membership required/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message.slice(0, 600) }, { status });
  }
}
