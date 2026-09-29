'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const checked = (form: FormData, key: string) => form.get(key) === 'on';
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export async function saveNotificationPreferences(form: FormData) {
  const ctx = await getCurrentOrganization();
  const service = createSupabaseServiceClient();
  const { error } = await service.rpc('set_notification_preferences', {
    p_organization_id: ctx.organizationId,
    p_user_id: ctx.userId,
    p_in_app_enabled: checked(form, 'in_app_enabled'),
    p_telegram_enabled: checked(form, 'telegram_enabled'),
    p_email_enabled: checked(form, 'email_enabled'),
    p_push_enabled: checked(form, 'push_enabled'),
    p_sms_enabled: checked(form, 'sms_enabled'),
    p_minimum_severity: text(form, 'minimum_severity') || 'MEDIUM',
    p_escalation_enabled: checked(form, 'escalation_enabled'),
  });
  if (error) throw new Error(error.message);
  revalidatePath('/notifications');
}

async function mutateNotificationState(form: FormData, action: 'READ'|'ACKNOWLEDGE') {
  const ctx = await getCurrentOrganization();
  const id = text(form, 'id');
  if (!id) throw new Error('Notification id is required');
  const service = createSupabaseServiceClient();
  const { error } = await service.rpc('mark_notification_state', {
    p_organization_id: ctx.organizationId,
    p_user_id: ctx.userId,
    p_notification_id: id,
    p_action: action,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/notifications');
}

export async function markNotificationRead(form: FormData) {
  await mutateNotificationState(form, 'READ');
}

export async function acknowledgeNotification(form: FormData) {
  await mutateNotificationState(form, 'ACKNOWLEDGE');
}
