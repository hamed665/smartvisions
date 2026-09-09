import type { TelegramCostLimitKey, TelegramMarketStyleField, TelegramOwnerCommand } from './contracts';

const COUNTRY_ALIASES: Record<string, string> = {
  om: 'OM', oman: 'OM', 'عمان': 'OM',
  ae: 'AE', uae: 'AE', emirates: 'AE', 'امارات': 'AE', 'الإمارات': 'AE',
  sa: 'SA', ksa: 'SA', saudi: 'SA', 'عربستان': 'SA', 'سعودی': 'SA', 'السعودية': 'SA',
  qa: 'QA', qatar: 'QA', 'قطر': 'QA',
  gb: 'GB', uk: 'GB', britain: 'GB', england: 'GB', 'انگلیس': 'GB', 'بریتانیا': 'GB',
  us: 'US', usa: 'US', america: 'US', 'آمریکا': 'US', 'امریکا': 'US',
  ca: 'CA', canada: 'CA', 'کانادا': 'CA', 'كندا': 'CA',
};

const AGENT_ALIASES: Record<string, string> = {
  secretary: 'secretary', 'منشی': 'secretary',
  relevance: 'relevance_checker', relevance_checker: 'relevance_checker', 'ربط': 'relevance_checker',
  orchestrator: 'decision_orchestrator', decision_orchestrator: 'decision_orchestrator', 'ارکستریتور': 'decision_orchestrator',
  intent: 'intent_discovery', intent_discovery: 'intent_discovery', 'اینتنت': 'intent_discovery',
  psychology: 'conversation_psychology', conversation_psychology: 'conversation_psychology', 'روانشناسی': 'conversation_psychology',
  business: 'business_analyst', business_analyst: 'business_analyst', 'بیزینس': 'business_analyst',
  culture: 'culture_locale', culture_locale: 'culture_locale', 'فرهنگ': 'culture_locale',
  sales: 'sales_marketing', sales_marketing: 'sales_marketing', 'فروش': 'sales_marketing',
  evidence: 'evidence_checker', evidence_checker: 'evidence_checker', 'شواهد': 'evidence_checker',
  preview: 'preview_director', preview_director: 'preview_director', 'پریویو': 'preview_director',
};

const COST_ALIASES: Record<string, TelegramCostLimitKey> = {
  monthly: 'monthly_total_budget_usd', month: 'monthly_total_budget_usd', 'ماهانه': 'monthly_total_budget_usd',
  openai: 'openai_budget_usd', 'اوپنای': 'openai_budget_usd',
  google: 'google_places_budget_usd', places: 'google_places_budget_usd', google_places: 'google_places_budget_usd', 'گوگل': 'google_places_budget_usd',
  resend: 'resend_budget_usd', email: 'resend_budget_usd', 'ایمیل': 'resend_budget_usd',
  meta: 'meta_budget_usd', whatsapp: 'meta_budget_usd', 'متا': 'meta_budget_usd', 'واتساپ': 'meta_budget_usd',
  leads: 'daily_new_leads', lead: 'daily_new_leads', 'لید': 'daily_new_leads',
  outreach: 'daily_outreach_limit', 'ارسال': 'daily_outreach_limit',
};

const TONE_PRESETS: Array<[RegExp, string]> = [
  [/(دوستانه.*حرفه|friendly.*professional|professional.*friendly)/i, 'friendly_professional'],
  [/(صمیمی|گرم|warm|friendly)/i, 'warm_concise'],
  [/(رسمی|formal)/i, 'formal_professional'],
  [/(بدون فشار|کم.?فشار|consultative|low.?pressure)/i, 'consultative_low_pressure'],
  [/(مستقیم|نتیجه|direct|outcome)/i, 'direct_outcome_focused'],
  [/(مودب|understated|polite)/i, 'polite_understated'],
];

const toLatinDigits = (value: string) => value
  .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const clean = (value: string) => toLatinDigits(value).replace(/\s+/g, ' ').trim();
const token = (value: string) => clean(value).toLowerCase().replace(/[،,:؛]/g, '');

export function normalizeCountryCode(value: string | undefined) {
  if (!value) return undefined;
  const normalized = token(value);
  const alias = COUNTRY_ALIASES[normalized];
  if (alias) return alias;
  if (/^[a-z]{2}$/.test(normalized)) return normalized.toUpperCase();
  return undefined;
}

