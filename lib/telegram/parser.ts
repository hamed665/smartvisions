import type { TelegramCostLimitKey, TelegramOwnerCommand } from './contracts';
import { normalizeCountryCode as normalizeCountryCodeCore, parseTelegramOwnerCommand as parseCore } from './parser-core';

export const normalizeCountryCode = normalizeCountryCodeCore;

const REAL_COST_ALIASES: Record<string, TelegramCostLimitKey> = {
  monthly: 'monthly_total_budget_usd', month: 'monthly_total_budget_usd', 'ماهانه': 'monthly_total_budget_usd',
  openai: 'openai_budget_usd', 'اوپنای': 'openai_budget_usd',
  google: 'google_places_budget_usd', places: 'google_places_budget_usd', google_places: 'google_places_budget_usd', 'گوگل': 'google_places_budget_usd',
  email: 'email_budget_usd', resend: 'email_budget_usd', 'ایمیل': 'email_budget_usd',
  whatsapp: 'whatsapp_budget_usd', meta: 'whatsapp_budget_usd', 'واتساپ': 'whatsapp_budget_usd', 'متا': 'whatsapp_budget_usd',
  leads: 'daily_new_leads', lead: 'daily_new_leads', 'لید': 'daily_new_leads',
  audits: 'daily_website_audits', website_audits: 'daily_website_audits', 'آدیت': 'daily_website_audits',
  deepai: 'daily_deep_ai_runs', deep_ai: 'daily_deep_ai_runs', 'دیپ': 'daily_deep_ai_runs',
};

const toLatinDigits = (value: string) => value
  .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const clean = (value: string) => toLatinDigits(value).replace(/\s+/g, ' ').trim();
const token = (value: string) => clean(value).toLowerCase().replace(/[،,:؛]/g, '');
const numeric = (value: string | undefined) => {
  if (!value) return undefined;
  const number = Number(toLatinDigits(value).replace(/,/g, ''));
  return Number.isFinite(number) ? number : undefined;
};

function explicitSafetyBlock(input: string): TelegramOwnerCommand | null {
  if (/(shadow\s*mode|شدو\s*مود|حالت\s*سایه)/i.test(input) && /(off|خاموش|غیرفعال|disable)/i.test(input)) return { type: 'SAFETY_BLOCK', reason: 'SHADOW_MODE' };
  if (/(kill\s*switch|کیل\s*سوییچ)/i.test(input) && /(off|خاموش|غیرفعال|disable)/i.test(input)) return { type: 'SAFETY_BLOCK', reason: 'KILL_SWITCH_OFF' };
  if (/(secret|token|api\s*key|api|رمز|توکن|کلید\s*api)/i.test(input) && /(تغییر|change|set|show|نمایش|نشون|بده|دیدن|ببین)/i.test(input)) return { type: 'SAFETY_BLOCK', reason: 'SECRETS' };
  if (/(dnc|do.?not.?contact|عدم تماس|suppression)/i.test(input) && /(دور بزن|bypass|disable|خاموش|حذف)/i.test(input)) return { type: 'SAFETY_BLOCK', reason: 'DNC_BYPASS' };
  if (/(approval|تایید|تأیید)/i.test(input) && /(bypass|دور بزن|خاموش|disable)/i.test(input)) return { type: 'SAFETY_BLOCK', reason: 'APPROVAL_BYPASS' };
  if (/(whatsapp|واتساپ|instagram|اینستاگرام)/i.test(input) && /(auto cold|cold auto|ارسال خودکار سرد|اتو سرد)/i.test(input)) return { type: 'SAFETY_BLOCK', reason: 'AUTO_COLD_CHANNEL' };
  return null;
}

function realCostCommand(input: string): TelegramOwnerCommand | null {
  if (input.startsWith('/limit ')) {
    const parts = clean(input).split(' ').slice(1);
    const key = REAL_COST_ALIASES[token(parts[0] ?? '')];
    const value = numeric(parts[1]);
    if (key && value != null) return { type: 'SET_COST_LIMIT', key, value };
    return { type: 'HELP' };
  }

  const value = numeric(input.match(/(\d+(?:\.\d+)?)/)?.[1]);
  if (value == null || !/(کن|بذار|بگذار|set|change)/i.test(input)) return null;
  if (/(بودجه ماهانه|monthly budget)/i.test(input)) return { type: 'SET_COST_LIMIT', key: 'monthly_total_budget_usd', value };
  if (/(بودجه.*openai|openai.*budget)/i.test(input)) return { type: 'SET_COST_LIMIT', key: 'openai_budget_usd', value };
  if (/(بودجه.*گوگل|google.*budget|places.*budget)/i.test(input)) return { type: 'SET_COST_LIMIT', key: 'google_places_budget_usd', value };
  if (/(بودجه.*ایمیل|email.*budget|resend.*budget)/i.test(input)) return { type: 'SET_COST_LIMIT', key: 'email_budget_usd', value };
  if (/(بودجه.*واتساپ|whatsapp.*budget|meta.*budget)/i.test(input)) return { type: 'SET_COST_LIMIT', key: 'whatsapp_budget_usd', value };
  if (/(حد.*لید.*روزانه|daily.*lead)/i.test(input)) return { type: 'SET_COST_LIMIT', key: 'daily_new_leads', value };
  if (/(آدیت.*روزانه|daily.*website.*audit)/i.test(input)) return { type: 'SET_COST_LIMIT', key: 'daily_website_audits', value };
  if (/(دیپ.*روزانه|daily.*deep.*ai)/i.test(input)) return { type: 'SET_COST_LIMIT', key: 'daily_deep_ai_runs', value };
  return null;
}

export function parseTelegramOwnerCommand(rawInput: string): TelegramOwnerCommand {
  const input = clean(rawInput);
  if (!input) return { type: 'HELP' };
  // Deliberately slash-only: an owner alert self-test must never be inferred from casual language.
  if (/^\/alert_?test(?:@[A-Za-z0-9_]+)?$/i.test(input)) return { type: 'TEST_OWNER_ALERT' };
  const safety = explicitSafetyBlock(input);
  if (safety) return safety;
  const cost = realCostCommand(input);
  if (cost) return cost;
  return parseCore(input);
}
