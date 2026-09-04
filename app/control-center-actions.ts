'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';

function requiredText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function optionalText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim();
  return value || null;
}

function numeric(formData: FormData, key: string) {
  const value = Number(formData.get(key));
  if (!Number.isFinite(value)) throw new Error(`${key} must be numeric`);
  return value;
}

function optionalNumeric(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${key} must be numeric`);
  return value;
}

async function audit(
  ctx: Awaited<ReturnType<typeof getCurrentOrganization>>,
  action: string,
  entityType: string,
  entityId: string,
  afterData: unknown,
) {
  const { error } = await ctx.supabase.from('audit_logs').insert({
    organization_id: ctx.organizationId,
    actor_type: 'USER',
    actor_id: ctx.userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    after_data: afterData,
  });
  if (error) throw new Error(`Audit log failed: ${error.message}`);
}

export async function updateService(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const id = requiredText(formData, 'id');
  const payload = { name: requiredText(formData, 'name'), enabled: formData.get('enabled') === 'on', updated_at: new Date().toISOString() };
  const { error } = await ctx.supabase.from('services').update(payload).eq('organization_id', ctx.organizationId).eq('id', id);
  if (error) throw error;
  await audit(ctx, 'UPDATE_SERVICE', 'service', id, payload);
  revalidatePath('/services');
}

export async function createService(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const id = requiredText(formData, 'id').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const payload = { id, organization_id: ctx.organizationId, name: requiredText(formData, 'name'), enabled: true, config: {} };
  const { error } = await ctx.supabase.from('services').insert(payload);
  if (error) throw error;
  await audit(ctx, 'CREATE_SERVICE', 'service', id, payload);
  revalidatePath('/services');
}

export async function updatePrice(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const id = requiredText(formData, 'id');
  const values = {
    price: numeric(formData, 'price'),
    minimum_price: numeric(formData, 'minimum_price'),
    max_auto_discount_pct: numeric(formData, 'max_auto_discount_pct'),
    max_discount_with_approval_pct: numeric(formData, 'max_discount_with_approval_pct'),
  };
  if (values.minimum_price > values.price) throw new Error('minimum_price cannot exceed price');
  if (values.max_auto_discount_pct < 0 || values.max_discount_with_approval_pct < values.max_auto_discount_pct) throw new Error('discount thresholds are invalid');
  const { error } = await ctx.supabase.from('service_prices').update(values).eq('organization_id', ctx.organizationId).eq('id', id);
  if (error) throw error;
  await audit(ctx, 'UPDATE_SERVICE_PRICE', 'service_price', id, values);
  revalidatePath('/pricing');
}

export async function updateMarket(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const id = requiredText(formData, 'id');
  const { data: current, error: readError } = await ctx.supabase.from('market_settings').select('config').eq('organization_id', ctx.organizationId).eq('id', id).maybeSingle();
  if (readError || !current) throw new Error(readError?.message ?? 'Market not found');
  const config = { ...((current.config ?? {}) as Record<string, unknown>) };
  config.coldEmailEnabled = formData.get('cold_email_enabled') === 'on';
  config.whatsappColdEnabled = formData.get('whatsapp_cold_enabled') === 'on';
  config.instagramAutoColdEnabled = formData.get('instagram_auto_cold_enabled') === 'on';
  const payload = {
    enabled: formData.get('enabled') === 'on',
    currency: requiredText(formData, 'currency').toUpperCase(),
    timezone: requiredText(formData, 'timezone'),
    send_window_start: requiredText(formData, 'send_window_start'),
    send_window_end: requiredText(formData, 'send_window_end'),
    config,
    updated_at: new Date().toISOString(),
  };
  const { error } = await ctx.supabase.from('market_settings').update(payload).eq('organization_id', ctx.organizationId).eq('id', id);
  if (error) throw error;
  await audit(ctx, 'UPDATE_MARKET_SETTINGS', 'market_settings', id, payload);
  revalidatePath('/markets');
}

export async function updateAgent(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const id = requiredText(formData, 'id');
  const { data: current, error: readError } = await ctx.supabase.from('agent_settings').select('agent_name,config').eq('organization_id', ctx.organizationId).eq('id', id).maybeSingle();
  if (readError || !current) throw new Error(readError?.message ?? 'Agent not found');

  const confidence_threshold = numeric(formData, 'confidence_threshold');
  if (confidence_threshold < 0 || confidence_threshold > 1) throw new Error('confidence threshold out of range');

  const config = { ...((current.config ?? {}) as Record<string, unknown>) };
  if (current.agent_name === 'preview_director') {
    const generation = optionalNumeric(formData, 'generation_score_threshold');
    const heavy = optionalNumeric(formData, 'heavy_generation_score_threshold');
    if (generation !== null && (generation < 0 || generation > 100)) throw new Error('generation threshold out of range');
    if (heavy !== null && (heavy < 0 || heavy > 100)) throw new Error('heavy generation threshold out of range');
    if (generation !== null) config.generation_score_threshold = generation;
    if (heavy !== null) config.heavy_generation_score_threshold = heavy;
  }

  const payload = {
    enabled: formData.get('enabled') === 'on',
    model: optionalText(formData, 'model'),
    confidence_threshold,
    config,
    updated_at: new Date().toISOString(),
  };
  const { error } = await ctx.supabase.from('agent_settings').update(payload).eq('organization_id', ctx.organizationId).eq('id', id);
  if (error) throw error;
  await audit(ctx, 'UPDATE_AGENT_SETTINGS', 'agent_settings', id, payload);
  revalidatePath('/agents');
}

export async function updateApprovalRule(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const id = requiredText(formData, 'id');
  const payload = { requires_approval: formData.get('requires_approval') === 'on', updated_at: new Date().toISOString() };
  const { error } = await ctx.supabase.from('approval_rules').update(payload).eq('organization_id', ctx.organizationId).eq('id', id);
  if (error) throw error;
  await audit(ctx, 'UPDATE_APPROVAL_RULE', 'approval_rule', id, payload);
  revalidatePath('/system');
}
