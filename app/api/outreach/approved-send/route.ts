import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { evaluateCanonicalMarketWindow } from '@/lib/outreach/canonical-market-window';
import { POST as corePost } from './route-core';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for approved sending');
  return createClient(url, key, { auth: { persistSession:false, autoRefreshToken:false } });
}

type SendContext = { market_code?: string | null; lead_timezone?: string | null };

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  let body: { organizationId?: string; messageId?: string } = {};
  try { body = await request.clone().json() as typeof body; } catch { return corePost(request); }
  if (!body.organizationId || !body.messageId) return corePost(request);

  const supabase = serviceClient();
  const { data: message, error: messageError } = await supabase.from('conversation_messages').select('metadata').eq('organization_id',body.organizationId).eq('id',body.messageId).maybeSingle();
  if (messageError || !message) return corePost(request);
  const metadata = (message.metadata ?? {}) as Record<string,unknown>;
  const sendContext = (metadata.send_context ?? {}) as SendContext;
  const marketCode = String(sendContext.market_code ?? '').trim().toUpperCase();
  if (!marketCode) return NextResponse.json({error:'Approved draft is missing canonical market code'}, {status:409});

  const { data: market, error: marketError } = await supabase.from('market_settings').select('enabled,timezone,send_window_start,send_window_end').eq('organization_id',body.organizationId).eq('country_code',marketCode).maybeSingle();
  if (marketError || !market) return NextResponse.json({error:`Canonical market settings unavailable: ${marketError?.message ?? 'not found'}`}, {status:409});

  const window = evaluateCanonicalMarketWindow({
    marketEnabled:Boolean(market.enabled),
    marketTimezone:String(market.timezone),
    leadTimezone:sendContext.lead_timezone,
    start:String(market.send_window_start),
    end:String(market.send_window_end),
  });
  if (!window.allowed) return NextResponse.json({error:window.reason === 'market_disabled' ? 'Approved send blocked because market is disabled' : 'Outside canonical recipient local send window', window}, {status:409});

  // The existing approved-send core still applies every provider, DNC, Shadow Mode,
  // approval, Cost Guard, idempotency and 24-hour WhatsApp gate. This preflight only
  // adds canonical market enable/window enforcement and never calls a provider.
  return corePost(request);
}
