import { NextResponse } from 'next/server';

import { getCrmPipelineForecast } from '@/lib/crm/deals';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalUuid(value: string | null) {
  return value === null || UUID_RE.test(value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const pipelineId = url.searchParams.get('pipelineId');
  const ownerUserId = url.searchParams.get('ownerUserId');
  const teamId = url.searchParams.get('teamId');
  const currency = url.searchParams.get('currency');
  const includeClosed = url.searchParams.get('includeClosed') === 'true';

  if (!UUID_RE.test(organizationId)
      || !optionalUuid(pipelineId)
      || !optionalUuid(ownerUserId)
      || !optionalUuid(teamId)
      || (currency !== null && !/^[A-Za-z]{3}$/.test(currency))) {
    return NextResponse.json({ error: 'Invalid CRM forecast query' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const forecast = await getCrmPipelineForecast({
      supabase,
      organizationId,
      pipelineId,
      ownerUserId,
      teamId,
      currency,
      includeClosed,
    });
    return NextResponse.json(
      { forecast },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('CRM Pipeline forecast query failed', error);
    const message = error instanceof Error ? error.message : String(error);
    const status = /row-level security|permission denied/i.test(message) ? 403 : 500;
    return NextResponse.json({ error: 'CRM Pipeline forecast query failed' }, { status });
  }
}
