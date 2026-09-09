import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFollowupSchedule, type FollowupChannel } from './followups';

export type PersistedFollowupChannel = Extract<FollowupChannel, 'EMAIL' | 'WHATSAPP'>;

export function isGrowthFirstTouchIdempotencyKey(value?: string | null) {
  return String(value ?? '').trim().startsWith('growth-first-touch:');
}

export async function ensureFirstTouchFollowupJobs(input: {
  supabase: SupabaseClient;
  organizationId: string;
  leadId: string;
  channel: PersistedFollowupChannel;
  sentAt: Date | string;
  idempotencyKey?: string | null;
  campaignId?: string | null;
}) {
  if (!isGrowthFirstTouchIdempotencyKey(input.idempotencyKey)) {
    return { action: 'SKIPPED' as const, reason: 'NOT_GROWTH_FIRST_TOUCH', created: 0, existing: 0 };
  }

  const sentAt = input.sentAt instanceof Date ? input.sentAt : new Date(input.sentAt);
  if (Number.isNaN(sentAt.getTime())) {
    return { action: 'SKIPPED' as const, reason: 'INVALID_SENT_AT', created: 0, existing: 0 };
  }

  const schedule = buildFollowupSchedule({ sentAt, channel: input.channel });
  if (!schedule.length) {
    return { action: 'SKIPPED' as const, reason: 'NO_CHANNEL_FOLLOWUPS', created: 0, existing: 0 };
  }

  const sequences = schedule.map((job) => job.sequence);
  const { data: existingRows, error: existingError } = await input.supabase
    .from('followup_jobs')
    .select('id,sequence,status')
    .eq('organization_id', input.organizationId)
    .eq('lead_id', input.leadId)
    .eq('channel', input.channel)
    .in('sequence', sequences);
  if (existingError) throw new Error(`Follow-up reconciliation lookup failed: ${existingError.message}`);

  const existingSequences = new Set((existingRows ?? []).map((row) => Number(row.sequence)));
  const rows = schedule
    .filter((job) => !existingSequences.has(job.sequence))
    .map((job) => ({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      campaign_id: input.campaignId ?? null,
      channel: input.channel,
      sequence: job.sequence,
      scheduled_at: job.scheduledAt,
      status: 'PENDING',
    }));

  if (!rows.length) {
    return { action: 'RECONCILED' as const, created: 0, existing: existingSequences.size };
  }

  const { data: inserted, error: insertError } = await input.supabase
    .from('followup_jobs')
    .insert(rows)
    .select('id,sequence');
  if (insertError) {
    if (insertError.code === '23505') {
      return { action: 'RECONCILED' as const, created: 0, existing: schedule.length };
    }
    throw new Error(`Follow-up reconciliation insert failed: ${insertError.message}`);
  }

  return {
    action: 'RECONCILED' as const,
    created: inserted?.length ?? rows.length,
    existing: existingSequences.size,
  };
}
