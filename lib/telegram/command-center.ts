export type TelegramCommand =
  | { type: 'STATUS'; countryCode?: string }
  | { type: 'START_EMAIL'; countryCode: string; count: number; industry?: string }
  | { type: 'PAUSE_EMAIL'; countryCode: string }
  | { type: 'HELP' }
  | { type: 'UNKNOWN'; reason: string };

const COUNTRY_ALIASES: Array<[string, string[]]> = [
  ['OM', ['om', 'oman', 'عمان']],
  ['AE', ['ae', 'uae', 'emirates', 'امارات', 'امارات متحده']],
  ['SA', ['sa', 'ksa', 'saudi', 'عربستان', 'سعودی']],
  ['QA', ['qa', 'qatar', 'قطر']],
  ['GB', ['gb', 'uk', 'britain', 'انگلیس', 'بریتانیا']],
  ['US', ['us', 'usa', 'america', 'آمریکا', 'امریکا']],
];

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function latinDigits(value: string) {
  return [...value].map((char) => {
    const fa = FA_DIGITS.indexOf(char);
    if (fa >= 0) return String(fa);
    const ar = AR_DIGITS.indexOf(char);
    if (ar >= 0) return String(ar);
    return char;
  }).join('');
}

function normalize(value: string) {
  return latinDigits(value)
    .toLowerCase()
    .replace(/[،,؛;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveCountryCode(text: string) {
  const normalized = normalize(text);
  for (const [code, aliases] of COUNTRY_ALIASES) {
    if (aliases.some((alias) => new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i').test(normalized))) {
      return code;
    }
  }
  return null;
}

function cleanIndustry(text: string, countryCode: string, count: number) {
  let value = normalize(text)
    .replace(/^\/start_email\s+/i, '')
    .replace(/^\/start\s+/i, '')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\b(email|emails|ایمیل|ایمیل‌ها|ایمیلها|ارسال|بفرست|شروع|کن|امروز|today|start|send|برای|تا)\b/g, ' ');
  const aliases = COUNTRY_ALIASES.find(([code]) => code === countryCode)?.[1] ?? [];
  for (const alias of aliases) value = value.replace(new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  value = value.replace(String(count), ' ').replace(/\s+/g, ' ').trim();
  return value || undefined;
}

export function parseTelegramCommand(rawText: string): TelegramCommand {
  const text = normalize(rawText);
  if (!text) return { type: 'UNKNOWN', reason: 'EMPTY' };
  if (/^\/?help\b|راهنما|دستورها/.test(text)) return { type: 'HELP' };

  if (/^\/?status\b|^\/?report\b|وضعیت|گزارش|چند تا ایمیل|چندتا ایمیل|نتیجه/.test(text)) {
    return { type: 'STATUS', countryCode: resolveCountryCode(text) ?? undefined };
  }

  if (/^\/?pause_email\b|توقف|متوقف|پاز|pause/.test(text)) {
    const countryCode = resolveCountryCode(text);
    if (!countryCode) return { type: 'UNKNOWN', reason: 'COUNTRY_REQUIRED' };
    return { type: 'PAUSE_EMAIL', countryCode };
  }

  const looksLikeStart = /^\/?start_email\b|^\/?start\b|شروع|بفرست|ارسال/.test(text);
  if (looksLikeStart && /email|ایمیل/.test(text)) {
    const countryCode = resolveCountryCode(text);
    if (!countryCode) return { type: 'UNKNOWN', reason: 'COUNTRY_REQUIRED' };
    const match = text.match(/\b(\d{1,3})\b/);
    if (!match) return { type: 'UNKNOWN', reason: 'COUNT_REQUIRED' };
    const count = Number(match[1]);
    if (!Number.isInteger(count) || count < 1 || count > 100) return { type: 'UNKNOWN', reason: 'COUNT_OUT_OF_RANGE' };
    return { type: 'START_EMAIL', countryCode, count, industry: cleanIndustry(text, countryCode, count) };
  }

  return { type: 'UNKNOWN', reason: 'UNRECOGNIZED' };
}

export function commandHelpText() {
  return [
    'Smart Visions Command Center',
    '',
    'گزارش لحظه‌ای:',
    '«چند تا ایمیل دادی؟» یا /status',
    '«گزارش امارات» یا /status AE',
    '',
    'شروع کمپین ایمیل:',
    '«امروز 10 تا ایمیل عمان برای dental شروع کن»',
    '/start_email OM 10 dental',
    '',
    'توقف:',
    '«ایمیل عمان رو متوقف کن» یا /pause_email OM',
    '',
    'فرمان‌های تغییردهنده قبل از اجرا نیاز به تأیید دارند.',
  ].join('\n');
}
