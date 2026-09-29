'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

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

function integer(formData: FormData, key: string, min: number, max: number) {
  const value = Number(formData.get(key));
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(key + ' must be an integer between ' + min + ' and ' + max);
  }
  return value;
}

function optionalInteger(formData: FormData, key: string, min: number, max: number) {
  const raw = String(formData.get(key) ?? '').trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(key + ' must be an integer between ' + min + ' and ' + max);
  }
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

export async function updateServiceBookingCatalog(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const serviceId = requiredText(formData, 'service_id');
  const bookingEnabled = formData.get('booking_enabled') === 'on';
  const durationMinutes = optionalInteger(formData, 'duration_minutes', 5, 1440);
  if (bookingEnabled && durationMinutes === null) throw new Error('duration_minutes is required for a bookable service');

  const branchIds = formData.getAll('branch_id').map(value => String(value)).filter(Boolean);
  const staffUserIds = formData.getAll('staff_user_id').map(value => String(value)).filter(Boolean);
  const eligibleStaffRoles = formData.getAll('eligible_staff_role').map(value => String(value)).filter(Boolean);
  const resourceRequirements = formData.getAll('resource_id').map(value => {
    const resourceId = String(value);
    return {
      resourceId,
      quantity: integer(formData, 'resource_quantity_' + resourceId, 1, 100),
    };
  });

  const bookingRules: Record<string, unknown> = {
    allowCustomerCancel: formData.get('allow_customer_cancel') === 'on',
    allowCustomerReschedule: formData.get('allow_customer_reschedule') === 'on',
    requiresConfirmation: formData.get('requires_confirmation') === 'on',
  };
  const minimumNoticeMinutes = optionalInteger(formData, 'minimum_notice_minutes', 0, 10080);
  const maximumAdvanceDays = optionalInteger(formData, 'maximum_advance_days', 1, 730);
  const cancellationNoticeMinutes = optionalInteger(formData, 'cancellation_notice_minutes', 0, 10080);
  const slotIncrementMinutes = optionalInteger(formData, 'slot_increment_minutes', 5, 720);
  if (minimumNoticeMinutes !== null) bookingRules.minimumNoticeMinutes = minimumNoticeMinutes;
  if (maximumAdvanceDays !== null) bookingRules.maximumAdvanceDays = maximumAdvanceDays;
  if (cancellationNoticeMinutes !== null) bookingRules.cancellationNoticeMinutes = cancellationNoticeMinutes;
  if (slotIncrementMinutes !== null) bookingRules.slotIncrementMinutes = slotIncrementMinutes;

  const bookingService = createSupabaseServiceClient();
  const { error } = await bookingService.rpc('configure_service_booking_catalog', {
    p_organization_id: ctx.organizationId,
    p_actor_user_id: ctx.userId,
    p_service_id: serviceId,
    p_booking_enabled: bookingEnabled,
    p_duration_minutes: durationMinutes,
    p_buffer_before_minutes: integer(formData, 'buffer_before_minutes', 0, 1440),
    p_buffer_after_minutes: integer(formData, 'buffer_after_minutes', 0, 1440),
    p_capacity_per_slot: integer(formData, 'capacity_per_slot', 1, 1000),
    p_location_mode: requiredText(formData, 'location_mode').toUpperCase(),
    p_staff_mode: requiredText(formData, 'staff_mode').toUpperCase(),
    p_eligible_staff_roles: eligibleStaffRoles,
    p_booking_rules: bookingRules,
    p_branch_ids: branchIds,
    p_staff_user_ids: staffUserIds,
    p_resource_requirements: resourceRequirements,
    p_request_key: 'booking-catalog:' + serviceId + ':' + crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  revalidatePath('/services');
}

export async function createBookingResource(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const code = requiredText(formData, 'code').toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
  if (!/^[A-Z][A-Z0-9_-]{1,79}$/.test(code)) throw new Error('resource code is invalid');
  const payload = {
    organization_id: ctx.organizationId,
    branch_id: optionalText(formData, 'branch_id'),
    code,
    name: requiredText(formData, 'name'),
    resource_type: requiredText(formData, 'resource_type').toUpperCase(),
    capacity: integer(formData, 'capacity', 1, 1000),
    status: 'ACTIVE',
    metadata: {},
  };
  const { data, error } = await ctx.supabase.from('booking_resources').insert(payload).select('id').single();
  if (error) throw error;
  await audit(ctx, 'CREATE_BOOKING_RESOURCE', 'booking_resource', String(data.id), payload);
  revalidatePath('/services');
}

export async function updateBookingResource(formData: FormData) {
  const ctx = await getCurrentOrganization(true);
  const id = requiredText(formData, 'id');
  const code = requiredText(formData, 'code').toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
  if (!/^[A-Z][A-Z0-9_-]{1,79}$/.test(code)) throw new Error('resource code is invalid');
  const payload = {
    branch_id: optionalText(formData, 'branch_id'),
    code,
    name: requiredText(formData, 'name'),
    resource_type: requiredText(formData, 'resource_type').toUpperCase(),
    capacity: integer(formData, 'capacity', 1, 1000),
    status: requiredText(formData, 'status').toUpperCase(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await ctx.supabase.from('booking_resources')
    .update(payload)
    .eq('organization_id', ctx.organizationId)
    .eq('id', id);
  if (error) throw error;
  await audit(ctx, 'UPDATE_BOOKING_RESOURCE', 'booking_resource', id, payload);
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
