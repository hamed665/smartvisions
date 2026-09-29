import type { SupabaseClient } from '@supabase/supabase-js';
import { ResendEmailProvider } from '@/lib/outreach/resend-provider';
import { assertPaidOperationAllowed, getCostGuardState, recordUsage } from '@/lib/reliability/cost-guard';
import { getTelegramRuntimeConfig } from '@/lib/telegram/config';
import { notifyTelegramOwner } from '@/lib/telegram/notifications';

type JsonRecord = Record<string, unknown>;

type DeliveryCandidate = {
  notification_id: string;
  recipient_user_id: string;
  member_role: string;
  event_key: string;
  notification_type: string;
  severity: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: JsonRecord;
  escalation_level: number;
};

const record = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};

async function recordDelivery(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    notificationId: string;
    channel: 'TELEGRAM'|'EMAIL'|'PUSH'|'SMS';
    escalationLevel: number;
    status: 'SENT'|'FAILED'|'BLOCKED_EXTERNAL'|'SKIPPED'|'DUPLICATE';
    providerMessageId?: string | null;
    reason?: string | null;
    payload?: JsonRecord;
  },
) {
  const { data, error } = await supabase.rpc('record_notification_delivery', {
    p_organization_id: input.organizationId,
    p_notification_id: input.notificationId,
    p_channel: input.channel,
    p_escalation_level: input.escalationLevel,
    p_status: input.status,
    p_provider_message_id: input.providerMessageId ?? null,
    p_reason: input.reason ?? null,
    p_payload: input.payload ?? {},
  });
  if (error) throw new Error(`Notification delivery receipt failed: ${error.message}`);
  return data;
}

async function candidates(
  supabase: SupabaseClient,
  organizationId: string,
  channel: 'TELEGRAM'|'EMAIL'|'PUSH'|'SMS',
  limit: number,
) {
  const { data, error } = await supabase.rpc('get_notification_delivery_candidates', {
    p_organization_id: organizationId,
    p_channel: channel,
    p_limit: limit,
  });
  if (error) throw new Error(`Notification candidate lookup failed: ${error.message}`);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    payload: record(row.payload),
    escalation_level: Number(row.escalation_level ?? 0),
  })) as DeliveryCandidate[];
}

function formatNotification(candidate: DeliveryCandidate) {
  return [
    `[${candidate.severity}] ${candidate.title}`,
    candidate.body,
    candidate.entity_type && candidate.entity_id
      ? `${candidate.entity_type}: ${candidate.entity_id}`
      : '',
    candidate.escalation_level > 0
      ? `Escalation level: ${candidate.escalation_level}`
      : '',
  ].filter(Boolean).join('\n');
}

