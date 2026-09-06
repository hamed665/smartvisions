import type { TelegramCostLimitKey, TelegramOwnerCommand } from './contracts';
import { PANEL_PARITY_ACTION_NAMES, type PanelParityActionName, type PanelParityArgs } from './panel-parity-types';
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

const PANEL_ACTION_SET = new Set<string>(PANEL_PARITY_ACTION_NAMES);
const PANEL_BOOLEAN_KEYS = new Set([
  'enabled','requires_approval','cold_email_enabled','whatsapp_cold_enabled','instagram_auto_cold_enabled',
  'manual_review_required','is_default','approved','active','requires_human','model_routing_enabled','confirm_large_change',
]);
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
const stripQuotes = (value: string) => {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1,-1);
  return trimmed;
};
const panelBoolean = (value: string) => {
  const normalized = token(value);
  if (['true','1','yes','on','enable','enabled','فعال','روشن'].includes(normalized)) return 'on';
  if (['false','0','no','off','disable','disabled','غیرفعال','خاموش'].includes(normalized)) return 'off';
  return value;
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

function catalogCommand(rawInput: string): TelegramOwnerCommand | null {
  const normalized = toLatinDigits(rawInput).replace(/\r/g, '').trim();
  const slash = normalized.match(/^\/catalog(?:@[A-Za-z0-9_]+)?(?:\s+|\n)([\s\S]+)$/i);
  const natural = normalized.match(/^(?:کاتالوگ|catalog)\s*:\s*([\s\S]+)$/i);
  const body = (slash?.[1] ?? natural?.[1] ?? '').trim();
  if (!body) {
    if (/^\/catalog(?:@[A-Za-z0-9_]+)?\s*$/i.test(normalized) || /^(?:کاتالوگ|catalog)\s*:\s*$/i.test(normalized)) return { type: 'HELP' };
    return null;
  }
  if (body.length > 8000) return { type: 'HELP' };
  return { type: 'CATALOG_COMPOSE', rawText: body };
}

function panelArgs(input: string): PanelParityArgs {
  const args: PanelParityArgs = {};
  const pattern = /([A-Za-z0-9_.-]+)=("([^"]*)"|'([^']*)'|([^\s]+))/g;
  for (const match of input.matchAll(pattern)) {
    const key = match[1];
    const raw = toLatinDigits(match[3] ?? match[4] ?? match[5] ?? '');
    args[key] = PANEL_BOOLEAN_KEYS.has(key) ? panelBoolean(raw) : raw;
  }
  return args;
}

function panelCommand(rawInput: string): TelegramOwnerCommand | null {
  const normalized = toLatinDigits(rawInput).trim();
  if (/^\/panel(?:@[A-Za-z0-9_]+)?\s*$/i.test(normalized) || /^(panel capabilities|قابلیت(?:‌| )?های پنل|دستورهای پنل)$/i.test(clean(normalized))) {
    return { type:'SHOW_PANEL_CAPABILITIES' };
  }
  const panelMatch = normalized.match(/^\/panel(?:@[A-Za-z0-9_]+)?\s+([a-z0-9_.-]+)([\s\S]*)$/i);
  if (panelMatch) {
    const action = panelMatch[1] as PanelParityActionName;
    if (!PANEL_ACTION_SET.has(action)) return { type:'SHOW_PANEL_CAPABILITIES' };
    return { type:'PANEL_ACTION', action, args:panelArgs(panelMatch[2] ?? '') };
  }
  if (/^\/rescore(?:@[A-Za-z0-9_]+)?$/i.test(normalized)) return { type:'PANEL_ACTION', action:'growth.rescore', args:{} };
  const promote = normalized.match(/^\/promote(?:@[A-Za-z0-9_]+)?(?:\s+(\d+))?$/i);
  if (promote) return { type:'PANEL_ACTION', action:'growth.promote', args:promote[1]?{limit:promote[1]}:{} };
  const social = normalized.match(/^\/socialreview(?:@[A-Za-z0-9_]+)?\s+(\S+)\s+(WEAK|INACTIVE|GOOD)\s+([\s\S]+)$/i);
  if (social) return { type:'PANEL_ACTION', action:'growth.social_review', args:{opportunityId:social[1],quality:social[2].toUpperCase(),note:stripQuotes(social[3])} };
  const website = normalized.match(/^\/webaudit(?:@[A-Za-z0-9_]+)?\s+(lead|business)\s+(\S+)$/i);
  if (website) return { type:'PANEL_ACTION', action:'website.audit', args:website[1].toLowerCase()==='lead'?{leadId:website[2]}:{businessId:website[2]} };

  const natural = clean(normalized);
  if (/(بیزنس|کسب.?و.?کار|business).*(کش|cached).*(دوباره|re.?score|امتیاز)/i.test(natural) || /(دوباره.*امتیاز.*بیزنس|re.?score cached businesses)/i.test(natural)) {
    return { type:'PANEL_ACTION', action:'growth.rescore', args:{} };
  }
  if (/(قابلیت|کارهای).*(پنل|control center).*(تلگرام|telegram)/i.test(natural)) return { type:'SHOW_PANEL_CAPABILITIES' };
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
  const catalog = catalogCommand(rawInput);
  if (catalog) return catalog;
  const panel = panelCommand(rawInput);
  if (panel) return panel;
  const cost = realCostCommand(input);
  if (cost) return cost;
  return parseCore(input);
}
