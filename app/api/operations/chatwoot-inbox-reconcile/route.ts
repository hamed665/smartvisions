import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { processPendingChatwootInboxEvents } from '@/lib/chatwoot/unified-inbox-reconciler';

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null) as { limit?: number } | null;
  const numericLimit = Number(body?.limit);
  const limit = Number.isFinite(numericLimit)
    ? Math.min(25, Math.max(1, Math.trunc(numericLimit)))
    : 10;

  try {
    const summary = await processPendingChatwootInboxEvents({ limit });
    return NextResponse.json(summary);
  } catch {
    return NextResponse.json(
      { error: 'Unified Inbox reconciliation temporarily unavailable' },
      { status: 503 },
    );
  }
}
