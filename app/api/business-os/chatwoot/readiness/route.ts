import { NextResponse } from 'next/server';
import { loadChatwootReadiness } from '@/lib/chatwoot/readiness';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { supabase, organizationId } = await getCurrentOrganization(true);
    const readiness = await loadChatwootReadiness({
      supabase,
      organizationId,
    });

    return NextResponse.json(readiness, {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message === 'Authentication required') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }

    if (message === 'Owner permission required') {
      return NextResponse.json(
        { error: 'Owner permission required' },
        { status: 403 },
      );
    }

    console.error('Chatwoot readiness check failed');
    return NextResponse.json(
      { error: 'Communication Plane readiness unavailable' },
      { status: 503 },
    );
  }
}
