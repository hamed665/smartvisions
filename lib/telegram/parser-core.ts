import type { TelegramCostLimitKey, TelegramMarketStyleField, TelegramOwnerCommand } from './contracts';

const COUNTRY_ALIASES: Record<string, string> = {
  om: 'OM', oman: 'OM', 'عمان': 'OM',
  ae: 'AE', uae: 'AE', emirates: 'AE', 'امارات': 'AE', 'الإمارات': 'AE',
  sa: 'SA', ksa: 'SA', saudi: 'SA', 'عربستان': 'SA', 'سعودی': 'SA', 'السعودية': 'SA',
  qa: 'QA', qatar: 'QA', 'قطر': 'QA',
  gb: 'GB', uk: 'GB', britain: 'GB', england: 'GB', 'انگلیس': 'GB', 'بریتانیا': 'GB',
  us: 'US', usa: 'US', america: 'US', 'آمریکا': 'US', 'امریکا': 'US',
  ca: 'CA', canada: 'CA', 'کانادا': 'CA', كندا: 'CA',
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
  if (name === '/pricing') {
    const countryCode = normalizeCountryCode(parts[0]);
    return { type:'SHOW_PRICING', countryCode, serviceQuery: countryCode ? parts.slice(1).join(' ') || undefined : parts.join(' ') || undefined };
  }
  if (name === '/leads') return { type:'SHOW_LEADS', limit:Math.max(1,Math.min(50,numberValue(parts[0])??10)), stage:parts[1] };
  if (name === '/pause' && parts[0]) {
    const target = token(parts[0]);
    const mapped = target === 'agents' || target === 'ایجنت' ? 'AGENTS' : target === 'email' || target === 'ایمیل' ? 'EMAIL' : target === 'whatsapp' || target === 'واتساپ' ? 'WHATSAPP' : null;
    return mapped ? { type:'SET_PAUSE', target:mapped, paused:true } : null;
  }
  if (name === '/resume' && parts[0]) {
    const target = token(parts[0]);
    const mapped = target === 'agents' || target === 'ایجنت' ? 'AGENTS' : target === 'email' || target === 'ایمیل' ? 'EMAIL' : target === 'whatsapp' || target === 'واتساپ' ? 'WHATSAPP' : null;
    return mapped ? { type:'SET_PAUSE', target:mapped, paused:false } : null;
  }
  if (name === '/killswitch') return { type:'ACTIVATE_KILL_SWITCH' };
  if (name === '/approve' && parts[0]) return { type:'APPROVE_MESSAGE', messageId:parts[0] };
  if (name === '/reject' && parts[0]) return { type:'REJECT_MESSAGE', messageId:parts[0], reason:parts.slice(1).join(' ') || undefined };
  if (name === '/market' && parts.length >= 2) {
    const countryCode = normalizeCountryCode(parts[0]);
    const enabled = booleanValue(parts[1]);
    return countryCode && enabled != null ? { type:'SET_MARKET_ENABLED', countryCode, enabled } : null;
  }
  if (name === '/window' && parts.length >= 3) {
    const countryCode = normalizeCountryCode(parts[0]);
    return countryCode ? { type:'SET_MARKET_SEND_WINDOW', countryCode, start:parts[1], end:parts[2] } : null;
  }
  if (name === '/tone') return parseStyleSlash('tone', parts);
  if (name === '/dialect') return parseStyleSlash('dialect', parts);
  if (name === '/locale') return parseStyleSlash('primaryLocale', parts);
  if (name === '/revert') return { type:'REVERT_LAST_CHANGE', targetRunId:parts[0] };
  return null;
}

function naturalReadCommand(input: string): TelegramOwnerCommand | null {
  const countryCode = findCountryCode(input);
  if (/^(وضعیت|status)(\s|$)/i.test(input)) return { type:'SHOW_STATUS' };
  if (/(بازارها|markets)/i.test(input)) return { type:'SHOW_MARKETS' };
  if (/(قیمت|pricing)/i.test(input) && !/(تغییر|بذار|بگذار|set|change)/i.test(input)) return { type:'SHOW_PRICING', countryCode };
  if (/(لید|lead)/i.test(input) && !/(تغییر|set|create|بساز)/i.test(input)) return { type:'SHOW_LEADS', limit:10 };
  if (/(کمپین|campaign)/i.test(input) && !/(بساز|create|start|شروع)/i.test(input)) return { type:'SHOW_CAMPAIGNS', limit:10 };
  if (/(بودجه|budget)/i.test(input) && !/(تغییر|بذار|بگذار|set|change)/i.test(input)) return { type:'SHOW_BUDGET' };
  return null;
}

export function parseTelegramOwnerCommand(rawInput: string): TelegramOwnerCommand {
  const input = clean(rawInput);
  if (!input) return { type:'HELP' };
  if (input.startsWith('/')) return parseSlashCommand(input) ?? { type:'HELP' };
  return naturalReadCommand(input) ?? { type:'HELP' };
}