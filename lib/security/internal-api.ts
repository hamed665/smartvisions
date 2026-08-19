import { NextResponse } from 'next/server';

export function requireInternalApiKey(request: Request) {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    return NextResponse.json({ error: 'INTERNAL_API_KEY is not configured' }, { status: 503 });
  }

  const provided = request.headers.get('x-internal-api-key');
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
