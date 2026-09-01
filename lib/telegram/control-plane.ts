import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommandExecutionResult, TelegramCostLimitKey, TelegramOwnerCommand } from './contracts';
import type { ExecutedMutation, PreparedMutation } from './commands-core';
import * as core from './control-plane-core';

export const isControlReadCommand = core.isControlReadCommand;
export const isControlMutation = core.isControlMutation;

const REAL_COST_KEYS = new Set<TelegramCostLimitKey>([
  'monthly_total_budget_usd','openai_budget_usd','google_places_budget_usd','email_budget_usd','whatsapp_budget_usd','daily_new_leads','daily_website_audits','daily_deep_ai_runs',
]);
const INTEGER_COST_KEYS = new Set<TelegramCostLimitKey>(['daily_new_leads','daily_website_audits','daily_deep_ai_runs']);
const now = () => new Date().toISOString();
const rec = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function audit(input: { supabase: SupabaseClient; organizationId: string; ownerUserId: string; command: TelegramOwnerCommand; entityType?: string; entityId?: string; before?: unknown; after?: unknown }) {
  const { error } = await input.supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_type: 'SYSTEM',
    actor_id: null,
    action: `TELEGRAM_${input.command.type}`,
    entity_type: 'telegram_command',
    entity_id: null,
    before_data: input.before ?? null,
    after_data: { telegram_owner_user_id: input.ownerUserId, command_type: input.command.type, source_entity_type: input.entityType ?? null, source_entity_id: input.entityId ?? null, value: input.after ?? null },
  });
  if (error) throw new Error(`Audit log failed: ${error.message}`);
}

async function readCostValue(supabase: SupabaseClient, organizationId: string, key: TelegramCostLimitKey) {
  if (!REAL_COST_KEYS.has(key)) throw new Error('این Cost Guard key در Production وجود ندارد و از Telegram قابل تغییر نیست.');
  const { data, error } = await supabase.from('cost_guard_settings').select(key).eq('organization_id', organizationId).maybeSingle();
  if (error || !data) throw new Error(`Cost Guard lookup failed: ${error?.message ?? 'not found'}`);
  return Number(rec(data)[key] ?? 0);
}

async function readPricePolicy(supabase: SupabaseClient, organizationId: string, serviceId: string, countryCode: string) {
  const { data, error } = await supabase.from('service_prices')
    .select('service_id,country_code,minimum_price,max_auto_discount_pct,max_discount_with_approval_pct')
    .eq('organization_id', organizationId).eq('service_id', serviceId).eq('country_code', countryCode).maybeSingle();
  if (error || !data) throw new Error(`Price policy lookup failed: ${error?.message ?? 'not found'}`);
  return {
    serviceId: String(data.service_id),
    countryCode: String(data.country_code),
    minimumPrice: Number(data.minimum_price ?? 0),
    maxAutoDiscountPct: Number(data.max_auto_discount_pct ?? 0),
    maxDiscountWithApprovalPct: Number(data.max_discount_with_approval_pct ?? 0),
  };
}

export async function executeControlReadCommand(input: { supabase: SupabaseClient; organizationId: string; command: TelegramOwnerCommand }): Promise<CommandExecutionResult> {
  if (input.command.type !== 'SHOW_BUDGET') return core.executeControlReadCommand(input);
  const { data, error } = await input.supabase.from('cost_guard_settings').select('monthly_total_budget_usd,openai_budget_usd,google_places_budget_usd,email_budget_usd,whatsapp_budget_usd,reserve_budget_usd,daily_new_leads,daily_website_audits,daily_deep_ai_runs,warning_pct,throttle_pct,critical_pct,hard_stop_pct,model_routing_enabled,low_cost_model,high_reasoning_model').eq('organization_id', input.organizationId).maybeSingle();
  if (error || !data) throw new Error(`Budget lookup failed: ${error?.message ?? 'not found'}`);
  return { title: 'Cost Guard', text: [
    `Monthly: ${data.monthly_total_budget_usd} USD · reserve ${data.reserve_budget_usd} USD`,
    `OpenAI: ${data.openai_budget_usd} · Google Places: ${data.google_places_budget_usd} · Email: ${data.email_budget_usd} · WhatsApp: ${data.whatsapp_budget_usd} USD`,
    `Daily: leads ${data.daily_new_leads} · website audits ${data.daily_website_audits} · deep AI ${data.daily_deep_ai_runs}`,
    `Thresholds: warn ${data.warning_pct}% · throttle ${data.throttle_pct}% · critical ${data.critical_pct}% · hard stop ${data.hard_stop_pct}%`,
    `Model routing: ${data.model_routing_enabled ? 'ON' : 'OFF'} · low ${data.low_cost_model ?? '—'} · high ${data.high_reasoning_model ?? '—'}`,
  ].join('\n') };
}

