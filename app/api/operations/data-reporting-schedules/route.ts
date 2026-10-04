import { NextResponse } from 'next/server';

import { requireInternalApiKey } from '@/lib/security/internal-api';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import {
  latestDueReportingOccurrence,
  normalizeReportingSchedule,
  reportingScheduleSourceEventKey,
} from '@/lib/analytics/reporting-schedule';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function boundedLimit(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(500, Math.trunc(n))) : 200;
}

function hasReportingAction(actions: unknown) {
  return Array.isArray(actions) && actions.some((item) => {
    const row = record(item);
    return row.key === 'DELIVER_DATA_EXPORT';
  });
}

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({})) as { limit?: number; now?: string };
  const limit = boundedLimit(body.limit);
  const now = body.now ? new Date(body.now) : new Date();
  if (!Number.isFinite(now.getTime())) {
    return NextResponse.json({ error: 'now is invalid' }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data: rules, error: rulesError } = await supabase
    .from('automation_rules')
    .select('id,organization_id,latest_published_version')
    .eq('trigger_key', 'SCHEDULE_DUE')
    .eq('enabled', true)
    .eq('execution_state', 'READY')
    .gt('latest_published_version', 0)
    .order('organization_id', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);
  if (rulesError) {
    return NextResponse.json({ error: `Reporting schedule lookup failed: ${rulesError.message}` }, { status: 503 });
  }
  if (!rules?.length) {
    return NextResponse.json({
      rules: 0,
      reportingRules: 0,
      due: 0,
      enqueued: 0,
      replayed: 0,
      failed: 0,
      results: [],
    });
  }

  const ruleIds = rules.map(rule => String(rule.id));
  const { data: versions, error: versionsError } = await supabase
    .from('automation_rule_versions')
    .select('automation_rule_id,version,trigger_key,config,actions,published_at')
    .in('automation_rule_id', ruleIds)
    .eq('trigger_key', 'SCHEDULE_DUE');
  if (versionsError) {
    return NextResponse.json({ error: `Reporting schedule version lookup failed: ${versionsError.message}` }, { status: 503 });
  }

  const currentVersion = new Map<string, JsonRecord>();
  for (const version of versions ?? []) {
    const rule = rules.find(row =>
      String(row.id) === String(version.automation_rule_id)
      && Number(row.latest_published_version) === Number(version.version)
    );
    if (rule) currentVersion.set(String(rule.id), version as unknown as JsonRecord);
  }

  const results: JsonRecord[] = [];
  let reportingRules = 0;
  let due = 0;
  let enqueued = 0;
  let replayed = 0;
  let failed = 0;

  for (const rule of rules) {
    const ruleId = String(rule.id);
    const version = currentVersion.get(ruleId);
    if (!version || !hasReportingAction(version.actions)) continue;
    reportingRules += 1;

    try {
      const config = record(version.config);
      const schedule = normalizeReportingSchedule(config.reportSchedule);
      const occurrence = latestDueReportingOccurrence(schedule, now);
      const publishedAt = new Date(String(version.published_at ?? ''));
      if (!Number.isFinite(publishedAt.getTime())) {
        throw new Error('Published reporting version is missing a valid published_at boundary');
      }
      if (new Date(occurrence.scheduledAt).getTime() < publishedAt.getTime()) {
        results.push({
          ruleId,
          organizationId: String(rule.organization_id),
          occurrenceKey: occurrence.occurrenceKey,
          scheduledAt: occurrence.scheduledAt,
          skipped: 'OCCURRENCE_PRECEDES_PUBLISHED_VERSION',
        });
        continue;
      }
      const sourceEventKey = reportingScheduleSourceEventKey(ruleId, occurrence.occurrenceKey);
      due += 1;

      const { data, error } = await supabase.rpc('enqueue_automation_runtime_event', {
        p_organization_id: String(rule.organization_id),
        p_trigger_key: 'SCHEDULE_DUE',
        p_source_event_key: sourceEventKey,
        p_subject_type: null,
        p_subject_id: null,
        p_trigger_payload: {
          automationRuleId: ruleId,
          reportingOccurrence: occurrence,
          reportSchedule: schedule,
          producer: 'DATA_REPORTING_RECONCILER',
        },
        // Runtime deadlines are measured from actual enqueue time. The governed
        // due occurrence stays in trigger payload/sourceEventKey as evidence.
        p_scheduled_at: now.toISOString(),
      });
      if (error) throw new Error(error.message);

      const outcome = record(data);
      const matched = Number(outcome.matchedRules ?? 0);
      const added = Number(outcome.enqueuedRuns ?? 0);
      const duplicates = Number(outcome.replayedRuns ?? 0);
      if (matched !== 1 || added + duplicates !== 1) {
        throw new Error(`Targeted reporting enqueue contract mismatch: matched=${matched} enqueued=${added} replayed=${duplicates}`);
      }

      enqueued += added;
      replayed += duplicates;
      results.push({
        ruleId,
        organizationId: String(rule.organization_id),
        occurrenceKey: occurrence.occurrenceKey,
        scheduledAt: occurrence.scheduledAt,
        enqueued: added,
        replayed: duplicates,
      });
    } catch (error) {
      failed += 1;
      results.push({
        ruleId,
        organizationId: String(rule.organization_id),
        error: error instanceof Error ? error.message.slice(0, 800) : 'Reporting schedule reconciliation failed',
      });
    }
  }

  return NextResponse.json({
    rules: rules.length,
    reportingRules,
    due,
    enqueued,
    replayed,
    failed,
    results,
  }, { status: failed ? 207 : 200 });
}
