import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommandExecutionResult, TelegramCostLimitKey, TelegramMarketStyleField, TelegramOwnerCommand } from './contracts';
import type { ExecutedMutation, PreparedMutation } from './commands-core';

const READ_TYPES = new Set<TelegramOwnerCommand['type']>([
  'HELP','SHOW_PRICING','SHOW_MARKETS','SHOW_MARKET_POLICY','SHOW_AGENTS','SHOW_BUDGET','SHOW_APPROVALS','SHOW_CAMPAIGNS','SAFETY_BLOCK',
]);
const MUTATION_TYPES = new Set<TelegramOwnerCommand['type']>([
  'SET_DISCOUNT_POLICY','SET_MINIMUM_PRICE','SET_MARKET_STYLE','SET_MARKET_SEND_WINDOW','SET_AGENT_ENABLED','SET_AGENT_THRESHOLD','SET_COST_LIMIT','ACTIVATE_KILL_SWITCH',
]);
const COST_KEYS = new Set<TelegramCostLimitKey>(['monthly_total_budget_usd','openai_budget_usd','google_places_budget_usd','resend_budget_usd','meta_budget_usd','daily_new_leads','daily_outreach_limit']);
const STYLE_COLUMNS: Record<TelegramMarketStyleField, string> = {
  tone: 'tone_profile', dialect: 'dialect', primaryLocale: 'primary_locale', fallbackLocale: 'fallback_locale', dialectIntensity: 'dialect_intensity', maxFirstTouchWords: 'max_first_touch_words', maxReplyWords: 'max_reply_words',
};

const now = () => new Date().toISOString();
const rec = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ');

export function isControlReadCommand(type: TelegramOwnerCommand['type']) { return READ_TYPES.has(type); }
export function isControlMutation(type: TelegramOwnerCommand['type']) { return MUTATION_TYPES.has(type); }

function helpText() {
  return [
    'دستیار مدیریت Smart Visions آماده است. فارسی و English را می‌فهمد؛ تغییرات همچنان typed و قابل Audit هستند.',
    '',
    'مشاهده:',
    '/status · /services · /pricing OM · /leads 10',
    '/markets · /policy OM · /agents · /budget · /approvals · /campaigns',
    '',
    'قیمت و فروش:',
    '/price OM business_website 179',
    '/minimum OM business_website 160',
    '/discount OM business_website 5 10   ← auto 5% / با تأیید تا 10%',
    '',
    'بازار و لحن:',
    '/market OM on|off',
    '/tone OM friendly_professional',
    '/dialect OM omani',
    '/locale OM ar-OM',
    '/replywords OM 120',
    '/window OM 09:00 19:00',
    '',
    'Agent و هزینه:',
    '/agent secretary on|off · /threshold secretary 0.75',
    '/limit monthly 25 · /limit openai 10 · /limit leads 20 · /limit outreach 20',
    '',
    'عملیات:',
    '/hunt OM Muscat "dental clinic" 5 · /pause whatsapp · /resume whatsapp',
    '/approve <message-id> · /reject <message-id> · /revert',
    '/kill on  ← توقف اضطراری؛ خاموش‌کردن Kill Switch از تلگرام مجاز نیست.',
    '',
    'نمونه طبیعی: «لحن عمان رو دوستانه و حرفه‌ای کن» یا “set Oman tone to friendly professional”.',
    'هر تغییر Before → After دارد و بدون Confirm اجرا نمی‌شود. Secret/Token، خاموش‌کردن Shadow Mode، دورزدن DNC/Approval و auto-cold WhatsApp/Instagram از تلگرام مسدود است.',
  ].join('\n');
}

async function resolveService(supabase: SupabaseClient, organizationId: string, query: string) {
  const { data, error } = await supabase.from('services').select('id,name,enabled,config').eq('organization_id', organizationId).order('name');
  if (error) throw new Error(`Service lookup failed: ${error.message}`);
  const rows = data ?? [];
  const wanted = normalize(query);
  const exact = rows.find((row) => normalize(row.id) === wanted || normalize(row.name) === wanted);
  if (exact) return exact;
  const fuzzy = rows.filter((row) => normalize(row.id).includes(wanted) || normalize(row.name).includes(wanted) || wanted.includes(normalize(row.name)));
  if (fuzzy.length === 1) return fuzzy[0];
  if (!fuzzy.length) throw new Error(`سرویس «${query}» پیدا نشد.`);
  throw new Error(`سرویس «${query}» مبهم است: ${fuzzy.slice(0,5).map((row)=>`${row.name} (${row.id})`).join('، ')}`);
}

