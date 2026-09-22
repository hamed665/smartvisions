import { NextResponse } from 'next/server';
import { getCustomerTimeline, isTimelineItemId } from '@/lib/crm/customer-timeline';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseLimit(value: string | null) {
  if (!value) return 50;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return null;
  return Math.min(Math.max(parsed, 1), 100);
}

function parseBoolean(value: string | null, fallback: boolean) {
  if (value === null) return fallback;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get('organizationId')?.trim() ?? '';
  const businessId = url.searchParams.get('businessId')?.trim() ?? '';
  const limit = parseLimit(url.searchParams.get('limit'));
  const includeInternal = parseBoolean(url.searchParams.get('includeInternal'), true);
  const beforeAtRaw = url.searchParams.get('beforeAt');
  const beforeItemId = url.searchParams.get('beforeItemId');

  if (!UUID_RE.test(organizationId) || !UUID_RE.test(businessId)) {
    return NextResponse.json({ error: 'Valid organizationId and businessId are required' }, { status: 400 });
  }
  if (limit === null || includeInternal === null) {
    return NextResponse.json({ error: 'Invalid timeline query parameters' }, { status: 400 });
  }

  const hasCursorAt = Boolean(beforeAtRaw);
  const hasCursorId = Boolean(beforeItemId);
  if (hasCursorAt !== hasCursorId) {
    return NextResponse.json({ error: 'beforeAt and beforeItemId must be provided together' }, { status: 400 });
  }

  let cursor: { occurredAt: string; itemId: string } | null = null;
  if (beforeAtRaw && beforeItemId) {
    const parsedTime = Date.parse(beforeAtRaw);
    if (!Number.isFinite(parsedTime) || !isTimelineItemId(beforeItemId)) {
      return NextResponse.json({ error: 'Invalid timeline cursor' }, { status: 400 });
    }
    cursor = {
      occurredAt: new Date(parsedTime).toISOString(),
      itemId: beforeItemId,
    };
  }

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const page = await getCustomerTimeline({
      supabase,
      organizationId,
      businessId,
      limit,
      cursor,
      includeInternal,
    });

    if (!page) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    return NextResponse.json(page, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Customer timeline query failed', error);
    return NextResponse.json({ error: 'Customer timeline query failed' }, { status: 500 });
  }
}
