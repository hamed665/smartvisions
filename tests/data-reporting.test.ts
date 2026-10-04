import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  latestDueReportingOccurrence,
  normalizeReportingSchedule,
  reportingScheduleSourceEventKey,
} from '@/lib/analytics/reporting-schedule';
import {
  buildGovernedDataReport,
  detectDataReportAnomalies,
  resolveDataReportLanguage,
} from '@/lib/analytics/reporting';
import type { DashboardSnapshot } from '@/lib/analytics/dashboard';

const workerSource = readFileSync('worker/index.ts', 'utf8');
const scheduleRouteSource = readFileSync('app/api/operations/data-reporting-schedules/route.ts', 'utf8');
const runtimeSource = readFileSync('lib/automation/runtime.ts', 'utf8');
const migrationSource = readFileSync('supabase/migrations/20261004125500_data_reporting.sql', 'utf8');
const builderSource = readFileSync('components/automations/AutomationBuilder.tsx', 'utf8');
const testRouteSource = readFileSync('app/api/automations/test/route.ts', 'utf8');

function snapshot(daily: DashboardSnapshot['daily'] = []): DashboardSnapshot {
  return {
    schemaVersion: 1,
    generatedAt: '2026-10-04T12:00:00.000Z',
    window: {
      days: 30,
      startAt: '2026-09-04T12:00:00.000Z',
      endAt: '2026-10-04T12:00:00.000Z',
    },
    scope: {
      level: 'ORGANIZATION',
      organizationId: '00000000-0000-0000-0000-000000000001',
      tenantBusinessId: null,
      branchId: null,
      label: 'Smart Visions',
    },
    scopeOptions: { businesses: [], branches: [] },
    freshness: {
      warehouseLastCompleteThrough: '2026-10-04T11:59:00.000Z',
      warehouseLastSourceEventAt: '2026-10-04T11:59:00.000Z',
      warehouseLagSeconds: 60,
      warehouseFactCount: 9531,
      historyTruncated: false,
    },
    historical: [{
      key: 'payment.captured.amount',
      label: 'Captured payments',
      value: null,
      unit: 'MONEY',
      valuesByUnit: { OMR: 15, USD: 20 },
      available: true,
      reason: 'Multiple currencies are kept separate.',
      source: 'WAREHOUSE',
      definitionVersion: 1,
    }],
    live: [{
      key: 'leads.total',
      label: 'Leads',
      value: 19,
      available: true,
      reason: null,
      source: 'LIVE_CANONICAL_STATE',
    }],
    unavailable: [{
      key: 'retention',
      label: 'Retention',
      available: false,
      reason: 'No governed retention metric exists.',
      source: 'UNAVAILABLE',
    }],
    daily,
    notes: ['Governed analytics evidence only.'],
  };
}

describe('DATA-REPORTING schedule contracts', () => {
  it('normalizes all governed cadence families', () => {
    expect(normalizeReportingSchedule({
      cadence: 'DAILY', timezone: 'Asia/Muscat', time: '08:00',
    })).toEqual({ cadence: 'DAILY', timezone: 'Asia/Muscat', time: '08:00' });

    expect(normalizeReportingSchedule({
      cadence: 'WEEKLY', timezone: 'Asia/Muscat', time: '09:30', weekday: 1,
    }).weekday).toBe(1);

    expect(normalizeReportingSchedule({
      cadence: 'MONTHLY', timezone: 'Europe/London', time: '07:15', dayOfMonth: 28,
    }).dayOfMonth).toBe(28);

    expect(normalizeReportingSchedule({
      cadence: 'CUSTOM', timezone: 'America/New_York', time: '18:00', weekdays: [5, 1, 5, 3],
    }).weekdays).toEqual([1, 3, 5]);
  });

  it('fails closed for invalid timezone, time and bounded day selectors', () => {
    expect(() => normalizeReportingSchedule({
      cadence: 'DAILY', timezone: 'Mars/Olympus', time: '08:00',
    })).toThrow(/timezone/i);
    expect(() => normalizeReportingSchedule({
      cadence: 'DAILY', timezone: 'Asia/Muscat', time: '25:00',
    })).toThrow(/time/i);
    expect(() => normalizeReportingSchedule({
      cadence: 'WEEKLY', timezone: 'Asia/Muscat', time: '08:00', weekday: 8,
    })).toThrow(/weekday/i);
    expect(() => normalizeReportingSchedule({
      cadence: 'MONTHLY', timezone: 'Asia/Muscat', time: '08:00', dayOfMonth: 31,
    })).toThrow(/dayOfMonth/i);
  });

  it('resolves deterministic due occurrences in the configured timezone', () => {
    const daily = latestDueReportingOccurrence(
      { cadence: 'DAILY', timezone: 'Asia/Muscat', time: '08:00' },
      new Date('2026-10-04T05:00:00.000Z'),
    );
    expect(daily.scheduledAt).toBe('2026-10-04T04:00:00.000Z');
    expect(daily.occurrenceKey).toBe('DAILY-20261004');

    const weekly = latestDueReportingOccurrence(
      { cadence: 'WEEKLY', timezone: 'Asia/Muscat', time: '08:00', weekday: 1 },
      new Date('2026-10-07T12:00:00.000Z'),
    );
    expect(weekly.occurrenceKey).toMatch(/^WEEKLY-/);

    const monthly = latestDueReportingOccurrence(
      { cadence: 'MONTHLY', timezone: 'Asia/Muscat', time: '08:00', dayOfMonth: 1 },
      new Date('2026-10-04T12:00:00.000Z'),
    );
    expect(monthly.occurrenceKey).toBe('MONTHLY-202610');
  });

  it('builds a bounded idempotency key per rule occurrence', () => {
    expect(reportingScheduleSourceEventKey(
      '00000000-0000-4000-8000-000000000001',
      'DAILY-20261004',
    )).toBe('report.schedule:00000000-0000-4000-8000-000000000001:DAILY-20261004');
  });
});