async function resolvePrice(supabase: SupabaseClient, organizationId: string, serviceId: string, countryCode: string) {
  const { data, error } = await supabase.from('service_prices').select('id,service_id,country_code,currency,price,minimum_price,max_auto_discount_pct,max_discount_with_approval_pct').eq('organization_id', organizationId).eq('service_id', serviceId).eq('country_code', countryCode).maybeSingle();
  if (error) throw new Error(`Price lookup failed: ${error.message}`);
  if (!data) throw new Error(`برای ${serviceId} در ${countryCode} قانون قیمت تعریف نشده است.`);
  return data;
}

async function resolveAgent(supabase: SupabaseClient, organizationId: string, query: string) {
  const { data, error } = await supabase.from('agent_settings').select('id,agent_name,enabled,confidence_threshold').eq('organization_id', organizationId).order('agent_name');
  if (error) throw new Error(`Agent lookup failed: ${error.message}`);
  const wanted = normalize(query);
  const rows = data ?? [];
  const exact = rows.find((row) => normalize(row.agent_name) === wanted);
  if (exact) return exact;
  const fuzzy = rows.filter((row) => normalize(row.agent_name).includes(wanted) || wanted.includes(normalize(row.agent_name)));
  if (fuzzy.length === 1) return fuzzy[0];
  if (!fuzzy.length) throw new Error(`Agent «${query}» پیدا نشد.`);
  throw new Error(`Agent «${query}» مبهم است.`);
}

async function marketRow(supabase: SupabaseClient, organizationId: string, countryCode: string) {
  const { data, error } = await supabase.from('market_settings').select('id,country_code,enabled,currency,timezone,send_window_start,send_window_end,config').eq('organization_id', organizationId).eq('country_code', countryCode).maybeSingle();
  if (error) throw new Error(`Market lookup failed: ${error.message}`);
  if (!data) throw new Error(`Market ${countryCode} تعریف نشده است.`);
  return data;
}

async function localeRow(supabase: SupabaseClient, organizationId: string, countryCode: string) {
  const { data, error } = await supabase.from('locale_profiles').select('id,country_code,primary_locale,fallback_locale,dialect,tone_profile,dialect_intensity,max_first_touch_words,max_reply_words').eq('organization_id', organizationId).eq('country_code', countryCode).maybeSingle();
  if (error) throw new Error(`Locale lookup failed: ${error.message}`);
  if (!data) throw new Error(`Locale profile برای ${countryCode} تعریف نشده است.`);
  return data;
}

async function audit(input: { supabase: SupabaseClient; organizationId: string; ownerUserId: string; command: TelegramOwnerCommand; entityType?: string; entityId?: string; before?: unknown; after?: unknown }) {
  const { error } = await input.supabase.from('audit_logs').insert({
    organization_id: input.organizationId, actor_type: 'SYSTEM', actor_id: null, action: `TELEGRAM_${input.command.type}`,
    entity_type: 'telegram_command', entity_id: null, before_data: input.before ?? null,
    after_data: { telegram_owner_user_id: input.ownerUserId, command_type: input.command.type, source_entity_type: input.entityType ?? null, source_entity_id: input.entityId ?? null, value: input.after ?? null },
  });
  if (error) throw new Error(`Audit log failed: ${error.message}`);
}

function safetyText(reason: Extract<TelegramOwnerCommand,{type:'SAFETY_BLOCK'}>['reason']) {
  const map = {
    SHADOW_MODE: 'خاموش‌کردن Shadow Mode از Telegram عمداً مسدود است. این مرحله فقط از Control Center و بعد از Pilot تأییدشده انجام می‌شود.',
    KILL_SWITCH_OFF: 'Kill Switch را می‌توان از Telegram برای توقف اضطراری روشن کرد، اما خاموش‌کردنش از Telegram مجاز نیست.',
    SECRETS: 'Token / API key / Secret از Telegram قابل نمایش یا تغییر نیست.',
    DNC_BYPASS: 'DNC / suppression قابل دورزدن یا غیرفعال‌کردن از Telegram نیست.',
    AUTO_COLD_CHANNEL: 'فعال‌سازی auto-cold WhatsApp/Instagram از Telegram مسدود است.',
    APPROVAL_BYPASS: 'Approval gateهای حساس از Telegram قابل دورزدن یا خاموش‌کردن نیستند.',
  } as const;
  return map[reason];
}

