import { DateTime } from 'luxon';
import type { SupabaseClient } from '@supabase/supabase-js';

const MARKET_TIMEZONES: Record<string, string> = {
  OM: 'Asia/Muscat', AE: 'Asia/Dubai', SA: 'Asia/Riyadh', QA: 'Asia/Qatar', GB: 'Europe/London', US: 'America/New_York',
};

function dayRange(countryCode?: string) {
  const zone = MARKET_TIMEZONES[countryCode ?? 'OM'] ?? 'Asia/Muscat';
  const now = DateTime.now().setZone(zone);
  return { dateKey: now.toISODate() ?? '', startIso: now.startOf('day').toUTC().toISO()!, endIso: now.plus({ days: 1 }).startOf('day').toUTC().toISO()!, zone };
}

export type TelegramDailySummary = {
  text: string;
  sent: number;
  delivered: number;
  bounced: number;
  inboundReplies: number;
  activeCampaigns: number;
  target: number;
  countryCode?: string;
};

export async function buildTelegramDailySummary(supabase: SupabaseClient, organizationId: string, countryCode?: string): Promise<TelegramDailySummary> {
  const range = dayRange(countryCode);
  const code = countryCode?.toUpperCase();

  let campaignsQuery = supabase.from('campaigns')
    .select('id,name,country_code,industry,target_count,status,config')
    .eq('organization_id', organizationId)
    .eq('status', 'RUNNING');
  if (code) campaignsQuery = campaignsQuery.eq('country_code', code);

  const [campaignsResult, sentResult, inboundResult, eventResult] = await Promise.all([
    campaignsQuery,
    supabase.from('conversation_messages')
      .select('id,lead_id,provider_message_id,sent_at,metadata')
      .eq('organization_id', organizationId)
      .eq('channel', 'EMAIL')
      .eq('direction', 'OUTBOUND')
      .eq('status', 'SENT')
      .gte('sent_at', range.startIso)
      .lt('sent_at', range.endIso),
    supabase.from('outreach_messages')
      .select('id,lead_id,received_at,metadata')
      .eq('organization_id', organizationId)
      .eq('channel', 'EMAIL')
      .eq('direction', 'INBOUND')
      .gte('received_at', range.startIso)
      .lt('received_at', range.endIso),
    supabase.from('email_events')
      .select('provider_message_id,event_type,created_at,payload')
      .eq('organization_id', organizationId)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso),
  ]);

  const error = campaignsResult.error ?? sentResult.error ?? inboundResult.error ?? eventResult.error;
  if (error) throw new Error(`Telegram report query failed: ${error.message}`);

  const campaigns = campaignsResult.data ?? [];
  const sentRows = sentResult.data ?? [];
  const sentIds = new Set(sentRows.map((row) => String(row.provider_message_id ?? '')).filter(Boolean));
  const relevantEvents = (eventResult.data ?? []).filter((row) => !code || sentIds.has(String(row.provider_message_id ?? '')));
  const delivered = new Set(relevantEvents.filter((row) => String(row.event_type).toLowerCase() === 'email.delivered').map((row) => String(row.provider_message_id))).size;
  const bounced = new Set(relevantEvents.filter((row) => /bounce/i.test(String(row.event_type))).map((row) => String(row.provider_message_id))).size;
  const target = campaigns.reduce((sum, row) => sum + Number(row.target_count ?? 0), 0);

  const campaignLines = campaigns.slice(0, 8).map((row) => {
    const industry = String(row.industry ?? '').trim();
    return `• ${String(row.country_code ?? '')}${industry ? ` · ${industry}` : ''}: ${Number(row.target_count ?? 0)} target`;
  });

  const scope = code ?? 'ALL';
  const text = [
    `📊 Smart Visions | ${range.dateKey} | ${scope}`,
    `ارسال واقعی: ${sentRows.length}`,
    `Delivered: ${delivered}`,
    `Bounce: ${bounced}`,
    `Reply ورودی: ${(inboundResult.data ?? []).length}`,
    `کمپین فعال: ${campaigns.length}`,
    `Target فعال: ${target}`,
    campaignLines.length ? '' : null,
    campaignLines.length ? 'کمپین‌ها:' : null,
    ...campaignLines,
  ].filter((value): value is string => typeof value === 'string').join('\n');

  return {
    text,
    sent: sentRows.length,
    delivered,
    bounced,
    inboundReplies: (inboundResult.data ?? []).length,
    activeCampaigns: campaigns.length,
    target,
    countryCode: code,
  };
}

export function marketTimezone(countryCode: string) {
  return MARKET_TIMEZONES[countryCode.toUpperCase()] ?? 'UTC';
}
