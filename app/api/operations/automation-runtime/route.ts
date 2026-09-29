import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { runAutomationRuntimeTick } from '@/lib/automation/runtime';
import { POST as approvedSendPost } from '@/app/api/outreach/approved-send/route';

function boundedLimit(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(25, Math.round(n))) : 10;
}

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const internalKey = request.headers.get('x-internal-api-key');
  if (!internalKey) return NextResponse.json({ error: 'Internal API key is required' }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { limit?: number };
  const supabase = createSupabaseServiceClient();
  const workerId = `cloudflare-cron:${crypto.randomUUID()}`;

  try {
    const result = await runAutomationRuntimeTick({
      supabase,
      workerId,
      limit: boundedLimit(body.limit),
      approvedSend: async ({ organizationId, messageId }) => {
        const approvedRequest = new Request('https://smartvisions.internal/api/outreach/approved-send', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-api-key': internalKey,
          },
          body: JSON.stringify({ organizationId, messageId }),
        });
        const response = await approvedSendPost(approvedRequest);
        const parsed = await response.clone().json().catch(() => ({}));
        return {
          status: response.status,
          body: parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {},
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Automation runtime tick failed',
    }, { status: 503 });
  }
}
