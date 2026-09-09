import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommandExecutionResult, TelegramOwnerCommand } from './contracts';
import { getMarketOperationalProfile, isSupportedMarketCode, marketDayUtcRange } from '@/lib/outreach/market-profile';

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

async function actualEmailStats(input: { supabase: SupabaseClient; organizationId: string; countryCode?: string }) {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { supabase, organizationId } = input;
  const [sentResult, inboundResult] = await Promise.all([
    supabase.from('conversation_messages').select('id,lead_id,provider_message_id,sent_at,status').eq('organization_id', organizationId).eq('channel', 'EMAIL').eq('direction', 'OUTBOUND').eq('status', 'SENT').gte('sent_at', since),
    supabase.from('outreach_messages').select('id,lead_id,received_at,created_at').eq('organization_id', organizationId).eq('channel', 'EMAIL').eq('direction', 'INBOUND').gte('created_at', since),
  ]);
  if (sentResult.error || inboundResult.error) throw new Error(`Outreach stats lookup failed: ${sentResult.error?.message ?? inboundResult.error?.message}`);
  const leadIds = [...new Set([...(sentResult.data ?? []), ...(inboundResult.data ?? [])].map((row) => String(row.lead_id ?? '')).filter(Boolean))];
  const leadCountry = new Map<string, string>();
  if (leadIds.length) {
    const { data: leads, error } = await supabase.from('leads').select('id,business_id').eq('organization_id', organizationId).in('id', leadIds);
    if (error) throw new Error(`Outreach lead lookup failed: ${error.message}`);
    const businessIds = [...new Set((leads ?? []).map((row) => String(row.business_id ?? '')).filter(Boolean))];
    const businessCountry = new Map<string, string>();
    if (businessIds.length) {
      const { data: businesses, error: businessError } = await supabase.from('businesses').select('id,country_code').eq('organization_id', organizationId).in('id', businessIds);
      if (businessError) throw new Error(`Outreach business lookup failed: ${businessError.message}`);
      for (const row of businesses ?? []) businessCountry.set(String(row.id), String(row.country_code ?? '').toUpperCase());
    }
    for (const row of leads ?? []) leadCountry.set(String(row.id), businessCountry.get(String(row.business_id)) ?? '');
  }
  const wanted = input.countryCode?.toUpperCase();
  const sentRows = (sentResult.data ?? []).filter((row) => !wanted || leadCountry.get(String(row.lead_id)) === wanted);
  const inboundRows = (inboundResult.data ?? []).filter((row) => !wanted || leadCountry.get(String(row.lead_id)) === wanted);
  const providerIds = [...new Set(sentRows.map((row) => String(row.provider_message_id ?? '')).filter(Boolean))];
  let delivered = 0; let bounced = 0;
  if (providerIds.length) {
    const { data: events, error } = await supabase.from('email_events').select('provider_message_id,event_type').eq('organization_id', organizationId).in('provider_message_id', providerIds);
    if (error) throw new Error(`Email event lookup failed: ${error.message}`);
    delivered = new Set((events ?? []).filter((row) => String(row.event_type).toLowerCase() === 'email.delivered').map((row) => String(row.provider_message_id))).size;
    bounced = new Set((events ?? []).filter((row) => /bounce/i.test(String(row.event_type))).map((row) => String(row.provider_message_id))).size;
  }
  return { sent: sentRows.length, delivered, bounced, replies: inboundRows.length };
}

