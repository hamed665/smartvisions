import type { DashboardSnapshot } from '@/lib/analytics/dashboard';

export type DataReportLanguage = 'EN' | 'AR' | 'FA';
export type DataReportSummaryMode = 'STANDARD' | 'EXECUTIVE';

export type DataReportAnomaly = {
  key: 'communication' | 'commerce' | 'booking' | 'ai';
  label: string;
  current: number;
  previous: number;
  changePct: number | null;
  direction: 'UP' | 'DOWN';
  severity: 'WARN' | 'HIGH';
};

export type GovernedDataReport = {
  language: DataReportLanguage;
  summaryMode: DataReportSummaryMode;
  subject: string;
  text: string;
  anomalies: DataReportAnomaly[];
};

function languageFrom(value: unknown): DataReportLanguage | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['en', 'eng', 'english'].includes(normalized)) return 'EN';
  if (['ar', 'ara', 'arabic', 'العربية', 'عربي'].includes(normalized)) return 'AR';
  if (['fa', 'fas', 'per', 'persian', 'farsi', 'فارسی'].includes(normalized)) return 'FA';
  return null;
}

export function resolveDataReportLanguage(requested: unknown, fallback: unknown): DataReportLanguage {
  const raw = String(requested ?? '').trim().toUpperCase();
  if (raw && raw !== 'AUTO') return languageFrom(raw) ?? 'EN';
  return languageFrom(fallback) ?? 'EN';
}

export function normalizeDataReportSummaryMode(value: unknown): DataReportSummaryMode {
  return String(value ?? '').trim().toUpperCase() === 'EXECUTIVE' ? 'EXECUTIVE' : 'STANDARD';
}

function number(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}

function metricValue(metric: { value: number | null; valuesByUnit?: Record<string, number>; unit?: string }) {
  const units = Object.entries(metric.valuesByUnit ?? {}).sort(([a], [b]) => a.localeCompare(b));
  if (units.length) return units.map(([unit, value]) => `${number(value)} ${unit}`).join(' · ');
  if (metric.value == null) return '—';
  return metric.unit && metric.unit !== 'COUNT'
    ? `${number(metric.value)} ${metric.unit}`
    : number(metric.value);
}

const LABELS = {
  EN: {
    report: 'Smart Visions business report',
    executive: 'Executive briefing',
    standard: 'Business summary',
    scope: 'Scope',
    window: 'Window',
    days: 'days',
    freshness: 'Warehouse freshness',
    facts: 'facts',
    lag: 'lag',
    historical: 'Governed historical metrics',
    live: 'Live canonical gauges',
    anomalies: 'Anomaly alerts',
    none: 'No governed anomaly crossed the alert threshold.',
    unavailable: 'Unavailable governed metrics',
    generated: 'Generated',
    attachment: 'The attached export uses the same governed Metrics Registry and Analytics Warehouse evidence.',
    up: 'up',
    down: 'down',
  },
  AR: {
    report: 'تقرير أعمال Smart Visions',
    executive: 'الملخص التنفيذي',
    standard: 'ملخص الأعمال',
    scope: 'النطاق',
    window: 'الفترة',
    days: 'يوم',
    freshness: 'حداثة مستودع البيانات',
    facts: 'سجل',
    lag: 'تأخير',
    historical: 'المؤشرات التاريخية المعتمدة',
    live: 'المؤشرات الحالية المعتمدة',
    anomalies: 'تنبيهات الشذوذ',
    none: 'لا يوجد شذوذ معتمد تجاوز حد التنبيه.',
    unavailable: 'مؤشرات غير متاحة',
    generated: 'وقت الإنشاء',
    attachment: 'المرفق يستخدم نفس سجل المؤشرات ومستودع التحليلات المعتمد.',
    up: 'ارتفاع',
    down: 'انخفاض',
  },
  FA: {
    report: 'گزارش کسب‌وکار Smart Visions',
    executive: 'خلاصه مدیریتی',
    standard: 'خلاصه کسب‌وکار',
    scope: 'محدوده',
    window: 'بازه',
    days: 'روز',
    freshness: 'تازگی انبار تحلیلی',
    facts: 'رکورد',
    lag: 'تاخیر',
    historical: 'شاخص‌های تاریخی معتبر',
    live: 'شاخص‌های زنده معتبر',
    anomalies: 'هشدارهای ناهنجاری',
    none: 'هیچ ناهنجاری معتبری از آستانه هشدار عبور نکرد.',
    unavailable: 'شاخص‌های غیرقابل‌دسترس',
    generated: 'زمان تولید',
    attachment: 'فایل پیوست از همان Metrics Registry و Analytics Warehouse معتبر استفاده می‌کند.',
    up: 'افزایش',
    down: 'کاهش',
  },
} as const;

