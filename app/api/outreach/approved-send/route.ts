import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { evaluateCanonicalMarketWindow } from '@/lib/outreach/canonical-market-window';
import { countMailboxSendsLast24Hours } from '@/lib/outreach/mailbox-usage';
import { POST as corePost } from './route-core';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for approved sending');
  return createClient(url, key, { auth: { persistSession:false, autoRefreshToken:false } });
}

type SendContext = {
  market_code?: string | null;
  lead_timezone?: string | null;
  mailbox_id?: string | null;
};

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  let body: { organizationId?: string; messageId?: string; controlledShadowPilot?: boolean } = {};
  try { body = await request.clone().json() as typeof body; } catch { return corePost(request); }
  if (!body.organizationId || !body.messageId) return corePost(request);

  const supabase = serviceClient();
  const { data: message, error: messageError } = await supabase
    .from('conversation_messages')
    .select('channel,metadata')
    .eq('organization_id',body.organizationId)
    .eq('id',body.messageId)
    .maybeSingle();
  if (messageError || !message) return corePost(request);

  const metadata = (message.metadata ?? {}) as Record<string,unknown>;
  const sendContext = (metadata.send_context ?? {}) as SendContext;
  const marketCode = String(sendContext.market_code ?? '').trim().toUpperCase();
  if (!marketCode) return NextResponse.json({error:'Approved draft is missing canonical market code'}, {status:409});

  const { data: market, error: marketError } = await supabase
    .from('market_settings')
    .select('enabled,timezone,send_window_start,send_window_end')
    .eq('organization_id',body.organizationId)
    .eq('country_code',marketCode)
    .maybeSingle();
  if (marketError || !market) return NextResponse.json({error:`Canonical market settings unavailable: ${marketError?.message ?? 'not found'}`}, {status:409});

  const window = evaluateCanonicalMarketWindow({
    marketEnabled:Boolean(market.enabled),
    marketTimezone:String(market.timezone),
    leadTimezone:sendContext.lead_timezone,
    start:String(market.send_window_start),
    end:String(market.send_window_end),
  });
  if (!window.allowed && !body.controlledShadowPilot) {
    return NextResponse.json({error:window.reason === 'market_disabled' ? 'Approved send blocked because market is disabled' : 'Outside canonical recipient local send window', window}, {status:409});
  }
  if (!market.enabled) {
    return NextResponse.json({error:'Approved send blocked because market is disabled', window}, {status:409});
  }

  if (message.channel === 'EMAIL') {
    const mailboxId = String(sendContext.mailbox_id ?? '').trim();
    if (!mailboxId) return NextResponse.json({error:'Approved email is missing mailbox_id'}, {status:409});
    let sentLast24Hours: number;
    try {
      sentLast24Hours = await countMailboxSendsLast24Hours({
        supabase,
        organizationId: body.organizationId,
        mailboxId,
      });
    } catch (error) {
      return NextResponse.json({error:error instanceof Error ? error.message : 'Mailbox usage is unavailable; approved send blocked'}, {status:503});
    }
    const { error: mailboxSyncError } = await supabase
      .from('mailboxes')
      .update({ sent_today: sentLast24Hours, updated_at: new Date().toISOString() })
      .eq('organization_id', body.organizationId)
      .eq('id', mailboxId);
    if (mailboxSyncError) return NextResponse.json({error:`Mailbox usage cache reconciliation failed: ${mailboxSyncError.message}`}, {status:503});
  }

  // Controlled Shadow requests may reach the core outside normal market hours, but the
  // core must independently prove a currently active, claimed live-test exception before
  // it relaxes any market-window check. All other safety gates remain authoritative.
  return corePost(request);
}
