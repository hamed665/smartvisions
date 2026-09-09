import { DateTime } from 'luxon';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TelegramCommand } from './command-center';
import { marketTimezone } from './report';

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export type CommandEvaluation = { ok: true; proposal: string } | { ok: false; reason: string; message: string };

async function marketReady(supabase: SupabaseClient, organizationId: string, countryCode: string) {
  const { data, error } = await supabase.from('market_settings')
    .select('enabled,config,timezone,send_window_start,send_window_end')
    .eq('organization_id', organizationId)
    .eq('country_code', countryCode)
    .maybeSingle();
  if (error) throw new Error(`Market lookup failed: ${error.message}`);
  const config = record(data?.config);
  return {
    exists: Boolean(data),
    enabled: data?.enabled === true,
    coldEmailEnabled: config.coldEmailEnabled === true,
    timezone: String(data?.timezone ?? marketTimezone(countryCode)),
    sendWindowStart: String(data?.send_window_start ?? ''),
    sendWindowEnd: String(data?.send_window_end ?? ''),
  };
}

async function mailboxCapacity(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase.from('mailboxes')
    .select('daily_limit,warmup_status,health_status,enabled')
    .eq('organization_id', organizationId)
    .eq('enabled', true);
  if (error) throw new Error(`Mailbox capacity lookup failed: ${error.message}`);
  return (data ?? [])
    .filter((row) => ['ACTIVE', 'READY', 'WARMED', 'COMPLETED'].includes(String(row.warmup_status ?? '').toUpperCase()))
    .filter((row) => String(row.health_status ?? '').toUpperCase() === 'HEALTHY')
    .reduce((sum, row) => sum + Math.max(0, Number(row.daily_limit ?? 0)), 0);
}

export async function evaluateTelegramCommand(supabase: SupabaseClient, organizationId: string, command: TelegramCommand): Promise<CommandEvaluation> {
  if (command.type === 'START_EMAIL') {
    if (command.countryCode !== 'OM') {
      return { ok: false, reason: 'MARKET_EXECUTION_NOT_PRODUCTION_READY', message: `${command.countryCode} هنوز مسیر end-to-end ارسال خودکار Production ندارد؛ فرمان اجرا نشد.` };
    }
    const [market, capacity, controls] = await Promise.all([
      marketReady(supabase, organizationId, command.countryCode),
      mailboxCapacity(supabase, organizationId),
      supabase.from('system_controls').select('global_kill_switch,email_paused,agents_paused,shadow_mode').eq('organization_id', organizationId).maybeSingle(),
    ]);
    if (controls.error) throw new Error(`System controls lookup failed: ${controls.error.message}`);
    if (!market.exists || !market.enabled || !market.coldEmailEnabled) return { ok: false, reason: 'MARKET_EMAIL_DISABLED', message: `Cold email برای ${command.countryCode} در Market Settings فعال نیست.` };
    if (controls.data?.global_kill_switch || controls.data?.email_paused || controls.data?.agents_paused || !controls.data?.shadow_mode) {
      return { ok: false, reason: 'SAFETY_CONTROLS_BLOCKED', message: 'Safety/System Controls اجازه شروع ارسال را نمی‌دهند.' };
    }
    if (command.count > capacity) return { ok: false, reason: 'MAILBOX_CAPACITY_EXCEEDED', message: `درخواست ${command.count} است ولی ظرفیت امن mailbox فعلی ${capacity} ایمیل در روز است.` };
    return { ok: true, proposal: `شروع Email Outreach امروز برای ${command.countryCode}\nTarget: ${command.count}\nIndustry: ${command.industry ?? 'All eligible'}\nCapacity: ${capacity}\nShadow/Safety: ON` };
  }
  if (command.type === 'PAUSE_EMAIL') return { ok: true, proposal: `توقف Email Outreach فعال برای ${command.countryCode}` };
  return { ok: false, reason: 'NOT_MUTATING', message: 'این فرمان تغییری ایجاد نمی‌کند.' };
}