const ANOMALY_LABELS: Record<DataReportLanguage, Record<DataReportAnomaly['key'], string>> = {
  EN: { communication: 'Communication activity', commerce: 'Commerce activity', booking: 'Booking activity', ai: 'AI activity' },
  AR: { communication: 'نشاط التواصل', commerce: 'نشاط التجارة', booking: 'نشاط الحجوزات', ai: 'نشاط الذكاء الاصطناعي' },
  FA: { communication: 'فعالیت ارتباطات', commerce: 'فعالیت تجاری', booking: 'فعالیت رزرو', ai: 'فعالیت هوش مصنوعی' },
};

export function detectDataReportAnomalies(snapshot: DashboardSnapshot): DataReportAnomaly[] {
  const rows = snapshot.daily.slice(-14);
  if (rows.length < 14) return [];

  const previousRows = rows.slice(0, 7);
  const currentRows = rows.slice(7);
  const keys: DataReportAnomaly['key'][] = ['communication', 'commerce', 'booking', 'ai'];
  const result: DataReportAnomaly[] = [];

  for (const key of keys) {
    const previous = previousRows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
    const current = currentRows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
    const difference = current - previous;

    if (previous === 0) {
      if (current >= 5) {
        result.push({
          key,
          label: key,
          current,
          previous,
          changePct: null,
          direction: 'UP',
          severity: current >= 10 ? 'HIGH' : 'WARN',
        });
      }
      continue;
    }

    const changePct = Math.round((difference / previous) * 1000) / 10;
    if (Math.abs(changePct) < 50 || Math.abs(difference) < 3) continue;

    result.push({
      key,
      label: key,
      current,
      previous,
      changePct,
      direction: difference >= 0 ? 'UP' : 'DOWN',
      severity: Math.abs(changePct) >= 100 && Math.abs(difference) >= 5 ? 'HIGH' : 'WARN',
    });
  }

  return result.sort((a, b) => {
    const severity = { HIGH: 2, WARN: 1 };
    return severity[b.severity] - severity[a.severity]
      || Math.abs(b.changePct ?? 999) - Math.abs(a.changePct ?? 999);
  });
}

function metricLines(snapshot: DashboardSnapshot, mode: DataReportSummaryMode) {
  const limit = mode === 'EXECUTIVE' ? 8 : 5;
  return {
    historical: snapshot.historical
      .filter(metric => metric.available)
      .slice(0, limit)
      .map(metric => `• ${metric.label}: ${metricValue(metric)}`),
    live: snapshot.live
      .filter(metric => metric.available)
      .slice(0, limit)
      .map(metric => `• ${metric.label}: ${metricValue(metric)}`),
  };
}

export function buildGovernedDataReport(
  snapshot: DashboardSnapshot,
  input: {
    language: DataReportLanguage;
    summaryMode?: DataReportSummaryMode;
    includeAnomalies?: boolean;
  },
): GovernedDataReport {
  const language = input.language;
  const summaryMode = normalizeDataReportSummaryMode(input.summaryMode);
  const labels = LABELS[language];
  const lines = metricLines(snapshot, summaryMode);
  const anomalies = input.includeAnomalies === false ? [] : detectDataReportAnomalies(snapshot);
  const anomalyLines = anomalies.map(anomaly => {
    const direction = anomaly.direction === 'UP' ? labels.up : labels.down;
    const change = anomaly.changePct == null ? 'new activity' : `${Math.abs(anomaly.changePct)}%`;
    return `• [${anomaly.severity}] ${ANOMALY_LABELS[language][anomaly.key]}: ${direction} ${change} (${anomaly.previous} → ${anomaly.current})`;
  });

  const title = summaryMode === 'EXECUTIVE' ? labels.executive : labels.standard;
  const body = [
    `${labels.report} · ${title}`,
    `${labels.scope}: ${snapshot.scope.label} (${snapshot.scope.level})`,
    `${labels.window}: ${snapshot.window.days} ${labels.days}`,
    `${labels.freshness}: ${number(snapshot.freshness.warehouseFactCount)} ${labels.facts} · ${labels.lag}: ${snapshot.freshness.warehouseLagSeconds == null ? '—' : `${number(snapshot.freshness.warehouseLagSeconds)}s`}`,
    '',
    labels.historical,
    ...(lines.historical.length ? lines.historical : ['• —']),
    '',
    labels.live,
    ...(lines.live.length ? lines.live : ['• —']),
    '',
    labels.anomalies,
    ...(anomalyLines.length ? anomalyLines : [`• ${labels.none}`]),
    '',
    `${labels.unavailable}: ${snapshot.unavailable.length}`,
    `${labels.generated}: ${snapshot.generatedAt}`,
    '',
    labels.attachment,
  ];

  return {
    language,
    summaryMode,
    subject: `${labels.report} · ${snapshot.window.days}d · ${snapshot.scope.label}`,
    text: body.join('\n'),
    anomalies,
  };
}
