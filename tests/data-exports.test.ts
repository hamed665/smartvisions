import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  makeDataExportArtifact,
  normalizeDataExportFormat,
  serializeDataExportCsv,
  serializeDataExportJson,
  serializeDataExportPdf,
  serializeDataExportXlsx,
} from '@/lib/analytics/export-core';
import type { DashboardSnapshot } from '@/lib/analytics/dashboard';

const routeSource = readFileSync('app/api/data/export/route.ts', 'utf8');
const exportSource = readFileSync('lib/analytics/export.ts', 'utf8');
const runtimeSource = readFileSync('lib/automation/runtime.ts', 'utf8');
const migrationSource = readFileSync('supabase/migrations/20261004122500_data_exports.sql', 'utf8');
const resendSource = readFileSync('lib/outreach/resend-provider.ts', 'utf8');

const snapshot: DashboardSnapshot = {
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
    label: 'Organization',
  },
  scopeOptions: { businesses: [], branches: [] },
  freshness: {
    warehouseLastCompleteThrough: '2026-10-04T11:59:00.000Z',
    warehouseLastSourceEventAt: '2026-10-04T11:59:00.000Z',
    warehouseLagSeconds: 60,
    warehouseFactCount: 12,
    historyTruncated: false,
  },
  historical: [{
    key: 'payment.captured.amount',
    label: 'Captured amount',
    value: null,
    unit: 'MONEY',
    valuesByUnit: { OMR: 12.5, USD: 20 },
    available: true,
    reason: 'Multiple currencies are kept separate; no cross-currency total is manufactured.',
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
    reason: 'No canonical retention metric exists.',
    source: 'UNAVAILABLE',
  }],
  daily: [{
    day: '2026-10-04',
    communication: 3,
    commerce: 2,
    booking: 1,
    ai: 4,
  }],
  notes: ['Governed evidence only.'],
};

describe('DATA-EXPORTS', () => {
  it('accepts only the four internally generated formats', () => {
    expect(normalizeDataExportFormat('csv')).toBe('CSV');
    expect(normalizeDataExportFormat('JSON')).toBe('JSON');
    expect(normalizeDataExportFormat('xlsx')).toBe('XLSX');
    expect(normalizeDataExportFormat('pdf')).toBe('PDF');
    expect(normalizeDataExportFormat('google_sheets')).toBeNull();
    expect(normalizeDataExportFormat('sql')).toBeNull();
  });

  it('serializes CSV and JSON without merging currencies', () => {
    const csv = new TextDecoder().decode(serializeDataExportCsv(snapshot));
    expect(csv).toContain('12.5 OMR | 20 USD');
    expect(csv).toContain('Multiple currencies are kept separate');
    const json = JSON.parse(new TextDecoder().decode(serializeDataExportJson(snapshot)));
    expect(json.historical[0].valuesByUnit).toEqual({ OMR: 12.5, USD: 20 });
    expect(json.exportKind).toBe('GOVERNED_ANALYTICS_SNAPSHOT');
  });

  it('emits real XLSX ZIP and PDF byte signatures without third-party export authority', () => {
    const xlsx = serializeDataExportXlsx(snapshot);
    expect(String.fromCharCode(...xlsx.slice(0, 2))).toBe('PK');
    const pdf = new TextDecoder().decode(serializeDataExportPdf(snapshot).slice(0, 8));
    expect(pdf).toContain('%PDF-1.4');
  });

  it('creates deterministic attachment metadata by format', () => {
    const csv = makeDataExportArtifact(snapshot, 'CSV');
    const xlsx = makeDataExportArtifact(snapshot, 'XLSX');
    expect(csv.filename).toContain('smart-visions-analytics-organization-30d-2026-10-04.csv');
    expect(xlsx.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it('reuses authenticated dashboard scope and contains no arbitrary SQL export path', () => {
    expect(routeSource).toContain('getCurrentOrganization()');
    expect(exportSource).toContain('loadDataDashboard({');
    expect(routeSource).toContain('GOOGLE_SHEETS_CONNECTION_NOT_CONFIGURED');
    expect(routeSource).not.toContain('.rpc(');
    expect(routeSource).not.toContain('.from(');
    expect(exportSource).not.toContain('SELECT ');
  });

  it('reuses Automation Runtime + canonical schedule and email authorities for delivery', () => {
    expect(migrationSource).toContain("'DELIVER_DATA_EXPORT'");
    expect(migrationSource).toContain('"scheduleAuthority":"SCHEDULE_DUE"');
    expect(migrationSource).toContain("'AUTOMATION_RULE'");
    expect(runtimeSource).toContain("case 'DELIVER_DATA_EXPORT':");
    expect(runtimeSource).toContain("organization_settings");
    expect(runtimeSource).toContain("notificationMailboxId");
    expect(runtimeSource).toContain("SCHEDULED_DATA_EXPORT");
    expect(resendSource).toContain('input.attachments');
  });

  it('does not invent a Google Sheets credential path', () => {
    expect(migrationSource).toContain('"googleSheetsPublishing":false');
    expect(routeSource).toContain('BLOCKED_EXTERNAL');
    expect(routeSource).not.toContain('GOOGLE_CLIENT');
    expect(routeSource).not.toContain('GOOGLE_SHEETS_TOKEN');
  });
});
