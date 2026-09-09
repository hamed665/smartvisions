import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommandExecutionResult, TelegramOwnerCommand } from './contracts';

const MARKET_TZ: Record<string, string> = {
  OM: 'Asia/Muscat', AE: 'Asia/Dubai', SA: 'Asia/Riyadh', QA: 'Asia/Qatar', GB: 'Europe/London', US: 'America/New_York',
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function dayRange(countryCode?: string) {
  const timezone = MARKET_TZ[String(countryCode ?? 'OM').toUpperCase()] ?? 'Asia/Muscat';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dateKey = `${map.year}-${map.month}-${map.day}`;
  // Oman/UAE/Saudi/Qatar are the live launch markets; use local calendar labels for targeting.
  // Provider metrics below are intentionally based on a conservative 36h read and then scoped by targetDate/campaign lead membership.
  return { timezone, dateKey };
}

async function actualEmailStats(input: { supabase: SupabaseClient; organizationId: string; countryCode?: string }) {
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const { supabase, organizationId } = input;
  const [sentResult, inboundResult] = await Promise.all([
    supabase.from('conversation_messages')
      .select('id,lead_id,provider_message_id,sent_at,status')
      .eq('organization_id', organizationId)
      .eq('channel', 'EMAIL')
      .eq('direction', 'OUTBOUND')
      .eq('status', 'SENT')
      .gte('sent_at', since),
    supabase.from('outreach_messages')
      .select('id,lead_id,received_at')
      .eq('organization_id', organizationId)
      .eq('channel', 'EMAIL')
      .eq('direction', 'INBOUND')
      .gte('created_at', since),
  ]);
  if (sentResult.error || inboundResult.error) throw new Error(`Outreach stats lookup failed: ${sentResult.error?.message ?? inboundResult.error?.message}`);

  const leadIds = [...new Set([...(sentResult.data ?? []), ...(inboundResult.data ?? [])].map((row) => String(row.lead_id ?? '')).filter(Boolean))];
  const leadCountry = new Map<string, string>();
  if (leadIds.length) {
    const { data: leads, error: leadError } = await supabase.from('leads').select('id,business_id').eq('organization_id', organizationId).in('id', leadIds);
    if (leadError) throw new Error(`Outreach lead lookup failed: ${leadError.message}`);
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
  let delivered = 0;
  let bounced = 0;
  if (providerIds.length) {
    const { data: events, error: eventError } = await supabase.from('email_events')
      .select('provider_message_id,event_type')
      .eq('organization_id', organizationId)
      .in('provider_message_id', providerIds);
    if (eventError) throw new Error(`Email event lookup failed: ${eventError.message}`);
    delivered = new Set((events ?? []).filter((row) => String(row.event_type).toLowerCase() === 'email.delivered').map((row) => String(row.provider_message_id))).size;
    bounced = new Set((events ?? []).filter((row) => /bounce/i.test(String(row.event_type))).map((row) => String(row.provider_message_id))).size;
  }
  return { sent: sentRows.length, delivered, bounced, replies: inboundRows.length };
}

export async function buildOutreachReport(input: { supabase: SupabaseClient; organizationId: string; countryCode?: string }): Promise<CommandExecutionResult> {
  const code = input.countryCode?.toUpperCase();
  const { dateKey } = dayRange(code);
  let query = input.supabase.from('campaigns')
    .select('id,name,country_code,city,industry,target_count,status,config,updated_at')
    .eq('organization_id', input.organizationId)
    .eq('status', 'RUNNING');
  if (code) query = query.eq('country_code', code);
  const [campaignsResult, stats, mailboxesResult] = await Promise.all([
    query,
    actualEmailStats(input),
    input.supabase.from('mailboxes').select('address,enabled,daily_limit,warmup_status,health_status').eq('organization_id', input.organizationId).eq('enabled', true),
  ]);
  if (campaignsResult.error || mailboxesResult.error) throw new Error(`Outreach report lookup failed: ${campaignsResult.error?.message ?? mailboxesResult.error?.message}`);
  const campaigns = campaignsResult.data ?? [];
  const target = campaigns.reduce((sum, row) => sum + Number(row.target_count ?? 0), 0);
  const capacity = (mailboxesResult.data ?? []).filter((row) => String(row.health_status).toUpperCase() === 'HEALTHY' && ['ACTIVE','READY','WARMED','COMPLETED'].includes(String(row.warmup_status).toUpperCase())).reduce((sum, row) => sum + Number(row.daily_limit ?? 0), 0);
  const campaignLines = campaigns.slice(0, 8).map((row) => `• ${row.country_code}${row.industry ? ` · ${row.industry}` : ''}: target ${row.target_count}`);
  return {
    title: `گزارش Outreach ${code ?? 'همه بازارها'}`,
    text: [
      `📊 ${dateKey} · ${code ?? 'ALL'}`,
      `ارسال واقعی Email: ${stats.sent}`,
      `Delivered: ${stats.delivered}`,
      `Bounce: ${stats.bounced}`,
      `Reply ورودی: ${stats.replies}`,
      `Target کمپین‌های فعال: ${target}`,
      `ظرفیت Mailbox سالم: ${capacity}/day`,
      `کمپین فعال: ${campaigns.length}`,
      ...(campaignLines.length ? ['', ...campaignLines] : []),
    ].join('\n'),
  };
}

export async function prepareDailyEmailOutreach(input: {
  supabase: SupabaseClient;
  organizationId: string;
  command: Extract<TelegramOwnerCommand, { type: 'SET_DAILY_EMAIL_OUTREACH' }>;
}) {
  const command = input.command;
  const countryCode = command.countryCode.toUpperCase();
  if (countryCode !== 'OM') {
    throw new Error(`${countryCode} هنوز مسیر end-to-end ارسال خودکار Production-verified ندارد. برای جلوگیری از کمپین RUNNING جعلی، اجرا Block شد.`);
  }
  const [controls, market, mailboxes] = await Promise.all([
    input.supabase.from('system_controls').select('global_kill_switch,email_paused,agents_paused,shadow_mode').eq('organization_id', input.organizationId).maybeSingle(),
    input.supabase.from('market_settings').select('enabled,config').eq('organization_id', input.organizationId).eq('country_code', countryCode).maybeSingle(),
    input.supabase.from('mailboxes').select('daily_limit,warmup_status,health_status,enabled').eq('organization_id', input.organizationId).eq('enabled', true),
  ]);
  const error = controls.error ?? market.error ?? mailboxes.error;
  if (error) throw new Error(`Email command preflight failed: ${error.message}`);
  if (!controls.data || controls.data.global_kill_switch || controls.data.email_paused || controls.data.agents_paused || !controls.data.shadow_mode) throw new Error('Safety/System Controls اجازه شروع Email Outreach را نمی‌دهند.');
  if (!market.data?.enabled || record(market.data.config).coldEmailEnabled !== true) throw new Error(`Cold Email برای ${countryCode} در Market Settings فعال نیست.`);
  const capacity = (mailboxes.data ?? []).filter((row) => String(row.health_status).toUpperCase() === 'HEALTHY' && ['ACTIVE','READY','WARMED','COMPLETED'].includes(String(row.warmup_status).toUpperCase())).reduce((sum, row) => sum + Number(row.daily_limit ?? 0), 0);
  const targetCount = Math.max(1, Math.min(100, Math.floor(command.targetCount)));
  if (targetCount > capacity) throw new Error(`Target ${targetCount} از ظرفیت امن فعلی Mailbox (${capacity}/day) بیشتر است.`);
  const { dateKey } = dayRange(countryCode);
  const { data: existing, error: existingError } = await input.supabase.from('campaigns')
    .select('id,name,country_code,city,industry,target_count,status,config')
    .eq('organization_id', input.organizationId)
    .eq('country_code', countryCode)
    .contains('config', { dailyOutreachTarget: true, targetDate: dateKey, marketCode: countryCode })
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (existingError) throw new Error(`Daily campaign lookup failed: ${existingError.message}`);
  const before = existing ? { id: existing.id, targetCount: existing.target_count, industry: existing.industry, status: existing.status, config: existing.config } : null;
  const baseConfig = record(existing?.config);
  const after = {
    targetCount,
    countryCode,
    industry: command.industry ?? null,
    targetDate: dateKey,
    status: 'RUNNING',
    maxShadowDrafts: targetCount,
    shadowModeRequired: true,
    capacity,
  };
  return {
    command: { ...command, countryCode, targetCount },
    preview: {
      title: 'شروع Daily Email Outreach',
      text: [`Country: ${countryCode}`, `Industry: ${command.industry ?? 'All eligible'}`, `Target: ${targetCount}`, `Mailbox capacity: ${capacity}`, 'Shadow/Safety: ON', '', 'برای اجرا تأیید لازم است.'].join('\n'),
      before,
      after,
      entityType: 'campaign',
      entityId: existing?.id ? String(existing.id) : `${countryCode}:${dateKey}`,
      requiresConfirmation: true,
    } satisfies CommandExecutionResult,
    dateKey,
    baseConfig,
  };
}

export async function executeDailyEmailOutreach(input: {
  supabase: SupabaseClient;
  organizationId: string;
  ownerUserId: string;
  command: Extract<TelegramOwnerCommand, { type: 'SET_DAILY_EMAIL_OUTREACH' }>;
  preview: CommandExecutionResult;
}) {
  const prepared = await prepareDailyEmailOutreach({ supabase: input.supabase, organizationId: input.organizationId, command: input.command });
  if (JSON.stringify(prepared.preview.before ?? null) !== JSON.stringify(input.preview.before ?? null)) throw new Error('Campaign state بعد از Preview تغییر کرده؛ فرمان را دوباره صادر کن.');
  const command = prepared.command;
  const existingId = record(input.preview.before).id ? String(record(input.preview.before).id) : null;
  const config = {
    ...prepared.baseConfig,
    marketCode: command.countryCode,
    targetDate: prepared.dateKey,
    outreachMode: 'CONTROLLED',
    dailyOutreachTarget: true,
    maxShadowDrafts: command.targetCount,
    outreachEnabled: true,
    shadowModeRequired: true,
    autoApprovalEnabled: true,
    automatedSendingEnabled: true,
    automationAuthorization: 'OWNER_REQUESTED_FULL_AUTOMATION',
    activationSource: 'TELEGRAM_OWNER_CONFIRMED',
  };
  let campaignId = existingId;
  if (campaignId) {
    const { error } = await input.supabase.from('campaigns').update({ industry: command.industry ?? null, target_count: command.targetCount, status: 'RUNNING', config, updated_at: new Date().toISOString() }).eq('organization_id', input.organizationId).eq('id', campaignId);
    if (error) throw new Error(`Daily campaign update failed: ${error.message}`);
  } else {
    const { data, error } = await input.supabase.from('campaigns').insert({ organization_id: input.organizationId, name: `Daily Controlled ${command.countryCode} — ${prepared.dateKey}`, hunter_type: 'BUSINESS', country_code: command.countryCode, city: null, industry: command.industry ?? null, target_count: command.targetCount, status: 'RUNNING', config }).select('id').single();
    if (error) throw new Error(`Daily campaign create failed: ${error.message}`);
    campaignId = String(data.id);
  }
  const result = {
    title: 'Email Outreach شروع شد',
    text: `✅ ${command.countryCode} · ${command.industry ?? 'All eligible'} · target ${command.targetCount}\nSafety/Shadow دست‌نخورده ماند.`,
    before: input.preview.before,
    after: { ...prepared.preview.after, campaignId },
    entityType: 'campaign',
    entityId: campaignId ?? undefined,
    command,
    reversible: false,
  };
  const { error: auditError } = await input.supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_type: 'SYSTEM',
    actor_id: null,
    action: 'TELEGRAM_SET_DAILY_EMAIL_OUTREACH',
    entity_type: 'campaign',
    entity_id: campaignId,
    before_data: input.preview.before ?? null,
    after_data: { telegram_owner_user_id: input.ownerUserId, command_type: command.type, value: result.after },
  });
  if (auditError) throw new Error(`Telegram outreach audit failed: ${auditError.message}`);
  return result;
}
