import { NextResponse } from 'next/server';

import {
  applyVerifiedContactImport,
  getCrmDataQualitySummary,
  isCrmDataQualityMutationRole,
  prepareVerifiedContactImportRows,
  previewVerifiedContactImport,
  type CrmVerifiedContactImportInput,
} from '@/lib/crm/data-quality';
import { createClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function membership(organizationId: string) {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) } as const;
  }
  const { data, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error || !data) {
    return { response: NextResponse.json({ error: 'Organization membership required' }, { status: 403 }) } as const;
  }
  return { supabase, userId: auth.user.id, role: String(data.role) } as const;
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/requires OWNER|authorized|permission denied|row-level security|trusted server/i.test(message)) return 403;
  if (/Business is not in|Business lookup|not found/i.test(message)) return 404;
  if (/ambiguous|request key was reused|duplicate/i.test(message)) return 409;
  if (/invalid|supports 1 to 100|exceeds 256|too long|required/i.test(message)) return 400;
  return 500;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId') ?? '';
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '100', 10);

  if (!isUuid(organizationId) || !Number.isInteger(limit) || limit < 1 || limit > 250) {
    return NextResponse.json({ error: 'Invalid data-quality query' }, { status: 400 });
  }

  const auth = await membership(organizationId);
  if ('response' in auth) return auth.response;

  try {
    const summary = await getCrmDataQualitySummary({
      supabase: auth.supabase,
      organizationId,
      limit,
    });
    return NextResponse.json({ summary }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('CRM data-quality read failed', error);
    return NextResponse.json({ error: 'CRM data-quality read failed' }, { status: statusFor(error) });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) throw new Error('body');
    body = parsed;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const organizationId = body.organizationId;
  const action = String(body.action ?? '');
  if (!isUuid(organizationId) || !['PREVIEW_IMPORT','APPLY_IMPORT'].includes(action)) {
    return NextResponse.json({ error: 'Invalid data-quality mutation payload' }, { status: 400 });
  }

  const auth = await membership(organizationId);
  if ('response' in auth) return auth.response;

  let rows;
  try {
    rows = prepareVerifiedContactImportRows(
      Array.isArray(body.rows) ? body.rows as CrmVerifiedContactImportInput[] : [],
    );
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Invalid verified import rows',
    }, { status: 400 });
  }

  try {
    const preview = await previewVerifiedContactImport({
      supabase: auth.supabase,
      organizationId,
      rows,
    });

    if (action === 'PREVIEW_IMPORT') {
      return NextResponse.json({ preview }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (!isCrmDataQualityMutationRole(auth.role)) {
      return NextResponse.json({ error: 'Verified import requires OWNER, ADMIN or SALES_MANAGER' }, { status: 403 });
    }

    const blocked = preview.filter(row => row.status.startsWith('BLOCKED_'));
    if (blocked.length) {
      return NextResponse.json({
        error: 'Verified import has blocked rows',
        blocked: blocked.map(row => ({
          clientRowKey: row.clientRowKey,
          status: row.status,
        })),
      }, { status: 409 });
    }

    const requestKey = typeof body.requestKey === 'string' ? body.requestKey.trim() : '';
    if (!/^[A-Za-z0-9._:-]{1,200}$/.test(requestKey)) {
      return NextResponse.json({ error: 'Verified import requestKey is required' }, { status: 400 });
    }

    const result = await applyVerifiedContactImport({
      service: createSupabaseServiceClient(),
      organizationId,
      actorUserId: auth.userId,
      requestKey,
      rows,
    });
    return NextResponse.json({ preview, result });
  } catch (error) {
    console.error('CRM data-quality mutation failed', error);
    const status = statusFor(error);
    return NextResponse.json({
      error: status >= 500
        ? 'CRM data-quality mutation failed'
        : (error instanceof Error ? error.message : 'CRM data-quality mutation failed'),
    }, { status });
  }
}
