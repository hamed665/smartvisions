import { NextResponse } from 'next/server';
import {
  ControlPlaneBootstrapError,
  createBrandBootstrap,
  createBusinessBootstrap,
  parseBrandBootstrapPayload,
  parseBusinessBootstrapPayload,
} from '@/lib/business-os/control-plane-bootstrap';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function errorStatus(error: unknown) {
  if (!(error instanceof ControlPlaneBootstrapError)) return 500;
  if (error.code === 'FORBIDDEN') return 403;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'CONFLICT') return 409;
  if (error.code === 'INVALID') return 400;
  return 500;
}

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}

export async function POST(request: Request) {
  const { supabase, user } = await requireUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!isObject(parsed)) throw new Error('invalid body');
    body = parsed;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const operation =
    typeof body.operation === 'string'
      ? body.operation.trim().toUpperCase()
      : '';

  try {
    if (operation === 'CREATE_BRAND') {
      const payload = parseBrandBootstrapPayload(body);
      const result = await createBrandBootstrap({
        supabase,
        userId: user.id,
        payload,
      });

      return NextResponse.json(
        {
          brand: result.row,
          created: result.created,
          replayed: !result.created,
        },
        {
          status: result.created ? 201 : 200,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    }

    if (operation === 'CREATE_BUSINESS') {
      const payload = parseBusinessBootstrapPayload(body);
      const result = await createBusinessBootstrap({
        supabase,
        userId: user.id,
        payload,
      });

      return NextResponse.json(
        {
          business: result.row,
          created: result.created,
          replayed: !result.created,
        },
        {
          status: result.created ? 201 : 200,
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    }

    return NextResponse.json(
      { error: 'Unsupported control-plane bootstrap operation' },
      { status: 400 },
    );
  } catch (error) {
    const code =
      error instanceof ControlPlaneBootstrapError
        ? error.code
        : 'UNEXPECTED';

    console.error('Governed control-plane bootstrap failed', { code });

    return NextResponse.json(
      { error: 'Control-plane bootstrap failed', code },
      { status: errorStatus(error) },
    );
  }
}