describe('DATA-REPORTING governed summaries', () => {
  it('uses Organization language fallback and supports EN/AR/FA', () => {
    expect(resolveDataReportLanguage('AUTO', 'fa')).toBe('FA');
    expect(resolveDataReportLanguage('AUTO', 'Arabic')).toBe('AR');
    expect(resolveDataReportLanguage('EN', 'fa')).toBe('EN');
    expect(resolveDataReportLanguage('AUTO', 'unknown')).toBe('EN');
  });

  it('detects only evidence-backed 7d-over-7d anomalies', () => {
    const daily = Array.from({ length: 14 }, (_, index) => ({
      day: `2026-09-${String(21 + index).padStart(2, '0')}`,
      communication: index < 7 ? 1 : 3,
      commerce: 0,
      booking: 0,
      ai: 1,
    }));
    const anomalies = detectDataReportAnomalies(snapshot(daily));
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toMatchObject({
      key: 'communication',
      previous: 7,
      current: 21,
      changePct: 200,
      direction: 'UP',
      severity: 'HIGH',
    });
  });

  it('does not manufacture anomaly evidence from an incomplete 14-day window', () => {
    const daily = Array.from({ length: 13 }, (_, index) => ({
      day: `2026-09-${String(20 + index).padStart(2, '0')}`,
      communication: 50,
      commerce: 0,
      booking: 0,
      ai: 0,
    }));
    expect(detectDataReportAnomalies(snapshot(daily))).toEqual([]);
  });

  it('builds multilingual executive briefing without combining currencies', () => {
    const report = buildGovernedDataReport(snapshot(), {
      language: 'FA',
      summaryMode: 'EXECUTIVE',
      includeAnomalies: true,
    });
    expect(report.text).toContain('خلاصه مدیریتی');
    expect(report.text).toContain('15 OMR · 20 USD');
    expect(report.subject).toContain('Smart Visions');
    expect(report.summaryMode).toBe('EXECUTIVE');
  });
});

describe('DATA-REPORTING architecture', () => {
  it('produces schedules before the existing Automation Runtime in Cloudflare Cron', () => {
    const reportingIndex = workerSource.indexOf('/api/operations/data-reporting-schedules');
    const runtimeIndex = workerSource.indexOf('/api/operations/automation-runtime');
    expect(reportingIndex).toBeGreaterThan(0);
    expect(runtimeIndex).toBeGreaterThan(reportingIndex);
    expect(workerSource).toContain('reportingScheduleEnqueued');
  });

  it('reuses canonical runtime enqueue rather than creating a second scheduler queue', () => {
    expect(scheduleRouteSource).toContain("supabase.rpc('enqueue_automation_runtime_event'");
    expect(scheduleRouteSource).toContain("p_trigger_key: 'SCHEDULE_DUE'");
    expect(scheduleRouteSource).toContain('automationRuleId');
    expect(scheduleRouteSource).not.toContain(".from('report_schedules')");
    expect(scheduleRouteSource).not.toContain(".from('report_queue')");
    expect(migrationSource).not.toContain('create table public.report_');
    expect(migrationSource).not.toContain('create table public.reporting_');
  });

  it('activates the existing export executor and adds deterministic governed summary fields', () => {
    expect(migrationSource).toContain("availability='AVAILABLE'");
    expect(migrationSource).toContain("'scheduleProducer','DATA_REPORTING_RECONCILER'");
    expect(runtimeSource).toContain('buildGovernedDataReport');
    expect(runtimeSource).toContain('resolveDataReportLanguage');
    expect(runtimeSource).toContain('anomalyCount');
  });

  it('exposes reporting cadence in the existing Automation Builder and read-only test mode', () => {
    expect(builderSource).toContain("id: 'daily-executive-report'");
    expect(builderSource).toContain("triggerKey: 'SCHEDULE_DUE'");
    expect(builderSource).toContain('reportSchedule');
    expect(builderSource).toContain("key: 'DELIVER_DATA_EXPORT'");
    expect(testRouteSource).toContain("validate_automation_reporting_schedule");
  });
});
