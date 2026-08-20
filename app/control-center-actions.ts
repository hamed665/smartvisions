'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';

function requiredText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function numeric(formData: FormData, key: string) {
  const value = Number(formData.get(key));
  if (!Number.isFinite(value)) throw new Error(`${key} must be numeric`);
  return value;
}

export async function updateService(formData: FormData) {
  const { supabase, organizationId } = await getCurrentOrganization(true);
  const id = requiredText(formData, 'id');
  const name = requiredText(formData, 'name');
  const enabled = formData.get('enabled') === 'on';
  const { error } = await supabase.from('services').update({ name, enabled, updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', id);
  if (error) throw error;
  revalidatePath('/services');
}

export async function createService(formData: FormData) {
  const { supabase, organizationId } = await getCurrentOrganization(true);
  const id = requiredText(formData, 'id').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const name = requiredText(formData, 'name');
  const { error } = await supabase.from('services').insert({ id, organization_id: organizationId, name, enabled: true, config: {} });
  if (error) throw error;
  revalidatePath('/services');
}

export async function updatePrice(formData: FormData) {
  const { supabase, organizationId } = await getCurrentOrganization(true);
  const id = requiredText(formData, 'id');
  const values = {
    price: numeric(formData, 'price'),
    minimum_price: numeric(formData, 'minimum_price'),
    max_auto_discount_pct: numeric(formData, 'max_auto_discount_pct'),
    max_discount_with_approval_pct: numeric(formData, 'max_discount_with_approval_pct'),
  };
  const { error } = await supabase.from('service_prices').update(values).eq('organization_id', organizationId).eq('id', id);
  if (error) throw error;
  revalidatePath('/pricing');
}

export async function updateMarket(formData: FormData) {
  const { supabase, organizationId } = await getCurrentOrganization(true);
  const id = requiredText(formData, 'id');
  const enabled = formData.get('enabled') === 'on';
  const currency = requiredText(formData, 'currency').toUpperCase();
  const timezone = requiredText(formData, 'timezone');
  const send_window_start = requiredText(formData, 'send_window_start');
  const send_window_end = requiredText(formData, 'send_window_end');
  const { error } = await supabase.from('market_settings').update({ enabled, currency, timezone, send_window_start, send_window_end, updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', id);
  if (error) throw error;
  revalidatePath('/markets');
}

export async function updateAgent(formData: FormData) {
  const { supabase, organizationId } = await getCurrentOrganization(true);
  const id = requiredText(formData, 'id');
  const enabled = formData.get('enabled') === 'on';
  const model = requiredText(formData, 'model');
  const temperature = numeric(formData, 'temperature');
  const max_tokens = Math.round(numeric(formData, 'max_tokens'));
  const confidence_threshold = numeric(formData, 'confidence_threshold');
  if (temperature < 0 || temperature > 2) throw new Error('temperature out of range');
  if (confidence_threshold < 0 || confidence_threshold > 1) throw new Error('confidence threshold out of range');
  const { error } = await supabase.from('agent_settings').update({ enabled, model, temperature, max_tokens, confidence_threshold, updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', id);
  if (error) throw error;
  revalidatePath('/agents');
}

export async function updateApprovalRule(formData: FormData) {
  const { supabase, organizationId } = await getCurrentOrganization(true);
  const id = requiredText(formData, 'id');
  const requires_approval = formData.get('requires_approval') === 'on';
  const { error } = await supabase.from('approval_rules').update({ requires_approval, updated_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', id);
  if (error) throw error;
  revalidatePath('/system');
}
