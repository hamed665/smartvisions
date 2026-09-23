import { NextResponse } from 'next/server';
import { listChatwootSliceBResources } from '@/lib/chatwoot/tenant-bridge-slice-b';
import { createClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBoolean(value: string | null, fallback: boolean) {
  if (value === null) return fallback;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
}

function parseLimit(value: string | null) {
  if (value === null) return 50;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 100) : null;
}

export async function GET(request: Request) {
  const session = await createClient();
  const { data: authData, error: authError } = await session.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const tenantBusinessId =
    url.searchParams.get('tenantBusinessId')?.trim() || null;
  const includeArchived = parseBoolean(
    url.searchParams.get('includeArchived'),
    false,
  );
  const limit = parseLimit(url.searchParams.get('limit'));

  if (
    !UUID_RE.test(organizationId) ||
    (tenantBusinessId !== null && !UUID_RE.test(tenantBusinessId)) ||
    includeArchived === null ||
    limit === null
  ) {
    return NextResponse.json(
      { error: 'Invalid Chatwoot Slice B resource query' },
      { status: 400 },
    );
  }

  const { data: membership, error: membershipError } = await session
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (
    membershipError ||
    !membership ||
    (membership.role !== 'OWNER' && membership.role !== 'ADMIN')
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const service = createSupabaseServiceClient();
    const resources = await listChatwootSliceBResources({
      service,
      organizationId,
      tenantBusinessId,
      includeArchived,
      limit,
    });

    return NextResponse.json(resources, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Chatwoot Slice B resource query failed', error);
    return NextResponse.json(
      { error: 'Chatwoot Slice B resource query failed' },
      { status: 500 },
    );
  }
}
