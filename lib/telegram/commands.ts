import type { SupabaseClient } from '@supabase/supabase-js';
import { controlledGooglePlacesIdSearch } from '@/lib/hunters/business/google-places-controlled';
import type { CommandExecutionResult, TelegramOwnerCommand } from './contracts';

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ');
const now = () => new Date().toISOString();
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const jsonEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export type PreparedMutation = {
  command: TelegramOwnerCommand;
  preview: CommandExecutionResult;
};

export type ExecutedMutation = CommandExecutionResult & {
  command: TelegramOwnerCommand;
  reversible: boolean;
};

export function isSafeServiceOptionKey(key: string) {
  const normalized = key.trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(normalized)) return false;
  return !/(secret|token|password|credential|api[_-]?key|webhook|auth)/i.test(normalized);
}

async function resolveService(supabase: SupabaseClient, organizationId: string, query: string) {
  const { data, error } = await supabase.from('services').select('id,name,enabled,config').eq('organization_id', organizationId).order('name');
  if (error) throw new Error(`Service lookup failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: string; name: string; enabled: boolean; config: unknown }>;
  const wanted = normalize(query);
  const exact = rows.find((row) => normalize(row.id) === wanted || normalize(row.name) === wanted);
  if (exact) return exact;
  const fuzzy = rows.filter((row) => normalize(row.id).includes(wanted) || normalize(row.name).includes(wanted) || wanted.includes(normalize(row.name)));
  if (fuzzy.length === 1) return fuzzy[0];
  if (!fuzzy.length) throw new Error(`سرویس «${query}» پیدا نشد.`);
  throw new Error(`سرویس «${query}» مبهم است: ${fuzzy.slice(0, 5).map((row) => `${row.name} (${row.id})`).join('، ')}`);
}

async function resolvePrice(supabase: SupabaseClient, organizationId: string, serviceId: string, countryCode: string) {
  const { data, error } = await supabase.from('service_prices')
    .select('id,service_id,country_code,currency,price,minimum_price,max_auto_discount_pct,max_discount_with_approval_pct')
    .eq('organization_id', organizationId).eq('service_id', serviceId).eq('country_code', countryCode).maybeSingle();
  if (error) throw new Error(`Price lookup failed: ${error.message}`);
  if (!data) throw new Error(`برای ${serviceId} در ${countryCode} قانون قیمت تعریف نشده است.`);
  return data as Record<string, unknown>;
}

async function auditTelegramChange(input: {
  supabase: SupabaseClient;
  organizationId: string;
  ownerUserId: string;
  command: TelegramOwnerCommand;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}) {
  const { error } = await input.supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_type: 'TELEGRAM_OWNER',
    actor_id: input.ownerUserId,
    action: `TELEGRAM_${input.command.type}`,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    before_data: input.before ?? null,
    after_data: input.after ?? null,
  });
  if (error) throw new Error(`Audit log failed: ${error.message}`);
}

function helpText() {
  return [
    'دستیار مدیریت Smart Visions آماده است.',
    '',
    'دستورهای امن و مستقیم:',
    '/status  وضعیت سیستم',
    '/services  سرویس‌ها',
    '/pricing OM  قیمت‌های عمان',
    '/leads 10  آخرین لیدها',
    '/price OM business_website 179  تغییر قیمت',
    '/service business_website off  فعال/غیرفعال‌کردن سرویس',
    '/option custom_website requiresCustomQuote true  تغییر یک Option غیرحساس',
    '/hunt OM Muscat "dental clinic" 5  اجرای Discovery کم‌هزینه',
    '/market OM on  فعال/غیرفعال‌کردن بازار',
    '/pause whatsapp  یا /resume whatsapp',
    '/approve <message-id>  و /reject <message-id>',
    '/revert  برگرداندن آخرین تغییر قابل برگشت',
    '',
    'هر تغییر قبل از اجرا Before → After نشان داده می‌شود و بدون تأیید انجام نمی‌شود.',
  ].join('\n');
}

export async function executeReadCommand(input: {
  supabase: SupabaseClient;
  organizationId: string;
  command: TelegramOwnerCommand;
}): Promise<CommandExecutionResult> {
  const { supabase, organizationId, command } = input;
  if (command.type === 'HELP') return { title: 'راهنما', text: helpText() };

  if (command.type === 'SHOW_STATUS') {
    const [controls, integrations, hotLeads, approvals, runningCampaigns] = await Promise.all([
      supabase.from('system_controls').select('global_kill_switch,email_paused,whatsapp_ai_paused,agents_paused,shadow_mode,monthly_budget_usd').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('integration_connections').select('provider,channel,status,enabled').eq('organization_id', organizationId).order('provider'),
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('status', ['INTERESTED','HOT','HUMAN']),
      supabase.from('conversation_messages').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('requires_approval', true).in('status', ['APPROVAL_REQUIRED','READY']),
      supabase.from('campaigns').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'RUNNING'),
    ]);
    const firstError = [controls.error, integrations.error, hotLeads.error, approvals.error, runningCampaigns.error].find(Boolean);
    if (firstError) throw new Error(`Status lookup failed: ${firstError.message}`);
    const c = controls.data;
    const connected = (integrations.data ?? []).filter((row) => row.enabled && row.status === 'CONNECTED').map((row) => row.provider);
    return {
      title: 'وضعیت سیستم',
      text: [
        `Shadow Mode: ${c?.shadow_mode ? 'ON ✅' : 'OFF ⚠️'}`,
        `Global Kill Switch: ${c?.global_kill_switch ? 'ON ⛔️' : 'OFF ✅'}`,
        `Agents: ${c?.agents_paused ? 'PAUSED' : 'ACTIVE'}`,
        `WhatsApp AI: ${c?.whatsapp_ai_paused ? 'PAUSED' : 'ACTIVE'}`,
        `Email: ${c?.email_paused ? 'PAUSED' : 'ACTIVE'}`,
        `Connected: ${connected.join(', ') || 'none'}`,
        `Hot / interested / human leads: ${hotLeads.count ?? 0}`,
        `Approvals waiting: ${approvals.count ?? 0}`,
        `Running hunter campaigns: ${runningCampaigns.count ?? 0}`,
        `Monthly budget: ${c?.monthly_budget_usd ?? '—'} USD`,
      ].join('\n'),
    };
  }

  if (command.type === 'LIST_SERVICES') {
    const { data, error } = await supabase.from('services').select('id,name,enabled,config').eq('organization_id', organizationId).order('name');
    if (error) throw new Error(`Services lookup failed: ${error.message}`);
    const rows = data ?? [];
    return {
      title: 'سرویس‌ها',
      text: rows.length ? rows.map((row) => `${row.enabled ? '✅' : '⏸'} ${row.name}  [${row.id}]`).join('\n') : 'سرویسی تعریف نشده است.',
    };
  }

  if (command.type === 'SHOW_PRICING') {
    let query = supabase.from('service_prices').select('service_id,country_code,currency,price,minimum_price,max_auto_discount_pct,max_discount_with_approval_pct').eq('organization_id', organizationId).order('country_code').order('service_id');
    if (command.countryCode) query = query.eq('country_code', command.countryCode.toUpperCase());
    const { data, error } = await query;
    if (error) throw new Error(`Pricing lookup failed: ${error.message}`);
    let rows = data ?? [];
    if (command.serviceQuery) {
      const service = await resolveService(supabase, organizationId, command.serviceQuery);
      rows = rows.filter((row) => row.service_id === service.id);
    }
    return {
      title: 'Pricing',
      text: rows.length ? rows.slice(0, 60).map((row) => `${row.country_code} · ${row.service_id}: ${row.price} ${row.currency}${row.minimum_price != null ? ` (min ${row.minimum_price})` : ''}`).join('\n') : 'قیمتی با این فیلتر پیدا نشد.',
    };
  }

  if (command.type === 'SHOW_LEADS') {
    const limit = Math.max(1, Math.min(command.limit ?? 10, 50));
    let query = supabase.from('leads').select('id,status,opportunity_score,intent_score,recommended_offer,business_id,created_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(limit);
    if (command.stage) query = query.eq('status', command.stage);
    const { data: leads, error } = await query;
    if (error) throw new Error(`Lead lookup failed: ${error.message}`);
    const businessIds = [...new Set((leads ?? []).map((row) => row.business_id).filter(Boolean))];
    const { data: businesses, error: businessError } = businessIds.length
      ? await supabase.from('businesses').select('id,name,whatsapp,international_phone,phone').eq('organization_id', organizationId).in('id', businessIds)
      : { data: [], error: null };
    if (businessError) throw new Error(`Lead business lookup failed: ${businessError.message}`);
    const byId = new Map((businesses ?? []).map((row) => [row.id, row]));
    const lines = (leads ?? []).map((lead) => {
      const business = byId.get(lead.business_id);
      const phone = business?.international_phone ?? business?.phone ?? '';
      return `${lead.status} · ${business?.name ?? lead.id} · opp ${lead.opportunity_score ?? 0} / intent ${lead.intent_score ?? 0}${phone ? ` · ${phone}` : ''}`;
    });
    return { title: 'لیدها', text: lines.length ? lines.join('\n') : 'لیدی با این فیلتر پیدا نشد.' };
  }

  return { title: 'راهنما', text: helpText() };
}

async function latestReversibleRun(supabase: SupabaseClient, organizationId: string, ownerUserId: string) {
  const { data, error } = await supabase.from('telegram_command_runs')
    .select('id,command_type,command_payload,result,completed_at')
    .eq('organization_id', organizationId).eq('user_id', ownerUserId).eq('status', 'COMPLETED')
    .order('completed_at', { ascending: false }).limit(20);
  if (error) throw new Error(`Telegram history lookup failed: ${error.message}`);
  return (data ?? []).find((row) => asRecord(row.result).reversible === true && row.command_type !== 'REVERT_LAST_CHANGE') ?? null;
}

export async function prepareMutation(input: {
  supabase: SupabaseClient;
  organizationId: string;
  ownerUserId: string;
  command: TelegramOwnerCommand;
}): Promise<PreparedMutation> {
  const { supabase, organizationId, ownerUserId } = input;
  let command = input.command;

  if (command.type === 'SET_PRICE') {
    const service = await resolveService(supabase, organizationId, command.serviceQuery);
    const priceRow = await resolvePrice(supabase, organizationId, service.id, command.countryCode.toUpperCase());
    const minimum = priceRow.minimum_price == null ? null : Number(priceRow.minimum_price);
    if (!Number.isFinite(command.price) || command.price < 0) throw new Error('قیمت باید عدد معتبر و غیرمنفی باشد.');
    if (minimum != null && command.price < minimum) throw new Error(`قیمت جدید از minimum_price (${minimum} ${priceRow.currency}) کمتر است.`);
    command = { ...command, serviceQuery: service.id, countryCode: command.countryCode.toUpperCase() };
    const before = { serviceId: service.id, countryCode: priceRow.country_code, currency: priceRow.currency, price: Number(priceRow.price), minimumPrice: minimum };
    const after = { ...before, price: command.price };
    return { command, preview: { title: 'تغییر قیمت', text: `${service.name} · ${command.countryCode}\nBefore: ${before.price} ${priceRow.currency}\nAfter: ${after.price} ${priceRow.currency}`, before, after, entityType: 'service_price', entityId: String(priceRow.id), requiresConfirmation: true } };
  }

  if (command.type === 'SET_SERVICE_ENABLED') {
    const service = await resolveService(supabase, organizationId, command.serviceQuery);
    command = { ...command, serviceQuery: service.id };
    const before = { id: service.id, name: service.name, enabled: service.enabled };
    const after = { ...before, enabled: command.enabled };
    return { command, preview: { title: 'تغییر وضعیت سرویس', text: `${service.name}\nBefore: ${before.enabled ? 'ENABLED' : 'DISABLED'}\nAfter: ${after.enabled ? 'ENABLED' : 'DISABLED'}`, before, after, entityType: 'service', entityId: service.id, requiresConfirmation: true } };
  }

  if (command.type === 'SET_SERVICE_OPTION') {
    if (!isSafeServiceOptionKey(command.optionKey)) throw new Error('این Option key مجاز نیست؛ کلیدهای حساس credential/token/secret از تلگرام قابل تغییر نیستند.');
    const service = await resolveService(supabase, organizationId, command.serviceQuery);
    const config = asRecord(service.config);
    command = { ...command, serviceQuery: service.id };
    const before = { serviceId: service.id, optionKey: command.optionKey, value: config[command.optionKey] ?? null };
    const after = { ...before, value: command.value };
    return { command, preview: { title: 'تغییر Service Option', text: `${service.name} · ${command.optionKey}\nBefore: ${JSON.stringify(before.value)}\nAfter: ${JSON.stringify(after.value)}`, before, after, entityType: 'service', entityId: service.id, requiresConfirmation: true } };
  }

  if (command.type === 'SET_MARKET_ENABLED') {
    const countryCode = command.countryCode.toUpperCase();
    const { data, error } = await supabase.from('market_settings').select('id,country_code,enabled,currency,timezone').eq('organization_id', organizationId).eq('country_code', countryCode).maybeSingle();
    if (error) throw new Error(`Market lookup failed: ${error.message}`);
    if (!data) throw new Error(`Market ${countryCode} تعریف نشده است.`);
    command = { ...command, countryCode };
    const before = { countryCode, enabled: data.enabled };
    const after = { countryCode, enabled: command.enabled };
    return { command, preview: { title: 'تغییر وضعیت بازار', text: `${countryCode}\nBefore: ${before.enabled ? 'ENABLED' : 'DISABLED'}\nAfter: ${after.enabled ? 'ENABLED' : 'DISABLED'}`, before, after, entityType: 'market_settings', entityId: String(data.id), requiresConfirmation: true } };
  }

  if (command.type === 'SET_PAUSE') {
    const { data, error } = await supabase.from('system_controls').select('organization_id,agents_paused,email_paused,whatsapp_ai_paused,global_kill_switch,shadow_mode').eq('organization_id', organizationId).maybeSingle();
    if (error) throw new Error(`System control lookup failed: ${error.message}`);
    if (!data) throw new Error('System controls پیدا نشد.');
    const column = command.target === 'AGENTS' ? 'agents_paused' : command.target === 'EMAIL' ? 'email_paused' : 'whatsapp_ai_paused';
    const before = { target: command.target, paused: Boolean(data[column]) };
    const after = { target: command.target, paused: command.paused };
    return { command, preview: { title: 'تغییر Pause', text: `${command.target}\nBefore: ${before.paused ? 'PAUSED' : 'ACTIVE'}\nAfter: ${after.paused ? 'PAUSED' : 'ACTIVE'}\nShadow Mode بدون تغییر می‌ماند.`, before, after, entityType: 'system_controls', entityId: organizationId, requiresConfirmation: true } };
  }

  if (command.type === 'CREATE_HUNTER_CAMPAIGN') {
    const countryCode = command.countryCode.toUpperCase();
    const city = String(command.city ?? '').trim();
    if (!city) throw new Error('برای اجرای Hunter از تلگرام، شهر را هم مشخص کن؛ مثل: /hunt OM Muscat "dental clinic" 5');
    const industry = String(command.industry ?? '').trim();
    if (!industry) throw new Error('Industry لازم است.');
    const targetCount = Math.max(1, Math.min(command.targetCount ?? 5, 20));
    const { data: market, error } = await supabase.from('market_settings').select('id,country_code,enabled').eq('organization_id', organizationId).eq('country_code', countryCode).maybeSingle();
    if (error) throw new Error(`Market lookup failed: ${error.message}`);
    if (!market?.enabled) throw new Error(`Market ${countryCode} فعال نیست.`);
    command = { ...command, countryCode, city, industry, targetCount };
    const after = { hunterType: 'BUSINESS', countryCode, city, industry, targetCount, discoveryMode: 'GOOGLE_PLACES_IDS_ONLY', providerQualification: false, outreachTriggered: false };
    return { command, preview: { title: 'اجرای Hunter', text: `${countryCode} · ${city} · ${industry}\nتا ${targetCount} candidate ID\nDiscovery مرحله اول zero-cost است؛ qualification پولی و outreach خودکار اجرا نمی‌شود.`, before: null, after, entityType: 'campaign', requiresConfirmation: true } };
  }

  if (command.type === 'APPROVE_MESSAGE' || command.type === 'REJECT_MESSAGE') {
    const { data, error } = await supabase.from('conversation_messages').select('id,status,requires_approval,approval_reason,channel,original_text').eq('organization_id', organizationId).eq('id', command.messageId).maybeSingle();
    if (error) throw new Error(`Approval lookup failed: ${error.message}`);
    if (!data) throw new Error('پیام برای approval پیدا نشد.');
    if (!data.requires_approval || !['APPROVAL_REQUIRED','READY'].includes(String(data.status))) throw new Error('این پیام دیگر در وضعیت قابل تأیید/رد نیست.');
    const before = { id: data.id, status: data.status, requiresApproval: data.requires_approval, approvalReason: data.approval_reason };
    const after = command.type === 'APPROVE_MESSAGE'
      ? { id: data.id, status: 'APPROVED', requiresApproval: false, approvalReason: null }
      : { id: data.id, status: 'BLOCKED', requiresApproval: false, approvalReason: command.reason ?? 'Rejected by Telegram owner' };
    return { command, preview: { title: command.type === 'APPROVE_MESSAGE' ? 'Approve message' : 'Reject message', text: `${data.channel}\n${String(data.original_text ?? '').slice(0, 500)}\nBefore: ${data.status}\nAfter: ${after.status}`, before, after, entityType: 'conversation_message', entityId: String(data.id), requiresConfirmation: true } };
  }

  if (command.type === 'REVERT_LAST_CHANGE') {
    const last = command.targetRunId
      ? await supabase.from('telegram_command_runs').select('id,command_type,command_payload,result,completed_at').eq('organization_id', organizationId).eq('id', command.targetRunId).maybeSingle()
      : { data: await latestReversibleRun(supabase, organizationId, ownerUserId), error: null };
    if (last.error) throw new Error(`Revert lookup failed: ${last.error.message}`);
    if (!last.data) throw new Error('تغییر قابل برگشتی در تاریخچه Telegram پیدا نشد.');
    const originalResult = asRecord(last.data.result);
    const originalCommand = asRecord(last.data.command_payload) as TelegramOwnerCommand;
    command = { type: 'REVERT_LAST_CHANGE', targetRunId: String(last.data.id) };
    return { command, preview: { title: 'Revert آخرین تغییر', text: `قرار است ${String(last.data.command_type)} برگردانده شود.\nBefore revert: ${JSON.stringify(originalResult.after ?? null)}\nAfter revert: ${JSON.stringify(originalResult.before ?? null)}`, before: originalResult.after, after: originalResult.before, entityType: String(originalResult.entityType ?? 'telegram_change'), entityId: String(originalResult.entityId ?? ''), requiresConfirmation: true } };
  }

  throw new Error('این دستور تغییری نیست یا پشتیبانی نمی‌شود.');
}

async function assertCurrentMatches(supabase: SupabaseClient, organizationId: string, command: TelegramOwnerCommand, before: unknown) {
  const expected = asRecord(before);
  if (command.type === 'SET_PRICE') {
    const row = await resolvePrice(supabase, organizationId, command.serviceQuery, command.countryCode);
    const current = { serviceId: command.serviceQuery, countryCode: row.country_code, currency: row.currency, price: Number(row.price), minimumPrice: row.minimum_price == null ? null : Number(row.minimum_price) };
    if (!jsonEqual(current, expected)) throw new Error('قیمت بعد از confirmation preview تغییر کرده؛ برای جلوگیری از overwrite دوباره دستور را بفرست.');
  } else if (command.type === 'SET_SERVICE_ENABLED') {
    const service = await resolveService(supabase, organizationId, command.serviceQuery);
    const current = { id: service.id, name: service.name, enabled: service.enabled };
    if (!jsonEqual(current, expected)) throw new Error('وضعیت سرویس عوض شده؛ دوباره دستور را صادر کن.');
  } else if (command.type === 'SET_SERVICE_OPTION') {
    const service = await resolveService(supabase, organizationId, command.serviceQuery);
    const current = { serviceId: service.id, optionKey: command.optionKey, value: asRecord(service.config)[command.optionKey] ?? null };
    if (!jsonEqual(current, expected)) throw new Error('Option بعد از preview تغییر کرده؛ دوباره دستور را صادر کن.');
  } else if (command.type === 'SET_MARKET_ENABLED') {
    const { data, error } = await supabase.from('market_settings').select('country_code,enabled').eq('organization_id', organizationId).eq('country_code', command.countryCode).maybeSingle();
    if (error || !data) throw new Error(error?.message ?? 'Market not found');
    if (!jsonEqual({ countryCode: data.country_code, enabled: data.enabled }, expected)) throw new Error('وضعیت بازار بعد از preview تغییر کرده؛ دوباره دستور را صادر کن.');
  } else if (command.type === 'SET_PAUSE') {
    const { data, error } = await supabase.from('system_controls').select('agents_paused,email_paused,whatsapp_ai_paused').eq('organization_id', organizationId).maybeSingle();
    if (error || !data) throw new Error(error?.message ?? 'System controls not found');
    const paused = command.target === 'AGENTS' ? data.agents_paused : command.target === 'EMAIL' ? data.email_paused : data.whatsapp_ai_paused;
    if (!jsonEqual({ target: command.target, paused: Boolean(paused) }, expected)) throw new Error('Pause state بعد از preview تغییر کرده؛ دوباره دستور را صادر کن.');
  } else if (command.type === 'APPROVE_MESSAGE' || command.type === 'REJECT_MESSAGE') {
    const { data, error } = await supabase.from('conversation_messages').select('id,status,requires_approval,approval_reason').eq('organization_id', organizationId).eq('id', command.messageId).maybeSingle();
    if (error || !data) throw new Error(error?.message ?? 'Message not found');
    const current = { id: data.id, status: data.status, requiresApproval: data.requires_approval, approvalReason: data.approval_reason };
    if (!jsonEqual(current, expected)) throw new Error('Approval state بعد از preview تغییر کرده؛ دوباره دستور را صادر کن.');
  }
}

async function restoreOriginalChange(input: { supabase: SupabaseClient; organizationId: string; targetRunId: string }) {
  const { data, error } = await input.supabase.from('telegram_command_runs').select('id,command_type,command_payload,result,status').eq('organization_id', input.organizationId).eq('id', input.targetRunId).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? 'Telegram history not found');
  if (data.status !== 'COMPLETED') throw new Error('Target Telegram change is not completed');
  const command = data.command_payload as TelegramOwnerCommand;
  const result = asRecord(data.result);
  if (result.reversible !== true) throw new Error('این تغییر قابل برگشت نیست.');
  const before = asRecord(result.before);

  if (command.type === 'SET_PRICE') {
    const { error: updateError } = await input.supabase.from('service_prices').update({ price: before.price }).eq('organization_id', input.organizationId).eq('service_id', command.serviceQuery).eq('country_code', command.countryCode);
    if (updateError) throw updateError;
  } else if (command.type === 'SET_SERVICE_ENABLED') {
    const { error: updateError } = await input.supabase.from('services').update({ enabled: before.enabled, updated_at: now() }).eq('organization_id', input.organizationId).eq('id', command.serviceQuery);
    if (updateError) throw updateError;
  } else if (command.type === 'SET_SERVICE_OPTION') {
    const service = await resolveService(input.supabase, input.organizationId, command.serviceQuery);
    const config = { ...asRecord(service.config) };
    if (before.value === null || before.value === undefined) delete config[command.optionKey]; else config[command.optionKey] = before.value;
    const { error: updateError } = await input.supabase.from('services').update({ config, updated_at: now() }).eq('organization_id', input.organizationId).eq('id', command.serviceQuery);
    if (updateError) throw updateError;
  } else if (command.type === 'SET_MARKET_ENABLED') {
    const { error: updateError } = await input.supabase.from('market_settings').update({ enabled: before.enabled, updated_at: now() }).eq('organization_id', input.organizationId).eq('country_code', command.countryCode);
    if (updateError) throw updateError;
  } else if (command.type === 'SET_PAUSE') {
    const column = command.target === 'AGENTS' ? 'agents_paused' : command.target === 'EMAIL' ? 'email_paused' : 'whatsapp_ai_paused';
    const { error: updateError } = await input.supabase.from('system_controls').update({ [column]: before.paused, updated_at: now() }).eq('organization_id', input.organizationId);
    if (updateError) throw updateError;
  } else {
    throw new Error('این نوع تغییر برای Revert پشتیبانی نمی‌شود.');
  }
  return { originalCommand: command, before: result.after, after: result.before, entityType: result.entityType, entityId: result.entityId };
}

export async function executePreparedMutation(input: {
  supabase: SupabaseClient;
  organizationId: string;
  ownerUserId: string;
  command: TelegramOwnerCommand;
  preview: CommandExecutionResult;
}): Promise<ExecutedMutation> {
  const { supabase, organizationId, ownerUserId, command, preview } = input;

  if (command.type === 'REVERT_LAST_CHANGE') {
    if (!command.targetRunId) throw new Error('Revert target is missing');
    const restored = await restoreOriginalChange({ supabase, organizationId, targetRunId: command.targetRunId });
    const result: ExecutedMutation = { title: 'Revert انجام شد', text: `${restored.originalCommand.type} به مقدار قبلی برگشت.`, before: restored.before, after: restored.after, entityType: String(restored.entityType ?? 'telegram_change'), entityId: String(restored.entityId ?? ''), command, reversible: false };
    await auditTelegramChange({ supabase, organizationId, ownerUserId, command, entityType: result.entityType, entityId: result.entityId, before: result.before, after: result.after });
    return result;
  }

  await assertCurrentMatches(supabase, organizationId, command, preview.before);
  let after: unknown = preview.after;
  let entityType = preview.entityType;
  let entityId = preview.entityId;
  let text = 'تغییر انجام شد.';
  let reversible = true;

  if (command.type === 'SET_PRICE') {
    const { error } = await supabase.from('service_prices').update({ price: command.price }).eq('organization_id', organizationId).eq('service_id', command.serviceQuery).eq('country_code', command.countryCode);
    if (error) throw new Error(`Price update failed: ${error.message}`);
    text = `قیمت ${command.serviceQuery} در ${command.countryCode} روی ${command.price} تنظیم شد.`;
  } else if (command.type === 'SET_SERVICE_ENABLED') {
    const { error } = await supabase.from('services').update({ enabled: command.enabled, updated_at: now() }).eq('organization_id', organizationId).eq('id', command.serviceQuery);
    if (error) throw new Error(`Service update failed: ${error.message}`);
    text = `سرویس ${command.serviceQuery} ${command.enabled ? 'فعال' : 'غیرفعال'} شد.`;
  } else if (command.type === 'SET_SERVICE_OPTION') {
    const service = await resolveService(supabase, organizationId, command.serviceQuery);
    const config = { ...asRecord(service.config), [command.optionKey]: command.value };
    const { error } = await supabase.from('services').update({ config, updated_at: now() }).eq('organization_id', organizationId).eq('id', command.serviceQuery);
    if (error) throw new Error(`Service option update failed: ${error.message}`);
    text = `${command.serviceQuery}.${command.optionKey} تغییر کرد.`;
  } else if (command.type === 'SET_MARKET_ENABLED') {
    const { error } = await supabase.from('market_settings').update({ enabled: command.enabled, updated_at: now() }).eq('organization_id', organizationId).eq('country_code', command.countryCode);
    if (error) throw new Error(`Market update failed: ${error.message}`);
    text = `بازار ${command.countryCode} ${command.enabled ? 'فعال' : 'غیرفعال'} شد.`;
  } else if (command.type === 'SET_PAUSE') {
    const column = command.target === 'AGENTS' ? 'agents_paused' : command.target === 'EMAIL' ? 'email_paused' : 'whatsapp_ai_paused';
    const { error } = await supabase.from('system_controls').update({ [column]: command.paused, updated_at: now() }).eq('organization_id', organizationId);
    if (error) throw new Error(`Pause update failed: ${error.message}`);
    text = `${command.target} ${command.paused ? 'PAUSED' : 'ACTIVE'} شد. Shadow Mode دست‌نخورده ماند.`;
  } else if (command.type === 'APPROVE_MESSAGE' || command.type === 'REJECT_MESSAGE') {
    const payload = command.type === 'APPROVE_MESSAGE'
      ? { requires_approval: false, status: 'APPROVED', approval_reason: null, processed_at: now() }
      : { requires_approval: false, status: 'BLOCKED', approval_reason: command.reason ?? 'Rejected by Telegram owner', processed_at: now() };
    const { error } = await supabase.from('conversation_messages').update(payload).eq('organization_id', organizationId).eq('id', command.messageId);
    if (error) throw new Error(`Approval update failed: ${error.message}`);
    after = { ...asRecord(preview.after), processedAt: payload.processed_at };
    text = command.type === 'APPROVE_MESSAGE' ? 'پیام تأیید شد.' : 'پیام رد شد.';
    reversible = false;
  } else if (command.type === 'CREATE_HUNTER_CAMPAIGN') {
    reversible = false;
    const targetCount = Math.max(1, Math.min(command.targetCount ?? 5, 20));
    const start = new Date(); start.setUTCHours(0, 0, 0, 0);
    const [{ data: costSettings, error: costError }, { count: discoveredToday, error: countError }] = await Promise.all([
      supabase.from('cost_guard_settings').select('daily_new_leads').eq('organization_id', organizationId).maybeSingle(),
      supabase.from('discovery_records').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('source_type', 'google_places').gte('discovered_at', start.toISOString()),
    ]);
    if (costError || !costSettings) throw new Error(costError?.message ?? 'Cost Guard settings unavailable');
    if (countError) throw new Error(countError.message);
    const remainingDaily = Math.max(0, Number(costSettings.daily_new_leads ?? 0) - Number(discoveredToday ?? 0));
    const limit = Math.min(targetCount, remainingDaily, 20);
    if (limit < 1) throw new Error('Daily new-lead quota reached; Hunter blocked.');

    const { data: campaign, error: campaignError } = await supabase.from('campaigns').insert({
      organization_id: organizationId,
      name: `Telegram · ${command.countryCode} · ${command.city} · ${command.industry}`.slice(0, 180),
      hunter_type: 'BUSINESS',
      country_code: command.countryCode,
      city: command.city,
      industry: command.industry,
      target_count: limit,
      status: 'RUNNING',
      config: { source: 'TELEGRAM_OWNER', discovery_mode: 'GOOGLE_PLACES_IDS_ONLY', provider_qualification: false, outreach_triggered: false },
    }).select('id').single();
    if (campaignError) throw new Error(`Campaign creation failed: ${campaignError.message}`);
    entityType = 'campaign'; entityId = String(campaign.id);
    try {
      const search = await controlledGooglePlacesIdSearch({ organizationId, query: { countryCode: command.countryCode, city: String(command.city), industry: command.industry, limit } });
      const uniqueIds = [...new Set(search.placeIds)].slice(0, limit);
      const { data: existing, error: existingError } = uniqueIds.length
        ? await supabase.from('discovery_records').select('source_id').eq('organization_id', organizationId).eq('source_type', 'google_places').in('source_id', uniqueIds)
        : { data: [], error: null };
      if (existingError) throw existingError;
      const existingIds = new Set((existing ?? []).map((row) => String(row.source_id)));
      const newIds = uniqueIds.filter((id) => !existingIds.has(id));
      if (newIds.length) {
        const { error: insertError } = await supabase.from('discovery_records').insert(newIds.map((placeId) => ({
          organization_id: organizationId,
          campaign_id: campaign.id,
          source_type: 'google_places',
          source_id: placeId,
          source_url: `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
          raw_payload: { provider: 'GOOGLE_PLACES', operation: 'TEXT_SEARCH_IDS_ONLY', countryCode: command.countryCode, city: command.city, industry: command.industry, placeId, telegramOwner: true, qualificationTarget: 'GROWTH_OPPORTUNITY' },
        })));
        if (insertError) throw insertError;
      }
      const completed = { returnedCount: search.placeIds.length, uniqueCount: uniqueIds.length, insertedCount: newIds.length, duplicateCount: uniqueIds.length - newIds.length, providerQualification: false, outreachTriggered: false };
      const { error: completeError } = await supabase.from('campaigns').update({ status: 'COMPLETED', config: { source: 'TELEGRAM_OWNER', discovery_mode: 'GOOGLE_PLACES_IDS_ONLY', ...completed }, updated_at: now() }).eq('organization_id', organizationId).eq('id', campaign.id).eq('status', 'RUNNING');
      if (completeError) throw completeError;
      after = { ...asRecord(preview.after), campaignId: campaign.id, ...completed };
      text = `Hunter تمام شد: ${uniqueIds.length} candidate ID، ${newIds.length} مورد جدید ثبت شد. Qualification پولی و outreach اجرا نشد.`;
    } catch (error) {
      await supabase.from('campaigns').update({ status: 'FAILED', updated_at: now(), config: { source: 'TELEGRAM_OWNER', error: error instanceof Error ? error.message.slice(0, 240) : 'Hunter failed', outreach_triggered: false } }).eq('organization_id', organizationId).eq('id', campaign.id);
      throw error;
    }
  } else {
    throw new Error('Unsupported mutation');
  }

  const result: ExecutedMutation = { title: preview.title, text, before: preview.before, after, entityType, entityId, command, reversible };
  await auditTelegramChange({ supabase, organizationId, ownerUserId, command, entityType, entityId, before: result.before, after: result.after });
  return result;
}