export async function executeControlReadCommand(input: { supabase: SupabaseClient; organizationId: string; command: TelegramOwnerCommand }): Promise<CommandExecutionResult> {
  const { supabase, organizationId, command } = input;
  if (command.type === 'HELP') return { title: 'راهنما', text: helpText() };
  if (command.type === 'SAFETY_BLOCK') return { title: 'قفل ایمنی 🔒', text: safetyText(command.reason) };

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
    return { title: 'Pricing', text: rows.length ? rows.slice(0,60).map((row)=>`${row.country_code} · ${row.service_id}: ${row.price} ${row.currency} · floor ${row.minimum_price ?? '—'} · auto≤${row.max_auto_discount_pct ?? 0}% · approval≤${row.max_discount_with_approval_pct ?? 0}%`).join('\n') : 'قیمتی با این فیلتر پیدا نشد.' };
  }

  if (command.type === 'SHOW_MARKETS') {
    const [{ data: markets, error: marketError }, { data: locales, error: localeError }] = await Promise.all([
      supabase.from('market_settings').select('country_code,enabled,currency,timezone,send_window_start,send_window_end').eq('organization_id', organizationId).order('country_code'),
      supabase.from('locale_profiles').select('country_code,primary_locale,dialect,tone_profile,max_reply_words').eq('organization_id', organizationId).order('country_code'),
    ]);
    if (marketError || localeError) throw new Error(`Markets lookup failed: ${marketError?.message ?? localeError?.message}`);
    const localeBy = new Map((locales ?? []).map((row)=>[row.country_code,row]));
    return { title: 'بازارها', text: (markets ?? []).map((m)=>{ const l=localeBy.get(m.country_code); return `${m.enabled?'✅':'⏸'} ${m.country_code} · ${m.currency} · ${m.timezone} · ${String(m.send_window_start).slice(0,5)}–${String(m.send_window_end).slice(0,5)} · ${l?.primary_locale ?? '—'} · ${l?.dialect ?? '—'} · tone ${l?.tone_profile ?? '—'}`; }).join('\n') || 'بازاری تعریف نشده است.' };
  }

  if (command.type === 'SHOW_MARKET_POLICY') {
    const countryCode = command.countryCode.toUpperCase();
    const [market, locale, outreach, approvals] = await Promise.all([
      marketRow(supabase, organizationId, countryCode),
      localeRow(supabase, organizationId, countryCode),
      supabase.from('outreach_policies').select('enabled,send_window_start,send_window_end,business_days,max_emails_per_day,max_emails_per_mailbox,max_followups,followup_delays_days,manual_review_required').eq('organization_id', organizationId).eq('country_code', countryCode).maybeSingle(),
      supabase.from('approval_rules').select('action_key,requires_approval').eq('organization_id', organizationId).order('action_key'),
    ]);
    if (outreach.error) throw new Error(`Outreach policy lookup failed: ${outreach.error.message}`);
    if (approvals.error) throw new Error(`Approval policy lookup failed: ${approvals.error.message}`);
    const p = outreach.data;
    const activeApprovals = (approvals.data ?? []).filter((row)=>row.requires_approval).map((row)=>row.action_key);
    return { title: `Policy · ${countryCode}`, text: [
      `Market: ${market.enabled?'ENABLED':'DISABLED'} · ${market.currency} · ${market.timezone}`,
      `Live send window: ${String(market.send_window_start).slice(0,5)}–${String(market.send_window_end).slice(0,5)}`,
      `Locale: ${locale.primary_locale} · dialect ${locale.dialect ?? '—'} · tone ${locale.tone_profile ?? '—'} · reply≤${locale.max_reply_words} words`,
      p ? `Email policy: ${p.enabled?'ON':'OFF'} · ${String(p.send_window_start).slice(0,5)}–${String(p.send_window_end).slice(0,5)} · daily ${p.max_emails_per_day} · mailbox ${p.max_emails_per_mailbox} · followups ${p.max_followups}` : 'Email policy: —',
      `Manual review: ${p?.manual_review_required ? 'REQUIRED' : 'not required by market policy'}`,
      `Hard approval rules: ${activeApprovals.join(', ') || 'none'}`,
    ].join('\n') };
  }

  if (command.type === 'SHOW_AGENTS') {
    const { data, error } = await supabase.from('agent_settings').select('agent_name,enabled,confidence_threshold,model').eq('organization_id', organizationId).order('agent_name');
    if (error) throw new Error(`Agents lookup failed: ${error.message}`);
    return { title: 'Agentها', text: (data ?? []).map((row)=>`${row.enabled?'✅':'⏸'} ${row.agent_name} · threshold ${row.confidence_threshold ?? '—'} · ${row.model ?? 'default model'}`).join('\n') || 'Agentی تعریف نشده است.' };
  }

  if (command.type === 'SHOW_BUDGET') {
    const { data, error } = await supabase.from('cost_guard_settings').select('monthly_total_budget_usd,openai_budget_usd,google_places_budget_usd,resend_budget_usd,meta_budget_usd,daily_new_leads,daily_outreach_limit,auto_pause_at_pct,routing_policy,model_name').eq('organization_id', organizationId).maybeSingle();
    if (error || !data) throw new Error(`Budget lookup failed: ${error?.message ?? 'not found'}`);
    return { title: 'Cost Guard', text: [
      `Monthly: ${data.monthly_total_budget_usd} USD · auto-pause ${data.auto_pause_at_pct}%`,
      `OpenAI: ${data.openai_budget_usd} · Google Places: ${data.google_places_budget_usd} · Resend: ${data.resend_budget_usd} · Meta: ${data.meta_budget_usd} USD`,
      `Daily new leads: ${data.daily_new_leads} · daily outreach: ${data.daily_outreach_limit}`,
      `Routing: ${data.routing_policy ?? '—'} · model: ${data.model_name ?? '—'}`,
    ].join('\n') };
  }

  if (command.type === 'SHOW_APPROVALS') {
    const limit = Math.max(1,Math.min(50,command.limit ?? 10));
    const { data, error } = await supabase.from('conversation_messages').select('id,channel,status,approval_reason,original_text,created_at').eq('organization_id', organizationId).eq('requires_approval', true).in('status',['APPROVAL_REQUIRED','READY']).order('created_at',{ascending:false}).limit(limit);
    if (error) throw new Error(`Approvals lookup failed: ${error.message}`);
    return { title: 'Approvalهای منتظر', text: (data ?? []).map((row)=>`${row.id}\n${row.channel} · ${row.status} · ${row.approval_reason ?? '—'}\n${String(row.original_text ?? '').slice(0,220)}`).join('\n\n') || 'Approval منتظری وجود ندارد.' };
  }

  if (command.type === 'SHOW_CAMPAIGNS') {
    const limit = Math.max(1,Math.min(50,command.limit ?? 10));
    const { data, error } = await supabase.from('campaigns').select('id,name,hunter_type,country_code,city,industry,target_count,status,updated_at').eq('organization_id', organizationId).order('updated_at',{ascending:false}).limit(limit);
    if (error) throw new Error(`Campaigns lookup failed: ${error.message}`);
    return { title: 'کمپین‌ها', text: (data ?? []).map((row)=>`${row.status} · ${row.name}\n${row.country_code ?? '—'} · ${row.city ?? '—'} · ${row.industry ?? '—'} · target ${row.target_count}`).join('\n\n') || 'کمپینی وجود ندارد.' };
  }

  return { title: 'راهنما', text: helpText() };
}

