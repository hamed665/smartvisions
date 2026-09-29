import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

type EventBody = {
  organizationId?: string;
  triggerKey?: string;
  sourceEventKey?: string;
  subjectType?: string | null;
  subjectId?: string | null;
  payload?: Record<string, unknown>;
  scheduledAt?: string;
};

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json().catch(() => null) as EventBody | null;
  if (!body?.organizationId || !body.triggerKey || !body.sourceEventKey) {
    return NextResponse.json({
      error: 'organizationId, triggerKey and sourceEventKey are required',
    }, { status: 400 });
  }
  if ((body.subjectType && !body.subjectId) || (!body.subjectType && body.subjectId)) {
    return NextResponse.json({ error: 'subjectType and subjectId must be supplied together' }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc('enqueue_automation_runtime_event', {
    p_organization_id: body.organizationId,
    p_trigger_key: body.triggerKey,
    p_source_event_key: body.sourceEventKey,
    p_subject_type: body.subjectType ?? null,
    p_subject_id: body.subjectId ?? null,
    p_trigger_payload: body.payload ?? {},
    p_scheduled_at: body.scheduledAt ?? new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json(data ?? {});
}
