import { NextResponse } from 'next/server';

import { getCrmPipelineForecast } from '@/lib/crm/deals';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalUuid(value: string | null) {
  return value === null || UUID_RE.test(value);
}

function optionalIso(value: string | null) {
  if (value === null) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const pipelineId = url.searchParams.get('pipelineId');
  const ownerUserId = url.searchParams.get('ownerUserId');
  const ownerTeamId = url.searchParams.get('ownerTeamId');
  const from = optionalIso(url.searchParams.get('from'));
  const to = optionalIso(url.searchParams.get('to'));

  if (!UUID_RE.test(organizationId)
      || !optionalUuid(pipelineId)
      || !optionalUuid(ownerUserId)
      || !optionalUuid(ownerTeamId)
      || from === undefined
      || to === undefined
      || (from && to && Date.parse(from) >= Date.parse(to))) {
    return NextResponse.json({ error: 'Invalid CRM pipeline forecast query' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const items = await getCrmPipelineForecast({
      supabase,
      organizationId,
      pipelineId,
      ownerUserId,
      ownerTeamId,
      from,
      to,
    });
    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('CRM pipeline forecast query failed', error);
    return NextResponse.json({ error: 'CRM pipeline forecast query failed' }, { status: 500 });
  }
}
