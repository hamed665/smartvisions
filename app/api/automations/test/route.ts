import { NextResponse } from 'next/server';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

type TestBody = {
  triggerKey?: string;
  conditions?: unknown;
  actions?: unknown;
  config?: unknown;
  subjectId?: string | null;
};

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as TestBody | null;
  const triggerKey = String(body?.triggerKey ?? '').trim().toUpperCase();
  const conditions = body?.conditions;
  const actions = body?.actions;
  const config = body?.config && typeof body.config === 'object' && !Array.isArray(body.config)
    ? body.config as Record<string, unknown>
    : {};
  const subjectId = String(body?.subjectId ?? '').trim() || null;

  if (!triggerKey || !isArray(conditions) || !isArray(actions) || actions.length === 0) {
    return NextResponse.json({
      ok: false,
      error: 'triggerKey, conditions[] and at least one action are required',
    }, { status: 400 });
  }

  const ctx = await getCurrentOrganization(true);
  const service = createSupabaseServiceClient();

  const { data: trigger, error: triggerError } = await service
    .from('automation_trigger_catalog')
    .select('trigger_key,availability,description')
    .eq('trigger_key', triggerKey)
    .maybeSingle();

  if (triggerError) {
    return NextResponse.json({ ok: false, error: triggerError.message }, { status: 409 });
  }
  if (!trigger || trigger.availability !== 'AVAILABLE') {
    return NextResponse.json({
      ok: false,
      error: trigger ? `Trigger is not publishable: ${trigger.availability}` : 'Trigger is not cataloged',
    }, { status: 409 });
  }

  const hasReportingAction = actions.some((item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      && (item as Record<string, unknown>).key === 'DELIVER_DATA_EXPORT'
  );
  if (triggerKey === 'SCHEDULE_DUE' && hasReportingAction) {
    const { error: scheduleError } = await service.rpc(
      'validate_automation_reporting_schedule',
      { p_trigger_key: triggerKey, p_config: config },
    );
    if (scheduleError) {
      return NextResponse.json({ ok: false, error: scheduleError.message }, { status: 409 });
    }
  }

  const { data: conditionLeaves, error: conditionError } = await service.rpc(
    'validate_automation_conditions',
    { p_conditions: conditions },
  );
  if (conditionError) {
    return NextResponse.json({ ok: false, error: conditionError.message }, { status: 409 });
  }

  const { data: expectedSubject, error: expectedError } = await service.rpc(
    'automation_trigger_expected_condition_subject',
    { p_trigger_key: triggerKey },
  );
  if (expectedError) {
    return NextResponse.json({ ok: false, error: expectedError.message }, { status: 409 });
  }

  let conditionSubject: string | null = null;
  if (conditions.length > 0) {
    const { data, error } = await service.rpc(
      'automation_conditions_subject_type',
      { p_conditions: conditions },
    );
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    conditionSubject = typeof data === 'string' ? data : null;
    if (conditionSubject && !expectedSubject) {
      return NextResponse.json({
        ok: false,
        error: `Trigger ${triggerKey} does not support canonical subject conditions`,
      }, { status: 409 });
    }
    if (conditionSubject && expectedSubject && conditionSubject !== expectedSubject) {
      return NextResponse.json({
        ok: false,
        error: `Condition subject ${conditionSubject} does not match trigger subject ${expectedSubject}`,
      }, { status: 409 });
    }
  }

  const { data: actionCount, error: actionError } = await service.rpc(
    'validate_automation_actions',
    {
      p_organization_id: ctx.organizationId,
      p_actions: actions,
      p_for_publish: true,
    },
  );
  if (actionError) {
    return NextResponse.json({ ok: false, error: actionError.message }, { status: 409 });
  }

  const { error: scopeError } = await service.rpc(
    'validate_automation_runtime_action_scopes',
    {
      p_trigger_key: triggerKey,
      p_actions: actions,
    },
  );
  if (scopeError) {
    return NextResponse.json({ ok: false, error: scopeError.message }, { status: 409 });
  }

  const { error: configError } = await service.rpc(
    'validate_automation_runtime_action_configs',
    { p_actions: actions },
  );
  if (configError) {
    return NextResponse.json({ ok: false, error: configError.message }, { status: 409 });
  }

  let sample: { matched: boolean; leafCount: number } | null = null;
  if (subjectId) {
    if (!expectedSubject) {
      return NextResponse.json({
        ok: false,
        error: 'This trigger has no fixed canonical subject for record-based condition testing',
      }, { status: 409 });
    }

    const { data, error } = await service.rpc('evaluate_automation_conditions', {
      p_organization_id: ctx.organizationId,
      p_subject_type: expectedSubject,
      p_subject_id: subjectId,
      p_conditions: conditions,
    });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row === 'object') {
      const record = row as Record<string, unknown>;
      sample = {
        matched: record.matched === true,
        leafCount: Number(record.leaf_count ?? conditionLeaves ?? 0),
      };
    }
  }

  return NextResponse.json({
    ok: true,
    triggerSubject: typeof expectedSubject === 'string' ? expectedSubject : null,
    conditionSubject,
    conditionLeaves: Number(conditionLeaves ?? 0),
    actionCount: Number(actionCount ?? actions.length),
    sample,
    sideEffects: false,
  });
}
