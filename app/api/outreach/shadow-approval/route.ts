import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { queueShadowDraft } from '@/lib/outreach/shadow-approval';

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as Parameters<typeof queueShadowDraft>[0];
  try {
    const result = await queueShadowDraft(body);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shadow approval queue failed';
    const status = message.includes('required') ? 400 : message.includes('not found') ? 404 : message.includes('only available') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
