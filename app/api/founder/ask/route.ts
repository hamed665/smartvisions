import { NextResponse } from 'next/server';

import { analyzeFounderQuestion } from '@/lib/founder/intelligence';
import { normalizeFounderHistory } from '@/lib/founder/intelligence-core';
import { founderOsV1Enabled, loadFounderStatusV1 } from '@/lib/founder/server';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const current = await getCurrentOrganization();
    if (current.role !== 'OWNER') {
      return NextResponse.json({ error: 'Founder intelligence is OWNER-only' }, { status: 403 });
    }

    const body = await request.json() as { question?: unknown; history?: unknown };
    const question = String(body.question ?? '').trim();
    if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 });
    if (question.length > 4_000) {
      return NextResponse.json({ error: 'question is too long' }, { status: 400 });
    }

    const service = createSupabaseServiceClient();
    const flag = await founderOsV1Enabled({
      supabase: service,
      organizationId: current.organizationId,
    });
    if (!flag.enabled) {
      return NextResponse.json({ error: 'Founder OS is not enabled' }, { status: 404 });
    }

    const status = await loadFounderStatusV1({
      supabase: service,
      organizationId: current.organizationId,
    });
    const result = await analyzeFounderQuestion({
      organizationId: current.organizationId,
      question,
      status,
      history: normalizeFounderHistory(body.history),
    });

    return NextResponse.json(
      { result },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Founder intelligence failed';
    const status = /Authentication|membership/i.test(message)
      ? 401
      : /OWNER-only/i.test(message)
        ? 403
        : /required|too long/i.test(message)
          ? 400
          : /Cost Guard|budget|runtime|Kill Switch|paused/i.test(message)
            ? 409
            : 500;
    return NextResponse.json({ error: message.slice(0, 600) }, { status });
  }
}
