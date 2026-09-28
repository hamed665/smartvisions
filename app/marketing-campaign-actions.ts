'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const allowedRoles = new Set(['OWNER', 'ADMIN', 'SALES_MANAGER']);
const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const required = (form: FormData, key: string) => {
  const value = text(form, key);
  if (!value) throw new Error(`${key} is required`);
  return value;
};
const integer = (form: FormData, key: string) => {
  const value = Number(required(form, key));
  if (!Number.isInteger(value)) throw new Error(`${key} must be an integer`);
  return value;
};
const optionalIso = (form: FormData, key: string) => {
  const value = text(form, key);
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${key} must be a valid date/time`);
  return parsed.toISOString();
};
const requiredIso = (form: FormData, key: string) => {
  const value = optionalIso(form, key);
  if (!value) throw new Error(`${key} is required`);
  return value;
};

function currencyDecimals(currency: string) {
  if (['OMR', 'BHD', 'KWD', 'JOD', 'TND'].includes(currency)) return 3;
  if (['JPY', 'KRW'].includes(currency)) return 0;
  return 2;
}

function toMinorUnits(amount: string, currency: string) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('budget must be a positive number');
  const factor = 10 ** currencyDecimals(currency);
  const minor = Math.round(numeric * factor);
  if (!Number.isSafeInteger(minor) || minor < 1) throw new Error('budget is outside the supported range');
  return minor;
}

async function operator() {
  const ctx = await getCurrentOrganization();
  if (!allowedRoles.has(ctx.role)) throw new Error('Marketing campaign management requires OWNER, ADMIN or SALES_MANAGER');
  return ctx;
}

function service() {
  return createSupabaseServiceClient();
}

function refresh() {
  revalidatePath('/campaigns');
  revalidatePath('/messages');
  revalidatePath('/audit');
}

export async function createMarketingCampaign(form: FormData) {
  const ctx = await operator();
  const supabase = service();
  const currency = required(form, 'budget_currency').toUpperCase();
  const requestKey = required(form, 'request_key');

  const { error } = await supabase.rpc('create_marketing_campaign', {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_name: required(form, 'name'),
    p_country_code: required(form, 'country_code').toUpperCase(),
    p_audience_snapshot_id: required(form, 'audience_snapshot_id'),
    p_channel: required(form, 'channel').toUpperCase(),
    p_scheduled_start_at: requiredIso(form, 'scheduled_start_at'),
    p_scheduled_end_at: optionalIso(form, 'scheduled_end_at'),
    p_frequency_cap_per_recipient: integer(form, 'frequency_cap_per_recipient'),
    p_budget_cap_minor: toMinorUnits(required(form, 'budget_amount'), currency),
    p_budget_currency: currency,
    p_request_key: requestKey,
  });

  if (error) throw new Error(error.message);
  refresh();
}

export async function upsertMarketingCampaignVariant(form: FormData) {
  const ctx = await operator();
  const supabase = service();

  const { error } = await supabase.rpc('upsert_marketing_campaign_variant', {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_campaign_id: required(form, 'campaign_id'),
    p_message_template_id: required(form, 'message_template_id'),
    p_variant_key: required(form, 'variant_key'),
    p_strategy: required(form, 'strategy'),
    p_allocation_bps: integer(form, 'allocation_bps'),
    p_is_control: form.get('is_control') === 'on',
  });

  if (error) throw new Error(error.message);
  refresh();
}

export async function transitionMarketingCampaign(form: FormData) {
  const ctx = await operator();
  const supabase = service();
  const action = required(form, 'action').toUpperCase();

  if (!['SUBMIT', 'APPROVE', 'REJECT', 'START', 'PAUSE', 'RESUME', 'COMPLETE'].includes(action)) {
    throw new Error('Unsupported marketing campaign transition');
  }
  if (['APPROVE', 'REJECT'].includes(action) && !['OWNER', 'ADMIN'].includes(ctx.role)) {
    throw new Error('Approval decisions require OWNER or ADMIN');
  }

  const { error } = await supabase.rpc('transition_marketing_campaign', {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_campaign_id: required(form, 'campaign_id'),
    p_action: action,
  });

  if (error) throw new Error(error.message);
  refresh();
}

export async function recordMarketingCampaignConversion(form: FormData) {
  const ctx = await operator();
  const supabase = service();

  const { error } = await supabase.rpc('record_marketing_campaign_conversion', {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_campaign_id: required(form, 'campaign_id'),
    p_message_variant_id: text(form, 'message_variant_id') || null,
    p_deal_id: required(form, 'deal_id'),
    p_evidence_note: required(form, 'evidence_note'),
    p_occurred_at: requiredIso(form, 'occurred_at'),
    p_request_key: required(form, 'request_key'),
  });

  if (error) throw new Error(error.message);
  refresh();
}
