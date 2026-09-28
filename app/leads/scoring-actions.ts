'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import {
  canMutateCrmLeadScoring,
  clearCrmLeadScoreOverride,
  recomputeCrmLeadEngagement,
  setCrmLeadScoreOverride,
} from '@/lib/crm/lead-scoring';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const required = (form: FormData, key: string) => {
  const value = text(form, key);
  if (!value) throw new Error(key + ' is required');
  return value;
};
const integer = (form: FormData, key: string) => {
  const value = Number(required(form, key));
  if (!Number.isInteger(value)) throw new Error(key + ' must be an integer');
  return value;
};

async function context() {
  const ctx = await getCurrentOrganization();
  if (!canMutateCrmLeadScoring(ctx.role)) {
    throw new Error('Lead scoring mutation requires OWNER, ADMIN or SALES_MANAGER');
  }
  return { ...ctx, service: createSupabaseServiceClient() };
}

function refresh(leadId: string) {
  revalidatePath('/leads');
  revalidatePath('/hot-leads');
  revalidatePath('/leads/' + leadId);
}

export async function recomputeLeadEngagement(form: FormData) {
  const ctx = await context();
  const leadId = required(form, 'leadId');
  const expectedRevision = integer(form, 'expectedRevision');
  await recomputeCrmLeadEngagement({
    service: ctx.service,
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    leadId,
    expectedRevision,
    requestKey: 'ui-engagement-' + randomUUID(),
  });
  refresh(leadId);
}

export async function setLeadScoreOverride(form: FormData) {
  const ctx = await context();
  const leadId = required(form, 'leadId');
  const expectedRevision = integer(form, 'expectedRevision');
  const overrideScore = integer(form, 'overrideScore');
  const reason = required(form, 'reason');
  if (overrideScore < 0 || overrideScore > 100) throw new Error('overrideScore must be between 0 and 100');
  if (reason.length > 240) throw new Error('reason is too long');

  const expiresRaw = text(form, 'expiresAt');
  const expiresAt = expiresRaw ? new Date(expiresRaw).toISOString() : null;

  await setCrmLeadScoreOverride({
    service: ctx.service,
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    leadId,
    overrideScore,
    reason,
    expiresAt,
    expectedRevision,
    requestKey: 'ui-override-set-' + randomUUID(),
  });
  refresh(leadId);
}

export async function clearLeadScoreOverride(form: FormData) {
  const ctx = await context();
  const leadId = required(form, 'leadId');
  const expectedRevision = integer(form, 'expectedRevision');
  const reason = required(form, 'reason');
  if (reason.length > 240) throw new Error('reason is too long');

  await clearCrmLeadScoreOverride({
    service: ctx.service,
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    leadId,
    reason,
    expectedRevision,
    requestKey: 'ui-override-clear-' + randomUUID(),
  });
  refresh(leadId);
}