function validateStyle(field: TelegramMarketStyleField, value: string | number) {
  if (field === 'tone') {
    if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{1,63}$/i.test(value)) throw new Error('Tone باید یک preset کوتاه و امن باشد.');
  } else if (field === 'dialect') {
    if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z0-9 _-]{1,79}$/.test(value)) throw new Error('Dialect نامعتبر است.');
  } else if (field === 'primaryLocale' || field === 'fallbackLocale') {
    if (typeof value !== 'string' || !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})?$/.test(value)) throw new Error('Locale باید مثل ar-OM یا en باشد.');
  } else if (field === 'dialectIntensity') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) throw new Error('Dialect intensity باید بین 0 و 1 باشد.');
  } else {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 10 || value > 500) throw new Error('Word limit باید عدد صحیح بین 10 و 500 باشد.');
  }
}

function validTime(value: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }

export async function prepareControlMutation(input: { supabase: SupabaseClient; organizationId: string; ownerUserId: string; command: TelegramOwnerCommand }): Promise<PreparedMutation> {
  const { supabase, organizationId } = input;
  let command = input.command;

  if (command.type === 'SET_DISCOUNT_POLICY') {
    const service = await resolveService(supabase, organizationId, command.serviceQuery);
    const row = await resolvePrice(supabase, organizationId, service.id, command.countryCode.toUpperCase());
    const auto = Number(command.maxAutoDiscountPct), approval = Number(command.maxDiscountWithApprovalPct);
    if (![auto,approval].every(Number.isFinite) || auto < 0 || approval < auto || approval > 100) throw new Error('Discount policy نامعتبر است: 0 ≤ auto ≤ approval ≤ 100.');
    const price = Number(row.price), floor = Number(row.minimum_price ?? 0);
    const maxByFloor = price > 0 ? ((price-floor)/price)*100 : 0;
    if (floor > 0 && approval > maxByFloor + 0.0001) throw new Error(`Approval discount با floor تداخل دارد؛ حداکثر سازگار با floor حدود ${maxByFloor.toFixed(2)}% است.`);
    command = { ...command, countryCode: command.countryCode.toUpperCase(), serviceQuery: service.id };
    const before = { serviceId: service.id, countryCode: row.country_code, maxAutoDiscountPct: Number(row.max_auto_discount_pct ?? 0), maxDiscountWithApprovalPct: Number(row.max_discount_with_approval_pct ?? 0) };
    const after = { ...before, maxAutoDiscountPct: auto, maxDiscountWithApprovalPct: approval };
    return { command, preview: { title: 'قانون تخفیف', text: `${service.name} · ${command.countryCode}\nAuto: ${before.maxAutoDiscountPct}% → ${auto}%\nWith approval: ${before.maxDiscountWithApprovalPct}% → ${approval}%\nFloor دست‌نخورده می‌ماند: ${floor} ${row.currency}`, before, after, entityType:'service_price', entityId:String(row.id), requiresConfirmation:true } };
  }

  if (command.type === 'SET_MINIMUM_PRICE') {
    const service = await resolveService(supabase, organizationId, command.serviceQuery);
    const row = await resolvePrice(supabase, organizationId, service.id, command.countryCode.toUpperCase());
    const minimumPrice = Number(command.minimumPrice);
    if (!Number.isFinite(minimumPrice) || minimumPrice < 0 || minimumPrice > Number(row.price)) throw new Error(`Minimum price باید بین 0 و قیمت فعلی ${row.price} باشد.`);
    command = { ...command, countryCode: command.countryCode.toUpperCase(), serviceQuery: service.id };
    const before = { serviceId: service.id, countryCode: row.country_code, minimumPrice: Number(row.minimum_price ?? 0) };
    const after = { ...before, minimumPrice };
    return { command, preview: { title:'Price floor', text:`${service.name} · ${command.countryCode}\nBefore: ${before.minimumPrice} ${row.currency}\nAfter: ${minimumPrice} ${row.currency}`, before, after, entityType:'service_price', entityId:String(row.id), requiresConfirmation:true } };
  }

  if (command.type === 'SET_MARKET_STYLE') {
    const countryCode = command.countryCode.toUpperCase();
    validateStyle(command.field, command.value);
    const row = await localeRow(supabase, organizationId, countryCode);
    const column = STYLE_COLUMNS[command.field];
    const current = rec(row)[column];
    command = { ...command, countryCode };
    const before = { countryCode, field: command.field, value: current ?? null };
    const after = { ...before, value: command.value };
    return { command, preview:{ title:'Market style', text:`${countryCode} · ${command.field}\nBefore: ${String(before.value ?? '—')}\nAfter: ${String(command.value)}`, before, after, entityType:'locale_profile', entityId:String(row.id), requiresConfirmation:true } };
  }

  if (command.type === 'SET_MARKET_SEND_WINDOW') {
    const countryCode = command.countryCode.toUpperCase();
    if (!validTime(command.start) || !validTime(command.end) || command.start >= command.end) throw new Error('Send window باید HH:MM معتبر و start < end باشد.');
    const row = await marketRow(supabase, organizationId, countryCode);
    command = { ...command, countryCode };
    const before = { countryCode, start:String(row.send_window_start).slice(0,5), end:String(row.send_window_end).slice(0,5) };
    const after = { countryCode, start:command.start, end:command.end };
    return { command, preview:{ title:'Send window', text:`${countryCode}\nBefore: ${before.start}–${before.end}\nAfter: ${command.start}–${command.end}`, before, after, entityType:'market_settings', entityId:String(row.id), requiresConfirmation:true } };
  }

  if (command.type === 'SET_AGENT_ENABLED') {
    const agent = await resolveAgent(supabase, organizationId, command.agentQuery);
    command = { ...command, agentQuery: agent.agent_name };
    const before = { agentName:agent.agent_name, enabled:Boolean(agent.enabled) };
    const after = { ...before, enabled:command.enabled };
    return { command, preview:{ title:'Agent state', text:`${agent.agent_name}\nBefore: ${before.enabled?'ENABLED':'DISABLED'}\nAfter: ${command.enabled?'ENABLED':'DISABLED'}`, before, after, entityType:'agent_settings', entityId:String(agent.id), requiresConfirmation:true } };
  }

  if (command.type === 'SET_AGENT_THRESHOLD') {
    const threshold = Number(command.threshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('Confidence threshold باید بین 0 و 1 باشد.');
    const agent = await resolveAgent(supabase, organizationId, command.agentQuery);
    command = { ...command, agentQuery:agent.agent_name, threshold };
    const before = { agentName:agent.agent_name, threshold:Number(agent.confidence_threshold ?? 0) };
    const after = { ...before, threshold };
    return { command, preview:{ title:'Agent threshold', text:`${agent.agent_name}\nBefore: ${before.threshold}\nAfter: ${threshold}`, before, after, entityType:'agent_settings', entityId:String(agent.id), requiresConfirmation:true } };
  }

  if (command.type === 'SET_COST_LIMIT') {
    if (!COST_KEYS.has(command.key)) throw new Error('این Cost Guard key از Telegram قابل تغییر نیست.');
    const value = Number(command.value);
    const integerKey = command.key === 'daily_new_leads' || command.key === 'daily_outreach_limit';
    const normalizedValue = integerKey ? Math.round(value) : Math.round(value*100)/100;
    const max = integerKey ? 10000 : 100000;
    if (!Number.isFinite(value) || normalizedValue < 0 || normalizedValue > max) throw new Error(`مقدار Cost Guard باید بین 0 و ${max} باشد.`);
    const { data, error } = await supabase.from('cost_guard_settings').select(command.key).eq('organization_id', organizationId).maybeSingle();
    if (error || !data) throw new Error(`Cost Guard lookup failed: ${error?.message ?? 'not found'}`);
    command = { ...command, value:normalizedValue };
    const before = { key:command.key, value:Number(rec(data)[command.key] ?? 0) };
    const after = { key:command.key, value:normalizedValue };
    return { command, preview:{ title:'Cost Guard limit', text:`${command.key}\nBefore: ${before.value}\nAfter: ${normalizedValue}`, before, after, entityType:'cost_guard_settings', entityId:organizationId, requiresConfirmation:true } };
  }

  if (command.type === 'ACTIVATE_KILL_SWITCH') {
    const { data, error } = await supabase.from('system_controls').select('global_kill_switch,shadow_mode').eq('organization_id', organizationId).maybeSingle();
    if (error || !data) throw new Error(`System controls lookup failed: ${error?.message ?? 'not found'}`);
    const before = { globalKillSwitch:Boolean(data.global_kill_switch), shadowMode:Boolean(data.shadow_mode) };
    const after = { globalKillSwitch:true, shadowMode:Boolean(data.shadow_mode) };
    return { command, preview:{ title:'توقف اضطراری', text:`Global Kill Switch\nBefore: ${before.globalKillSwitch?'ON':'OFF'}\nAfter: ON ⛔️\nاین تغییر از Telegram قابل خاموش‌کردن یا Revert نیست.`, before, after, entityType:'system_controls', entityId:organizationId, requiresConfirmation:true } };
  }

  throw new Error('Extended mutation پشتیبانی نمی‌شود.');
}

async function assertCurrent(input: { supabase: SupabaseClient; organizationId: string; command: TelegramOwnerCommand; before: unknown }) {
  const { supabase, organizationId, command } = input;
  const expected = rec(input.before);
  if (command.type === 'SET_DISCOUNT_POLICY') {
    const row = await resolvePrice(supabase, organizationId, command.serviceQuery, command.countryCode);
    const current = { serviceId:command.serviceQuery, countryCode:row.country_code, maxAutoDiscountPct:Number(row.max_auto_discount_pct ?? 0), maxDiscountWithApprovalPct:Number(row.max_discount_with_approval_pct ?? 0) };
    if (!eq(current, expected)) throw new Error('Discount policy بعد از preview تغییر کرده؛ دوباره دستور را بفرست.');
  } else if (command.type === 'SET_MINIMUM_PRICE') {
    const row = await resolvePrice(supabase, organizationId, command.serviceQuery, command.countryCode);
    if (!eq({ serviceId:command.serviceQuery, countryCode:row.country_code, minimumPrice:Number(row.minimum_price ?? 0) }, expected)) throw new Error('Price floor بعد از preview تغییر کرده؛ دوباره دستور را بفرست.');
  } else if (command.type === 'SET_MARKET_STYLE') {
    const row = await localeRow(supabase, organizationId, command.countryCode);
    const current = { countryCode:command.countryCode, field:command.field, value:rec(row)[STYLE_COLUMNS[command.field]] ?? null };
    if (!eq(current, expected)) throw new Error('Market style بعد از preview تغییر کرده؛ دوباره دستور را بفرست.');
  } else if (command.type === 'SET_MARKET_SEND_WINDOW') {
    const row = await marketRow(supabase, organizationId, command.countryCode);
    const current = { countryCode:command.countryCode, start:String(row.send_window_start).slice(0,5), end:String(row.send_window_end).slice(0,5) };
    if (!eq(current, expected)) throw new Error('Send window بعد از preview تغییر کرده؛ دوباره دستور را بفرست.');
  } else if (command.type === 'SET_AGENT_ENABLED' || command.type === 'SET_AGENT_THRESHOLD') {
    const agent = await resolveAgent(supabase, organizationId, command.agentQuery);
    const current = command.type === 'SET_AGENT_ENABLED' ? { agentName:agent.agent_name, enabled:Boolean(agent.enabled) } : { agentName:agent.agent_name, threshold:Number(agent.confidence_threshold ?? 0) };
    if (!eq(current, expected)) throw new Error('Agent setting بعد از preview تغییر کرده؛ دوباره دستور را بفرست.');
  } else if (command.type === 'SET_COST_LIMIT') {
    const { data, error } = await supabase.from('cost_guard_settings').select(command.key).eq('organization_id', organizationId).maybeSingle();
    if (error || !data) throw new Error(error?.message ?? 'Cost Guard not found');
    if (!eq({key:command.key,value:Number(rec(data)[command.key] ?? 0)}, expected)) throw new Error('Cost Guard بعد از preview تغییر کرده؛ دوباره دستور را بفرست.');
  } else if (command.type === 'ACTIVATE_KILL_SWITCH') {
    const { data, error } = await supabase.from('system_controls').select('global_kill_switch,shadow_mode').eq('organization_id', organizationId).maybeSingle();
    if (error || !data) throw new Error(error?.message ?? 'System controls not found');
    if (!eq({globalKillSwitch:Boolean(data.global_kill_switch),shadowMode:Boolean(data.shadow_mode)}, expected)) throw new Error('System controls بعد از preview تغییر کرده؛ دوباره دستور را بفرست.');
  }
}

export async function executeControlMutation(input: { supabase: SupabaseClient; organizationId: string; ownerUserId: string; command: TelegramOwnerCommand; preview: CommandExecutionResult }): Promise<ExecutedMutation> {
  const { supabase, organizationId, ownerUserId, command, preview } = input;
  await assertCurrent({supabase,organizationId,command,before:preview.before});
  let text = 'تغییر انجام شد.';
  let reversible = true;

  if (command.type === 'SET_DISCOUNT_POLICY') {
    const { error } = await supabase.from('service_prices').update({ max_auto_discount_pct:command.maxAutoDiscountPct, max_discount_with_approval_pct:command.maxDiscountWithApprovalPct, updated_at:now() }).eq('organization_id',organizationId).eq('service_id',command.serviceQuery).eq('country_code',command.countryCode);
    if (error) throw new Error(`Discount policy update failed: ${error.message}`);
    text = `قانون تخفیف ${command.serviceQuery}/${command.countryCode} به auto ${command.maxAutoDiscountPct}% و approval ${command.maxDiscountWithApprovalPct}% تغییر کرد.`;
  } else if (command.type === 'SET_MINIMUM_PRICE') {
    const { error } = await supabase.from('service_prices').update({ minimum_price:command.minimumPrice, updated_at:now() }).eq('organization_id',organizationId).eq('service_id',command.serviceQuery).eq('country_code',command.countryCode);
    if (error) throw new Error(`Minimum price update failed: ${error.message}`);
    text = `Price floor ${command.serviceQuery}/${command.countryCode} روی ${command.minimumPrice} تنظیم شد.`;
  } else if (command.type === 'SET_MARKET_STYLE') {
    const { error } = await supabase.from('locale_profiles').update({ [STYLE_COLUMNS[command.field]]:command.value, updated_at:now() }).eq('organization_id',organizationId).eq('country_code',command.countryCode);
    if (error) throw new Error(`Market style update failed: ${error.message}`);
    text = `${command.countryCode} · ${command.field} روی ${command.value} تنظیم شد.`;
  } else if (command.type === 'SET_MARKET_SEND_WINDOW') {
    const { error } = await supabase.from('market_settings').update({ send_window_start:command.start, send_window_end:command.end, updated_at:now() }).eq('organization_id',organizationId).eq('country_code',command.countryCode);
    if (error) throw new Error(`Send window update failed: ${error.message}`);
    text = `Send window ${command.countryCode} روی ${command.start}–${command.end} تنظیم شد.`;
  } else if (command.type === 'SET_AGENT_ENABLED') {
    const { error } = await supabase.from('agent_settings').update({ enabled:command.enabled, updated_at:now() }).eq('organization_id',organizationId).eq('agent_name',command.agentQuery);
    if (error) throw new Error(`Agent update failed: ${error.message}`);
    text = `${command.agentQuery} ${command.enabled?'ENABLED':'DISABLED'} شد.`;
  } else if (command.type === 'SET_AGENT_THRESHOLD') {
    const { error } = await supabase.from('agent_settings').update({ confidence_threshold:command.threshold, updated_at:now() }).eq('organization_id',organizationId).eq('agent_name',command.agentQuery);
    if (error) throw new Error(`Agent threshold update failed: ${error.message}`);
    text = `Threshold ${command.agentQuery} روی ${command.threshold} تنظیم شد.`;
  } else if (command.type === 'SET_COST_LIMIT') {
    const { error } = await supabase.from('cost_guard_settings').update({ [command.key]:command.value, updated_at:now() }).eq('organization_id',organizationId);
    if (error) throw new Error(`Cost Guard update failed: ${error.message}`);
    text = `${command.key} روی ${command.value} تنظیم شد.`;
  } else if (command.type === 'ACTIVATE_KILL_SWITCH') {
    const { error } = await supabase.from('system_controls').update({ global_kill_switch:true, updated_at:now() }).eq('organization_id',organizationId);
    if (error) throw new Error(`Kill Switch update failed: ${error.message}`);
    text = 'Global Kill Switch فعال شد ⛔️. خاموش‌کردن آن از Telegram مجاز نیست.';
    reversible = false;
  } else {
    throw new Error('Unsupported control mutation');
  }

  const result: ExecutedMutation = { title:preview.title, text, before:preview.before, after:preview.after, entityType:preview.entityType, entityId:preview.entityId, command, reversible };
  await audit({supabase,organizationId,ownerUserId,command,entityType:result.entityType,entityId:result.entityId,before:result.before,after:result.after});
  return result;
}

export async function revertTargetsControlMutation(input: { supabase: SupabaseClient; organizationId: string; command: TelegramOwnerCommand }) {
  if (input.command.type !== 'REVERT_LAST_CHANGE' || !input.command.targetRunId) return false;
  const { data, error } = await input.supabase.from('telegram_command_runs').select('command_type').eq('organization_id',input.organizationId).eq('id',input.command.targetRunId).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? 'Telegram history not found');
  return isControlMutation(data.command_type as TelegramOwnerCommand['type']);
}

