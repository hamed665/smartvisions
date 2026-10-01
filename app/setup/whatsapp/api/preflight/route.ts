import { NextRequest, NextResponse } from 'next/server';

import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { metaGraphVersion } from '@/lib/whatsapp/meta-onboarding';
import {
  hashWhatsAppRemoteSetupSecret,
  normalizeWhatsAppRemoteSetupSecret,
  WHATSAPP_REMOTE_SETUP_COOKIE,
} from '@/lib/whatsapp/remote-setup';

export const runtime = 'nodejs';

type Blocker = {
  code: 'META_PROVIDER_CONFIGURATION_MISSING' | 'COEXISTENCE_NOT_VERIFIED' | 'EXISTING_API_DESTINATION_MISSING';
  message: string;
};

export async function GET(request: NextRequest) {
  try {
    const sessionSecret = normalizeWhatsAppRemoteSetupSecret(
      request.cookies.get(WHATSAPP_REMOTE_SETUP_COOKIE)?.value,
    );
    if (!sessionSecret) {
      return NextResponse.json({ error: 'No active WhatsApp setup session' }, { status: 401 });
    }

    const service = createSupabaseServiceClient();
    const sessionHash = await hashWhatsAppRemoteSetupSecret(sessionSecret);
    const { data, error } = await service.rpc('get_meta_whatsapp_remote_setup_context', {
      p_session_token_hash: sessionHash,
    });
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row?.attempt_id) {
      return NextResponse.json({ error: 'This WhatsApp setup session is expired or revoked' }, { status: 410 });
    }

    const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim() || process.env.META_APP_ID?.trim() || '';
    const configurationId = process.env.NEXT_PUBLIC_META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || '';
    const providerConfigured = Boolean(appId && configurationId);
    const blockers: Blocker[] = [];

    if (!providerConfigured) {
      blockers.push({
        code: 'META_PROVIDER_CONFIGURATION_MISSING',
        message: 'Smart Visions Meta provider setup is not ready for customer authorization in this environment.',
      });
    }

    if (row.connection_mode === 'BUSINESS_APP_COEXISTENCE') {
      blockers.push({
        code: 'COEXISTENCE_NOT_VERIFIED',
        message: 'Same-number WhatsApp Business App Coexistence remains fail-closed until the official provider path is verified. Your current WhatsApp stays untouched.',
      });
    }

    if (row.connection_mode === 'EXISTING_API_RECONNECT') {
      const { data: binding } = await service
        .from('communication_channel_bindings')
        .select('provider,provider_destination_id')
        .eq('organization_id', row.organization_id)
        .eq('id', row.binding_id)
        .maybeSingle();

      if (binding?.provider !== 'META' || !binding.provider_destination_id) {
        blockers.push({
          code: 'EXISTING_API_DESTINATION_MISSING',
          message: 'This binding no longer has an existing Meta API destination to reconnect.',
        });
      }
    }

    return NextResponse.json({
      ok: true,
      attemptStatus: row.attempt_status,
      connectionMode: row.connection_mode,
      purpose: row.purpose,
      providerConfigured,
      canLaunchMeta: row.attempt_status === 'AUTHORIZED' && blockers.length === 0,
      canResume: row.attempt_status === 'AUTHORIZED',
      completed: row.attempt_status === 'COMPLETED',
      setupLaterAvailable: row.attempt_status === 'AUTHORIZED',
      sessionExpiresAt: row.session_expires_at,
      appId: providerConfigured ? appId : null,
      configurationId: providerConfigured ? configurationId : null,
      graphVersion: metaGraphVersion(),
      blockers,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to run WhatsApp setup preflight' }, { status: 500 });
  }
}