export async function executeTelegramCommand(input: {
  supabase: SupabaseClient;
  organizationId: string;
  command: TelegramCommand;
  actorId: string;
}) {
  const { supabase, organizationId, command, actorId } = input;
  if (command.type === 'START_EMAIL') {
    const evaluation = await evaluateTelegramCommand(supabase, organizationId, command);
    if (!evaluation.ok) throw new Error(`${evaluation.reason}: ${evaluation.message}`);
    const targetDate = DateTime.now().setZone(marketTimezone(command.countryCode)).toISODate();
    if (!targetDate) throw new Error('Unable to resolve target date');
    const marker = { dailyOutreachTarget: true, targetDate, marketCode: command.countryCode };

    const { data: existingRows, error: existingError } = await supabase.from('campaigns')
      .select('id,config')
      .eq('organization_id', organizationId)
      .eq('hunter_type', 'BUSINESS')
      .eq('country_code', command.countryCode)
      .contains('config', marker)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (existingError) throw new Error(`Campaign lookup failed: ${existingError.message}`);
    let existing = existingRows?.[0] ?? null;

    if (!existing) {
      const { data: baseline, error: baselineError } = await supabase.from('campaigns')
        .select('id,config')
        .eq('organization_id', organizationId)
        .eq('country_code', command.countryCode)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (baselineError) throw new Error(`Campaign baseline lookup failed: ${baselineError.message}`);
      existing = baseline;
    }

    const baseConfig = record(existing?.config);
    if (baseConfig.automatedSendingEnabled !== true || baseConfig.automationAuthorization !== 'OWNER_REQUESTED_FULL_AUTOMATION') {
      throw new Error('NO_AUTOMATED_SENDING_AUTHORIZATION: no production-authorized campaign baseline exists');
    }

    const config = {
      ...baseConfig,
      ...marker,
      outreachMode: 'CONTROLLED',
      outreachEnabled: true,
      shadowModeRequired: true,
      automatedSendingEnabled: true,
      maxShadowDrafts: command.count,
      commandSource: 'TELEGRAM_COMMAND_CENTER',
    };
    const payload = {
      name: `Daily Controlled ${command.countryCode} — ${targetDate}`,
      hunter_type: 'BUSINESS',
      country_code: command.countryCode,
      city: null,
      industry: command.industry ?? null,
      target_count: command.count,
      status: 'RUNNING',
      config,
      updated_at: new Date().toISOString(),
    };

    let campaignId = existing?.id ? String(existing.id) : '';
    if (campaignId) {
      const { error } = await supabase.from('campaigns').update(payload).eq('organization_id', organizationId).eq('id', campaignId);
      if (error) throw new Error(`Campaign update failed: ${error.message}`);
    } else {
      const { data, error } = await supabase.from('campaigns').insert({ organization_id: organizationId, ...payload }).select('id').single();
      if (error) throw new Error(`Campaign create failed: ${error.message}`);
      campaignId = String(data.id);
    }

    await supabase.from('audit_logs').insert({
      organization_id: organizationId,
      actor_type: 'USER',
      actor_id: actorId,
      action: 'TELEGRAM_START_EMAIL_OUTREACH',
      entity_type: 'campaign',
      entity_id: campaignId,
      after_data: { countryCode: command.countryCode, target: command.count, industry: command.industry ?? null, targetDate, source: 'TELEGRAM_COMMAND_CENTER' },
    });
    return { campaignId, message: `✅ کمپین ${command.countryCode} با target ${command.count} شروع شد.${command.industry ? `\nIndustry: ${command.industry}` : ''}` };
  }

  if (command.type === 'PAUSE_EMAIL') {
    const { data, error } = await supabase.from('campaigns')
      .select('id,config')
      .eq('organization_id', organizationId)
      .eq('country_code', command.countryCode)
      .eq('status', 'RUNNING');
    if (error) throw new Error(`Campaign lookup failed: ${error.message}`);
    const now = new Date().toISOString();
    for (const row of data ?? []) {
      const config = { ...record(row.config), outreachEnabled: false, pausedAt: now, pausedReason: 'TELEGRAM_OWNER_COMMAND' };
      const update = await supabase.from('campaigns').update({ status: 'PAUSED', config, updated_at: now }).eq('organization_id', organizationId).eq('id', row.id);
      if (update.error) throw new Error(`Campaign pause failed: ${update.error.message}`);
    }
    await supabase.from('audit_logs').insert({
      organization_id: organizationId,
      actor_type: 'USER',
      actor_id: actorId,
      action: 'TELEGRAM_PAUSE_EMAIL_OUTREACH',
      entity_type: 'market',
      entity_id: command.countryCode,
      after_data: { pausedCampaigns: (data ?? []).map((row) => row.id), source: 'TELEGRAM_COMMAND_CENTER' },
    });
    return { message: `⏸ Email Outreach برای ${command.countryCode} متوقف شد.`, paused: (data ?? []).length };
  }

  throw new Error('Unsupported mutating command');
}