function findCountryCode(value: string) {
  const normalized = clean(value).toLowerCase();
  const aliases = Object.keys(COUNTRY_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[\\s،,])${escaped}(?=$|[\\s،,.])`, 'i').test(normalized)) return COUNTRY_ALIASES[alias];
  }
  return undefined;
}

function numberValue(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(toLatinDigits(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: string) {
  const normalized = token(value);
  if (['on','true','yes','1','فعال','روشن','enable','enabled'].includes(normalized)) return true;
  if (['off','false','no','0','غیرفعال','خاموش','disable','disabled'].includes(normalized)) return false;
  return undefined;
}

function normalizeAgentQuery(value: string | undefined) {
  if (!value) return undefined;
  const normalized = token(value).replace(/\s+/g, '_');
  return AGENT_ALIASES[normalized] ?? normalized;
}

function tonePreset(value: string) {
  for (const [pattern, preset] of TONE_PRESETS) if (pattern.test(value)) return preset;
  const normalized = token(value).replace(/\s+/g, '_');
  return /^[a-z][a-z0-9_-]{1,63}$/.test(normalized) ? normalized : undefined;
}

function parseStyleSlash(field: TelegramMarketStyleField, parts: string[]): TelegramOwnerCommand | null {
  const countryCode = normalizeCountryCode(parts[0]);
  if (!countryCode || parts.length < 2) return null;
  const raw = parts.slice(1).join(' ');
  if (field === 'dialectIntensity' || field === 'maxFirstTouchWords' || field === 'maxReplyWords') {
    const value = numberValue(raw);
    return value == null ? null : { type: 'SET_MARKET_STYLE', countryCode, field, value };
  }
  const value = field === 'tone' ? tonePreset(raw) : raw;
  return value ? { type: 'SET_MARKET_STYLE', countryCode, field, value } : null;
}

function parseSlashCommand(input: string): TelegramOwnerCommand | null {
  const [rawName, ...parts] = clean(input).split(' ');
  const name = rawName.toLowerCase().split('@')[0];
  if (name === '/start' || name === '/help') return { type: 'HELP' };
  if (name === '/status') return { type: 'SHOW_STATUS' };
  if (name === '/services') return { type: 'LIST_SERVICES' };
  if (name === '/markets') return { type: 'SHOW_MARKETS' };
  if (name === '/agents') return { type: 'SHOW_AGENTS' };
  if (name === '/budget') return { type: 'SHOW_BUDGET' };
  if (name === '/approvals') return { type: 'SHOW_APPROVALS', limit: Math.max(1, Math.min(50, numberValue(parts[0]) ?? 10)) };
  if (name === '/campaigns') return { type: 'SHOW_CAMPAIGNS', limit: Math.max(1, Math.min(50, numberValue(parts[0]) ?? 10)) };
  if (name === '/policy' && parts[0]) {
    const countryCode = normalizeCountryCode(parts[0]);
    return countryCode ? { type: 'SHOW_MARKET_POLICY', countryCode } : null;
  }
  if (name === '/pricing') return { type: 'SHOW_PRICING', countryCode: normalizeCountryCode(parts[0]), serviceQuery: parts.slice(1).join(' ') || undefined };
  if (name === '/leads') return { type: 'SHOW_LEADS', limit: Math.max(1, Math.min(50, numberValue(parts[0]) ?? 10)), stage: parts[1]?.toUpperCase() };
  if (name === '/price' && parts.length >= 3) {
    const countryCode = normalizeCountryCode(parts[0]);
    const price = numberValue(parts.at(-1));
    const serviceQuery = parts.slice(1, -1).join(' ');
    if (countryCode && serviceQuery && price != null) return { type: 'SET_PRICE', countryCode, serviceQuery, price };
  }
  if (name === '/discount' && parts.length >= 4) {
    const countryCode = normalizeCountryCode(parts[0]);
    const approval = numberValue(parts.at(-1));
    const auto = numberValue(parts.at(-2));
    const serviceQuery = parts.slice(1, -2).join(' ');
    if (countryCode && serviceQuery && auto != null && approval != null) return { type: 'SET_DISCOUNT_POLICY', countryCode, serviceQuery, maxAutoDiscountPct: auto, maxDiscountWithApprovalPct: approval };
  }
  if (name === '/minimum' && parts.length >= 3) {
    const countryCode = normalizeCountryCode(parts[0]);
    const minimumPrice = numberValue(parts.at(-1));
    const serviceQuery = parts.slice(1, -1).join(' ');
    if (countryCode && serviceQuery && minimumPrice != null) return { type: 'SET_MINIMUM_PRICE', countryCode, serviceQuery, minimumPrice };
  }
  if (name === '/service' && parts.length >= 2) {
    const enabled = booleanValue(parts.at(-1) ?? '');
    const serviceQuery = parts.slice(0, -1).join(' ');
    if (enabled != null && serviceQuery) return { type: 'SET_SERVICE_ENABLED', serviceQuery, enabled };
  }
  if (name === '/option' && parts.length >= 3) {
    const serviceQuery = parts[0];
    const optionKey = parts[1];
    const raw = parts.slice(2).join(' ');
    const bool = booleanValue(raw);
    const numeric = numberValue(raw);
    const value = bool ?? numeric ?? raw;
    return { type: 'SET_SERVICE_OPTION', serviceQuery, optionKey, value };
  }
  if (name === '/tone') return parseStyleSlash('tone', parts);
  if (name === '/dialect') return parseStyleSlash('dialect', parts);
  if (name === '/locale') return parseStyleSlash('primaryLocale', parts);
  if (name === '/replywords') return parseStyleSlash('maxReplyWords', parts);
  if (name === '/window' && parts.length >= 3) {
    const countryCode = normalizeCountryCode(parts[0]);
    if (countryCode) return { type: 'SET_MARKET_SEND_WINDOW', countryCode, start: parts[1], end: parts[2] };
  }
  if (name === '/agent' && parts.length >= 2) {
    const enabled = booleanValue(parts.at(-1) ?? '');
    const agentQuery = normalizeAgentQuery(parts.slice(0, -1).join(' '));
    if (agentQuery && enabled != null) return { type: 'SET_AGENT_ENABLED', agentQuery, enabled };
  }
  if (name === '/threshold' && parts.length >= 2) {
    const threshold = numberValue(parts.at(-1));
    const agentQuery = normalizeAgentQuery(parts.slice(0, -1).join(' '));
    if (agentQuery && threshold != null) return { type: 'SET_AGENT_THRESHOLD', agentQuery, threshold };
  }
  if (name === '/limit' && parts.length >= 2) {
    const key = COST_ALIASES[token(parts[0])];
    const value = numberValue(parts[1]);
    if (key && value != null) return { type: 'SET_COST_LIMIT', key, value };
  }
  if (name === '/kill' && booleanValue(parts[0] ?? '') === true) return { type: 'ACTIVATE_KILL_SWITCH' };
  if (name === '/kill' && booleanValue(parts[0] ?? '') === false) return { type: 'SAFETY_BLOCK', reason: 'KILL_SWITCH_OFF' };
  if (name === '/hunt' && parts.length >= 3) {
    const countryCode = normalizeCountryCode(parts[0]);
    if (!countryCode) return null;
    const targetMaybe = numberValue(parts.at(-1));
    const body = targetMaybe != null ? parts.slice(1, -1) : parts.slice(1);
    const city = body[0];
    const industry = body.slice(1).join(' ');
    if (city && industry) return { type: 'CREATE_HUNTER_CAMPAIGN', countryCode, city, industry, targetCount: Math.max(1, Math.min(20, targetMaybe ?? 5)) };
  }
  if (name === '/market' && parts.length >= 2) {
    const countryCode = normalizeCountryCode(parts[0]);
    const enabled = booleanValue(parts[1]);
    if (countryCode && enabled != null) return { type: 'SET_MARKET_ENABLED', countryCode, enabled };
  }
  if ((name === '/pause' || name === '/resume') && parts[0]) {
    const targetRaw = token(parts[0]);
    const target = targetRaw.includes('whatsapp') || targetRaw.includes('واتساپ') ? 'WHATSAPP'
      : targetRaw.includes('email') || targetRaw.includes('ایمیل') ? 'EMAIL'
      : targetRaw.includes('agent') || targetRaw.includes('ایجنت') ? 'AGENTS' : null;
    if (target) return { type: 'SET_PAUSE', target, paused: name === '/pause' };
  }
  if (name === '/approve' && parts[0]) return { type: 'APPROVE_MESSAGE', messageId: parts[0] };
  if (name === '/reject' && parts[0]) return { type: 'REJECT_MESSAGE', messageId: parts[0], reason: parts.slice(1).join(' ') || undefined };
  if (name === '/revert') return { type: 'REVERT_LAST_CHANGE', targetRunId: parts[0] || undefined };
  return null;
}

function parseNaturalDiscount(input: string): TelegramOwnerCommand | null {
  const countryCode = findCountryCode(input);
  if (!countryCode || !/(تخفیف|discount)/i.test(input)) return null;
  const auto = input.match(/(?:تخفیف\s*خودکار|auto\s*discount)\D{0,20}(\d+(?:\.\d+)?)\s*%?/i)?.[1];
  const approval = input.match(/(?:با\s*(?:تایید|تأیید)|approval(?:\s*discount)?|with\s*approval)\D{0,20}(\d+(?:\.\d+)?)\s*%?/i)?.[1];
  if (!auto || !approval) return null;
  const countryNames = Object.keys(COUNTRY_ALIASES).sort((a,b)=>b.length-a.length).join('|');
  const service = input
    .replace(new RegExp(`(?:${countryNames})`, 'ig'), ' ')
    .replace(/(?:برای|در|set|change|discount|تخفیف|خودکار|auto|approval|with|با|تایید|تأیید|تا|to|and|و|درصد|%|\d+(?:\.\d+)?)/ig, ' ')
    .replace(/\s+/g, ' ').trim();
  if (!service) return null;
  return { type: 'SET_DISCOUNT_POLICY', countryCode, serviceQuery: service, maxAutoDiscountPct: Number(auto), maxDiscountWithApprovalPct: Number(approval) };
}

export function parseTelegramOwnerCommand(rawInput: string): TelegramOwnerCommand {
  const input = clean(rawInput);
  if (!input) return { type: 'HELP' };
  if (input.startsWith('/')) return parseSlashCommand(input) ?? { type: 'HELP' };

  if (/(shadow\s*mode|شدو\s*مود|حالت\s*سایه)/i.test(input) && /(off|خاموش|غیرفعال|disable)/i.test(input)) return { type: 'SAFETY_BLOCK', reason: 'SHADOW_MODE' };
  if (/(kill\s*switch|کیل\s*سوییچ)/i.test(input) && /(off|خاموش|غیرفعال|disable)/i.test(input)) return { type: 'SAFETY_BLOCK', reason: 'KILL_SWITCH_OFF' };
  if (/(secret|token|api\s*key|رمز|توکن)/i.test(input) && /(تغییر|change|set|show|نمایش)/i.test(input)) return { type: 'SAFETY_BLOCK', reason: 'SECRETS' };
  if (/(dnc|do.?not.?contact|عدم تماس|suppression)/i.test(input) && /(دور بزن|bypass|disable|خاموش|حذف)/i.test(input)) return { type: 'SAFETY_BLOCK', reason: 'DNC_BYPASS' };
  if (/(approval|تایید|تأیید)/i.test(input) && /(bypass|دور بزن|خاموش|disable)/i.test(input)) return { type: 'SAFETY_BLOCK', reason: 'APPROVAL_BYPASS' };
  if (/(whatsapp|واتساپ|instagram|اینستاگرام)/i.test(input) && /(auto cold|cold auto|ارسال خودکار سرد|اتو سرد)/i.test(input)) return { type: 'SAFETY_BLOCK', reason: 'AUTO_COLD_CHANNEL' };

  if (/^(کمک|راهنما|help)$/i.test(input)) return { type: 'HELP' };
  if (/(وضعیت|status|سیستم چطوره|گزارش سیستم)/i.test(input)) return { type: 'SHOW_STATUS' };
  if (/(لیست|فهرست).*(سرویس|خدمات)|^(سرویس ها|سرویس‌ها|services)$/i.test(input)) return { type: 'LIST_SERVICES' };
  if (/(بازارها|markets)/i.test(input) && /(نشون|نمایش|لیست|show|list|چه)/i.test(input)) return { type: 'SHOW_MARKETS' };
  if (/(ایجنت|agent)/i.test(input) && /(نشون|نمایش|لیست|show|list|وضعیت)/i.test(input)) return { type: 'SHOW_AGENTS' };
  if (/(بودجه|budget|cost guard)/i.test(input) && /(نشون|نمایش|show|چقد|وضعیت)/i.test(input)) return { type: 'SHOW_BUDGET' };
  if (/(approval|تایید|تأیید)/i.test(input) && /(لیست|نشون|نمایش|show|waiting|منتظر)/i.test(input)) return { type: 'SHOW_APPROVALS', limit: 10 };
  if (/(campaign|کمپین)/i.test(input) && /(لیست|نشون|نمایش|show|وضعیت)/i.test(input)) return { type: 'SHOW_CAMPAIGNS', limit: 10 };
  if (/(policy|سیاست)/i.test(input)) {
    const countryCode = findCountryCode(input);
    if (countryCode && /(نشون|نمایش|show|چی|وضعیت)/i.test(input)) return { type: 'SHOW_MARKET_POLICY', countryCode };
  }
  if (/(لید|lead)/i.test(input) && /(نشون|نمایش|لیست|show|list)/i.test(input)) {
    const match = input.match(/(\d{1,2})/);
    return { type: 'SHOW_LEADS', limit: Math.max(1, Math.min(50, numberValue(match?.[1]) ?? 10)) };
  }

  const discount = parseNaturalDiscount(input);
  if (discount) return discount;

  const minFa = input.match(/(?:حداقل\s*قیمت|min(?:imum)?\s*price)\s+(.+?)\s+(?:در|برای|in|for)\s+([^\s]+).*?(\d+(?:\.\d+)?)/i);
  if (minFa) {
    const countryCode = normalizeCountryCode(minFa[2]);
    const minimumPrice = numberValue(minFa[3]);
    if (countryCode && minimumPrice != null) return { type: 'SET_MINIMUM_PRICE', countryCode, serviceQuery: minFa[1].trim(), minimumPrice };
  }

  const priceFa = input.match(/قیمت\s+(.+?)\s+(?:در|برای)\s+([^\s]+)\s+(?:رو|را)?\s*(\d+(?:\.\d+)?)\s*(?:کن|بذار|بگذار|تغییر بده)/i);
  if (priceFa) {
    const countryCode = normalizeCountryCode(priceFa[2]);
    const price = numberValue(priceFa[3]);
    if (countryCode && price != null) return { type: 'SET_PRICE', countryCode, serviceQuery: priceFa[1].trim(), price };
  }
  const priceEn = input.match(/(?:set|change)\s+(?:the\s+)?price\s+(?:of\s+)?(.+?)\s+(?:in|for)\s+([^\s]+)\s+(?:to\s+)?(\d+(?:\.\d+)?)/i);
  if (priceEn) {
    const countryCode = normalizeCountryCode(priceEn[2]);
    const price = numberValue(priceEn[3]);
    if (countryCode && price != null) return { type: 'SET_PRICE', countryCode, serviceQuery: priceEn[1].trim(), price };
  }

  const countryCode = findCountryCode(input);
  if (countryCode && /(لحن|tone)/i.test(input) && /(کن|بذار|بگذار|set|change|to)/i.test(input)) {
    const preset = tonePreset(input);
    if (preset) return { type: 'SET_MARKET_STYLE', countryCode, field: 'tone', value: preset };
  }
  if (countryCode && /(لهجه|dialect)/i.test(input) && /(کن|بذار|بگذار|set|change|to)/i.test(input)) {
    const dialect = /عمانی|omani/i.test(input) ? 'omani' : /اماراتی|emirati/i.test(input) ? 'emirati' : /سعودی|saudi/i.test(input) ? 'saudi' : /قطری|qatari/i.test(input) ? 'qatari' : /british|بریتیش/i.test(input) ? 'british' : /american|امریکن/i.test(input) ? 'american' : undefined;
    if (dialect) return { type: 'SET_MARKET_STYLE', countryCode, field: 'dialect', value: dialect };
  }
  if (countryCode && /(زبان اصلی|primary locale|primary language)/i.test(input)) {
    const locale = input.match(/\b([a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?)\b/)?.[1];
    if (locale && !normalizeCountryCode(locale)) return { type: 'SET_MARKET_STYLE', countryCode, field: 'primaryLocale', value: locale };
  }
  if (countryCode && /(ساعت ارسال|send window)/i.test(input)) {
    const times = input.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g);
    if (times?.length && times.length >= 2) return { type: 'SET_MARKET_SEND_WINDOW', countryCode, start: times[0], end: times[1] };
    const hours = [...input.matchAll(/\b([0-9]|1\d|2[0-3])\b/g)].map((m) => `${m[1].padStart(2,'0')}:00`);
    if (hours.length >= 2) return { type: 'SET_MARKET_SEND_WINDOW', countryCode, start: hours.at(-2)!, end: hours.at(-1)! };
  }

  const agentToggle = input.match(/(?:ایجنت|agent)\s+([a-zA-Z_\-]+).*?(فعال|غیرفعال|روشن|خاموش|enable|disable|on|off)/i);
  if (agentToggle) {
    const agentQuery = normalizeAgentQuery(agentToggle[1]);
    const enabled = booleanValue(agentToggle[2]);
    if (agentQuery && enabled != null) return { type: 'SET_AGENT_ENABLED', agentQuery, enabled };
  }
  const threshold = input.match(/(?:threshold|آستانه)\s+([a-zA-Z_\-]+).*?(\d+(?:\.\d+)?)/i);
  if (threshold) {
    const agentQuery = normalizeAgentQuery(threshold[1]);
    const value = numberValue(threshold[2]);
    if (agentQuery && value != null) return { type: 'SET_AGENT_THRESHOLD', agentQuery, threshold: value };
  }

  const costValue = input.match(/(\d+(?:\.\d+)?)/)?.[1];
  if (costValue && /(بودجه ماهانه|monthly budget)/i.test(input) && /(کن|بذار|set|change)/i.test(input)) return { type: 'SET_COST_LIMIT', key: 'monthly_total_budget_usd', value: Number(costValue) };
  if (costValue && /(بودجه.*openai|openai.*budget)/i.test(input) && /(کن|بذار|set|change)/i.test(input)) return { type: 'SET_COST_LIMIT', key: 'openai_budget_usd', value: Number(costValue) };
  if (costValue && /(حد.*لید.*روزانه|daily.*lead)/i.test(input) && /(کن|بذار|set|change)/i.test(input)) return { type: 'SET_COST_LIMIT', key: 'daily_new_leads', value: Number(costValue) };
  if (costValue && /(حد.*ارسال.*روزانه|daily.*outreach)/i.test(input) && /(کن|بذار|set|change)/i.test(input)) return { type: 'SET_COST_LIMIT', key: 'daily_outreach_limit', value: Number(costValue) };

  if (/(kill\s*switch|کیل\s*سوییچ)/i.test(input) && /(فعال|روشن|on|activate|enable)/i.test(input)) return { type: 'ACTIVATE_KILL_SWITCH' };

  if (/(قیمت|pricing|price)/i.test(input)) return { type: 'SHOW_PRICING', countryCode: findCountryCode(input) };

  const serviceToggle = input.match(/(?:سرویس|خدمت)\s+(.+?)\s+(?:رو|را)?\s*(فعال|غیرفعال|روشن|خاموش)\s*(?:کن)?$/i);
  if (serviceToggle) return { type: 'SET_SERVICE_ENABLED', serviceQuery: serviceToggle[1].trim(), enabled: ['فعال','روشن'].includes(serviceToggle[2]) };

  const pauseTarget = /(واتساپ|whatsapp|ایمیل|email|ایجنت|agent)/i.exec(input)?.[1] ?? '';
  if (pauseTarget && /(متوقف|pause|خاموش)/i.test(input)) {
    const target = /(واتساپ|whatsapp)/i.test(pauseTarget) ? 'WHATSAPP' : /(ایمیل|email)/i.test(pauseTarget) ? 'EMAIL' : 'AGENTS';
    return { type: 'SET_PAUSE', target, paused: true };
  }
  if (pauseTarget && /(ادامه|resume|فعال)/i.test(input)) {
    const target = /(واتساپ|whatsapp)/i.test(pauseTarget) ? 'WHATSAPP' : /(ایمیل|email)/i.test(pauseTarget) ? 'EMAIL' : 'AGENTS';
    return { type: 'SET_PAUSE', target, paused: false };
  }

  const hunter = input.match(/(?:برو\s+)?(?:تو|در)\s+([^\s،]+)[،,\s]+([^،,]+?)[،,\s]+(.+?)\s+(?:پیدا\s+کن|find)(?:\s+(\d+)\s*(?:تا)?)?$/i);
  if (hunter) {
    const code = normalizeCountryCode(hunter[1]);
    const targetCount = numberValue(hunter[4]) ?? 5;
    if (code) return { type: 'CREATE_HUNTER_CAMPAIGN', countryCode: code, city: hunter[2].trim(), industry: hunter[3].trim(), targetCount: Math.max(1, Math.min(20, targetCount)) };
  }

  const marketToggle = input.match(/(?:بازار|market)\s+([^\s]+).*?(فعال|غیرفعال|enable|disable)/i);
  if (marketToggle) {
    const code = normalizeCountryCode(marketToggle[1]);
    if (code) return { type: 'SET_MARKET_ENABLED', countryCode: code, enabled: /فعال|enable/i.test(marketToggle[2]) && !/غیرفعال|disable/i.test(marketToggle[2]) };
  }

  if (/(آخرین تغییر|last change).*(برگرد|revert|undo)/i.test(input)) return { type: 'REVERT_LAST_CHANGE' };
  return { type: 'HELP' };
}