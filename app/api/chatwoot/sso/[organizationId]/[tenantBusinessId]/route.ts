import { NextResponse } from 'next/server';
import {
  ChatwootSsoError,
  createChatwootSsoLoginUrl,
} from '@/lib/chatwoot/sso';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    organizationId: string;
    tenantBusinessId: string;
  }>;
};

function errorResponse(error: unknown) {
  if (error instanceof ChatwootSsoError) {
    if (error.code === 'INVALID_INPUT') {
      return NextResponse.json(
        { error: 'Invalid Chatwoot SSO request' },
        { status: 400 },
      );
    }
    if (error.code === 'AUTHENTICATION_REQUIRED') {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      );
    }
    if (error.code === 'FORBIDDEN') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 },
      );
    }
  }

  return NextResponse.json(
    { error: 'Chatwoot SSO temporarily unavailable' },
    { status: 503 },
  );
}

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const { organizationId, tenantBusinessId } = await context.params;

  try {
    const supabase = await createClient();
    const result = await createChatwootSsoLoginUrl({
      supabase,
      organizationId,
      tenantBusinessId,
    });

    const response = NextResponse.redirect(result.url, 302);
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    return response;
  }
}
