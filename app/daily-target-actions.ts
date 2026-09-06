'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { omanDateKey } from '@/lib/outreach/daily-target';

function targetFromForm(form: FormData) {
  const value = Number(String(form.get('target') ?? '30'));
  if (!Number.isFinite(value)) throw new Error('Daily target must be numeric');
  return Math.min(100, Math.max(1, Math.round(value)));
}

export async function setDailyOutreachTarget(form: FormData) {
  const ctx = await getCurrentOrganization(true);
  const target = targetFromForm(form);
  const targetDate = omanDateKey();
  const marker = { dailyOutreachTarget: true, targetDate, marketCode: 'OM' };

  const { data: existingRows, error: lookupError } = await ctx.supabase
    .from('campaigns')
    .select('id,config')
    .eq('organization_id', ctx.organizationId)
    .eq('hunter_type', 'BUSINESS')
    .eq('country_code', 'OM')
    .contains('config', marker)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (lookupError) throw lookupError;

  const existing = existingRows?.[0] ?? null;
  const config = {
    ...(existing?.config && typeof existing.config === 'object' && !Array.isArray(existing.config) ? existing.config : {}),
    ...marker,
    shadowModeRequired: true,
    manualReviewOnly: true,
    outreachMode: 'CONTROLLED',
    outreachEnabled: false,
    autoAcquisitionEnabled: false,
  };
  const payload = {
    name: `Daily Outreach — Oman — ${targetDate}`,
    hunter_type: 'BUSINESS',
    country_code: 'OM',
    city: null,
    industry: null,
    target_count: target,
    status: 'RUNNING',
    config,
    updated_at: new Date().toISOString(),
  };

  let campaignId = existing?.id ? String(existing.id) : '';
  if (campaignId) {
    const { error } = await ctx.supabase
      .from('campaigns')
      .update(payload)
      .eq('organization_id', ctx.organizationId)
      .eq('id', campaignId);
    if (error) throw error;
  } else {
    const { data, error } = await ctx.supabase
      .from('campaigns')
      .insert({ organization_id: ctx.organizationId, ...payload })
      .select('id')
      .single();
    if (error) throw error;
    campaignId = String(data.id);
  }

  const { error: auditError } = await ctx.supabase.from('audit_logs').insert({
    organization_id: ctx.organizationId,
    actor_type: 'USER',
    actor_id: ctx.userId,
    action: 'SET_DAILY_OUTREACH_TARGET',
    entity_type: 'campaign',
    entity_id: campaignId,
    after_data: {
      target,
      targetDate,
      marketCode: 'OM',
      status: 'RUNNING',
      shadowModeRequired: true,
      manualReviewOnly: true,
      outreachEnabled: false,
      providerSendTriggered: false,
    },
  });
  if (auditError) throw new Error(`Audit log failed: ${auditError.message}`);

  revalidatePath('/');
  revalidatePath('/campaigns');
  revalidatePath('/hunters');
}
