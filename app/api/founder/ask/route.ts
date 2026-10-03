import { NextResponse } from 'next/server';

import { analyzeFounderQuestion } from '@/lib/founder/intelligence';
import { normalizeFounderHistory } from '@/lib/founder/intelligence-core';
import { founderOsV1Enabled, loadFounderStatusV1 } from '@/lib/founder/server';
import { loadFounderFinanceV1 } from '@/lib/founder/finance-server';
import { loadFounderInvestorWorkspaceV1 } from '@/lib/founder/investor-server';
import { loadFounderCapitalWorkspaceV1 } from '@/lib/founder/capital-server';
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

    const [status, finance, investor, capital] = await Promise.all([
      loadFounderStatusV1({
        supabase: service,
        organizationId: current.organizationId,
      }),
      loadFounderFinanceV1({
        supabase: service,
        organizationId: current.organizationId,
      }),
      loadFounderInvestorWorkspaceV1({
        supabase: service,
        organizationId: current.organizationId,
      }),
      loadFounderCapitalWorkspaceV1({
        supabase: service,
        organizationId: current.organizationId,
      }),
    ]);
    const result = await analyzeFounderQuestion({
      organizationId: current.organizationId,
      question,
      status,
      finance,
      investor,
      capital,
      history: normalizeFounderHistory(body.history),
      signal: request.signal,
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
