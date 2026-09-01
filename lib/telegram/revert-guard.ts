import type { SupabaseClient } from '@supabase/supabase-js';
import type { TelegramMarketStyleField, TelegramOwnerCommand } from './contracts';
import { jsonValueEqual } from './json-value-equality';

const STYLE_COLUMNS: Record<TelegramMarketStyleField, string> = {
  tone: 'tone_profile',
  dialect: 'dialect',
  primaryLocale: 'primary_locale',
  fallbackLocale: 'fallback_locale',
  dialectIntensity: 'dialect_intensity',
  maxFirstTouchWords: 'max_first_touch_words',
  maxReplyWords: 'max_reply_words',
};

const rec = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function stale(label: string): never {
  throw new Error(`${label} فعلی با snapshot تغییر ثبت‌شده یکی نیست؛ Revert برای جلوگیری از overwrite متوقف شد.`);
}

export async function assertTelegramRevertFresh(input: {
  supabase: SupabaseClient;
  organizationId: string;
  targetRunId: string;
}) {
  const { data, error } = await input.supabase
    .from('telegram_command_runs')
    .select('command_payload,result,status')
    .eq('organization_id', input.organizationId)
    .eq('id', input.targetRunId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? 'Telegram history not found');
  if (data.status !== 'COMPLETED') throw new Error('Target Telegram change is not completed');

  const original = data.command_payload as TelegramOwnerCommand;
  const result = rec(data.result);
  if (result.reversible !== true) throw new Error('این تغییر قابل برگشت نیست.');
  const after = rec(result.after);

  switch (original.type) {
    case 'SET_PRICE': {
      const { data: row, error: rowError } = await input.supabase.from('service_prices')
        .select('service_id,country_code,currency,price,minimum_price')
        .eq('organization_id', input.organizationId).eq('service_id', original.serviceQuery).eq('country_code', original.countryCode).maybeSingle();
      if (rowError || !row) throw new Error(rowError?.message ?? 'Price not found');
      const current = { serviceId:String(row.service_id), countryCode:String(row.country_code), currency:String(row.currency), price:Number(row.price), minimumPrice:row.minimum_price == null ? null : Number(row.minimum_price) };
      if (!jsonValueEqual(current, after)) stale('Price');
      return;
    }
    case 'SET_SERVICE_ENABLED': {
      const { data: row, error: rowError } = await input.supabase.from('services')
        .select('id,name,enabled').eq('organization_id', input.organizationId).eq('id', original.serviceQuery).maybeSingle();
      if (rowError || !row) throw new Error(rowError?.message ?? 'Service not found');
      const current = { id:String(row.id), name:String(row.name), enabled:Boolean(row.enabled) };
      if (!jsonValueEqual(current, after)) stale('Service state');
      return;
    }
    case 'SET_SERVICE_OPTION': {
      const { data: row, error: rowError } = await input.supabase.from('services')
        .select('id,config').eq('organization_id', input.organizationId).eq('id', original.serviceQuery).maybeSingle();
      if (rowError || !row) throw new Error(rowError?.message ?? 'Service not found');
      const current = { serviceId:String(row.id), optionKey:original.optionKey, value:rec(row.config)[original.optionKey] ?? null };
      if (!jsonValueEqual(current, after)) stale('Service option');
      return;
    }
    case 'SET_MARKET_ENABLED': {
      const { data: row, error: rowError } = await input.supabase.from('market_settings')
        .select('country_code,enabled').eq('organization_id', input.organizationId).eq('country_code', original.countryCode).maybeSingle();
      if (rowError || !row) throw new Error(rowError?.message ?? 'Market not found');
      const current = { countryCode:String(row.country_code), enabled:Boolean(row.enabled) };
      if (!jsonValueEqual(current, after)) stale('Market state');
      return;
    }
    case 'SET_PAUSE': {
      const { data: row, error: rowError } = await input.supabase.from('system_controls')
        .select('agents_paused,email_paused,whatsapp_ai_paused').eq('organization_id', input.organizationId).maybeSingle();
      if (rowError || !row) throw new Error(rowError?.message ?? 'System controls not found');
      const paused = original.target === 'AGENTS' ? row.agents_paused : original.target === 'EMAIL' ? row.email_paused : row.whatsapp_ai_paused;
      const current = { target:original.target, paused:Boolean(paused) };
      if (!jsonValueEqual(current, after)) stale('Pause state');
      return;
    }
    case 'SET_COST_LIMIT': {
      const { data: row, error: rowError } = await input.supabase.from('cost_guard_settings')
        .select(original.key).eq('organization_id', input.organizationId).maybeSingle();
      if (rowError || !row) throw new Error(rowError?.message ?? 'Cost Guard not found');
      const current = { key:original.key, value:Number(rec(row)[original.key] ?? 0) };
      if (!jsonValueEqual(current, after)) stale('Cost Guard');
      return;
    }
    case 'SET_DISCOUNT_POLICY': {
      const { data: row, error: rowError } = await input.supabase.from('service_prices')
        .select('service_id,country_code,max_auto_discount_pct,max_discount_with_approval_pct')
        .eq('organization_id', input.organizationId).eq('service_id', original.serviceQuery).eq('country_code', original.countryCode).maybeSingle();
      if (rowError || !row) throw new Error(rowError?.message ?? 'Price policy not found');
      const current = { serviceId:String(row.service_id), countryCode:String(row.country_code), maxAutoDiscountPct:Number(row.max_auto_discount_pct ?? 0), maxDiscountWithApprovalPct:Number(row.max_discount_with_approval_pct ?? 0) };
      if (!jsonValueEqual(current, after)) stale('Discount policy');
      return;
    }
    case 'SET_MINIMUM_PRICE': {
      const { data: row, error: rowError } = await input.supabase.from('service_prices')
        .select('service_id,country_code,minimum_price')
        .eq('organization_id', input.organizationId).eq('service_id', original.serviceQuery).eq('country_code', original.countryCode).maybeSingle();
      if (rowError || !row) throw new Error(rowError?.message ?? 'Price floor not found');
      const current = { serviceId:String(row.service_id), countryCode:String(row.country_code), minimumPrice:Number(row.minimum_price ?? 0) };
      if (!jsonValueEqual(current, after)) stale('Price floor');
      return;
    }
    case 'SET_MARKET_STYLE': {
      const column = STYLE_COLUMNS[original.field];
      const { data: row, error: rowError } = await input.supabase.from('locale_profiles')
        .select(`country_code,${column}`).eq('organization_id', input.organizationId).eq('country_code', original.countryCode).maybeSingle();
      if (rowError || !row) throw new Error(rowError?.message ?? 'Locale profile not found');
      const current = { countryCode:String(rec(row).country_code), field:original.field, value:rec(row)[column] ?? null };
      if (!jsonValueEqual(current, after)) stale('Market style');
      return;
    }
    case 'SET_MARKET_SEND_WINDOW': {
      const { data: row, error: rowError } = await input.supabase.from('market_settings')
        .select('country_code,send_window_start,send_window_end').eq('organization_id', input.organizationId).eq('country_code', original.countryCode).maybeSingle();
      if (rowError || !row) throw new Error(rowError?.message ?? 'Market settings not found');
      const current = { countryCode:String(row.country_code), start:String(row.send_window_start).slice(0,5), end:String(row.send_window_end).slice(0,5) };
      if (!jsonValueEqual(current, after)) stale('Send window');
      return;
    }
    case 'SET_AGENT_ENABLED': {
      const { data: row, error: rowError } = await input.supabase.from('agent_settings')
        .select('agent_name,enabled').eq('organization_id', input.organizationId).eq('agent_name', original.agentQuery).maybeSingle();
      if (rowError || !row) throw new Error(rowError?.message ?? 'Agent setting not found');
      const current = { agentName:String(row.agent_name), enabled:Boolean(row.enabled) };
      if (!jsonValueEqual(current, after)) stale('Agent state');
      return;
    }
    case 'SET_AGENT_THRESHOLD': {
      const { data: row, error: rowError } = await input.supabase.from('agent_settings')
        .select('agent_name,confidence_threshold').eq('organization_id', input.organizationId).eq('agent_name', original.agentQuery).maybeSingle();
      if (rowError || !row) throw new Error(rowError?.message ?? 'Agent setting not found');
      const current = { agentName:String(row.agent_name), threshold:Number(row.confidence_threshold ?? 0) };
      if (!jsonValueEqual(current, after)) stale('Agent threshold');
      return;
    }
    case 'APPROVE_MESSAGE':
    case 'REJECT_MESSAGE':
    case 'CREATE_HUNTER_CAMPAIGN':
    case 'ACTIVATE_KILL_SWITCH':
      throw new Error('این تغییر از Telegram قابل Revert نیست.');
    default:
      throw new Error('این نوع تغییر برای Revert خودکار پشتیبانی نمی‌شود.');
  }
}
