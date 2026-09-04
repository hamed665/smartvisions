import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { operationalChannelAllowed, type OperationalChannel } from '@/lib/operations/executor-core';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase credentials are required for operational channel guard');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;

  const body = await request.json() as { organizationId?: string; channel?: string };
  const organizationId = String(body.organizationId ?? '').trim();
  const channel = String(body.channel ?? '').trim().toUpperCase();
  if (!organizationId || !['EMAIL', 'WHATSAPP'].includes(channel)) {
    return NextResponse.json({ error: 'organizationId and supported channel are required' }, { status: 400 });
  }

  const { data, error } = await serviceClient().from('system_controls')
    .select('global_kill_switch,agents_paused,email_paused,whatsapp_ai_paused')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: `Operational controls unavailable: ${error.message}` }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'Operational controls are missing; scheduled work blocked' }, { status: 503 });

  const decision = operationalChannelAllowed({
    channel: channel as OperationalChannel,
    globalKillSwitch: Boolean(data.global_kill_switch),
    agentsPaused: Boolean(data.agents_paused),
    emailPaused: Boolean(data.email_paused),
    whatsappAiPaused: Boolean(data.whatsapp_ai_paused),
  });
  if (!decision.allowed) {
    return NextResponse.json({ allowed: false, reason: decision.reason }, { status: 423 });
  }
  return NextResponse.json({ allowed: true, reason: decision.reason });
}
