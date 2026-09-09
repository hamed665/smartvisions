import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isGrowthFirstTouchIdempotencyKey } from '@/lib/outreach/followup-persistence';

describe('follow-up runtime wiring', () => {
  it('schedules only canonical growth first-touch sends', () => {
    expect(isGrowthFirstTouchIdempotencyKey('growth-first-touch:lead-1')).toBe(true);
    expect(isGrowthFirstTouchIdempotencyKey('growth-first-touch:whatsapp-opt-in:lead-1')).toBe(true);
    expect(isGrowthFirstTouchIdempotencyKey('followup:job-1')).toBe(false);
    expect(isGrowthFirstTouchIdempotencyKey('agent-reply:message-1')).toBe(false);
  });

  it('persists the originating channel on existing follow-up jobs instead of creating a parallel queue', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0066_followup_channel_binding.sql'), 'utf8');
    expect(migration).toContain('alter table public.followup_jobs');
    expect(migration).toContain("channel in ('EMAIL', 'WHATSAPP')");
    expect(migration).toContain('followup_jobs_lead_channel_sequence_unique');
  });

  it('reconciles SENT first-touch messages and consumes jobs on their persisted channel', () => {
    const tick = readFileSync(resolve(process.cwd(), 'app/api/operations/tick/route.ts'), 'utf8');
    expect(tick).toContain('ensureFirstTouchFollowupJobs');
    expect(tick).toContain(".eq('status', 'SENT').in('channel', ['EMAIL','WHATSAPP'])");
    expect(tick).toContain(".select('id,organization_id,lead_id,campaign_id,channel,sequence,scheduled_at,status')");
    expect(tick).toContain(".eq('channel', jobChannel)");
  });
});
