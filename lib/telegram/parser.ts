import type { TelegramOwnerCommand } from './contracts';

const COUNTRY_ALIASES: Record<string, string> = {
  om: 'OM', oman: 'OM', 'عمان': 'OM',
  ae: 'AE', uae: 'AE', emirates: 'AE', 'امارات': 'AE', 'الإمارات': 'AE',
  sa: 'SA', ksa: 'SA', saudi: 'SA', 'عربستان': 'SA', 'سعودی': 'SA', 'السعودية': 'SA',
  qa: 'QA', qatar: 'QA', 'قطر': 'QA',
  gb: 'GB', uk: 'GB', britain: 'GB', england: 'GB', 'انگلیس': 'GB', 'بریتانیا': 'GB',
  us: 'US', usa: 'US', america: 'US', 'آمریکا': 'US', 'امریکا': 'US',
};

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

function numberValue(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(toLatinDigits(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: string) {
  const normalized = token(value);
  if (['on','true','yes','1','فعال','روشن'].includes(normalized)) return true;
  if (['off','false','no','0','غیرفعال','خاموش'].includes(normalized)) return false;
  return undefined;
}

function parseSlashCommand(input: string): TelegramOwnerCommand | null {
  const [rawName, ...parts] = clean(input).split(' ');
  const name = rawName.toLowerCase().split('@')[0];
  if (name === '/start' || name === '/help') return { type: 'HELP' };
  if (name === '/status') return { type: 'SHOW_STATUS' };
  if (name === '/services') return { type: 'LIST_SERVICES' };
  if (name === '/pricing') return { type: 'SHOW_PRICING', countryCode: normalizeCountryCode(parts[0]), serviceQuery: parts.slice(1).join(' ') || undefined };
  if (name === '/leads') return { type: 'SHOW_LEADS', limit: Math.max(1, Math.min(50, numberValue(parts[0]) ?? 10)), stage: parts[1]?.toUpperCase() };
  if (name === '/price' && parts.length >= 3) {
    const countryCode = normalizeCountryCode(parts[0]);
    const price = numberValue(parts.at(-1));
    const serviceQuery = parts.slice(1, -1).join(' ');
    if (countryCode && serviceQuery && price != null) return { type: 'SET_PRICE', countryCode, serviceQuery, price };
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
  if (name === '/hunt' && parts.length >= 3) {
    const countryCode = normalizeCountryCode(parts[0]);
    if (!countryCode) return null;
    const targetMaybe = numberValue(parts.at(-1));
    const body = targetMaybe != null ? parts.slice(1, -1) : parts.slice(1);
    const city = body[0];
    const industry = body.slice(1).join(' ');
    if (city && industry) return { type: 'CREATE_HUNTER_CAMPAIGN', countryCode, city, industry, targetCount: Math.max(1, Math.min(20, targetMaybe ?? 5)) };
  }
  if ((name === '/market') && parts.length >= 2) {
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
  if (name === '/revert') return { type: 'REVERT_LAST_CHANGE' };
  return null;
}

export function parseTelegramOwnerCommand(rawInput: string): TelegramOwnerCommand {
  const input = clean(rawInput);
  if (!input) return { type: 'HELP' };
  if (input.startsWith('/')) return parseSlashCommand(input) ?? { type: 'HELP' };

  const lower = input.toLowerCase();
  if (/^(کمک|راهنما|help)$/i.test(input)) return { type: 'HELP' };
  if (/(وضعیت|status|سیستم چطوره|گزارش سیستم)/i.test(input)) return { type: 'SHOW_STATUS' };
  if (/(لیست|فهرست).*(سرویس|خدمات)|^(سرویس ها|سرویس‌ها|services)$/i.test(input)) return { type: 'LIST_SERVICES' };
  if (/(لید|lead)/i.test(input) && /(نشون|نمایش|لیست|show|list)/i.test(input)) {
    const match = input.match(/(\d{1,2})/);
    return { type: 'SHOW_LEADS', limit: Math.max(1, Math.min(50, numberValue(match?.[1]) ?? 10)) };
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
  if (/(قیمت|pricing|price)/i.test(input)) {
    const country = Object.keys(COUNTRY_ALIASES).find((alias) => lower.includes(alias));
    return { type: 'SHOW_PRICING', countryCode: country ? COUNTRY_ALIASES[country] : undefined };
  }

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
    const countryCode = normalizeCountryCode(hunter[1]);
    const targetCount = numberValue(hunter[4]) ?? 5;
    if (countryCode) return { type: 'CREATE_HUNTER_CAMPAIGN', countryCode, city: hunter[2].trim(), industry: hunter[3].trim(), targetCount: Math.max(1, Math.min(20, targetCount)) };
  }

  const marketToggle = input.match(/(?:بازار|market)\s+([^\s]+).*?(فعال|غیرفعال|enable|disable)/i);
  if (marketToggle) {
    const countryCode = normalizeCountryCode(marketToggle[1]);
    if (countryCode) return { type: 'SET_MARKET_ENABLED', countryCode, enabled: /فعال|enable/i.test(marketToggle[2]) && !/غیرفعال|disable/i.test(marketToggle[2]) };
  }

  if (/(آخرین تغییر|last change).*(برگرد|revert|undo)/i.test(input)) return { type: 'REVERT_LAST_CHANGE' };
  return { type: 'HELP' };
}
