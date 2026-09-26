import { NextResponse } from 'next/server';
import { getCurrentOrganization } from '@/lib/supabase/org';
import {
  loadUnifiedInboxPage,
  parseUnifiedInboxQuery,
} from '@/lib/conversations/unified-inbox-query';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { supabase, organizationId } = await getCurrentOrganization();
    const query = parseUnifiedInboxQuery(new URL(request.url).searchParams);
    const result = await loadUnifiedInboxPage({ supabase, organizationId, query });

    return NextResponse.json(
      {
        ...result,
        serverTime: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load Unified Inbox';
    const status = /Authentication|membership/i.test(message)
      ? 401
      : /Invalid|too long/i.test(message)
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