export async function prepareControlMutation(input: { supabase: SupabaseClient; organizationId: string; ownerUserId: string; command: TelegramOwnerCommand }): Promise<PreparedMutation> {
  const { command } = input;
  if (command.type === 'SET_COST_LIMIT') {
    if (!REAL_COST_KEYS.has(command.key)) throw new Error('این Cost Guard key در Production وجود ندارد و از Telegram قابل تغییر نیست.');
    const value = Number(command.value);
    const integerKey = INTEGER_COST_KEYS.has(command.key);
    const normalizedValue = integerKey ? Math.round(value) : Math.round(value * 100) / 100;
    const max = integerKey ? 10000 : 100000;
    if (!Number.isFinite(value) || normalizedValue < 0 || normalizedValue > max) throw new Error(`مقدار Cost Guard باید بین 0 و ${max} باشد.`);
    const beforeValue = await readCostValue(input.supabase, input.organizationId, command.key);
    const normalizedCommand: TelegramOwnerCommand = { ...command, value: normalizedValue };
    const before = { key: command.key, value: beforeValue };
    const after = { key: command.key, value: normalizedValue };
    return { command: normalizedCommand, preview: { title:'Cost Guard limit', text:`${command.key}\nBefore: ${beforeValue}\nAfter: ${normalizedValue}`, before, after, entityType:'cost_guard_settings', entityId:input.organizationId, requiresConfirmation:true } };
  }
  if (command.type === 'SET_MARKET_SEND_WINDOW' && (command.start < '09:00' || command.end > '19:00')) {
    throw new Error('برای Safety، Telegram فقط می‌تواند پنجره ارسال را داخل بازه سخت 09:00–19:00 محدودتر کند.');
  }
  return core.prepareControlMutation(input);
}

async function assertFreshPreview(input: { supabase: SupabaseClient; organizationId: string; command: TelegramOwnerCommand; before: unknown }) {
  const expected = rec(input.before);
  if (input.command.type === 'SET_COST_LIMIT') {
    const current = await readCostValue(input.supabase, input.organizationId, input.command.key);
    if (!same({key:input.command.key,value:current}, expected)) throw new Error('Cost Guard بعد از preview تغییر کرده؛ دوباره دستور را بفرست.');
  } else if (input.command.type === 'SET_DISCOUNT_POLICY') {
    const current = await readPricePolicy(input.supabase,input.organizationId,input.command.serviceQuery,input.command.countryCode);
    const comparable = {serviceId:current.serviceId,countryCode:current.countryCode,maxAutoDiscountPct:current.maxAutoDiscountPct,maxDiscountWithApprovalPct:current.maxDiscountWithApprovalPct};
    if (!same(comparable, expected)) throw new Error('Discount policy بعد از preview تغییر کرده؛ دوباره دستور را بفرست.');
  } else if (input.command.type === 'SET_MINIMUM_PRICE') {
    const current = await readPricePolicy(input.supabase,input.organizationId,input.command.serviceQuery,input.command.countryCode);
    const comparable = {serviceId:current.serviceId,countryCode:current.countryCode,minimumPrice:current.minimumPrice};
    if (!same(comparable, expected)) throw new Error('Price floor بعد از preview تغییر کرده؛ دوباره دستور را بفرست.');
  }
}

export async function executeControlMutation(input: { supabase: SupabaseClient; organizationId: string; ownerUserId: string; command: TelegramOwnerCommand; preview: CommandExecutionResult }): Promise<ExecutedMutation> {
  const { supabase, organizationId, ownerUserId, command, preview } = input;
  if (!['SET_COST_LIMIT','SET_DISCOUNT_POLICY','SET_MINIMUM_PRICE'].includes(command.type)) return core.executeControlMutation(input);
  await assertFreshPreview({supabase,organizationId,command,before:preview.before});

  let text: string;
  if (command.type === 'SET_COST_LIMIT') {
    const { error } = await supabase.from('cost_guard_settings').update({ [command.key]:command.value, updated_at:now() }).eq('organization_id',organizationId);
    if (error) throw new Error(`Cost Guard update failed: ${error.message}`);
    text = `${command.key} روی ${command.value} تنظیم شد.`;
  } else if (command.type === 'SET_DISCOUNT_POLICY') {
    const { error } = await supabase.from('service_prices').update({ max_auto_discount_pct:command.maxAutoDiscountPct, max_discount_with_approval_pct:command.maxDiscountWithApprovalPct }).eq('organization_id',organizationId).eq('service_id',command.serviceQuery).eq('country_code',command.countryCode);
    if (error) throw new Error(`Discount policy update failed: ${error.message}`);
    text = `قانون تخفیف ${command.serviceQuery}/${command.countryCode} به auto ${command.maxAutoDiscountPct}% و approval ${command.maxDiscountWithApprovalPct}% تغییر کرد.`;
  } else if (command.type === 'SET_MINIMUM_PRICE') {
    const { error } = await supabase.from('service_prices').update({ minimum_price:command.minimumPrice }).eq('organization_id',organizationId).eq('service_id',command.serviceQuery).eq('country_code',command.countryCode);
    if (error) throw new Error(`Minimum price update failed: ${error.message}`);
    text = `Price floor ${command.serviceQuery}/${command.countryCode} روی ${command.minimumPrice} تنظیم شد.`;
  } else {
    return core.executeControlMutation(input);
  }

  const result: ExecutedMutation = { title:preview.title, text, before:preview.before, after:preview.after, entityType:preview.entityType, entityId:preview.entityId, command, reversible:true };
  await audit({supabase,organizationId,ownerUserId,command,entityType:result.entityType,entityId:result.entityId,before:result.before,after:result.after});
  return result;
}

