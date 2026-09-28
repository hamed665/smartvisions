'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const allowedRoles = new Set(['OWNER', 'ADMIN', 'SALES_MANAGER']);
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const required = (form: FormData, key: string) => {
  const value = text(form, key);
  if (!value) throw new Error(`${key} is required`);
  return value;
};

export async function recordMarketingPreference(form: FormData) {
  const ctx = await getCurrentOrganization();
  if (!allowedRoles.has(ctx.role)) {
    throw new Error('Marketing preference management requires OWNER, ADMIN or SALES_MANAGER');
  }

  const occurred = new Date(required(form, 'occurred_at'));
  if (!Number.isFinite(occurred.getTime())) throw new Error('occurred_at must be a valid date/time');

  const action = required(form, 'action').toUpperCase();
  if (!['GRANT', 'REVOKE'].includes(action)) throw new Error('Unsupported permission action');

  const service = createSupabaseServiceClient();
  const { error } = await service.rpc('record_marketing_permission_event', {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_lead_id: required(form, 'lead_id'),
    p_channel: required(form, 'channel').toUpperCase(),
    p_purpose: 'MARKETING',
    p_action: action,
    p_recipient: required(form, 'recipient'),
    p_source_type: required(form, 'source_type').toUpperCase(),
    p_source_reference: required(form, 'source_reference'),
    p_legal_basis: required(form, 'legal_basis').toUpperCase(),
    p_occurred_at: occurred.toISOString(),
    p_preference_center_managed: form.get('preference_center_managed') === 'on',
    p_request_key: text(form, 'request_key') || `marketing-permission-${randomUUID()}`,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/preferences');
  revalidatePath('/suppression');
  revalidatePath('/audit');
}
