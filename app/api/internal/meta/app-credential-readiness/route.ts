import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { verifyMetaAppCredentialPair } from '@/lib/whatsapp/meta-app-readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function trustedPreflightRequest(request: Request) {
  if (process.env.META_CREDENTIAL_PREFLIGHT_ENABLED !== 'true') return false;

  const expected = process.env.META_CREDENTIAL_PREFLIGHT_TOKEN?.trim() ?? '';
  const supplied = request.headers.get('x-smartvisions-meta-preflight')?.trim() ?? '';
  if (expected.length < 32 || supplied.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function POST(request: Request) {
  if (!trustedPreflightRequest(request)) {
    return new NextResponse(null, {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  const appId = process.env.META_APP_ID?.trim() ?? '';
  const appSecret = process.env.META_APP_SECRET?.trim() ?? '';

  try {
    await verifyMetaAppCredentialPair({ appId, appSecret });
    return new NextResponse(null, {
      status: 204,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json(
      { ok: false, code: 'META_APP_CREDENTIAL_MISMATCH_OR_UNAVAILABLE' },
      {
        status: 503,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}