async function deliverTelegram(
  supabase: SupabaseClient,
  organizationId: string,
  limit: number,
) {
  const rows = await candidates(supabase, organizationId, 'TELEGRAM', limit);
  const config = getTelegramRuntimeConfig();
  let sent = 0;
  let blocked = 0;
  let failed = 0;
  let duplicate = 0;

  for (const candidate of rows) {
    if (
      !config
      || config.organizationId !== organizationId
      || config.ownerUserId !== candidate.recipient_user_id
    ) {
      // Configuration blockers are intentionally not terminal receipts.
      // The candidate remains eligible after configuration is fixed.
      blocked += 1;
      continue;
    }

    const eventKey = [
      'automation-notification',
      candidate.notification_id,
      String(candidate.escalation_level),
    ].join(':');

    const result = await notifyTelegramOwner({
      supabase,
      eventKey,
      notificationType: 'SYSTEM_ALERT',
      text: formatNotification(candidate),
      entityType: candidate.entity_type ?? 'notification',
      entityId: candidate.entity_id ?? candidate.notification_id,
      payload: {
        source: 'AUTO_NOTIFICATIONS',
        notificationId: candidate.notification_id,
        notificationType: candidate.notification_type,
        severity: candidate.severity,
        escalationLevel: candidate.escalation_level,
      },
    });

    if (result.sent) {
      await recordDelivery(supabase, {
        organizationId,
        notificationId: candidate.notification_id,
        channel: 'TELEGRAM',
        escalationLevel: candidate.escalation_level,
        status: 'SENT',
        providerMessageId: String(result.messageId),
        payload: {
          reconciliationRequired: result.reconciliationRequired,
          telegramEventKey: eventKey,
        },
      });
      sent += 1;
    } else if ('reason' in result && result.reason === 'DUPLICATE') {
      await recordDelivery(supabase, {
        organizationId,
        notificationId: candidate.notification_id,
        channel: 'TELEGRAM',
        escalationLevel: candidate.escalation_level,
        status: 'DUPLICATE',
        reason: 'TELEGRAM_EVENT_ALREADY_SENT',
        payload: { telegramEventKey: eventKey },
      });
      duplicate += 1;
    } else if ('reason' in result && result.reason === 'NOT_CONFIGURED') {
      blocked += 1;
    } else {
      await recordDelivery(supabase, {
        organizationId,
        notificationId: candidate.notification_id,
        channel: 'TELEGRAM',
        escalationLevel: candidate.escalation_level,
        status: 'FAILED',
        reason: 'error' in result ? result.error : 'TELEGRAM_NOTIFICATION_FAILED',
      });
      failed += 1;
    }
  }

  return { candidates: rows.length, sent, blocked, failed, duplicate };
}

async function emailReadiness(
  supabase: SupabaseClient,
  organizationId: string,
) {
  const [{ data: settings, error: settingsError }, { data: connection, error: connectionError }] = await Promise.all([
    supabase.from('organization_settings')
      .select('notification_email,config')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase.from('integration_connections')
      .select('enabled,status')
      .eq('organization_id', organizationId)
      .eq('provider', 'EMAIL_PROVIDER')
      .eq('channel', 'EMAIL')
      .maybeSingle(),
  ]);

  if (settingsError || connectionError) {
    throw new Error(settingsError?.message ?? connectionError?.message ?? 'Notification email readiness lookup failed');
  }

  const settingsConfig = record(settings?.config);
  const to = String(settings?.notification_email ?? '').trim();
  const mailboxId = String(settingsConfig.notificationMailboxId ?? '').trim();

  if (!to || !mailboxId) {
    return {
      ready: false as const,
      reason: 'NOTIFICATION_EMAIL_OR_MAILBOX_NOT_CONFIGURED',
      to,
      mailboxId,
    };
  }
  if (!connection?.enabled || connection.status !== 'CONNECTED') {
    return {
      ready: false as const,
      reason: 'EMAIL_PROVIDER_NOT_CONNECTED',
      to,
      mailboxId,
    };
  }

  const { data: mailbox, error: mailboxError } = await supabase.from('mailboxes')
    .select('id,enabled,health_status')
    .eq('organization_id', organizationId)
    .eq('id', mailboxId)
    .maybeSingle();
  if (mailboxError) throw new Error(`Notification mailbox lookup failed: ${mailboxError.message}`);
  if (!mailbox?.enabled || String(mailbox.health_status).toUpperCase() !== 'HEALTHY') {
    return {
      ready: false as const,
      reason: 'NOTIFICATION_MAILBOX_NOT_HEALTHY',
      to,
      mailboxId,
    };
  }

  return { ready: true as const, to, mailboxId };
}

