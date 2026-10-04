import { DateTime } from 'luxon';

export type ReportingCadence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM';

export type ReportingSchedule = {
  cadence: ReportingCadence;
  timezone: string;
  time: string;
  weekday?: number;
  dayOfMonth?: number;
  weekdays?: number[];
};

export type ReportingOccurrence = {
  cadence: ReportingCadence;
  occurrenceKey: string;
  scheduledAt: string;
  localScheduledAt: string;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function integer(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function validTime(value: unknown) {
  const text = String(value ?? '').trim();
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { text, hour, minute };
}

function validZone(value: unknown) {
  const timezone = String(value ?? '').trim();
  if (!timezone || timezone.length > 120) return null;
  return DateTime.now().setZone(timezone).isValid ? timezone : null;
}

export function normalizeReportingSchedule(value: unknown): ReportingSchedule {
  const input = record(value);
  const cadence = String(input.cadence ?? '').trim().toUpperCase() as ReportingCadence;
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'].includes(cadence)) {
    throw new Error('Reporting schedule cadence must be DAILY, WEEKLY, MONTHLY or CUSTOM');
  }

  const timezone = validZone(input.timezone);
  if (!timezone) throw new Error('Reporting schedule timezone must be a valid IANA timezone');

  const time = validTime(input.time);
  if (!time) throw new Error('Reporting schedule time must be HH:MM in 24-hour time');

  if (cadence === 'WEEKLY') {
    const weekday = integer(input.weekday);
    if (weekday == null || weekday < 1 || weekday > 7) {
      throw new Error('Weekly reporting schedule weekday must be 1..7');
    }
    return { cadence, timezone, time: time.text, weekday };
  }

  if (cadence === 'MONTHLY') {
    const dayOfMonth = integer(input.dayOfMonth);
    if (dayOfMonth == null || dayOfMonth < 1 || dayOfMonth > 28) {
      throw new Error('Monthly reporting schedule dayOfMonth must be 1..28');
    }
    return { cadence, timezone, time: time.text, dayOfMonth };
  }

  if (cadence === 'CUSTOM') {
    if (!Array.isArray(input.weekdays)) {
      throw new Error('Custom reporting schedule requires weekdays[]');
    }
    const weekdays = [...new Set(input.weekdays.map(integer).filter((v): v is number => v != null))].sort((a, b) => a - b);
    if (!weekdays.length || weekdays.length > 7 || weekdays.some(day => day < 1 || day > 7)) {
      throw new Error('Custom reporting weekdays must contain 1..7 unique weekday values');
    }
    return { cadence, timezone, time: time.text, weekdays };
  }

  return { cadence, timezone, time: time.text };
}

function withScheduleTime(base: DateTime, time: string) {
  const parsed = validTime(time);
  if (!parsed) throw new Error('Reporting schedule time is invalid');
  return base.set({ hour: parsed.hour, minute: parsed.minute, second: 0, millisecond: 0 });
}

function occurrence(schedule: ReportingSchedule, local: DateTime): ReportingOccurrence {
  const scheduledAt = local.toUTC().toISO();
  const localScheduledAt = local.toISO();
  if (!scheduledAt || !localScheduledAt) throw new Error('Reporting schedule occurrence could not be serialized');

  let occurrenceKey: string;
  if (schedule.cadence === 'MONTHLY') {
    occurrenceKey = `MONTHLY-${local.toFormat('yyyyLL')}`;
  } else if (schedule.cadence === 'WEEKLY') {
    occurrenceKey = `WEEKLY-${local.toFormat("kkkk-'W'WW-c")}`;
  } else if (schedule.cadence === 'CUSTOM') {
    occurrenceKey = `CUSTOM-${local.toFormat('yyyyLLdd-HHmm')}`;
  } else {
    occurrenceKey = `DAILY-${local.toFormat('yyyyLLdd')}`;
  }

  return { cadence: schedule.cadence, occurrenceKey, scheduledAt, localScheduledAt };
}

export function latestDueReportingOccurrence(
  rawSchedule: ReportingSchedule | unknown,
  now = new Date(),
): ReportingOccurrence {
  const schedule = normalizeReportingSchedule(rawSchedule);
  const utcNow = DateTime.fromJSDate(now, { zone: 'utc' });
  if (!utcNow.isValid) throw new Error('Reporting schedule now is invalid');

  const localNow = utcNow.setZone(schedule.timezone);
  if (!localNow.isValid) throw new Error('Reporting schedule timezone conversion failed');

  if (schedule.cadence === 'DAILY') {
    let target = withScheduleTime(localNow.startOf('day'), schedule.time);
    if (target > localNow) target = target.minus({ days: 1 });
    return occurrence(schedule, target);
  }

  if (schedule.cadence === 'WEEKLY') {
    let target = withScheduleTime(
      localNow.startOf('week').plus({ days: (schedule.weekday ?? 1) - 1 }),
      schedule.time,
    );
    if (target > localNow) target = target.minus({ weeks: 1 });
    return occurrence(schedule, target);
  }

  if (schedule.cadence === 'MONTHLY') {
    let target = withScheduleTime(
      localNow.startOf('month').set({ day: schedule.dayOfMonth ?? 1 }),
      schedule.time,
    );
    if (target > localNow) {
      target = withScheduleTime(
        localNow.minus({ months: 1 }).startOf('month').set({ day: schedule.dayOfMonth ?? 1 }),
        schedule.time,
      );
    }
    return occurrence(schedule, target);
  }

  const candidates = (schedule.weekdays ?? []).map((weekday) => {
    let candidate = withScheduleTime(
      localNow.startOf('week').plus({ days: weekday - 1 }),
      schedule.time,
    );
    if (candidate > localNow) candidate = candidate.minus({ weeks: 1 });
    return candidate;
  });
  if (!candidates.length) throw new Error('Custom reporting schedule has no weekday');
  const target = candidates.reduce((latest, candidate) =>
    candidate.toMillis() > latest.toMillis() ? candidate : latest,
  );
  return occurrence(schedule, target);
}

export function reportingScheduleSourceEventKey(ruleId: string, occurrenceKey: string) {
  const rule = String(ruleId).trim().toLowerCase();
  const occurrence = String(occurrenceKey).trim().toUpperCase();
  const key = `report.schedule:${rule}:${occurrence}`;
  if (!/^[A-Za-z0-9._:-]{1,240}$/.test(key)) {
    throw new Error('Reporting schedule source-event key is invalid');
  }
  return key;
}
