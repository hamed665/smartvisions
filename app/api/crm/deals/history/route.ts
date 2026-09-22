import { NextResponse } from 'next/server';
import { listCrmDealStageHistory } from '@/lib/crm/deals';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const dealId = url.searchParams.get('dealId')?.trim() ?? '';

  if (!UUID_RE.test(organizationId) || !UUID_RE.test(dealId)) {
    return NextResponse.json({ error: 'Valid organizationId and dealId are required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const items = await listCrmDealStageHistory({ supabase, organizationId, dealId });
    return NextResponse.json(
      { items },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('CRM Deal stage history query failed', error);
    return NextResponse.json({ error: 'CRM Deal stage history query failed' }, { status: 500 });
  }
}
