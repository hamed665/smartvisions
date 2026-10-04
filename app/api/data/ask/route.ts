import { NextResponse } from 'next/server';

import { answerDataQuestion } from '@/lib/analytics/ask';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

function optionalId(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, 100) : null;
}

export async function POST(request: Request) {
  try {
    const current = await getCurrentOrganization();
    const body = await request.json() as {
      question?: unknown;
      days?: unknown;
      businessId?: unknown;
      branchId?: unknown;
    };
    const question = String(body.question ?? '').trim();
    if (!question) return NextResponse.json({ error: 'question is required' }, { status: 400 });
    if (question.length > 4_000) {
      return NextResponse.json({ error: 'question is too long' }, { status: 400 });
    }

    const result = await answerDataQuestion({
      supabase: current.supabase,
      organizationId: current.organizationId,
      question,
      requestedDays: body.days,
      requestedTenantBusinessId: optionalId(body.businessId),
      requestedBranchId: optionalId(body.branchId),
      signal: request.signal,
    });

    return NextResponse.json(
      { result },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ask Your Data failed';
    const status = /Authentication required|membership required/i.test(message)
      ? 401
      : /scope is not available|does not belong/i.test(message)
        ? 403
        : /required|too long|valid date|window/i.test(message)
          ? 400
          : /Cost Guard|budget|runtime|Kill Switch|paused|OpenAI is not configured/i.test(message)
            ? 409
            : 500;
    return NextResponse.json({ error: message.slice(0, 600) }, { status });
  }
}
