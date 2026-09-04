import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyTelegramOwner } from '@/lib/telegram/notifications';

export const OPERATIONAL_ALERT_CODES = [
  'COST_WARNING',
  'COST_THROTTLE',
  'COST_CRITICAL',
  'AGENT_PROCESSING_FAILED',
  'INBOUND_STUCK',
  'FOLLOWUP_FAILED',
  'RECONCILIATION_REQUIRED',
  'KILL_SWITCH_BLOCKED_SEND',
] as const;

export type OperationalAlertCode = (typeof OPERATIONAL_ALERT_CODES)[number];

export function isOperationalAlertCode(value: unknown): value is OperationalAlertCode {
  return typeof value === 'string' && (OPERATIONAL_ALERT_CODES as readonly string[]).includes(value);
}

const title: Record<OperationalAlertCode, string> = {
  COST_WARNING: '💰 Cost Guard warning',
  COST_THROTTLE: '💰 Cost Guard throttled',
  COST_CRITICAL: '🛑 Cost Guard critical',
  AGENT_PROCESSING_FAILED: '⚠️ Agent processing failed',
  INBOUND_STUCK: '⏱ Inbound processing stuck',
  FOLLOWUP_FAILED: '⚠️ Follow-up needs attention',
  RECONCILIATION_REQUIRED: '🧾 Reconciliation required',
  KILL_SWITCH_BLOCKED_SEND: '⛔️ Kill Switch blocked send',
};

export async function notifyOperationalAlert(input: {
  supabase: SupabaseClient;
  organizationId: string;
  code: OperationalAlertCode;
  eventKey: string;
  detail: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
}) {
  return notifyTelegramOwner({
    supabase: input.supabase,
    eventKey: `ops:${input.organizationId}:${input.eventKey}`.slice(0, 240),
    notificationType: 'SYSTEM_ALERT',
    text: [
      title[input.code],
      `Code: ${input.code}`,
      input.detail.slice(0, 1200),
      'این هشدار مدیریتی است و هیچ ارسال خودکاری به مشتری ایجاد نمی‌کند.',
    ].join('\n'),
    entityType: input.entityType ?? 'operations',
    entityId: input.entityId,
    payload: { code: input.code, ...input.payload, outboundTriggered: false },
  });
}