export async function buildOutreachReport(input: { supabase: SupabaseClient; organizationId: string; countryCode?: string }): Promise<CommandExecutionResult> {
  const code = input.countryCode?.toUpperCase();
  if (code && !isSupportedMarketCode(code)) throw new Error(`Market ${code} پشتیبانی نمی‌شود.`);
  let campaignQuery = input.supabase.from('campaigns').select('id,name,country_code,city,industry,target_count,status,config,updated_at').eq('organization_id', input.organizationId).eq('status', 'RUNNING');
  if (code) campaignQuery = campaignQuery.eq('country_code', code);
  let businessQuery = input.supabase.from('businesses').select('id,country_code').eq('organization_id', input.organizationId);
  if (code) businessQuery = businessQuery.eq('country_code', code);
  const [campaignsResult, stats, mailboxesResult, businessesResult] = await Promise.all([
    campaignQuery,
    actualEmailStats(input),
    input.supabase.from('mailboxes').select('address,enabled,daily_limit,warmup_status,health_status').eq('organization_id', input.organizationId).eq('enabled', true),
    businessQuery,
  ]);
  const firstError = campaignsResult.error ?? mailboxesResult.error ?? businessesResult.error;
  if (firstError) throw new Error(`Outreach report lookup failed: ${firstError.message}`);
  const campaigns = campaignsResult.data ?? [];
  const businessIds = (businessesResult.data ?? []).map((b) => String(b.id));
  let leads: Array<{ id: string; business_id: string | null; status: string | null }> = [];
  if (businessIds.length) {
    const { data, error } = await input.supabase.from('leads').select('id,business_id,status').eq('organization_id', input.organizationId).in('business_id', businessIds);
    if (error) throw new Error(`Report lead lookup failed: ${error.message}`); leads = data ?? [];
  }
  const leadIds = leads.map((l) => String(l.id));
  let queued = 0;
  if (leadIds.length) {
    const { count, error } = await input.supabase.from('conversation_messages').select('id', { count: 'exact', head: true }).eq('organization_id', input.organizationId).eq('channel', 'EMAIL').eq('direction', 'OUTBOUND').in('status', ['APPROVAL_REQUIRED','APPROVED','PROCESSING']).in('lead_id', leadIds);
    if (error) throw new Error(`Queued report lookup failed: ${error.message}`); queued = Number(count ?? 0);
  }
  let discovered = 0;
  const campaignIds = campaigns.map((c) => String(c.id));
  if (campaignIds.length) {
    const { count, error } = await input.supabase.from('discovery_records').select('id', { count: 'exact', head: true }).eq('organization_id', input.organizationId).in('campaign_id', campaignIds);
    if (error) throw new Error(`Discovery report lookup failed: ${error.message}`); discovered = Number(count ?? 0);
  }
  const target = campaigns.reduce((sum, row) => sum + Number(row.target_count ?? 0), 0);
  const capacity = (mailboxesResult.data ?? []).filter((row) => String(row.health_status).toUpperCase() === 'HEALTHY' && ['ACTIVE','READY','WARMED','COMPLETED'].includes(String(row.warmup_status).toUpperCase())).reduce((sum, row) => sum + Number(row.daily_limit ?? 0), 0);
  const dateLabel = code ? marketDayUtcRange(code).dateKey : new Date().toISOString().slice(0,10);
  const qualified = leads.length;
  const progress = target > 0 ? Math.min(100, Math.round(stats.sent / target * 100)) : 0;
  const campaignLines = campaigns.slice(0, 10).map((row) => {
    const c = record(row.config); const blocker = String(c.lastAcquisitionReason ?? c.lastEvidenceReason ?? '').trim();
    return `• ${row.country_code} · ${row.city ?? 'default city'}${row.industry ? ` · ${row.industry}` : ''}: ${stats.sent}/${row.target_count}${blocker ? ` · ${blocker}` : ''}`;
  });
  return {
    title: `گزارش Outreach ${code ?? 'همه بازارها'}`,
    text: [
      `📊 ${dateLabel} · ${code ?? 'ALL'}`,
      `Discovered: ${discovered}`,
      `Qualified Leads: ${qualified}`,
      `Queued/Approved: ${queued}`,
      `Sent واقعی: ${stats.sent}`,
      `Delivered: ${stats.delivered}`,
      `Bounce: ${stats.bounced}`,
      `Reply: ${stats.replies}`,
      `Target: ${target}`,
      `Progress: ${progress}%`,
      `Mailbox capacity سالم: ${capacity}/day`,
      `Active campaigns: ${campaigns.length}`,
      ...(campaignLines.length ? ['', 'Campaigns:', ...campaignLines] : []),
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