export const revertTargetsControlMutation = core.revertTargetsControlMutation;

export async function executeControlRevert(input: { supabase: SupabaseClient; organizationId: string; ownerUserId: string; command: TelegramOwnerCommand; preview: CommandExecutionResult }): Promise<ExecutedMutation> {
  const { command } = input;
  if (command.type !== 'REVERT_LAST_CHANGE' || !command.targetRunId) throw new Error('Revert target is missing');
  const { data, error } = await input.supabase.from('telegram_command_runs').select('command_type,command_payload,result,status').eq('organization_id',input.organizationId).eq('id',command.targetRunId).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? 'Telegram history not found');
  const original = data.command_payload as TelegramOwnerCommand;
  if (!['SET_COST_LIMIT','SET_DISCOUNT_POLICY','SET_MINIMUM_PRICE'].includes(original.type)) return core.executeControlRevert(input);
  if (data.status !== 'COMPLETED') throw new Error('Target Telegram change is not completed');
  const journalResult = rec(data.result);
  if (journalResult.reversible !== true) throw new Error('این تغییر قابل برگشت نیست.');
  const before = rec(journalResult.before);
  const after = rec(journalResult.after);

  if (original.type === 'SET_COST_LIMIT') {
    if (!REAL_COST_KEYS.has(original.key)) throw new Error('Cost Guard key قدیمی/نامعتبر است و Revert خودکار نمی‌شود.');
    const current = await readCostValue(input.supabase,input.organizationId,original.key);
    if (!same({key:original.key,value:current}, after)) throw new Error('مقدار فعلی با تغییر ثبت‌شده یکی نیست؛ Revert برای جلوگیری از overwrite متوقف شد.');
    const { error:e } = await input.supabase.from('cost_guard_settings').update({[original.key]:before.value,updated_at:now()}).eq('organization_id',input.organizationId); if(e)throw e;
  } else if (original.type === 'SET_DISCOUNT_POLICY') {
    const current = await readPricePolicy(input.supabase,input.organizationId,original.serviceQuery,original.countryCode);
    if (!same({serviceId:current.serviceId,countryCode:current.countryCode,maxAutoDiscountPct:current.maxAutoDiscountPct,maxDiscountWithApprovalPct:current.maxDiscountWithApprovalPct}, after)) throw new Error('Discount policy فعلی با تغییر ثبت‌شده یکی نیست؛ Revert متوقف شد.');
    const { error:e } = await input.supabase.from('service_prices').update({max_auto_discount_pct:before.maxAutoDiscountPct,max_discount_with_approval_pct:before.maxDiscountWithApprovalPct}).eq('organization_id',input.organizationId).eq('service_id',original.serviceQuery).eq('country_code',original.countryCode); if(e)throw e;
  } else if (original.type === 'SET_MINIMUM_PRICE') {
    const current = await readPricePolicy(input.supabase,input.organizationId,original.serviceQuery,original.countryCode);
    if (!same({serviceId:current.serviceId,countryCode:current.countryCode,minimumPrice:current.minimumPrice}, after)) throw new Error('Price floor فعلی با تغییر ثبت‌شده یکی نیست؛ Revert متوقف شد.');
    const { error:e } = await input.supabase.from('service_prices').update({minimum_price:before.minimumPrice}).eq('organization_id',input.organizationId).eq('service_id',original.serviceQuery).eq('country_code',original.countryCode); if(e)throw e;
  }

  const result: ExecutedMutation = { title:'Revert انجام شد', text:`${original.type} به مقدار قبلی برگشت.`, before:input.preview.before, after:input.preview.after, entityType:String(journalResult.entityType ?? input.preview.entityType ?? 'telegram_change'), entityId:String(journalResult.entityId ?? input.preview.entityId ?? ''), command, reversible:false };
  await audit({supabase:input.supabase,organizationId:input.organizationId,ownerUserId:input.ownerUserId,command,entityType:result.entityType,entityId:result.entityId,before:result.before,after:result.after});
  return result;
}
