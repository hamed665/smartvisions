import type { SupabaseClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import type { CommandExecutionResult, TelegramOwnerCommand } from './contracts';
import { getMarketOperationalProfile, isSupportedMarketCode, marketDayUtcRange } from '@/lib/outreach/market-profile';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

type CampaignRow = {
  id: string;
  name: string | null;
  country_code: string | null;
  city: string | null;
  industry: string | null;
  target_count: number | null;
  status: string | null;
  config: unknown;
  updated_at?: string | null;
};

type CampaignStats = { sent: number; delivered: number; bounced: number; replies: number };

export function isOperationalDailyCampaign(row: CampaignRow, dateKey: string) {
  const config = record(row.config);
  return String(row.status).toUpperCase() === 'RUNNING'
    && config.dailyOutreachTarget === true
    && config.outreachEnabled === true
    && config.targetDate === dateKey
    && typeof row.country_code === 'string'
    && isSupportedMarketCode(row.country_code.toUpperCase());
}

type SendWindowState = 'OPEN' | 'BEFORE_WINDOW' | 'CLOSED' | 'UNKNOWN';

function clockMinutes(value: unknown) {
  const match = String(value ?? '').match(/^(\\d{1,2}):(\\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]); const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? hours * 60 + minutes : null;
}

export function operationalCampaignWindow(row: CampaignRow, now = new Date()): {
  state: SendWindowState;
  timezone: string;
  start: string;
  end: string;
} {
  const config = record(row.config);
  const country = String(row.country_code ?? '').toUpperCase();
  const fallbackTimezone = isSupportedMarketCode(country) ? marketDayUtcRange(country, now).timezone : '';
  const timezone = String(config.agentWindowTimezone ?? fallbackTimezone);
  const start = String(config.agentWindowStart ?? '09:00');
  const end = String(config.agentWindowEnd ?? '19:00');
  const startMinutes = clockMinutes(start); const endMinutes = clockMinutes(end);
  const local = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(timezone);
  if (!local.isValid || startMinutes == null || endMinutes == null) return { state: 'UNKNOWN', timezone, start, end };
  const currentMinutes = local.hour * 60 + local.minute;
  const open = startMinutes <= endMinutes
    ? currentMinutes >= startMinutes && currentMinutes < endMinutes
    : currentMinutes >= startMinutes || currentMinutes < endMinutes;
  const state: SendWindowState = open ? 'OPEN' : startMinutes <= endMinutes && currentMinutes < startMinutes ? 'BEFORE_WINDOW' : 'CLOSED';
  return { state, timezone, start, end };
}

export function operationalCampaignLine(row: CampaignRow, stats: CampaignStats, now = new Date()) {
  const config = record(row.config);
  const lastMarker = String(config.lastAcquisitionReason ?? config.lastEvidenceReason ?? '').trim();
  const remaining = Math.max(0, Number(row.target_count ?? 0) - stats.sent);
  const window = operationalCampaignWindow(row, now);
  return [
    `• ${row.country_code} · ${row.city ?? 'default city'}${row.industry ? ` · ${row.industry}` : ''}: ${stats.sent}/${row.target_count ?? 0}`,
    `remaining ${remaining}`,
    `window ${window.state} ${window.start}-${window.end} ${window.timezone}`,
    `delivered ${stats.delivered}`,
    `bounce ${stats.bounced}`,
    `reply ${stats.replies}`,
    ...(lastMarker ? [`last marker (not a current blocker unless timestamped): ${lastMarker}`] : []),
  ].join(' · ');
}

async function actualEmailStats(input: {
  supabase: SupabaseClient;
  organizationId: string;
  campaigns: CampaignRow[];
}) {
  const empty = { totals: { sent: 0, delivered: 0, bounced: 0, replies: 0 }, byCampaign: new Map<string, CampaignStats>() };
  if (!input.campaigns.length) return empty;

  const windows = new Map(input.campaigns.map((campaign) => {
    const code = String(campaign.country_code).toUpperCase();
    const day = marketDayUtcRange(code);
    return [String(campaign.id), { startIso: day.startIso, endIso: day.endIso }];
  }));
  const starts = [...windows.values()].map((window) => window.startIso).sort();
  const ends = [...windows.values()].map((window) => window.endIso).sort();
  const campaignIds = input.campaigns.map((campaign) => String(campaign.id));

  const { data: outbound, error: outboundError } = await input.supabase.from('outreach_messages')
    .select('id,campaign_id,lead_id,provider_message_id,sent_at,status')
    .eq('organization_id', input.organizationId)
    .eq('channel', 'EMAIL')
    .eq('direction', 'OUTBOUND')
    .in('campaign_id', campaignIds)
    .not('sent_at', 'is', null)
    .gte('sent_at', starts[0])
    .lt('sent_at', ends[ends.length - 1]);
  if (outboundError) throw new Error(`Outreach ledger lookup failed: ${outboundError.message}`);

  const sentRows = (outbound ?? []).filter((row) => {
    const window = windows.get(String(row.campaign_id));
    const sentAt = String(row.sent_at ?? '');
    return Boolean(window && sentAt >= window.startIso && sentAt < window.endIso);
  });
  const providerIds = [...new Set(sentRows.map((row) => String(row.provider_message_id ?? '')).filter(Boolean))];
  const leadIds = [...new Set(sentRows.map((row) => String(row.lead_id ?? '')).filter(Boolean))];

  const [eventsResult, inboundResult] = await Promise.all([
    providerIds.length
      ? input.supabase.from('email_events').select('provider_message_id,event_type').eq('organization_id', input.organizationId).in('provider_message_id', providerIds)
      : Promise.resolve({ data: [], error: null }),
    leadIds.length
      ? input.supabase.from('outreach_messages').select('id,lead_id,created_at').eq('organization_id', input.organizationId).eq('channel', 'EMAIL').eq('direction', 'INBOUND').in('lead_id', leadIds).gte('created_at', starts[0]).lt('created_at', ends[ends.length - 1])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (eventsResult.error || inboundResult.error) {
    throw new Error(`Outreach event lookup failed: ${eventsResult.error?.message ?? inboundResult.error?.message}`);
  }

  const deliveredIds = new Set((eventsResult.data ?? []).filter((row) => String(row.event_type).toLowerCase() === 'email.delivered').map((row) => String(row.provider_message_id)));
  const bouncedIds = new Set((eventsResult.data ?? []).filter((row) => /bounce/i.test(String(row.event_type))).map((row) => String(row.provider_message_id)));
  const campaignsByLead = new Map<string, Set<string>>();
  for (const row of sentRows) {
    const leadId = String(row.lead_id ?? '');
    if (!leadId) continue;
    const campaignSet = campaignsByLead.get(leadId) ?? new Set<string>();
    campaignSet.add(String(row.campaign_id));
    campaignsByLead.set(leadId, campaignSet);
  }
  const repliedCampaigns = new Map<string, Set<string>>();
  for (const row of inboundResult.data ?? []) {
    for (const campaignId of campaignsByLead.get(String(row.lead_id)) ?? []) {
      const window = windows.get(campaignId);
      const createdAt = String(row.created_at ?? '');
      if (!window || createdAt < window.startIso || createdAt >= window.endIso) continue;
      const replyIds = repliedCampaigns.get(campaignId) ?? new Set<string>();
      replyIds.add(String(row.id));
      repliedCampaigns.set(campaignId, replyIds);
    }
  }

  const byCampaign = new Map<string, CampaignStats>();
  for (const campaign of input.campaigns) {
    const campaignId = String(campaign.id);
    const rows = sentRows.filter((row) => String(row.campaign_id) === campaignId);
    byCampaign.set(campaignId, {
      sent: rows.length,
      delivered: rows.filter((row) => deliveredIds.has(String(row.provider_message_id))).length,
      bounced: rows.filter((row) => bouncedIds.has(String(row.provider_message_id))).length,
      replies: repliedCampaigns.get(campaignId)?.size ?? 0,
    });
  }
  const totals = [...byCampaign.values()].reduce((sum, value) => ({
    sent: sum.sent + value.sent,
    delivered: sum.delivered + value.delivered,
    bounced: sum.bounced + value.bounced,
    replies: sum.replies + value.replies,
  }), { sent: 0, delivered: 0, bounced: 0, replies: 0 });
  return { totals, byCampaign };
}

export async function buildOutreachReport(input: { supabase: SupabaseClient; organizationId: string; countryCode?: string }): Promise<CommandExecutionResult> {
  const code = input.countryCode?.toUpperCase();
  if (code && !isSupportedMarketCode(code)) throw new Error(`Market ${code} پشتیبانی نمی‌شود.`);
  let campaignQuery = input.supabase.from('campaigns').select('id,name,country_code,city,industry,target_count,status,config,updated_at').eq('organization_id', input.organizationId).eq('status', 'RUNNING');
  if (code) campaignQuery = campaignQuery.eq('country_code', code);
  const [campaignsResult, mailboxesResult] = await Promise.all([
    campaignQuery,
    input.supabase.from('mailboxes').select('address,enabled,daily_limit,warmup_status,health_status').eq('organization_id', input.organizationId).eq('enabled', true),
  ]);
  const firstError = campaignsResult.error ?? mailboxesResult.error;
  if (firstError) throw new Error(`Outreach report lookup failed: ${firstError.message}`);

  const running = (campaignsResult.data ?? []) as CampaignRow[];
  const operational = running.filter((campaign) => {
    const country = String(campaign.country_code ?? '').toUpperCase();
    return isSupportedMarketCode(country) && isOperationalDailyCampaign(campaign, marketDayUtcRange(country).dateKey);
  });
  const stats = await actualEmailStats({ supabase: input.supabase, organizationId: input.organizationId, campaigns: operational });
  const campaignIds = operational.map((campaign) => String(campaign.id));
  let discovered = 0;
  if (campaignIds.length) {
    const { count, error } = await input.supabase.from('discovery_records').select('id', { count: 'exact', head: true }).eq('organization_id', input.organizationId).in('campaign_id', campaignIds);
    if (error) throw new Error(`Discovery report lookup failed: ${error.message}`);
    discovered = Number(count ?? 0);
  }

  const target = operational.reduce((sum, row) => sum + Number(row.target_count ?? 0), 0);
  const remaining = Math.max(0, target - stats.totals.sent);
  const progress = target > 0 ? Math.min(100, Math.round(stats.totals.sent / target * 100)) : 0;
  const reportNow = new Date();
  const windowStates = operational.map((row) => operationalCampaignWindow(row, reportNow).state);
  const operationalState = remaining === 0 && target > 0
    ? 'TARGET_MET'
    : windowStates.includes('OPEN')
      ? 'UNDER_TARGET_WINDOW_OPEN'
      : windowStates.includes('BEFORE_WINDOW')
        ? 'UNDER_TARGET_WINDOW_NOT_OPEN'
        : remaining > 0
          ? 'UNDER_TARGET_WINDOW_CLOSED'
          : 'NO_OPERATIONAL_TARGET';
  const capacity = (mailboxesResult.data ?? [])
    .filter((row) => String(row.health_status).toUpperCase() === 'HEALTHY' && ['ACTIVE','READY','WARMED','COMPLETED'].includes(String(row.warmup_status).toUpperCase()))
    .reduce((sum, row) => sum + Number(row.daily_limit ?? 0), 0);
  const campaignLines = operational.slice(0, 10).map((row) => operationalCampaignLine(row, stats.byCampaign.get(String(row.id)) ?? { sent: 0, delivered: 0, bounced: 0, replies: 0 }, reportNow));
  const dateLabel = code ? marketDayUtcRange(code).dateKey : 'current local day per campaign';

  return {
    title: `گزارش Outreach ${code ?? 'همه بازارها'}`,
    text: [
      `📊 ${dateLabel} · ${code ?? 'ALL'}`,
      'Scope: فقط Daily Outreach عملیاتی امروز و ledger دارای campaign_id',
      `Discovered (operational campaigns): ${discovered}`,
      `Sent واقعی: ${stats.totals.sent}`,
      `Delivered: ${stats.totals.delivered}`,
      `Bounce: ${stats.totals.bounced}`,
      `Reply: ${stats.totals.replies}`,
      `Target عملیاتی: ${target}`,
      `Remaining: ${remaining}`,
      `Operational state: ${operationalState}`,
      `Progress: ${progress}%`,
      `Mailbox capacity سالم: ${capacity}/day`,
      `Operational daily campaigns: ${operational.length}`,
      `Other RUNNING records (pilot/non-outreach/stale): ${Math.max(0, running.length - operational.length)}`,
      ...(campaignLines.length ? ['', 'Campaigns:', ...campaignLines] : []),
      '',
      'توجه: Approval یا Lead قدیمی فقط inventory است و بدون انتساب زمانی/کمپینی، blocker یا فرصت فعال محسوب نمی‌شود.',
      remaining > 0 && operationalState === 'UNDER_TARGET_WINDOW_CLOSED'
        ? 'اقدام لازم: امروز زیر هدف بسته شده؛ ارسال خارج از پنجره ممنوع است. علت کسری را مشخص و صف قابل‌ارسال پنجره بعد را آماده کنید.'
        : remaining > 0
          ? 'اقدام لازم: هدف عملیاتی هنوز کامل نشده؛ علت کسری باید از evidence/queue/runtime telemetry مشخص شود.'
          : 'هدف عملیاتی امروز کامل است یا هدف فعالی وجود ندارد.',
    ].join('\n'),
  };
}

export async function prepareDailyEmailOutreach(input: { supabase: SupabaseClient; organizationId: string; command: Extract<TelegramOwnerCommand, { type: 'SET_DAILY_EMAIL_OUTREACH' }> }) {
  const command = input.command; const countryCode = command.countryCode.toUpperCase();
  if (!isSupportedMarketCode(countryCode)) throw new Error(`${countryCode} در Daily Outreach پشتیبانی نمی‌شود.`);
  const profile = getMarketOperationalProfile(countryCode);
  const [controls, market, mailboxes, prices] = await Promise.all([
    input.supabase.from('system_controls').select('global_kill_switch,email_paused,agents_paused,shadow_mode').eq('organization_id', input.organizationId).maybeSingle(),
    input.supabase.from('market_settings').select('enabled,config').eq('organization_id', input.organizationId).eq('country_code', countryCode).maybeSingle(),
    input.supabase.from('mailboxes').select('daily_limit,warmup_status,health_status,enabled').eq('organization_id', input.organizationId).eq('enabled', true),
    input.supabase.from('service_prices').select('service_id,price').eq('organization_id', input.organizationId).eq('country_code', countryCode),
  ]);
  const error = controls.error ?? market.error ?? mailboxes.error ?? prices.error;
  if (error) throw new Error(`Email command preflight failed: ${error.message}`);
  if (!controls.data || controls.data.global_kill_switch || controls.data.email_paused || controls.data.agents_paused || !controls.data.shadow_mode) throw new Error('Safety/System Controls اجازه شروع Email Outreach را نمی‌دهند.');
  if (!market.data?.enabled || record(market.data.config).coldEmailEnabled !== true) throw new Error(`Cold Email برای ${countryCode} در Market Settings فعال نیست.`);
  if (!(prices.data ?? []).some((row) => Number.isFinite(Number(row.price)) && Number(row.price) >= 0)) throw new Error(`MARKET_CATALOG_NOT_PRICED: برای ${countryCode} قیمت canonical سرویس تعریف نشده است.`);
  const capacity = (mailboxes.data ?? []).filter((row) => String(row.health_status).toUpperCase() === 'HEALTHY' && ['ACTIVE','READY','WARMED','COMPLETED'].includes(String(row.warmup_status).toUpperCase())).reduce((sum, row) => sum + Number(row.daily_limit ?? 0), 0);
  const targetCount = Math.max(1, Math.min(100, Math.floor(command.targetCount)));
  if (targetCount > capacity) throw new Error(`Target ${targetCount} از ظرفیت امن فعلی Mailbox (${capacity}/day) بیشتر است.`);
  const day = marketDayUtcRange(countryCode);
  const { data: existing, error: existingError } = await input.supabase.from('campaigns').select('id,name,country_code,city,industry,target_count,status,config').eq('organization_id', input.organizationId).eq('country_code', countryCode).contains('config', { dailyOutreachTarget: true, targetDate: day.dateKey, marketCode: countryCode }).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (existingError) throw new Error(`Daily campaign lookup failed: ${existingError.message}`);
  const before = existing ? { id: existing.id, city: existing.city, targetCount: existing.target_count, industry: existing.industry, status: existing.status, config: existing.config } : null;
  const baseConfig = record(existing?.config);
  const after = { targetCount, countryCode, city: existing?.city ?? profile.defaultCity, industry: command.industry ?? null, targetDate: day.dateKey, status: 'RUNNING', maxShadowDrafts: targetCount, shadowModeRequired: true, autoAcquisitionEnabled: true, capacity };
  return {
    command: { ...command, countryCode, targetCount },
    preview: { title: 'شروع Daily Email Outreach', text: [`Country: ${countryCode}`, `City: ${after.city}`, `Industry: ${command.industry ?? 'All eligible'}`, `Target: ${targetCount}`, `Mailbox capacity: ${capacity}`, 'Discover → Evidence → First Touch → Dispatch: ON', 'Shadow/Safety: ON', '', 'برای اجرا تأیید لازم است.'].join('\n'), before, after, entityType: 'campaign', entityId: existing?.id ? String(existing.id) : `${countryCode}:${day.dateKey}`, requiresConfirmation: true } satisfies CommandExecutionResult,
    dateKey: day.dateKey, baseConfig, defaultCity: profile.defaultCity,
  };
}

export async function executeDailyEmailOutreach(input: { supabase: SupabaseClient; organizationId: string; ownerUserId: string; command: Extract<TelegramOwnerCommand, { type: 'SET_DAILY_EMAIL_OUTREACH' }>; preview: CommandExecutionResult }) {
  const prepared = await prepareDailyEmailOutreach({ supabase: input.supabase, organizationId: input.organizationId, command: input.command });
  if (JSON.stringify(prepared.preview.before ?? null) !== JSON.stringify(input.preview.before ?? null)) throw new Error('Campaign state بعد از Preview تغییر کرده؛ فرمان را دوباره صادر کن.');
  const command = prepared.command; const existingId = record(input.preview.before).id ? String(record(input.preview.before).id) : null;
  const city = String(record(prepared.preview.after).city ?? prepared.defaultCity);
  const config = { ...prepared.baseConfig, marketCode: command.countryCode, targetDate: prepared.dateKey, outreachMode: 'CONTROLLED', dailyOutreachTarget: true, maxShadowDrafts: command.targetCount, outreachEnabled: true, shadowModeRequired: true, autoApprovalEnabled: true, automatedSendingEnabled: true, autoAcquisitionEnabled: true, manualReviewOnly: false, automationAuthorization: 'OWNER_REQUESTED_FULL_AUTOMATION', activationSource: 'TELEGRAM_OWNER_CONFIRMED', lastAcquisitionReason: 'PENDING', lastEvidenceReason: 'PENDING' };
  let campaignId = existingId;
  if (campaignId) {
    const { error } = await input.supabase.from('campaigns').update({ city, industry: command.industry ?? null, target_count: command.targetCount, status: 'RUNNING', config, updated_at: new Date().toISOString() }).eq('organization_id', input.organizationId).eq('id', campaignId);
    if (error) throw new Error(`Daily campaign update failed: ${error.message}`);
  } else {
    const { data, error } = await input.supabase.from('campaigns').insert({ organization_id: input.organizationId, name: `Daily Controlled ${command.countryCode} — ${prepared.dateKey}`, hunter_type: 'BUSINESS', country_code: command.countryCode, city, industry: command.industry ?? null, target_count: command.targetCount, status: 'RUNNING', config }).select('id').single();
    if (error) throw new Error(`Daily campaign create failed: ${error.message}`); campaignId = String(data.id);
  }
  const result = { title: 'Email Outreach شروع شد', text: `✅ ${command.countryCode} · ${city} · ${command.industry ?? 'All eligible'} · target ${command.targetCount}\nDiscover/Evidence/Dispatch فعال شد؛ Safety/Shadow دست‌نخورده ماند.`, before: input.preview.before, after: { ...prepared.preview.after, campaignId }, entityType: 'campaign', entityId: campaignId ?? undefined, command, reversible: false };
  const { error: auditError } = await input.supabase.from('audit_logs').insert({ organization_id: input.organizationId, actor_type: 'SYSTEM', actor_id: null, action: 'TELEGRAM_SET_DAILY_EMAIL_OUTREACH', entity_type: 'campaign', entity_id: campaignId, before_data: input.preview.before ?? null, after_data: { telegram_owner_user_id: input.ownerUserId, command_type: command.type, value: result.after } });
  if (auditError) throw new Error(`Telegram outreach audit failed: ${auditError.message}`);
  return result;
}