async function deliverEmail(
  supabase: SupabaseClient,
  organizationId: string,
  limit: number,
) {
  const rows = await candidates(supabase, organizationId, 'EMAIL', limit);
  if (!rows.length) return { candidates: 0, sent: 0, blocked: 0, failed: 0 };

  const readiness = await emailReadiness(supabase, organizationId);
  if (!readiness.ready) {
    // Configuration blockers are not terminal receipts. Once the canonical
    // destination/mailbox/provider becomes ready, these candidates can send.
    return {
      candidates: rows.length,
      sent: 0,
      blocked: rows.length,
      failed: 0,
      blocker: readiness.reason,
    };
  }

  const provider = new ResendEmailProvider();
  let sent = 0;
  let failed = 0;

  for (const candidate of rows) {
    const idempotencyKey = [
      'notification',
      candidate.notification_id,
      'email',
      String(candidate.escalation_level),
    ].join(':');

    try {
      assertPaidOperationAllowed(await getCostGuardState(organizationId), 'CRITICAL');
      const result = await provider.sendEmail({
        mailboxId: readiness.mailboxId,
        to: readiness.to,
        subject: `[${candidate.severity}] ${candidate.title}`,
        text: formatNotification(candidate),
        idempotencyKey,
      });
      await recordUsage({
        organizationId,
        provider: 'EMAIL_PROVIDER',
        operation: 'INTERNAL_NOTIFICATION_EMAIL',
        costUsd: 0,
        units: 1,
        metadata: {
          notificationId: candidate.notification_id,
          escalationLevel: candidate.escalation_level,
          providerMessageId: result.providerMessageId,
        },
      });
      await recordDelivery(supabase, {
        organizationId,
        notificationId: candidate.notification_id,
        channel: 'EMAIL',
        escalationLevel: candidate.escalation_level,
        status: 'SENT',
        providerMessageId: result.providerMessageId,
        payload: { idempotencyKey },
      });
      sent += 1;
    } catch (error) {
      await recordDelivery(supabase, {
        organizationId,
        notificationId: candidate.notification_id,
        channel: 'EMAIL',
        escalationLevel: candidate.escalation_level,
        status: 'FAILED',
        reason: error instanceof Error ? error.message.slice(0, 1000) : 'NOTIFICATION_EMAIL_FAILED',
        payload: { idempotencyKey },
      });
      failed += 1;
    }
  }

  return { candidates: rows.length, sent, blocked: 0, failed };
}

export async function runAutomationNotifications(input: {
  supabase: SupabaseClient;
  organizationId: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(100, Math.round(input.limit ?? 50)));

  const projection = await input.supabase.rpc('project_automation_notifications', {
    p_organization_id: input.organizationId,
    p_limit: limit * 4,
  });
  if (projection.error) throw new Error(`Notification projection failed: ${projection.error.message}`);

  const escalation = await input.supabase.rpc('reconcile_notification_escalations', {
    p_organization_id: input.organizationId,
    p_limit: limit,
  });
  if (escalation.error) throw new Error(`Notification escalation failed: ${escalation.error.message}`);

  const telegram = await deliverTelegram(input.supabase, input.organizationId, limit);
  const email = await deliverEmail(input.supabase, input.organizationId, limit);

  return {
    projection: record(projection.data),
    escalation: record(escalation.data),
    telegram,
    email,
    push: {
      status: 'DEPENDENCY_PENDING',
      reason: 'DEVICE_REGISTRATION_AND_PUSH_PROVIDER_NOT_CONFIGURED',
    },
    sms: {
      status: 'DEPENDENCY_PENDING',
      reason: 'OMNI_SMS_RCS_PROVIDER_ROUTE_NOT_PRODUCTION_VERIFIED',
    },
  };
}

export async function getAutomationNotificationReadiness(input: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  role: string;
}) {
  const telegram = getTelegramRuntimeConfig();
  const email = await emailReadiness(input.supabase, input.organizationId);

  return {
    inApp: { ready: true },
    telegram: {
      ready: Boolean(
        input.role === 'OWNER'
        && telegram
        && telegram.organizationId === input.organizationId
        && telegram.ownerUserId === input.userId
      ),
    },
    email: {
      ready: email.ready,
      reason: email.ready ? null : email.reason,
    },
    push: {
      ready: false,
      reason: 'DEVICE_REGISTRATION_AND_PUSH_PROVIDER_NOT_CONFIGURED',
    },
    sms: {
      ready: false,
      reason: 'OMNI_SMS_RCS_PROVIDER_ROUTE_NOT_PRODUCTION_VERIFIED',
    },
  };
}