export async function executeControlRevert(input: { supabase: SupabaseClient; organizationId: string; ownerUserId: string; command: TelegramOwnerCommand; preview: CommandExecutionResult }): Promise<ExecutedMutation> {
  const { supabase,organizationId,ownerUserId,command,preview } = input;
  if (command.type !== 'REVERT_LAST_CHANGE' || !command.targetRunId) throw new Error('Revert target is missing');
  const { data, error } = await supabase.from('telegram_command_runs').select('command_type,command_payload,result,status').eq('organization_id',organizationId).eq('id',command.targetRunId).maybeSingle();
  if (error || !data) throw new Error(error?.message ?? 'Telegram history not found');
  if (data.status !== 'COMPLETED') throw new Error('Target Telegram change is not completed');
  const original = data.command_payload as TelegramOwnerCommand;
  const result = rec(data.result);
  if (result.reversible !== true) throw new Error('این تغییر قابل برگشت نیست.');
  const before = rec(result.before);

  if (original.type === 'SET_DISCOUNT_POLICY') {
    const { error:e } = await supabase.from('service_prices').update({max_auto_discount_pct:before.maxAutoDiscountPct,max_discount_with_approval_pct:before.maxDiscountWithApprovalPct,updated_at:now()}).eq('organization_id',organizationId).eq('service_id',original.serviceQuery).eq('country_code',original.countryCode); if(e)throw e;
  } else if (original.type === 'SET_MINIMUM_PRICE') {
    const { error:e } = await supabase.from('service_prices').update({minimum_price:before.minimumPrice,updated_at:now()}).eq('organization_id',organizationId).eq('service_id',original.serviceQuery).eq('country_code',original.countryCode); if(e)throw e;
  } else if (original.type === 'SET_MARKET_STYLE') {
    const { error:e } = await supabase.from('locale_profiles').update({[STYLE_COLUMNS[original.field]]:before.value,updated_at:now()}).eq('organization_id',organizationId).eq('country_code',original.countryCode); if(e)throw e;
  } else if (original.type === 'SET_MARKET_SEND_WINDOW') {
    const { error:e } = await supabase.from('market_settings').update({send_window_start:before.start,send_window_end:before.end,updated_at:now()}).eq('organization_id',organizationId).eq('country_code',original.countryCode); if(e)throw e;
  } else if (original.type === 'SET_AGENT_ENABLED') {
    const { error:e } = await supabase.from('agent_settings').update({enabled:before.enabled,updated_at:now()}).eq('organization_id',organizationId).eq('agent_name',original.agentQuery); if(e)throw e;
  } else if (original.type === 'SET_AGENT_THRESHOLD') {
    const { error:e } = await supabase.from('agent_settings').update({confidence_threshold:before.threshold,updated_at:now()}).eq('organization_id',organizationId).eq('agent_name',original.agentQuery); if(e)throw e;
  } else if (original.type === 'SET_COST_LIMIT') {
    const { error:e } = await supabase.from('cost_guard_settings').update({[original.key]:before.value,updated_at:now()}).eq('organization_id',organizationId); if(e)throw e;
  } else {
    throw new Error('این نوع تغییر extended برای Revert پشتیبانی نمی‌شود.');
  }

  const reverted: ExecutedMutation = { title:'Revert انجام شد', text:`${original.type} به مقدار قبلی برگشت.`, before:preview.before, after:preview.after, entityType:String(result.entityType ?? preview.entityType ?? 'telegram_change'), entityId:String(result.entityId ?? preview.entityId ?? ''), command, reversible:false };
  await audit({supabase,organizationId,ownerUserId,command,entityType:reverted.entityType,entityId:reverted.entityId,before:reverted.before,after:reverted.after});
  return reverted;
}
