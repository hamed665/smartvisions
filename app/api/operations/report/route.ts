import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { isOperationalAlertCode, notifyOperationalAlert } from '@/lib/operations/alerts';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for operational alerts');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;
  const body = await request.json() as {
    organizationId?: string;
    code?: string;
    eventKey?: string;
    detail?: string;
    entityType?: string;
    entityId?: string;
    payload?: Record<string, unknown>;
  };
  if (!body.organizationId || !body.eventKey || !body.detail || !isOperationalAlertCode(body.code)) {
    return NextResponse.json({ error: 'organizationId, valid code, eventKey and detail are required' }, { status: 400 });
  }
  try {
    const result = await notifyOperationalAlert({
      supabase: serviceClient(),
      organizationId: body.organizationId,
      code: body.code,
      eventKey: body.eventKey,
      detail: body.detail,
      entityType: body.entityType,
      entityId: body.entityId,
      payload: body.payload,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Operational alert failed' }, { status: 503 });
  }
}
